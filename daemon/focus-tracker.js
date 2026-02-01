/**
 * Focus Tracker Module
 * Polls browser focus state via osascript to track when browser is actually active
 */

const { execSync } = require('child_process');
const db = require('../database/db');
const { extractDomain } = require('./browser-history');

let focusInterval = null;
let pollIntervalMs = 30000; // Default 30 seconds

/**
 * Get the name of the frontmost (active) application via osascript
 * @returns {string|null} Application name or null on error
 */
function getFrontmostApp() {
  try {
    const result = execSync(
      'osascript -e \'tell application "System Events" to name of first process whose frontmost is true\'',
      { encoding: 'utf8', timeout: 5000 }
    );
    return result.trim();
  } catch (error) {
    // Log but don't crash - this can fail if System Events isn't available
    console.error('[FocusTracker] Error getting frontmost app:', error.message);
    return null;
  }
}

/**
 * Get URL of active tab in Chrome
 * @returns {string|null} URL or null if Chrome not running/no windows
 */
function getChromeActiveTabUrl() {
  try {
    const result = execSync(
      'osascript -e \'tell application "Google Chrome" to get URL of active tab of front window\'',
      { encoding: 'utf8', timeout: 5000 }
    );
    return result.trim();
  } catch (error) {
    // Chrome may not be running or have no windows - this is normal
    return null;
  }
}

/**
 * Get URL of active tab in Safari
 * @returns {string|null} URL or null if Safari not running/no windows
 */
function getSafariActiveTabUrl() {
  try {
    const result = execSync(
      'osascript -e \'tell application "Safari" to get URL of current tab of front window\'',
      { encoding: 'utf8', timeout: 5000 }
    );
    return result.trim();
  } catch (error) {
    // Safari may not be running or have no windows - this is normal
    return null;
  }
}

/**
 * Determine which browser (if any) is focused and get its active tab URL
 * @param {string} frontmostApp - Name of the frontmost application
 * @returns {{browser: string|null, url: string|null}}
 */
function getActiveBrowserInfo(frontmostApp) {
  if (!frontmostApp) {
    return { browser: null, url: null };
  }

  // Check for Chrome variants
  if (frontmostApp === 'Google Chrome' || frontmostApp.includes('Chrome')) {
    const url = getChromeActiveTabUrl();
    return { browser: 'Chrome', url };
  }

  // Check for Safari
  if (frontmostApp === 'Safari') {
    const url = getSafariActiveTabUrl();
    return { browser: 'Safari', url };
  }

  // Not a tracked browser
  return { browser: null, url: null };
}

/**
 * Record a focus sample - called periodically to capture current state
 */
function recordFocusSample() {
  try {
    const timestamp = Date.now();
    const appName = getFrontmostApp();
    const { browser, url } = getActiveBrowserInfo(appName);

    // Extract domain if we have a URL
    let domain = null;
    if (url) {
      domain = extractDomain(url);
    }

    // Insert sample into database
    db.insertFocusSample({
      timestamp,
      app_name: appName,
      browser,
      domain
    });

    // Log only when browser is focused (to reduce noise)
    if (browser && domain) {
      console.log(`[FocusTracker] ${browser} focused on ${domain}`);
    }
  } catch (error) {
    console.error('[FocusTracker] Error recording sample:', error.message);
  }
}

/**
 * Start focus tracking at the specified interval
 * @param {number} intervalMs - Polling interval in milliseconds
 */
function startFocusTracking(intervalMs = null) {
  if (focusInterval) {
    console.log('[FocusTracker] Already running');
    return;
  }

  if (intervalMs) {
    pollIntervalMs = intervalMs;
  }

  console.log(`[FocusTracker] Starting with ${pollIntervalMs / 1000}s interval`);

  // Record immediately on start
  recordFocusSample();

  // Then poll at interval
  focusInterval = setInterval(recordFocusSample, pollIntervalMs);
}

/**
 * Stop focus tracking
 */
function stopFocusTracking() {
  if (focusInterval) {
    clearInterval(focusInterval);
    focusInterval = null;
    console.log('[FocusTracker] Stopped');
  }
}

/**
 * Check if focus tracking is running
 * @returns {boolean}
 */
function isTracking() {
  return focusInterval !== null;
}

/**
 * Get current poll interval
 * @returns {number} Interval in milliseconds
 */
function getPollInterval() {
  return pollIntervalMs;
}

module.exports = {
  getFrontmostApp,
  getChromeActiveTabUrl,
  getSafariActiveTabUrl,
  getActiveBrowserInfo,
  recordFocusSample,
  startFocusTracking,
  stopFocusTracking,
  isTracking,
  getPollInterval
};
