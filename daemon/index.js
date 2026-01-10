#!/usr/bin/env node

/**
 * Time Tracker Daemon - Browser History Version
 * Reads browser history periodically to track time spent on domains
 * NO ACCESSIBILITY PERMISSIONS REQUIRED
 */

const db = require('../database/db');
const tracker = require('./tracker');
const icalSync = require('./ical-sync');
const gitTracker = require('./git-tracker');

/**
 * Start the daemon
 */
async function startDaemon() {
  console.log('═════════════════════════════════════════════');
  console.log('  Time Tracker - Browser History Monitor');
  console.log('═════════════════════════════════════════════\n');

  console.log('✓ No system permissions required!\n');

  // Initialize database
  console.log('Initializing database...');
  try {
    await db.initDatabase();
  } catch (error) {
    console.error('✗ Database initialization failed:', error.message);
    process.exit(1);
  }

  console.log('');

  // Start tracking
  console.log('Starting browser history tracker...');
  tracker.startTracking();

  // Start git activity tracking
  console.log('Starting git activity tracker...');
  gitTracker.startTracking();

  // Start calendar sync (every 15 minutes)
  console.log('Starting iCal calendar sync...');
  const CALENDAR_SYNC_INTERVAL = 15 * 60 * 1000; // 15 minutes

  // Initial sync after 5 seconds (to allow DB to be ready)
  setTimeout(async () => {
    try {
      await icalSync.syncAllCalendars();
    } catch (error) {
      console.error('[Calendar] Initial sync error:', error.message);
    }
  }, 5000);

  // Set up periodic sync
  const calendarSyncInterval = setInterval(async () => {
    try {
      await icalSync.syncAllCalendars();
    } catch (error) {
      console.error('[Calendar] Sync error:', error.message);
    }
  }, CALENDAR_SYNC_INTERVAL);

  // Store interval for cleanup
  global.calendarSyncInterval = calendarSyncInterval;

  console.log('\n✓ Daemon is running!');
  console.log('  - Tracking: Chrome & Safari browser history');
  console.log('  - Git: Local repository activity tracking');
  console.log('  - Calendar: iCal feed sync every 15 minutes');
  console.log('  - Check interval: Every 5 minutes');
  console.log('  - Database: data/activity.db');
  console.log('  - Web UI: http://localhost:8765 (run `npm run server` to start)\n');
  console.log('Press Ctrl+C to stop\n');
  console.log('Activity log:');
  console.log('─────────────────────────────────────────────\n');
}

/**
 * Graceful shutdown
 */
function shutdown() {
  console.log('\n\nShutting down...');

  // Stop tracking
  tracker.stopTracking();

  // Stop git tracking
  gitTracker.stopTracking();

  // Stop calendar sync
  if (global.calendarSyncInterval) {
    clearInterval(global.calendarSyncInterval);
  }

  // Close database
  db.closeDatabase();

  console.log('✓ Daemon stopped\n');
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  shutdown();
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  shutdown();
});

// Start the daemon
startDaemon().catch((error) => {
  console.error('Failed to start daemon:', error);
  process.exit(1);
});
