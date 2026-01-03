const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const encryption = require('../server/utils/encryption');

const DB_PATH = path.join(__dirname, '..', 'data', 'activity.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db = null;

/**
 * Run pending database migrations
 */
function runMigrations() {
  if (!db) throw new Error('Database not initialized');

  const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

  // Create migrations directory if it doesn't exist
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return;
  }

  // Get all migration files
  const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort(); // Ensure they run in order

  if (migrationFiles.length === 0) {
    return;
  }

  // Ensure schema_migrations table exists
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);
  } catch (error) {
    console.error('Failed to create schema_migrations table:', error.message);
  }

  // Get applied migrations
  let appliedMigrations = [];
  try {
    const stmt = db.prepare('SELECT version FROM schema_migrations ORDER BY version');
    while (stmt.step()) {
      appliedMigrations.push(stmt.getAsObject().version);
    }
    stmt.free();
  } catch (error) {
    // If still fails, something is wrong
    console.error('Failed to query schema_migrations:', error.message);
  }

  // Run pending migrations
  migrationFiles.forEach(filename => {
    const version = parseInt(filename.split('_')[0], 10);

    if (appliedMigrations.includes(version)) {
      return; // Already applied
    }

    console.log(`Running migration ${version}: ${filename}`);
    const migrationSQL = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');

    try {
      db.run(migrationSQL);

      // Record migration as applied
      const stmt = db.prepare('INSERT INTO schema_migrations (version) VALUES (?)');
      stmt.run([version]);
      stmt.free();

      console.log(`✓ Migration ${version} applied`);
    } catch (error) {
      console.error(`✗ Migration ${version} failed:`, error.message);
      throw error;
    }
  });

  saveDatabase();
}

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

  // Run pending migrations
  runMigrations();

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
function insertSession({ start_time, end_time, duration_seconds, app_name, app_bundle_id, domain = null, project_id = null, page_title = null }) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(`
    INSERT INTO activity_sessions (start_time, end_time, duration_seconds, app_name, app_bundle_id, domain, project_id, page_title)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run([start_time, end_time, duration_seconds, app_name, app_bundle_id, domain, project_id, page_title]);
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
function getDailyReportAll(dateString, projectId = null) {
  if (!db) throw new Error('Database not initialized');

  const startOfDay = new Date(dateString).setHours(0, 0, 0, 0);
  const endOfDay = new Date(dateString).setHours(23, 59, 59, 999);

  const results = [];

  // Build query with optional project filter
  let query = `
    SELECT
      s.app_name,
      s.app_bundle_id,
      s.domain,
      s.project_id,
      p.name as project_name,
      p.color as project_color,
      SUM(s.duration_seconds) as total_seconds,
      COUNT(*) as session_count,
      GROUP_CONCAT(DISTINCT s.page_title) as page_titles
    FROM activity_sessions s
    LEFT JOIN projects p ON s.project_id = p.id
    WHERE s.start_time >= ? AND s.start_time <= ?
  `;

  const params = [startOfDay, endOfDay];

  // Add project filter if specified
  if (projectId !== null) {
    query += ` AND s.project_id = ?`;
    params.push(projectId);
  }

  query += `
    GROUP BY s.app_name, s.app_bundle_id, s.domain, s.project_id
    ORDER BY total_seconds DESC
  `;

  const stmt = db.prepare(query);
  stmt.bind(params);
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
 * Reload database from disk
 * This is needed because sql.js keeps database in memory
 * Must reload to see changes from other processes (e.g., daemon)
 */
async function reloadDatabase() {
  if (!db) {
    await initDatabase();
    return;
  }

  // Close current instance without saving
  db.close();

  // Reload from disk
  const SQL = await initSqlJs();
  let buffer = null;
  if (fs.existsSync(DB_PATH)) {
    buffer = fs.readFileSync(DB_PATH);
  }

  db = new SQL.Database(buffer);

  // Run pending migrations after reload
  runMigrations();
}

/**
 * Get all projects (non-archived)
 */
function getProjects() {
  if (!db) throw new Error('Database not initialized');

  const results = [];
  const stmt = db.prepare('SELECT * FROM projects WHERE is_archived = 0 ORDER BY name');

  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();

  return results;
}

/**
 * Get single project by ID
 */
function getProject(id) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('SELECT * FROM projects WHERE id = ?');
  stmt.bind([id]);

  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();

  return result;
}

/**
 * Create new project
 */
function createProject({ name, description = null, color = '#3B82F6' }) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(`
    INSERT INTO projects (name, description, color)
    VALUES (?, ?, ?)
  `);

  stmt.run([name, description, color]);
  stmt.free();

  // Get the inserted ID
  const idStmt = db.prepare('SELECT last_insert_rowid() as id');
  idStmt.step();
  const id = idStmt.getAsObject().id;
  idStmt.free();

  saveDatabase();
  return id;
}

/**
 * Update project
 */
function updateProject(id, { name, description, color }) {
  if (!db) throw new Error('Database not initialized');

  const updates = [];
  const values = [];

  if (name !== undefined) {
    updates.push('name = ?');
    values.push(name);
  }
  if (description !== undefined) {
    updates.push('description = ?');
    values.push(description);
  }
  if (color !== undefined) {
    updates.push('color = ?');
    values.push(color);
  }

  if (updates.length === 0) return;

  updates.push('updated_at = ?');
  values.push(Date.now());
  values.push(id);

  const stmt = db.prepare(`
    UPDATE projects
    SET ${updates.join(', ')}
    WHERE id = ?
  `);

  stmt.run(values);
  stmt.free();

  saveDatabase();
}

/**
 * Archive project (soft delete)
 */
function archiveProject(id) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('UPDATE projects SET is_archived = 1, updated_at = ? WHERE id = ?');
  stmt.run([Date.now(), id]);
  stmt.free();

  saveDatabase();
}

/**
 * Get all domains for a project
 */
function getProjectDomains(projectId) {
  if (!db) throw new Error('Database not initialized');

  const results = [];
  const stmt = db.prepare('SELECT * FROM project_domains WHERE project_id = ?');
  stmt.bind([projectId]);

  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();

  return results;
}

/**
 * Add domain mapping to project
 */
function addProjectDomain(projectId, domain) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(`
    INSERT INTO project_domains (project_id, domain)
    VALUES (?, ?)
  `);

  try {
    stmt.run([projectId, domain]);
    stmt.free();
    saveDatabase();
    return true;
  } catch (error) {
    stmt.free();
    if (error.message.includes('UNIQUE')) {
      throw new Error('Domain already mapped to this project');
    }
    throw error;
  }
}

/**
 * Remove domain mapping
 */
function removeProjectDomain(id) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('DELETE FROM project_domains WHERE id = ?');
  stmt.run([id]);
  stmt.free();

  saveDatabase();
}

/**
 * Assign session to project
 */
function assignSessionToProject(sessionId, projectId) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('UPDATE activity_sessions SET project_id = ? WHERE id = ?');
  stmt.run([projectId, sessionId]);
  stmt.free();

  saveDatabase();
}

/**
 * Find project ID by domain
 */
function findProjectByDomain(domain) {
  if (!db) throw new Error('Database not initialized');
  if (!domain) return null;

  const stmt = db.prepare('SELECT project_id FROM project_domains WHERE domain = ? LIMIT 1');
  stmt.bind([domain]);

  let projectId = null;
  if (stmt.step()) {
    projectId = stmt.getAsObject().project_id;
  }
  stmt.free();

  return projectId;
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

// ==========================================
// Calendar Integration Functions
// ==========================================

// Helper to create db wrapper for encryption (avoids context loss)
function getDbWrapper() {
  return {
    getSetting: (key, defaultValue) => getSetting(key, defaultValue),
    setSetting: (key, value) => setSetting(key, value),
    saveDatabase: () => saveDatabase()
  };
}

/**
 * Get all active calendar subscriptions
 */
function getCalendarSubscriptions() {
  if (!db) throw new Error('Database not initialized');

  const results = [];
  const stmt = db.prepare('SELECT * FROM calendar_subscriptions ORDER BY name');

  while (stmt.step()) {
    const row = stmt.getAsObject();
    try {
      // Decrypt URL
      results.push({
        id: row.id,
        name: row.name,
        ical_url: encryption.decrypt(row.ical_url, getDbWrapper()),
        provider: row.provider,
        is_active: row.is_active === 1,
        last_sync: row.last_sync,
        last_error: row.last_error,
        created_at: row.created_at,
        updated_at: row.updated_at
      });
    } catch (error) {
      console.error(`Failed to decrypt calendar subscription ${row.id}:`, error.message);
    }
  }
  stmt.free();

  return results;
}

/**
 * Get a single calendar subscription by ID
 */
function getCalendarSubscription(id) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('SELECT * FROM calendar_subscriptions WHERE id = ?');
  stmt.bind([id]);

  let result = null;
  if (stmt.step()) {
    const row = stmt.getAsObject();
    try {
      result = {
        id: row.id,
        name: row.name,
        ical_url: encryption.decrypt(row.ical_url, getDbWrapper()),
        provider: row.provider,
        is_active: row.is_active === 1,
        last_sync: row.last_sync,
        last_error: row.last_error,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    } catch (error) {
      console.error(`Failed to decrypt calendar subscription ${row.id}:`, error.message);
    }
  }
  stmt.free();

  return result;
}

/**
 * Add a new calendar subscription
 */
function addCalendarSubscription({ name, ical_url, provider = 'google' }) {
  if (!db) throw new Error('Database not initialized');

  try {
    // Encrypt the iCal URL
    const encryptedUrl = encryption.encrypt(ical_url, getDbWrapper());

    const stmt = db.prepare(`
      INSERT INTO calendar_subscriptions (name, ical_url, provider)
      VALUES (?, ?, ?)
    `);

    stmt.run([name, encryptedUrl, provider]);
    stmt.free();

    // Get the inserted ID
    const idStmt = db.prepare('SELECT last_insert_rowid() as id');
    idStmt.step();
    const id = idStmt.getAsObject().id;
    idStmt.free();

    saveDatabase();
    return id;
  } catch (error) {
    console.error('Failed to add calendar subscription:', error.message);
    throw error;
  }
}

/**
 * Update calendar subscription
 */
function updateCalendarSubscription(id, { name, ical_url, provider, is_active }) {
  if (!db) throw new Error('Database not initialized');

  const updates = [];
  const values = [];

  if (name !== undefined) {
    updates.push('name = ?');
    values.push(name);
  }
  if (ical_url !== undefined) {
    updates.push('ical_url = ?');
    values.push(encryption.encrypt(ical_url, getDbWrapper()));
  }
  if (provider !== undefined) {
    updates.push('provider = ?');
    values.push(provider);
  }
  if (is_active !== undefined) {
    updates.push('is_active = ?');
    values.push(is_active ? 1 : 0);
  }

  if (updates.length === 0) return;

  updates.push('updated_at = ?');
  values.push(Date.now());
  values.push(id);

  const stmt = db.prepare(`
    UPDATE calendar_subscriptions
    SET ${updates.join(', ')}
    WHERE id = ?
  `);

  stmt.run(values);
  stmt.free();

  saveDatabase();
}

/**
 * Update calendar subscription sync status
 */
function updateCalendarSubscriptionSync(id, { last_sync, last_error = null }) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(`
    UPDATE calendar_subscriptions
    SET last_sync = ?, last_error = ?, updated_at = ?
    WHERE id = ?
  `);

  stmt.run([last_sync, last_error, Date.now(), id]);
  stmt.free();

  saveDatabase();
}

/**
 * Delete calendar subscription (and all its events via CASCADE)
 */
function deleteCalendarSubscription(id) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('DELETE FROM calendar_subscriptions WHERE id = ?');
  stmt.run([id]);
  stmt.free();

  saveDatabase();
}

/**
 * Insert calendar event (handles duplicates via UNIQUE constraint)
 */
function insertCalendarEvent(eventData) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO calendar_events (
      external_id, provider, calendar_id, title, description,
      start_time, end_time, duration_seconds, project_id,
      is_all_day, location, attendees_count, subscription_id, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    stmt.run([
      eventData.external_id,
      eventData.provider || 'ical',
      eventData.calendar_id || null,
      eventData.title,
      eventData.description || null,
      eventData.start_time,
      eventData.end_time,
      eventData.duration_seconds,
      eventData.project_id || null,
      eventData.is_all_day ? 1 : 0,
      eventData.location || null,
      eventData.attendees_count || 0,
      eventData.subscription_id || null,
      Date.now()
    ]);
    stmt.free();
    saveDatabase();
    return true;
  } catch (error) {
    stmt.free();
    console.error('Failed to insert calendar event:', error.message);
    throw error;
  }
}

/**
 * Get calendar events for a specific date
 */
function getCalendarEvents(dateString) {
  if (!db) throw new Error('Database not initialized');

  const startOfDay = new Date(dateString).setHours(0, 0, 0, 0);
  const endOfDay = new Date(dateString).setHours(23, 59, 59, 999);

  const results = [];
  const stmt = db.prepare(`
    SELECT
      ce.*,
      p.name as project_name,
      p.color as project_color
    FROM calendar_events ce
    LEFT JOIN projects p ON ce.project_id = p.id
    WHERE ce.start_time >= ? AND ce.start_time <= ?
    ORDER BY ce.start_time
  `);

  stmt.bind([startOfDay, endOfDay]);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();

  return results;
}

/**
 * Assign calendar event to project
 */
function assignCalendarEventToProject(eventId, projectId) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('UPDATE calendar_events SET project_id = ?, updated_at = ? WHERE id = ?');
  stmt.run([projectId, Date.now(), eventId]);
  stmt.free();

  saveDatabase();
}

/**
 * Get all keywords for a project
 */
function getProjectKeywords(projectId) {
  if (!db) throw new Error('Database not initialized');

  const results = [];
  const stmt = db.prepare('SELECT * FROM project_calendar_keywords WHERE project_id = ? ORDER BY keyword');
  stmt.bind([projectId]);

  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();

  return results;
}

/**
 * Add keyword to project
 */
function addProjectKeyword(projectId, keyword) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(`
    INSERT INTO project_calendar_keywords (project_id, keyword)
    VALUES (?, ?)
  `);

  try {
    stmt.run([projectId, keyword]);
    stmt.free();
    saveDatabase();
    return true;
  } catch (error) {
    stmt.free();
    throw error;
  }
}

/**
 * Remove keyword from project
 */
function removeProjectKeyword(id) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('DELETE FROM project_calendar_keywords WHERE id = ?');
  stmt.run([id]);
  stmt.free();

  saveDatabase();
}

module.exports = {
  initDatabase,
  saveDatabase,
  reloadDatabase,
  insertEvent,
  insertSession,
  getDailyReport,
  getDailyReportAll,
  getTimelineData,
  getSetting,
  setSetting,
  getRecentEvents,
  closeDatabase,
  // Project functions
  getProjects,
  getProject,
  createProject,
  updateProject,
  archiveProject,
  getProjectDomains,
  addProjectDomain,
  removeProjectDomain,
  assignSessionToProject,
  findProjectByDomain,
  // Calendar integration functions
  getCalendarSubscriptions,
  getCalendarSubscription,
  addCalendarSubscription,
  updateCalendarSubscription,
  updateCalendarSubscriptionSync,
  deleteCalendarSubscription,
  insertCalendarEvent,
  getCalendarEvents,
  assignCalendarEventToProject,
  getProjectKeywords,
  addProjectKeyword,
  removeProjectKeyword
};
