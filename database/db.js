/**
 * Database Module - Dual Database Architecture
 *
 * Two separate databases to prevent race conditions:
 * - activity.db: Sessions and events (daemon writes, server reads)
 * - config.db: Projects, calendars, settings (server writes, daemon reads)
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const encryption = require('../server/utils/encryption');

// Database paths
const DATA_DIR = path.join(__dirname, '..', 'data');
const ACTIVITY_DB_PATH = path.join(DATA_DIR, 'activity.db');
const CONFIG_DB_PATH = path.join(DATA_DIR, 'config.db');
const ACTIVITY_SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const CONFIG_SCHEMA_PATH = path.join(__dirname, 'config-schema.sql');

// Database instances
let activityDb = null;
let configDb = null;

// SQL.js instance (shared)
let SQL = null;

// ==========================================
// Database Initialization
// ==========================================

/**
 * Initialize both databases
 */
async function initDatabase() {
  SQL = await initSqlJs();

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Initialize activity database
  await initActivityDatabase();

  // Initialize config database
  await initConfigDatabase();

  return { activityDb, configDb };
}

/**
 * Initialize activity database (sessions, events)
 */
async function initActivityDatabase() {
  let buffer = null;
  if (fs.existsSync(ACTIVITY_DB_PATH)) {
    buffer = fs.readFileSync(ACTIVITY_DB_PATH);
  }

  activityDb = new SQL.Database(buffer);

  if (!buffer) {
    // New database - run schema
    const schema = fs.readFileSync(ACTIVITY_SCHEMA_PATH, 'utf8');
    activityDb.run(schema);
    saveActivityDatabase();
    console.log('✓ Activity database initialized');
  } else {
    console.log('✓ Activity database loaded');
  }

  // Run activity migrations
  runActivityMigrations();
}

/**
 * Initialize config database (projects, calendars, settings)
 */
async function initConfigDatabase() {
  let buffer = null;
  if (fs.existsSync(CONFIG_DB_PATH)) {
    buffer = fs.readFileSync(CONFIG_DB_PATH);
  }

  configDb = new SQL.Database(buffer);

  if (!buffer) {
    // New database - run schema
    const schema = fs.readFileSync(CONFIG_SCHEMA_PATH, 'utf8');
    configDb.run(schema);
    saveConfigDatabase();
    console.log('✓ Config database initialized');
  } else {
    console.log('✓ Config database loaded');
  }
}

// ==========================================
// Save Functions (CRITICAL: Separate saves)
// ==========================================

/**
 * Save activity database to disk
 */
function saveActivityDatabase() {
  if (!activityDb) return;

  try {
    const data = activityDb.export();
    const buffer = Buffer.from(data);
    const tempPath = ACTIVITY_DB_PATH + '.tmp';
    fs.writeFileSync(tempPath, buffer);
    fs.renameSync(tempPath, ACTIVITY_DB_PATH);
  } catch (error) {
    console.error('[ActivityDB] Failed to save:', error.message);
    throw error;
  }
}

/**
 * Save config database to disk
 */
function saveConfigDatabase() {
  if (!configDb) return;

  try {
    const data = configDb.export();
    const buffer = Buffer.from(data);
    const tempPath = CONFIG_DB_PATH + '.tmp';
    fs.writeFileSync(tempPath, buffer);
    fs.renameSync(tempPath, CONFIG_DB_PATH);
  } catch (error) {
    console.error('[ConfigDB] Failed to save:', error.message);
    throw error;
  }
}

/**
 * Legacy save function - saves both databases
 * @deprecated Use saveActivityDatabase or saveConfigDatabase instead
 */
function saveDatabase() {
  saveActivityDatabase();
  saveConfigDatabase();
}

// ==========================================
// Reload Functions
// ==========================================

/**
 * Reload activity database from disk
 */
async function reloadActivityDatabase() {
  if (!SQL) {
    SQL = await initSqlJs();
  }

  if (activityDb) {
    saveActivityDatabase();
    activityDb.close();
  }

  let buffer = null;
  if (fs.existsSync(ACTIVITY_DB_PATH)) {
    buffer = fs.readFileSync(ACTIVITY_DB_PATH);
  }

  activityDb = new SQL.Database(buffer);
}

/**
 * Reload config database from disk
 */
