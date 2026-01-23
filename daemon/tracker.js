/**
 * Browser History Tracker
 * Periodically reads browser history and logs activity
 * NO ACCESSIBILITY PERMISSIONS REQUIRED
 */

const db = require('../database/db');
const browserHistory = require('./browser-history');
const projectMatcher = require('../server/utils/project-matcher');

let trackingInterval = null;
let lastCheckTimestamp = null;
let pollingIntervalMinutes = 5; // Check every 5 minutes

/**
 * Calculate focus-aware duration for a session
 * Uses focus samples to determine actual time the browser was focused on the domain
 * @param {Object} session - The session with browser, domain, start_time, end_time
 * @param {number} pollIntervalSeconds - The focus polling interval in seconds
 * @param {number} maxSessionMinutes - Maximum session duration cap in minutes
 * @returns {number} Adjusted duration in seconds
 */
function calculateFocusAwareDuration(session, pollIntervalSeconds, maxSessionMinutes) {
  const rawDurationSeconds = session.duration_seconds;
  const maxDurationSeconds = maxSessionMinutes * 60;

  // Get focus samples within the session time range
  const matchingCount = db.countFocusSamplesForSession(
    session.browser,
    session.domain,
    session.start_time,
    session.end_time
  );

  // Calculate focus-based duration
  const focusDurationSeconds = matchingCount * pollIntervalSeconds;

  // If we have focus samples, use them; otherwise fall back to capped raw duration
  if (matchingCount > 0) {
    // Use focus duration, but cap it at max session duration
    return Math.min(focusDurationSeconds, maxDurationSeconds);
  }

  // No focus samples in range - this could mean:
  // 1. Focus tracking wasn't running during this session
  // 2. Session was very short (less than one poll interval)
  // Fall back to capped raw duration
  return Math.min(rawDurationSeconds, maxDurationSeconds);
}

/**
 * Process browser history and save sessions
 */
async function processHistory() {
  try {
    console.log(`[${new Date().toLocaleTimeString()}] Reading browser history...`);

    // Get enabled Chrome profiles from settings
    const enabledProfiles = JSON.parse(db.getSetting('chrome_profiles_enabled', '["Default"]'));

    // Get focus tracking settings
    const focusTrackingEnabled = db.getSetting('focus_tracking_enabled', 'true') === 'true';
    const pollIntervalSeconds = parseInt(db.getSetting('focus_poll_interval_seconds', '30'), 10);
    const maxSessionMinutes = parseInt(db.getSetting('max_session_duration_minutes', '30'), 10);

    // Get history since last check (or last 24 hours if first run)
    const sinceTime = lastCheckTimestamp || (Date.now() - (24 * 60 * 60 * 1000));
    const history = await browserHistory.getAllBrowserHistory(sinceTime, enabledProfiles);

    if (history.length === 0) {
      console.log('  No new history entries');
      return;
    }

    console.log(`  Found ${history.length} history entries`);

    // Aggregate into sessions
    const sessions = browserHistory.aggregateIntoSessions(history);

    console.log(`  Aggregated into ${sessions.length} sessions`);

    // Save sessions to database
    let savedCount = 0;
    for (const session of sessions) {
      // Only save sessions that are at least 1 second
      if (session.duration_seconds >= 1) {
        // Calculate focus-aware duration if enabled
        let finalDuration = session.duration_seconds;
        if (focusTrackingEnabled) {
          finalDuration = calculateFocusAwareDuration(session, pollIntervalSeconds, maxSessionMinutes);
        } else {
          // If focus tracking disabled, still apply max cap
          finalDuration = Math.min(session.duration_seconds, maxSessionMinutes * 60);
        }

        // Try to match domain to a project
        const projectId = projectMatcher.matchDomain(session.domain);

        db.insertSession({
          start_time: session.start_time,
          end_time: session.end_time,
          duration_seconds: finalDuration,
          app_name: session.browser,
          app_bundle_id: session.browser === 'Chrome' ? 'com.google.Chrome' : 'com.apple.Safari',
          domain: session.domain,
          project_id: projectId, // Auto-assign project if domain matches
          page_title: session.page_title || null // Page title from browser history
        });
        savedCount++;

        // Log significant sessions (>30 seconds)
        if (finalDuration > 30) {
          const minutes = Math.floor(finalDuration / 60);
          const seconds = finalDuration % 60;
          const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
          const projectInfo = projectId ? ` [Project ${projectId}]` : '';

          // Show if duration was adjusted by focus tracking
          const rawMinutes = Math.floor(session.duration_seconds / 60);
          const rawSeconds = session.duration_seconds % 60;
          const rawTimeStr = rawMinutes > 0 ? `${rawMinutes}m ${rawSeconds}s` : `${rawSeconds}s`;
          const adjustedNote = (focusTrackingEnabled && finalDuration !== session.duration_seconds)
            ? ` (raw: ${rawTimeStr})`
            : '';

          console.log(`  → ${session.domain} (${session.browser}) - ${timeStr}${adjustedNote}${projectInfo}`);
        }
      }
    }

    console.log(`  Saved ${savedCount} sessions to database`);

    // Update last check timestamp
    lastCheckTimestamp = Date.now();

  } catch (error) {
    console.error('Error processing history:', error.message);
  }
}

/**
 * Start tracking
 */
function startTracking(intervalMinutes = null) {
  if (trackingInterval) {
    console.log('Tracking already started');
    return;
  }

  // Get polling interval from settings or use default
  if (intervalMinutes) {
    pollingIntervalMinutes = intervalMinutes;
  } else {
    pollingIntervalMinutes = parseInt(db.getSetting('polling_interval_minutes', '5'), 10);
  }

  console.log(`✓ Starting browser history tracking (checking every ${pollingIntervalMinutes} minutes)`);

  // Process immediately
  processHistory();

  // Then process at interval
  trackingInterval = setInterval(processHistory, pollingIntervalMinutes * 60 * 1000);
}

/**
 * Stop tracking
 */
function stopTracking() {
  if (trackingInterval) {
    clearInterval(trackingInterval);
    trackingInterval = null;
    console.log('✓ Tracking stopped');
  }
}

/**
 * Get tracking status
 */
function getTrackingStatus() {
  return {
    isTracking: trackingInterval !== null,
    pollingInterval: pollingIntervalMinutes,
    lastCheck: lastCheckTimestamp ? new Date(lastCheckTimestamp).toLocaleString() : 'Never'
  };
}

/**
 * Force a check now (useful for testing)
 */
async function checkNow() {
  await processHistory();
}

module.exports = {
  startTracking,
  stopTracking,
  getTrackingStatus,
  checkNow
};
