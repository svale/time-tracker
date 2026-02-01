/**
 * Browser History Reader
 * Reads Chrome and Safari history databases directly
 * NO ACCESSIBILITY PERMISSIONS REQUIRED
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();

// Browser history database paths
const CHROME_BASE = path.join(HOME, 'Library/Application Support/Google/Chrome');
const CHROME_HISTORY = path.join(CHROME_BASE, 'Default/History');
const SAFARI_HISTORY = path.join(HOME, 'Library/Safari/History.db');

/**
 * Discover all Chrome profiles on the system
 * Returns array of { id, name, email, historyPath }
 */
function discoverChromeProfiles() {
  const profiles = [];

  if (!fs.existsSync(CHROME_BASE)) {
    return profiles;
  }

  const entries = fs.readdirSync(CHROME_BASE, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name !== 'Default' && !entry.name.startsWith('Profile ')) continue;
    if (entry.name === 'Guest Profile') continue; // Skip guest profile

    const prefsPath = path.join(CHROME_BASE, entry.name, 'Preferences');
    const historyPath = path.join(CHROME_BASE, entry.name, 'History');

    if (!fs.existsSync(historyPath)) continue;

    let name = entry.name;
    let email = null;

    try {
      if (fs.existsSync(prefsPath)) {
        const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
        name = prefs.profile?.name || entry.name;
        email = prefs.account_info?.[0]?.email || null;
      }
    } catch (e) {
      console.warn(`Could not read profile preferences for ${entry.name}:`, e.message);
    }

    profiles.push({
      id: entry.name,
      name: name,
      email: email,
      historyPath: historyPath
    });
  }

  return profiles;
}

/**
 * Read Chrome history
 * @param {number|null} sinceTimestamp - Only get history since this timestamp (ms since epoch)
 * @param {string|null} historyPath - Optional path to Chrome History file (for multi-profile support)
 */
function readChromeHistory(sinceTimestamp = null, historyPath = null) {
  try {
    const targetPath = historyPath || CHROME_HISTORY;

    if (!fs.existsSync(targetPath)) {
      console.log(`Chrome history not found at ${targetPath}`);
      return [];
    }

    // Chrome locks the history file while running, so we need to copy it
    const tempPath = path.join(os.tmpdir(), `chrome-history-${Date.now()}.db`);

    try {
      fs.copyFileSync(targetPath, tempPath);
    } catch (error) {
      console.error(`Could not copy Chrome history from ${targetPath} (Chrome may be running):`, error.message);
      return [];
    }

    // Read the copied database
    const db = new Database(tempPath, { readonly: true });

    // Chrome stores timestamps as microseconds since 1601-01-01
    // Convert our timestamp (ms since 1970) to Chrome format
    let whereClause = '';
    if (sinceTimestamp) {
      const chromeTimestamp = (sinceTimestamp * 1000) + 11644473600000000;
      whereClause = `WHERE last_visit_time >= ${chromeTimestamp}`;
    }

    // Query visits with URLs
    const query = `
      SELECT
        urls.url,
        urls.title,
        urls.visit_count,
        urls.last_visit_time,
        visits.visit_time,
        visits.visit_duration
      FROM urls
      LEFT JOIN visits ON urls.id = visits.url
      ${whereClause}
      ORDER BY visits.visit_time DESC
      LIMIT 1000
    `;

    const results = [];
    const rows = db.prepare(query).all();

    for (const row of rows) {
      // Convert Chrome timestamp to JS timestamp
      // Chrome: microseconds since 1601-01-01
      // JS: milliseconds since 1970-01-01
      const chromeEpoch = 11644473600000000; // microseconds between 1601 and 1970
      const timestamp = row.visit_time ?
        Math.floor((row.visit_time - chromeEpoch) / 1000) :
        Math.floor((row.last_visit_time - chromeEpoch) / 1000);

      results.push({
        url: row.url,
        title: row.title,
        visit_count: row.visit_count || 1,
        timestamp: timestamp,
        duration_ms: row.visit_duration ? Math.floor(row.visit_duration / 1000) : 0,
        browser: 'Chrome'
      });
    }

    db.close();

    // Clean up temp file
    fs.unlinkSync(tempPath);

    return results;

  } catch (error) {
    console.error('Error reading Chrome history:', error.message);
    return [];
  }
}

/**
 * Read Safari history
 */
function readSafariHistory(sinceTimestamp = null) {
  try {
    if (!fs.existsSync(SAFARI_HISTORY)) {
      console.log('Safari history not found');
      return [];
    }

    // Copy Safari history (also locked while Safari is running)
    const tempPath = path.join(os.tmpdir(), `safari-history-${Date.now()}.db`);

    try {
      fs.copyFileSync(SAFARI_HISTORY, tempPath);
    } catch (error) {
      console.error('Could not copy Safari history (Safari may be running):', error.message);
      return [];
    }

    const db = new Database(tempPath, { readonly: true });

    // Safari stores timestamps as seconds since 2001-01-01 (Cocoa epoch)
    let whereClause = '';
    if (sinceTimestamp) {
      const safariTimestamp = (sinceTimestamp / 1000) - 978307200; // Convert to Safari format
      whereClause = `WHERE visit_time >= ${safariTimestamp}`;
    }

    const query = `
      SELECT
        history_items.url,
        history_visits.visit_time,
        history_items.visit_count
      FROM history_items
      LEFT JOIN history_visits ON history_items.id = history_visits.history_item
      ${whereClause}
      ORDER BY history_visits.visit_time DESC
      LIMIT 1000
    `;

    const results = [];
    const rows = db.prepare(query).all();

    for (const row of rows) {
      // Convert Safari timestamp to JS timestamp
      // Safari: seconds since 2001-01-01
      // JS: milliseconds since 1970-01-01
      const cocoaEpoch = 978307200; // seconds between 1970 and 2001
      const timestamp = row.visit_time ?
        Math.floor((row.visit_time + cocoaEpoch) * 1000) :
        Date.now();

      results.push({
        url: row.url,
        title: extractTitleFromUrl(row.url),
        visit_count: row.visit_count || 1,
        timestamp: timestamp,
        duration_ms: 0, // Safari doesn't store duration
        browser: 'Safari'
      });
    }

    db.close();

    // Clean up
    fs.unlinkSync(tempPath);

    return results;

  } catch (error) {
    console.error('Error reading Safari history:', error.message);
    return [];
  }
}

