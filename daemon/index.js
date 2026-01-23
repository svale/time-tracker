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
const focusTracker = require('./focus-tracker');

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

  // Start focus tracking if enabled
  const focusTrackingEnabled = db.getSetting('focus_tracking_enabled', 'true') === 'true';
  if (focusTrackingEnabled) {
    const pollIntervalSeconds = parseInt(db.getSetting('focus_poll_interval_seconds', '30'), 10);
    console.log(`Starting focus tracker (polling every ${pollIntervalSeconds}s)...`);
    focusTracker.startFocusTracking(pollIntervalSeconds * 1000);
  } else {
    console.log('Focus tracking is disabled');
  }

  // Periodic database reload (every 60 seconds)
  console.log('Setting up periodic database reload...');
  const DB_RELOAD_INTERVAL = 60 * 1000; // 60 seconds

  const dbReloadInterval = setInterval(async () => {
    try {
      await db.reloadDatabase();
      console.log('[DB] Reloaded from disk');
    } catch (error) {
      console.error('[DB] Reload error:', error.message);
    }
  }, DB_RELOAD_INTERVAL);

  // Store interval for cleanup
  global.dbReloadInterval = dbReloadInterval;

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

  // Periodic focus sample cleanup (every 24 hours)
  // Deletes samples older than 7 days to keep database size manageable
  const FOCUS_CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
  const FOCUS_SAMPLE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  const focusCleanupInterval = setInterval(() => {
    try {
      const olderThan = Date.now() - FOCUS_SAMPLE_RETENTION_MS;
      const deleted = db.cleanupOldFocusSamples(olderThan);
      if (deleted > 0) {
        console.log(`[FocusCleanup] Deleted ${deleted} focus samples older than 7 days`);
      }
    } catch (error) {
      console.error('[FocusCleanup] Error:', error.message);
    }
  }, FOCUS_CLEANUP_INTERVAL);

  // Store interval for cleanup
  global.focusCleanupInterval = focusCleanupInterval;

  console.log('\n✓ Daemon is running!');
  console.log('  - Tracking: Chrome & Safari browser history');
  console.log('  - Git: Local repository activity tracking');
  console.log('  - Calendar: iCal feed sync every 15 minutes');
  console.log('  - Focus: ' + (focusTrackingEnabled ? `Polling every ${parseInt(db.getSetting('focus_poll_interval_seconds', '30'), 10)}s` : 'Disabled'));
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

  // Stop focus tracking
  focusTracker.stopFocusTracking();

  // Stop calendar sync
  if (global.calendarSyncInterval) {
    clearInterval(global.calendarSyncInterval);
  }

  // Stop focus sample cleanup
  if (global.focusCleanupInterval) {
    clearInterval(global.focusCleanupInterval);
  }

  // Stop database reload interval
  if (global.dbReloadInterval) {
    clearInterval(global.dbReloadInterval);
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
