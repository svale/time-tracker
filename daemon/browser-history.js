/**
 * Browser History Reader
 * Reads Chrome and Safari history databases directly
 * NO ACCESSIBILITY PERMISSIONS REQUIRED
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();

// Browser history database paths
const CHROME_HISTORY = path.join(HOME, 'Library/Application Support/Google/Chrome/Default/History');
const SAFARI_HISTORY = path.join(HOME, 'Library/Safari/History.db');

/**
 * Read Chrome history
 */
async function readChromeHistory(sinceTimestamp = null) {
  try {
    if (!fs.existsSync(CHROME_HISTORY)) {
      console.log('Chrome history not found');
      return [];
    }

    // Chrome locks the history file while running, so we need to copy it
    const tempPath = path.join(os.tmpdir(), `chrome-history-${Date.now()}.db`);

    try {
      fs.copyFileSync(CHROME_HISTORY, tempPath);
    } catch (error) {
      console.error('Could not copy Chrome history (Chrome may be running):', error.message);
      return [];
    }

    // Read the copied database
    const SQL = await initSqlJs();
    const buffer = fs.readFileSync(tempPath);
    const db = new SQL.Database(buffer);

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
    const stmt = db.prepare(query);

    while (stmt.step()) {
      const row = stmt.getAsObject();

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

    stmt.free();
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
async function readSafariHistory(sinceTimestamp = null) {
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

    const SQL = await initSqlJs();
    const buffer = fs.readFileSync(tempPath);
    const db = new SQL.Database(buffer);

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
    const stmt = db.prepare(query);

    while (stmt.step()) {
      const row = stmt.getAsObject();

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

    stmt.free();
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
 */
async function getAllBrowserHistory(sinceTimestamp = null) {
  const chromeHistory = await readChromeHistory(sinceTimestamp);
  const safariHistory = await readSafariHistory(sinceTimestamp);

  const allHistory = [...chromeHistory, ...safariHistory];

  // Sort by timestamp descending
  allHistory.sort((a, b) => b.timestamp - a.timestamp);

  return allHistory;
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
        urls: [visit.url]
      };
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
      } else {
        // Save current session and start new one
        sessions.push(currentSession);
        currentSession = {
          domain,
          browser: visit.browser,
          start_time: visit.timestamp,
          end_time: visit.timestamp,
          visit_count: 1,
          urls: [visit.url]
        };
      }
    }
  }

  // Don't forget the last session
  if (currentSession) {
    sessions.push(currentSession);
  }

  // Calculate durations
  sessions.forEach(session => {
    session.duration_seconds = Math.floor((session.end_time - session.start_time) / 1000);
    // Minimum 1 second per visit if no duration calculated
    if (session.duration_seconds === 0) {
      session.duration_seconds = session.visit_count * 1;
    }
  });

  return sessions;
}

module.exports = {
  readChromeHistory,
  readSafariHistory,
  getAllBrowserHistory,
  extractDomain,
  aggregateIntoSessions
};
