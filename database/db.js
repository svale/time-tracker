const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'activity.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db = null;

/**
 * Initialize the database
 */
async function initDatabase() {
  const SQL = await initSqlJs();

  // Load existing database or create new one
  let buffer = null;
  if (fs.existsSync(DB_PATH)) {
    buffer = fs.readFileSync(DB_PATH);
  }

  db = new SQL.Database(buffer);

  // Run schema if new database
  if (!buffer) {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.run(schema);
    saveDatabase();
    console.log('✓ Database initialized');
  } else {
    console.log('✓ Database loaded');
  }

  return db;
}

/**
 * Save database to disk
 */
function saveDatabase() {
  if (!db) return;

  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

/**
 * Insert an activity event
 */
function insertEvent({ timestamp, app_name, app_bundle_id, window_title, is_idle = false }) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(`
    INSERT INTO activity_events (timestamp, app_name, app_bundle_id, window_title, is_idle)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run([timestamp, app_name, app_bundle_id, window_title, is_idle ? 1 : 0]);
  stmt.free();

  // Save to disk periodically (every insert for now, can optimize later)
  saveDatabase();
}

/**
 * Insert an activity session
 */
function insertSession({ start_time, end_time, duration_seconds, app_name, app_bundle_id, domain = null }) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(`
    INSERT INTO activity_sessions (start_time, end_time, duration_seconds, app_name, app_bundle_id, domain)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run([start_time, end_time, duration_seconds, app_name, app_bundle_id, domain]);
  stmt.free();

  saveDatabase();
}

/**
 * Get daily report (aggregated by app/domain)
 */
function getDailyReport(dateString) {
  if (!db) throw new Error('Database not initialized');

  // Convert date string (YYYY-MM-DD) to start/end timestamps
  const startOfDay = new Date(dateString).setHours(0, 0, 0, 0);
  const endOfDay = new Date(dateString).setHours(23, 59, 59, 999);

  const stmt = db.prepare(`
    SELECT
      app_name,
      app_bundle_id,
      domain,
      SUM(duration_seconds) as total_seconds,
      COUNT(*) as session_count
    FROM activity_sessions
    WHERE start_time >= ? AND start_time <= ?
    GROUP BY app_name, app_bundle_id, domain
    ORDER BY total_seconds DESC
  `);

  const result = stmt.getAsObject([startOfDay, endOfDay]);
  stmt.free();

  return result;
}

/**
 * Get all daily reports (returns array of rows)
 */
function getDailyReportAll(dateString) {
  if (!db) throw new Error('Database not initialized');

  const startOfDay = new Date(dateString).setHours(0, 0, 0, 0);
  const endOfDay = new Date(dateString).setHours(23, 59, 59, 999);

  const results = [];
  const stmt = db.prepare(`
    SELECT
      app_name,
      app_bundle_id,
      domain,
      SUM(duration_seconds) as total_seconds,
      COUNT(*) as session_count
    FROM activity_sessions
    WHERE start_time >= ? AND start_time <= ?
    GROUP BY app_name, app_bundle_id, domain
    ORDER BY total_seconds DESC
  `);

  stmt.bind([startOfDay, endOfDay]);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();

  return results;
}

/**
 * Get timeline data (hourly breakdown)
 */
function getTimelineData(dateString) {
  if (!db) throw new Error('Database not initialized');

  const startOfDay = new Date(dateString).setHours(0, 0, 0, 0);
  const endOfDay = new Date(dateString).setHours(23, 59, 59, 999);

  const results = [];
  const stmt = db.prepare(`
    SELECT
      strftime('%H:00', start_time / 1000, 'unixepoch', 'localtime') as hour,
      SUM(duration_seconds) as total_seconds
    FROM activity_sessions
    WHERE start_time >= ? AND start_time <= ?
    GROUP BY hour
    ORDER BY hour
  `);

  stmt.bind([startOfDay, endOfDay]);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();

  return results;
}

/**
 * Get setting value
 */
function getSetting(key, defaultValue = null) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  stmt.bind([key]);

  if (stmt.step()) {
    const result = stmt.getAsObject();
    stmt.free();
    return result.value;
  }

  stmt.free();
  return defaultValue;
}

/**
 * Set setting value
 */
function setSetting(key, value) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
  `);

  stmt.run([key, value, Date.now()]);
  stmt.free();

  saveDatabase();
}

/**
 * Get recent events (for debugging)
 */
function getRecentEvents(limit = 10) {
  if (!db) throw new Error('Database not initialized');

  const results = [];
  const stmt = db.prepare(`
    SELECT * FROM activity_events
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  stmt.bind([limit]);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();

  return results;
}

/**
 * Close database connection
 */
function closeDatabase() {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
  }
}

module.exports = {
  initDatabase,
  saveDatabase,
  insertEvent,
  insertSession,
  getDailyReport,
  getDailyReportAll,
  getTimelineData,
  getSetting,
  setSetting,
  getRecentEvents,
  closeDatabase
};