async function reloadConfigDatabase() {
  if (!SQL) {
    SQL = await initSqlJs();
  }

  if (configDb) {
    saveConfigDatabase();
    configDb.close();
  }

  let buffer = null;
  if (fs.existsSync(CONFIG_DB_PATH)) {
    buffer = fs.readFileSync(CONFIG_DB_PATH);
  }

  configDb = new SQL.Database(buffer);
}

/**
 * Reload both databases from disk
 */
async function reloadDatabase() {
  await reloadActivityDatabase();
  await reloadConfigDatabase();
}

// ==========================================
// Activity Migrations
// ==========================================

function runActivityMigrations() {
  if (!activityDb) return;

  // Ensure schema_migrations table exists
  try {
    activityDb.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);
  } catch (error) {
    console.error('Failed to create schema_migrations table:', error.message);
  }

  // Note: Old migrations are no longer needed for activity.db
  // The schema.sql already has the correct structure
  // Project/calendar tables have been moved to config.db
}

// ==========================================
// Close Functions
// ==========================================

/**
 * Close both database connections
 */
function closeDatabase() {
  if (activityDb) {
    saveActivityDatabase();
    activityDb.close();
    activityDb = null;
  }
  if (configDb) {
    saveConfigDatabase();
    configDb.close();
    configDb = null;
  }
}

// ==========================================
// Activity Database Functions
// ==========================================

/**
 * Insert an activity event
 */