/**
 * Extract domain from URL
 */
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    let domain = urlObj.hostname;

    // Remove www. prefix
    domain = domain.replace(/^www\./, '');

    // Handle localhost with port
    if (domain === 'localhost' && urlObj.port) {
      return `localhost:${urlObj.port}`;
    }

    return domain;
  } catch (error) {
    return null;
  }
}

/**
 * Extract title from URL if not available
 */
function extractTitleFromUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname + urlObj.pathname;
  } catch (error) {
    return url;
  }
}

/**
 * Get all browser history since a timestamp
 * @param {number|null} sinceTimestamp - Only get history since this timestamp (ms since epoch)
 * @param {string[]|null} enabledProfileIds - Array of Chrome profile IDs to read from (e.g., ['Default', 'Profile 1'])
 */
function getAllBrowserHistory(sinceTimestamp = null, enabledProfileIds = null) {
  let chromeHistory = [];

  // If no specific profiles provided, use Default only (backwards compatible)
  const profileIds = enabledProfileIds || ['Default'];
  const allProfiles = discoverChromeProfiles();

  for (const profileId of profileIds) {
    const profile = allProfiles.find(p => p.id === profileId);
    if (profile) {
      const history = readChromeHistory(sinceTimestamp, profile.historyPath);
      chromeHistory = chromeHistory.concat(history);
    }
  }

  const safariHistory = readSafariHistory(sinceTimestamp);
  const allHistory = [...chromeHistory, ...safariHistory];

  // Sort by timestamp descending
  allHistory.sort((a, b) => b.timestamp - a.timestamp);

  return allHistory;
}

/**
 * Get most frequent title from titleCounts map
 */
function getMostFrequentTitle(titleCounts) {
  if (!titleCounts || Object.keys(titleCounts).length === 0) {
    return null;
  }

  let maxCount = 0;
  let mostFrequentTitle = null;

  for (const [title, count] of Object.entries(titleCounts)) {
    if (count > maxCount) {
      maxCount = count;
      mostFrequentTitle = title;
    }
  }

  return mostFrequentTitle;
}

/**
 * Aggregate history into time sessions
 * Groups consecutive visits to same domain within threshold
 */
function aggregateIntoSessions(history, sessionGapMinutes = 5) {
  if (history.length === 0) return [];

  const sessions = [];
  let currentSession = null;
  const sessionGapMs = sessionGapMinutes * 60 * 1000;

  // Process from oldest to newest
  const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);

  for (const visit of sortedHistory) {
    const domain = extractDomain(visit.url);
    if (!domain) continue;

    if (!currentSession) {
      // Start new session
      currentSession = {
        domain,
        browser: visit.browser,
        start_time: visit.timestamp,
        end_time: visit.timestamp,
        visit_count: 1,
        urls: [visit.url],
        titleCounts: {}
      };
      // Track title occurrences
      if (visit.title) {
        currentSession.titleCounts[visit.title] = 1;
      }
    } else {
      const timeSinceLastVisit = visit.timestamp - currentSession.end_time;
      const sameDomain = domain === currentSession.domain;

      if (sameDomain && timeSinceLastVisit < sessionGapMs) {
        // Extend current session
        currentSession.end_time = visit.timestamp;
        currentSession.visit_count++;
        if (!currentSession.urls.includes(visit.url)) {
          currentSession.urls.push(visit.url);
        }
        // Track title occurrences
        if (visit.title) {
          currentSession.titleCounts[visit.title] = (currentSession.titleCounts[visit.title] || 0) + 1;
        }
      } else {
        // Save current session and start new one
        sessions.push(currentSession);
        currentSession = {
          domain,
          browser: visit.browser,
          start_time: visit.timestamp,
          end_time: visit.timestamp,
          visit_count: 1,
          urls: [visit.url],
          titleCounts: {}
        };
        // Track title occurrences
        if (visit.title) {
          currentSession.titleCounts[visit.title] = 1;
        }
      }
    }
  }

  // Don't forget the last session
  if (currentSession) {
    sessions.push(currentSession);
  }

  // Calculate durations and determine most frequent title
  sessions.forEach(session => {
    session.duration_seconds = Math.floor((session.end_time - session.start_time) / 1000);
    // Minimum 1 second per visit if no duration calculated
    if (session.duration_seconds === 0) {
      session.duration_seconds = session.visit_count * 1;
    }
    // Set the most frequent title as the session's page_title
    session.page_title = getMostFrequentTitle(session.titleCounts);
    // Clean up titleCounts (we don't need to store this)
    delete session.titleCounts;
  });

  return sessions;
}

module.exports = {
  readChromeHistory,
  readSafariHistory,
  getAllBrowserHistory,
  extractDomain,
  aggregateIntoSessions,
  discoverChromeProfiles
};