function insertEvent({ timestamp, app_name, app_bundle_id, window_title, is_idle = false }) {
  if (!activityDb) throw new Error('Activity database not initialized');

  const stmt = activityDb.prepare(`
    INSERT INTO activity_events (timestamp, app_name, app_bundle_id, window_title, is_idle)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run([timestamp, app_name, app_bundle_id, window_title, is_idle ? 1 : 0]);
  stmt.free();

  saveActivityDatabase();
}

/**
 * Insert an activity session
 */
function insertSession({ start_time, end_time, duration_seconds, app_name, app_bundle_id, domain = null, project_id = null, page_title = null }) {
  if (!activityDb) throw new Error('Activity database not initialized');

  const stmt = activityDb.prepare(`
    INSERT INTO activity_sessions (start_time, end_time, duration_seconds, app_name, app_bundle_id, domain, project_id, page_title)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run([start_time, end_time, duration_seconds, app_name, app_bundle_id, domain, project_id, page_title]);
  stmt.free();

  saveActivityDatabase();
}

/**
 * Get recent events (for debugging)
 */
function getRecentEvents(limit = 10) {
  if (!activityDb) throw new Error('Activity database not initialized');

  const results = [];
  const stmt = activityDb.prepare(`
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
 * Get timeline data (hourly breakdown)
 */
function getTimelineData(dateString) {
  if (!activityDb) throw new Error('Activity database not initialized');

  const startOfDay = new Date(dateString).setHours(0, 0, 0, 0);
  const endOfDay = new Date(dateString).setHours(23, 59, 59, 999);

  const results = [];
  const stmt = activityDb.prepare(`
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
 * Assign session to project (writes to activity db)
 */
function assignSessionToProject(sessionId, projectId) {
  if (!activityDb) throw new Error('Activity database not initialized');

  const stmt = activityDb.prepare('UPDATE activity_sessions SET project_id = ? WHERE id = ?');
  stmt.run([projectId, sessionId]);
  stmt.free();

  saveActivityDatabase();
}

/**
 * Update all sessions matching a domain to assign them to a project
 */
function updateSessionsByDomain(domain, projectId) {
  if (!activityDb) throw new Error('Activity database not initialized');
  if (!domain) return 0;

  const stmt = activityDb.prepare(`
    UPDATE activity_sessions
    SET project_id = ?
    WHERE domain = ? AND (project_id IS NULL OR project_id = 0)
  `);

  stmt.run([projectId, domain]);
  stmt.free();

  const countStmt = activityDb.prepare('SELECT changes() as count');
  countStmt.step();
  const count = countStmt.getAsObject().count;
  countStmt.free();

  saveActivityDatabase();
  return count;
}

// ==========================================
// Config Database Functions - Settings
// ==========================================

/**
 * Get setting value
 */
function getSetting(key, defaultValue = null) {
  if (!configDb) throw new Error('Config database not initialized');

  const stmt = configDb.prepare('SELECT value FROM settings WHERE key = ?');
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
  if (!configDb) throw new Error('Config database not initialized');

  const stmt = configDb.prepare(`
    INSERT OR REPLACE INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
  `);

  stmt.run([key, value, Date.now()]);
  stmt.free();

  saveConfigDatabase();
}

// ==========================================
// Config Database Functions - Projects
// ==========================================

/**
 * Get all projects (non-archived)
 */
function getProjects() {
  if (!configDb) throw new Error('Config database not initialized');

  const results = [];
  const stmt = configDb.prepare('SELECT * FROM projects WHERE is_archived = 0 ORDER BY name');

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
  if (!configDb) throw new Error('Config database not initialized');

  const stmt = configDb.prepare('SELECT * FROM projects WHERE id = ?');
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
  if (!configDb) throw new Error('Config database not initialized');

  const stmt = configDb.prepare(`
    INSERT INTO projects (name, description, color)
    VALUES (?, ?, ?)
  `);

  stmt.run([name, description, color]);
  stmt.free();

  const idStmt = configDb.prepare('SELECT last_insert_rowid() as id');
  idStmt.step();
  const id = idStmt.getAsObject().id;
  idStmt.free();

  saveConfigDatabase();
  return id;
}

/**
 * Update project
 */
function updateProject(id, { name, description, color }) {
  if (!configDb) throw new Error('Config database not initialized');

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

  const stmt = configDb.prepare(`
    UPDATE projects
    SET ${updates.join(', ')}
    WHERE id = ?
  `);

  stmt.run(values);
  stmt.free();

  saveConfigDatabase();
}

/**
 * Archive project (soft delete)
 */
function archiveProject(id) {
  if (!configDb) throw new Error('Config database not initialized');

  const stmt = configDb.prepare('UPDATE projects SET is_archived = 1, updated_at = ? WHERE id = ?');
  stmt.run([Date.now(), id]);
  stmt.free();

  saveConfigDatabase();
}

// ==========================================
// Config Database Functions - Project Domains
// ==========================================

/**
 * Get all domains for a project
 */
function getProjectDomains(projectId) {
  if (!configDb) throw new Error('Config database not initialized');

  const results = [];
  const stmt = configDb.prepare('SELECT * FROM project_domains WHERE project_id = ?');
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
  if (!configDb) throw new Error('Config database not initialized');

  const stmt = configDb.prepare(`
    INSERT INTO project_domains (project_id, domain)
    VALUES (?, ?)
  `);

  try {
    stmt.run([projectId, domain]);
    stmt.free();
    saveConfigDatabase();
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
  if (!configDb) throw new Error('Config database not initialized');

  const stmt = configDb.prepare('DELETE FROM project_domains WHERE id = ?');
  stmt.run([id]);
  stmt.free();

  saveConfigDatabase();
}

/**
 * Find project ID by domain
 */
function findProjectByDomain(domain) {
  if (!configDb) throw new Error('Config database not initialized');
  if (!domain) return null;

  const stmt = configDb.prepare('SELECT project_id FROM project_domains WHERE domain = ? LIMIT 1');
  stmt.bind([domain]);

  let projectId = null;
  if (stmt.step()) {
    projectId = stmt.getAsObject().project_id;
  }
  stmt.free();

  return projectId;
}

// ==========================================
// Config Database Functions - Project Keywords
// ==========================================

/**
 * Get all keywords for a project
 */
function getProjectKeywords(projectId) {
  if (!configDb) throw new Error('Config database not initialized');

  const results = [];
  const stmt = configDb.prepare('SELECT * FROM project_calendar_keywords WHERE project_id = ? ORDER BY keyword');
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
  if (!configDb) throw new Error('Config database not initialized');

  const stmt = configDb.prepare(`
    INSERT INTO project_calendar_keywords (project_id, keyword)
    VALUES (?, ?)
  `);

  try {
    stmt.run([projectId, keyword]);
    stmt.free();
    saveConfigDatabase();
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
  if (!configDb) throw new Error('Config database not initialized');

  const stmt = configDb.prepare('DELETE FROM project_calendar_keywords WHERE id = ?');
  stmt.run([id]);
  stmt.free();

  saveConfigDatabase();
}

// ==========================================
// Config Database Functions - Calendar
// ==========================================

// Helper to create db wrapper for encryption
function getDbWrapper() {
  return {
    getSetting: (key, defaultValue) => getSetting(key, defaultValue),
    setSetting: (key, value) => setSetting(key, value),
    saveDatabase: () => saveConfigDatabase()
  };
}

/**
 * Get all active calendar subscriptions
 */
function getCalendarSubscriptions() {
  if (!configDb) throw new Error('Config database not initialized');

  const results = [];
  const stmt = configDb.prepare('SELECT * FROM calendar_subscriptions ORDER BY name');

  while (stmt.step()) {
    const row = stmt.getAsObject();
    try {
      results.push({
        id: row.id,
        name: row.name,
        ical_url: encryption.decrypt(row.ical_url, getDbWrapper()),
        provider: row.provider,
        is_active: row.is_active === 1,
        include_in_worktime: row.include_in_worktime === 1,
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
  if (!configDb) throw new Error('Config database not initialized');

  const stmt = configDb.prepare('SELECT * FROM calendar_subscriptions WHERE id = ?');
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
        include_in_worktime: row.include_in_worktime === 1,
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
  if (!configDb) throw new Error('Config database not initialized');

  try {
    const encryptedUrl = encryption.encrypt(ical_url, getDbWrapper());

    const stmt = configDb.prepare(`
      INSERT INTO calendar_subscriptions (name, ical_url, provider)
      VALUES (?, ?, ?)
    `);

    stmt.run([name, encryptedUrl, provider]);
    stmt.free();

    const idStmt = configDb.prepare('SELECT last_insert_rowid() as id');
    idStmt.step();
    const id = idStmt.getAsObject().id;
    idStmt.free();

    saveConfigDatabase();
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
  if (!configDb) throw new Error('Config database not initialized');

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

  const stmt = configDb.prepare(`
    UPDATE calendar_subscriptions
    SET ${updates.join(', ')}
    WHERE id = ?
  `);

  stmt.run(values);
  stmt.free();

  saveConfigDatabase();
}

/**
 * Update calendar subscription worktime setting
 */
function updateCalendarSubscriptionWorktime(id, includeInWorktime) {
  if (!configDb) throw new Error('Config database not initialized');

  const stmt = configDb.prepare(`
    UPDATE calendar_subscriptions
    SET include_in_worktime = ?, updated_at = ?
    WHERE id = ?
  `);

  stmt.run([includeInWorktime ? 1 : 0, Date.now(), id]);
  stmt.free();

  saveConfigDatabase();
}

/**
 * Update calendar subscription sync status
 */
function updateCalendarSubscriptionSync(id, { last_sync, last_error = null }) {
  if (!configDb) throw new Error('Config database not initialized');

  const stmt = configDb.prepare(`
    UPDATE calendar_subscriptions
    SET last_sync = ?, last_error = ?, updated_at = ?
    WHERE id = ?
  `);

  stmt.run([last_sync, last_error, Date.now(), id]);
  stmt.free();

  saveConfigDatabase();
}

/**
 * Delete calendar subscription
 */
function deleteCalendarSubscription(id) {
  if (!configDb) throw new Error('Config database not initialized');

  const stmt = configDb.prepare('DELETE FROM calendar_subscriptions WHERE id = ?');
  stmt.run([id]);
  stmt.free();

  saveConfigDatabase();
}

/**
 * Insert calendar event
 */
function insertCalendarEvent(eventData) {
  if (!configDb) throw new Error('Config database not initialized');

  const stmt = configDb.prepare(`
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
    saveConfigDatabase();
    return true;
  } catch (error) {
    stmt.free();
    console.error('Failed to insert calendar event:', error.message);
    throw error;
  }
}

/**
 * Insert calendar event WITHOUT saving to disk
 */
function insertCalendarEventNoSave(eventData) {
  if (!configDb) throw new Error('Config database not initialized');

  const stmt = configDb.prepare(`
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
    return true;
  } catch (error) {
    stmt.free();
    console.error('Failed to insert calendar event:', error.message);
    throw error;
  }
}

/**
 * Assign calendar event to project
 */
function assignCalendarEventToProject(eventId, projectId) {
  if (!configDb) throw new Error('Config database not initialized');

  const stmt = configDb.prepare('UPDATE calendar_events SET project_id = ?, updated_at = ? WHERE id = ?');
  stmt.run([projectId, Date.now(), eventId]);
  stmt.free();

  saveConfigDatabase();
}

// ==========================================
// Cross-Database Functions (Application-level joins)
// ==========================================

/**
 * Build a map of project_id -> project info
 */
function getProjectsMap() {
  const projects = getProjects();
  const map = {};
  projects.forEach(p => {
    map[p.id] = { name: p.name, color: p.color };
  });
  return map;
}

/**
 * Get daily report (aggregated by app/domain) - legacy single row
 */
function getDailyReport(dateString) {
  if (!activityDb) throw new Error('Activity database not initialized');

  const startOfDay = new Date(dateString).setHours(0, 0, 0, 0);
  const endOfDay = new Date(dateString).setHours(23, 59, 59, 999);

  const stmt = activityDb.prepare(`
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
 * Get all daily reports with project info (cross-database join)
 */
function getDailyReportAll(dateString, projectId = null) {
  if (!activityDb) throw new Error('Activity database not initialized');

  const startOfDay = new Date(dateString).setHours(0, 0, 0, 0);
  const endOfDay = new Date(dateString).setHours(23, 59, 59, 999);

  // Get sessions from activity database
  let query = `
    SELECT
      app_name,
      app_bundle_id,
      domain,
      project_id,
      SUM(duration_seconds) as total_seconds,
      COUNT(*) as session_count,
      GROUP_CONCAT(DISTINCT page_title) as page_titles
    FROM activity_sessions
    WHERE start_time >= ? AND start_time <= ?
  `;

  const params = [startOfDay, endOfDay];

  if (projectId !== null) {
    query += ` AND project_id = ?`;
    params.push(projectId);
  }

  query += `
    GROUP BY app_name, app_bundle_id, domain, project_id
    ORDER BY total_seconds DESC
  `;

  const results = [];
  const stmt = activityDb.prepare(query);
  stmt.bind(params);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();

  // Get project info from config database and merge
  const projectsMap = getProjectsMap();

  return results.map(row => ({
    ...row,
    project_name: row.project_id ? (projectsMap[row.project_id]?.name || null) : null,
    project_color: row.project_id ? (projectsMap[row.project_id]?.color || null) : null
  }));
}

/**
 * Get workday statistics (cross-database join)
 */
function getWorkdayStats(dateString) {
  if (!activityDb) throw new Error('Activity database not initialized');
  if (!configDb) throw new Error('Config database not initialized');

  const startOfDay = new Date(dateString).setHours(0, 0, 0, 0);
  const endOfDay = new Date(dateString).setHours(23, 59, 59, 999);

  // Get project map for lookups
  const projectsMap = getProjectsMap();

  // 1. Get activity sessions from activity database
  const sessions = [];
  const sessionStmt = activityDb.prepare(`
    SELECT start_time, end_time, duration_seconds, domain, project_id
    FROM activity_sessions
    WHERE start_time >= ? AND start_time <= ?
    ORDER BY start_time
  `);
  sessionStmt.bind([startOfDay, endOfDay]);
  while (sessionStmt.step()) {
    const row = sessionStmt.getAsObject();
    sessions.push({
      ...row,
      project_name: row.project_id ? (projectsMap[row.project_id]?.name || null) : null,
      project_color: row.project_id ? (projectsMap[row.project_id]?.color || null) : null
    });
  }
  sessionStmt.free();

  // 2. Get calendar events from config database (with subscription filter)
  const calendarEvents = [];
  const calStmt = configDb.prepare(`
    SELECT e.start_time, e.end_time, e.title, e.project_id
    FROM calendar_events e
    JOIN calendar_subscriptions cs ON e.subscription_id = cs.id
    WHERE e.start_time >= ? AND e.end_time <= ?
      AND e.is_all_day = 0
      AND cs.include_in_worktime = 1
    ORDER BY e.start_time
  `);
  calStmt.bind([startOfDay, endOfDay]);
  while (calStmt.step()) {
    const row = calStmt.getAsObject();
    calendarEvents.push({
      ...row,
      project_name: row.project_id ? (projectsMap[row.project_id]?.name || null) : null,
      project_color: row.project_id ? (projectsMap[row.project_id]?.color || null) : null
    });
  }
  calStmt.free();

  return { sessions, calendarEvents };
}

/**
 * Get calendar events for a specific date (with project info)
 */
function getCalendarEvents(dateString) {
  if (!configDb) throw new Error('Config database not initialized');

  const startOfDay = new Date(dateString).setHours(0, 0, 0, 0);
  const endOfDay = new Date(dateString).setHours(23, 59, 59, 999);

  // Get project map for lookups
  const projectsMap = getProjectsMap();

  const results = [];
  const stmt = configDb.prepare(`
    SELECT *
    FROM calendar_events
    WHERE start_time >= ? AND start_time <= ?
    ORDER BY start_time
  `);

  stmt.bind([startOfDay, endOfDay]);
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push({
      ...row,
      project_name: row.project_id ? (projectsMap[row.project_id]?.name || null) : null,
      project_color: row.project_id ? (projectsMap[row.project_id]?.color || null) : null
    });
  }
  stmt.free();

  return results;
}

// ==========================================
// Exports
// ==========================================

/**
 * Git Activity Functions
 */

/**
 * Get all git repositories
 */
function getGitRepositories() {
  if (!configDb) throw new Error('Config database not initialized');

  const results = [];
  const stmt = configDb.prepare(`
    SELECT r.*, p.name as project_name, p.color as project_color
    FROM git_repositories r
    LEFT JOIN projects p ON r.project_id = p.id
    ORDER BY r.repo_name
  `);

  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();

  return results;
}

/**
 * Get a single git repository by ID
 */
function getGitRepository(id) {
  if (!configDb) throw new Error('Config database not initialized');

  const stmt = configDb.prepare(`
    SELECT r.*, p.name as project_name, p.color as project_color
    FROM git_repositories r
    LEFT JOIN projects p ON r.project_id = p.id
    WHERE r.id = ?
  `);
  stmt.bind([id]);

  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();

  return result;
}

/**
 * Create a git repository entry
 */
function createGitRepository({ repo_path, repo_name, project_id = null, is_active = true }) {
  if (!configDb) throw new Error('Config database not initialized');

  const stmt = configDb.prepare(`
    INSERT INTO git_repositories (repo_path, repo_name, project_id, is_active)
    VALUES (?, ?, ?, ?)
  `);

  try {
    stmt.run([repo_path, repo_name, project_id, is_active ? 1 : 0]);
    stmt.free();

    // Get the inserted ID
    const idStmt = configDb.prepare('SELECT last_insert_rowid() as id');
    idStmt.step();
    const id = idStmt.getAsObject().id;
    idStmt.free();

    saveConfigDatabase();
    return id;
  } catch (error) {
    stmt.free();
    throw error;
  }
}

/**
 * Update git repository
 */
function updateGitRepository(id, { project_id, is_active, last_scanned, last_commit_hash }) {
  if (!configDb) throw new Error('Config database not initialized');

  const updates = [];
  const values = [];

  if (project_id !== undefined) {
    updates.push('project_id = ?');
    values.push(project_id);
  }
  if (is_active !== undefined) {
    updates.push('is_active = ?');
    values.push(is_active ? 1 : 0);
  }
  if (last_scanned !== undefined) {
    updates.push('last_scanned = ?');
    values.push(last_scanned);
  }
  if (last_commit_hash !== undefined) {
    updates.push('last_commit_hash = ?');
    values.push(last_commit_hash);
  }

  if (updates.length === 0) return;

  updates.push('updated_at = ?');
  values.push(Date.now());

  values.push(id);

  const stmt = configDb.prepare(`
    UPDATE git_repositories
    SET ${updates.join(', ')}
    WHERE id = ?
  `);

  stmt.run(values);
  stmt.free();

  saveConfigDatabase();
}

/**
 * Delete git repository
 */
function deleteGitRepository(id) {
  if (!configDb) throw new Error('Config database not initialized');

  const stmt = configDb.prepare('DELETE FROM git_repositories WHERE id = ?');
  stmt.run([id]);
  stmt.free();

  saveConfigDatabase();
}

/**
 * Insert git activity
 */
function insertGitActivity({
  repo_id,
  action_type,
  commit_hash = null,
  commit_message = null,
  branch_name = null,
  author_name = null,
  author_email = null,
  timestamp,
  project_id = null
}) {
  if (!configDb) throw new Error('Config database not initialized');

  const stmt = configDb.prepare(`
    INSERT INTO git_activity (
      repo_id, action_type, commit_hash, commit_message,
      branch_name, author_name, author_email, timestamp, project_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run([
    repo_id,
    action_type,
    commit_hash,
    commit_message,
    branch_name,
    author_name,
    author_email,
    timestamp,
    project_id
  ]);
  stmt.free();

  saveConfigDatabase();
}

/**
 * Get git activity for a date range
 */
function getGitActivity(startTime, endTime, projectId = null) {
  if (!configDb) throw new Error('Config database not initialized');

  let query = `
    SELECT
      a.*,
      r.repo_name,
      r.repo_path,
      p.name as project_name,
      p.color as project_color
    FROM git_activity a
    JOIN git_repositories r ON a.repo_id = r.id
    LEFT JOIN projects p ON a.project_id = p.id
    WHERE a.timestamp >= ? AND a.timestamp <= ?
  `;

  const params = [startTime, endTime];

  if (projectId !== null) {
    query += ' AND a.project_id = ?';
    params.push(projectId);
  }

  query += ' ORDER BY a.timestamp DESC';

  const results = [];
  const stmt = configDb.prepare(query);
  stmt.bind(params);

  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();

  return results;
}

/**
 * Get git activity summary for a day (aggregated by repo/project)
 */
function getGitActivitySummary(dateString, projectId = null) {
  if (!configDb) throw new Error('Config database not initialized');

  const startOfDay = new Date(dateString).setHours(0, 0, 0, 0);
  const endOfDay = new Date(dateString).setHours(23, 59, 59, 999);

  let query = `
    SELECT
      a.repo_id,
      r.repo_name,
      r.repo_path,
      a.project_id,
      p.name as project_name,
      p.color as project_color,
      COUNT(*) as activity_count,
      COUNT(CASE WHEN a.action_type = 'commit' THEN 1 END) as commit_count,
      COUNT(CASE WHEN a.action_type = 'merge' THEN 1 END) as merge_count,
      MIN(a.timestamp) as first_activity,
      MAX(a.timestamp) as last_activity
    FROM git_activity a
    JOIN git_repositories r ON a.repo_id = r.id
    LEFT JOIN projects p ON a.project_id = p.id
    WHERE a.timestamp >= ? AND a.timestamp <= ?
  `;

  const params = [startOfDay, endOfDay];

  if (projectId !== null) {
    query += ' AND a.project_id = ?';
    params.push(projectId);
  }

  query += `
    GROUP BY a.repo_id, a.project_id
    ORDER BY activity_count DESC
  `;

  const results = [];
  const stmt = configDb.prepare(query);
  stmt.bind(params);

  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();

  return results;
}

module.exports = {
  // Initialization
  initDatabase,
  closeDatabase,

  // Save functions
  saveDatabase,
  saveActivityDatabase,
  saveConfigDatabase,

  // Reload functions
  reloadDatabase,
  reloadActivityDatabase,
  reloadConfigDatabase,

  // Activity database functions
  insertEvent,
  insertSession,
  getRecentEvents,
  getTimelineData,
  assignSessionToProject,
  updateSessionsByDomain,

  // Cross-database reports
  getDailyReport,
  getDailyReportAll,
  getWorkdayStats,

  // Config database - Settings
  getSetting,
  setSetting,

  // Config database - Projects
  getProjects,
  getProject,
  createProject,
  updateProject,
  archiveProject,

  // Config database - Project domains
  getProjectDomains,
  addProjectDomain,
  removeProjectDomain,
  findProjectByDomain,

  // Config database - Project keywords
  getProjectKeywords,
  addProjectKeyword,
  removeProjectKeyword,

  // Config database - Calendar
  getCalendarSubscriptions,
  getCalendarSubscription,
  addCalendarSubscription,
  updateCalendarSubscription,
  updateCalendarSubscriptionWorktime,
  updateCalendarSubscriptionSync,
  deleteCalendarSubscription,
  insertCalendarEvent,
  insertCalendarEventNoSave,
  getCalendarEvents,
  assignCalendarEventToProject,

  // Git activity functions
  getGitRepositories,
  getGitRepository,
  createGitRepository,
  updateGitRepository,
  deleteGitRepository,
  insertGitActivity,
  getGitActivity,
  getGitActivitySummary
};
