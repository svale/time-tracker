/**
 * Database Module - better-sqlite3 with WAL mode
 *
 * Single database at ~/.time-tracker/timetracker.db
 * Uses WAL mode for safe concurrent access between daemon and server
 * No manual save/reload needed - writes go directly to disk
 */

const Database = require('better-sqlite3');
const os = require('os');
const path = require('path');
const fs = require('fs');
const encryption = require('../server/utils/encryption');

// Database paths
const DATA_DIR = path.join(os.homedir(), '.time-tracker');
const DB_PATH = path.join(DATA_DIR, 'timetracker.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// Database instance
let db = null;

// ==========================================
// Database Initialization
// ==========================================

/**
 * Initialize the database (synchronous)
 */
function initDatabase() {
  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Open database (creates if not exists)
  db = new Database(DB_PATH);

  // Enable WAL mode and busy timeout for concurrent access
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

  // Check if database needs initialization
  const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'").get();
  if (!tableCheck) {
    // New database - run schema
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.exec(schema);
    console.log('✓ Database initialized at', DB_PATH);
  } else {
    console.log('✓ Database loaded from', DB_PATH);
  }

  // Run migrations
  runMigrations();

  return db;
}

/**
 * Run database migrations
 */
function runMigrations() {
  if (!db) return;

  // Ensure schema_migrations table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);

  // Migration 7: First migration for unified database
  // Mark as applied since we're starting fresh with unified schema
  const check7 = db.prepare("SELECT version FROM schema_migrations WHERE version = 7").get();
  if (!check7) {
    db.prepare("INSERT OR IGNORE INTO schema_migrations (version) VALUES (7)").run();
    console.log('✓ Migration 7: Unified database schema initialized');
  }
}

/**
 * WAL checkpoint - call periodically to keep WAL file size manageable
 */
function walCheckpoint() {
  if (db) {
    db.pragma('wal_checkpoint(TRUNCATE)');
  }
}

/**
 * Close database connection
 */
function closeDatabase() {
  if (db) {
    // Checkpoint before closing to ensure all data is in main database file
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    db = null;
    console.log('✓ Database closed');
  }
}

// ==========================================
// Backward Compatibility - Deprecated Functions
// ==========================================

// These functions are kept for backward compatibility but are no-ops
// better-sqlite3 writes directly to disk, no manual save needed
function saveDatabase() {}
function saveActivityDatabase() {}
function saveConfigDatabase() {}
function reloadDatabase() {}
function reloadActivityDatabase() {}
function reloadConfigDatabase() {}

// ==========================================
// Activity Database Functions
// ==========================================

/**
 * Insert an activity event
 */
function insertEvent({ timestamp, app_name, app_bundle_id, window_title, is_idle = false }) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(`
    INSERT INTO activity_events (timestamp, app_name, app_bundle_id, window_title, is_idle)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(timestamp, app_name, app_bundle_id, window_title, is_idle ? 1 : 0);
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

  stmt.run(start_time, end_time, duration_seconds, app_name, app_bundle_id, domain, project_id, page_title);
}

/**
 * Get recent events (for debugging)
 */
function getRecentEvents(limit = 10) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(`
    SELECT * FROM activity_events
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  return stmt.all(limit);
}

/**
 * Get timeline data (hourly breakdown)
 */
function getTimelineData(dateString) {
  if (!db) throw new Error('Database not initialized');

  const startOfDay = new Date(dateString).setHours(0, 0, 0, 0);
  const endOfDay = new Date(dateString).setHours(23, 59, 59, 999);

  const stmt = db.prepare(`
    SELECT
      strftime('%H:00', start_time / 1000, 'unixepoch', 'localtime') as hour,
      SUM(duration_seconds) as total_seconds
    FROM activity_sessions
    WHERE start_time >= ? AND start_time <= ?
    GROUP BY hour
    ORDER BY hour
  `);

  return stmt.all(startOfDay, endOfDay);
}

/**
 * Assign session to project
 */
function assignSessionToProject(sessionId, projectId) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('UPDATE activity_sessions SET project_id = ? WHERE id = ?');
  stmt.run(projectId, sessionId);
}

/**
 * Update all sessions matching a domain to assign them to a project
 */
function updateSessionsByDomain(domain, projectId) {
  if (!db) throw new Error('Database not initialized');
  if (!domain) return 0;

  const stmt = db.prepare(`
    UPDATE activity_sessions
    SET project_id = ?
    WHERE domain = ? AND (project_id IS NULL OR project_id = 0)
  `);

  const result = stmt.run(projectId, domain);
  return result.changes;
}

// ==========================================
// Focus Samples Functions
// ==========================================

/**
 * Insert a focus sample
 */
function insertFocusSample({ timestamp, app_name, browser, domain }) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(`
    INSERT INTO focus_samples (timestamp, app_name, browser, domain)
    VALUES (?, ?, ?, ?)
  `);

  stmt.run(timestamp, app_name, browser, domain);
}

/**
 * Get focus samples within a time range
 */
function getFocusSamples(startTime, endTime) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(`
    SELECT * FROM focus_samples
    WHERE timestamp >= ? AND timestamp <= ?
    ORDER BY timestamp
  `);

  return stmt.all(startTime, endTime);
}

/**
 * Get focus samples for a specific domain within a time range
 */
function getFocusSamplesForDomain(domain, startTime, endTime) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(`
    SELECT * FROM focus_samples
    WHERE domain = ? AND timestamp >= ? AND timestamp <= ?
    ORDER BY timestamp
  `);

  return stmt.all(domain, startTime, endTime);
}

/**
 * Count focus samples matching browser and domain within a time range
 */
function countFocusSamplesForSession(browser, domain, startTime, endTime) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM focus_samples
    WHERE browser = ? AND domain = ? AND timestamp >= ? AND timestamp <= ?
  `);

  const result = stmt.get(browser, domain, startTime, endTime);
  return result.count;
}

/**
 * Delete focus samples older than a given timestamp
 */
function cleanupOldFocusSamples(olderThanTimestamp) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('DELETE FROM focus_samples WHERE timestamp < ?');
  const result = stmt.run(olderThanTimestamp);
  return result.changes;
}

// ==========================================
// Settings Functions
// ==========================================

/**
 * Get setting value
 */
function getSetting(key, defaultValue = null) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const result = stmt.get(key);

  return result ? result.value : defaultValue;
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

  stmt.run(key, value, Date.now());
}

// ==========================================
// Projects Functions
// ==========================================

/**
 * Get all projects (non-archived)
 */
function getProjects() {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('SELECT * FROM projects WHERE is_archived = 0 ORDER BY name');
  return stmt.all();
}

/**
 * Get single project by ID
 */
function getProject(id) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('SELECT * FROM projects WHERE id = ?');
  return stmt.get(id);
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

  const result = stmt.run(name, description, color);
  return result.lastInsertRowid;
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

  stmt.run(...values);
}

/**
 * Archive project (soft delete)
 */
function archiveProject(id) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('UPDATE projects SET is_archived = 1, updated_at = ? WHERE id = ?');
  stmt.run(Date.now(), id);
}

// ==========================================
// Project Domains Functions
// ==========================================

/**
 * Get all domains for a project
 */
function getProjectDomains(projectId) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('SELECT * FROM project_domains WHERE project_id = ?');
  return stmt.all(projectId);
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
    stmt.run(projectId, domain);
    return true;
  } catch (error) {
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
  stmt.run(id);
}

/**
 * Find project ID by domain
 */
function findProjectByDomain(domain) {
  if (!db) throw new Error('Database not initialized');
  if (!domain) return null;

  const stmt = db.prepare('SELECT project_id FROM project_domains WHERE domain = ? LIMIT 1');
  const result = stmt.get(domain);

  return result ? result.project_id : null;
}

// ==========================================
// Project Keywords Functions
// ==========================================

/**
 * Get all keywords for a project
 */
function getProjectKeywords(projectId) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('SELECT * FROM project_calendar_keywords WHERE project_id = ? ORDER BY keyword');
  return stmt.all(projectId);
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

  stmt.run(projectId, keyword);
  return true;
}

/**
 * Remove keyword from project
 */
function removeProjectKeyword(id) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('DELETE FROM project_calendar_keywords WHERE id = ?');
  stmt.run(id);
}

// ==========================================
// Calendar Functions
// ==========================================

// Helper to create db wrapper for encryption
function getDbWrapper() {
  return {
    getSetting: (key, defaultValue) => getSetting(key, defaultValue),
    setSetting: (key, value) => setSetting(key, value),
    saveDatabase: () => {} // No-op for better-sqlite3
  };
}

/**
 * Get all active calendar subscriptions
 */
function getCalendarSubscriptions() {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('SELECT * FROM calendar_subscriptions ORDER BY name');
  const rows = stmt.all();

  return rows.map(row => {
    try {
      return {
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
      return null;
    }
  }).filter(Boolean);
}

/**
 * Get a single calendar subscription by ID
 */
function getCalendarSubscription(id) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('SELECT * FROM calendar_subscriptions WHERE id = ?');
  const row = stmt.get(id);

  if (!row) return null;

  try {
    return {
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
    return null;
  }
}

/**
 * Add a new calendar subscription
 */
function addCalendarSubscription({ name, ical_url, provider = 'google' }) {
  if (!db) throw new Error('Database not initialized');

  const encryptedUrl = encryption.encrypt(ical_url, getDbWrapper());

  const stmt = db.prepare(`
    INSERT INTO calendar_subscriptions (name, ical_url, provider)
    VALUES (?, ?, ?)
  `);

  const result = stmt.run(name, encryptedUrl, provider);
  return result.lastInsertRowid;
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

  stmt.run(...values);
}

/**
 * Update calendar subscription worktime setting
 */
function updateCalendarSubscriptionWorktime(id, includeInWorktime) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(`
    UPDATE calendar_subscriptions
    SET include_in_worktime = ?, updated_at = ?
    WHERE id = ?
  `);

  stmt.run(includeInWorktime ? 1 : 0, Date.now(), id);
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

  stmt.run(last_sync, last_error, Date.now(), id);
}

/**
 * Delete calendar subscription
 */
function deleteCalendarSubscription(id) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('DELETE FROM calendar_subscriptions WHERE id = ?');
  stmt.run(id);
}

/**
 * Insert calendar event
 */
function insertCalendarEvent(eventData) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO calendar_events (
      external_id, provider, calendar_id, title, description,
      start_time, end_time, duration_seconds, project_id, matched_keyword,
      is_all_day, location, attendees_count, subscription_id, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    eventData.external_id,
    eventData.provider || 'ical',
    eventData.calendar_id || null,
    eventData.title,
    eventData.description || null,
    eventData.start_time,
    eventData.end_time,
    eventData.duration_seconds,
    eventData.project_id || null,
    eventData.matched_keyword || null,
    eventData.is_all_day ? 1 : 0,
    eventData.location || null,
    eventData.attendees_count || 0,
    eventData.subscription_id || null,
    Date.now()
  );

  return true;
}

/**
 * Insert calendar event - same as insertCalendarEvent (no-save variant deprecated)
 */
function insertCalendarEventNoSave(eventData) {
  return insertCalendarEvent(eventData);
}

/**
 * Assign calendar event to project
 */
function assignCalendarEventToProject(eventId, projectId) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('UPDATE calendar_events SET project_id = ?, updated_at = ? WHERE id = ?');
  stmt.run(projectId, Date.now(), eventId);
}

// ==========================================
// Cross-Database Functions
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
  if (!db) throw new Error('Database not initialized');

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

  return stmt.get(startOfDay, endOfDay);
}

/**
 * Get all daily reports with project info
 */
function getDailyReportAll(dateString, projectId = null) {
  if (!db) throw new Error('Database not initialized');

  const startOfDay = new Date(dateString).setHours(0, 0, 0, 0);
  const endOfDay = new Date(dateString).setHours(23, 59, 59, 999);

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

  const stmt = db.prepare(query);
  const results = stmt.all(...params);

  // Get project info and merge
  const projectsMap = getProjectsMap();

  return results.map(row => ({
    ...row,
    project_name: row.project_id ? (projectsMap[row.project_id]?.name || null) : null,
    project_color: row.project_id ? (projectsMap[row.project_id]?.color || null) : null
  }));
}

/**
 * Get workday statistics
 */
function getWorkdayStats(dateString) {
  if (!db) throw new Error('Database not initialized');

  const startOfDay = new Date(dateString).setHours(0, 0, 0, 0);
  const endOfDay = new Date(dateString).setHours(23, 59, 59, 999);

  // Get project map for lookups
  const projectsMap = getProjectsMap();

  // 1. Get activity sessions
  const sessionStmt = db.prepare(`
    SELECT start_time, end_time, duration_seconds, domain, project_id
    FROM activity_sessions
    WHERE start_time >= ? AND start_time <= ?
    ORDER BY start_time
  `);
  const sessionRows = sessionStmt.all(startOfDay, endOfDay);

  const sessions = sessionRows.map(row => ({
    ...row,
    project_name: row.project_id ? (projectsMap[row.project_id]?.name || null) : null,
    project_color: row.project_id ? (projectsMap[row.project_id]?.color || null) : null
  }));

  // 2. Get calendar events (with subscription filter)
  const calStmt = db.prepare(`
    SELECT e.start_time, e.end_time, e.title, e.project_id
    FROM calendar_events e
    JOIN calendar_subscriptions cs ON e.subscription_id = cs.id
    WHERE e.start_time >= ? AND e.end_time <= ?
      AND e.is_all_day = 0
      AND cs.include_in_worktime = 1
    ORDER BY e.start_time
  `);
  const calRows = calStmt.all(startOfDay, endOfDay);

  const calendarEvents = calRows.map(row => ({
    ...row,
    project_name: row.project_id ? (projectsMap[row.project_id]?.name || null) : null,
    project_color: row.project_id ? (projectsMap[row.project_id]?.color || null) : null
  }));

  return { sessions, calendarEvents };
}

/**
 * Get calendar events for a specific date (with project info)
 */
function getCalendarEvents(dateString) {
  if (!db) throw new Error('Database not initialized');

  const startOfDay = new Date(dateString).setHours(0, 0, 0, 0);
  const endOfDay = new Date(dateString).setHours(23, 59, 59, 999);

  // Get project map for lookups
  const projectsMap = getProjectsMap();

  const stmt = db.prepare(`
    SELECT *
    FROM calendar_events
    WHERE start_time >= ? AND start_time <= ?
    ORDER BY start_time
  `);

  const rows = stmt.all(startOfDay, endOfDay);

  return rows.map(row => ({
    ...row,
    project_name: row.project_id ? (projectsMap[row.project_id]?.name || null) : null,
    project_color: row.project_id ? (projectsMap[row.project_id]?.color || null) : null
  }));
}

// ==========================================
// Git Activity Functions
// ==========================================

/**
 * Get all git repositories
 */
function getGitRepositories() {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(`
    SELECT r.*, p.name as project_name, p.color as project_color
    FROM git_repositories r
    LEFT JOIN projects p ON r.project_id = p.id
    ORDER BY r.repo_name
  `);

  return stmt.all();
}

/**
 * Get a single git repository by ID
 */
function getGitRepository(id) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(`
    SELECT r.*, p.name as project_name, p.color as project_color
    FROM git_repositories r
    LEFT JOIN projects p ON r.project_id = p.id
    WHERE r.id = ?
  `);

  return stmt.get(id);
}

/**
 * Create a git repository entry
 */
function createGitRepository({ repo_path, repo_name, project_id = null, is_active = true }) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(`
    INSERT INTO git_repositories (repo_path, repo_name, project_id, is_active)
    VALUES (?, ?, ?, ?)
  `);

  const result = stmt.run(repo_path, repo_name, project_id, is_active ? 1 : 0);
  return result.lastInsertRowid;
}

/**
 * Update git repository
 */
function updateGitRepository(id, { project_id, is_active, last_scanned, last_commit_hash }) {
  if (!db) throw new Error('Database not initialized');

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

  const stmt = db.prepare(`
    UPDATE git_repositories
    SET ${updates.join(', ')}
    WHERE id = ?
  `);

  stmt.run(...values);
}

/**
 * Delete git repository
 */
function deleteGitRepository(id) {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('DELETE FROM git_repositories WHERE id = ?');
  stmt.run(id);
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
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(`
    INSERT INTO git_activity (
      repo_id, action_type, commit_hash, commit_message,
      branch_name, author_name, author_email, timestamp, project_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    repo_id,
    action_type,
    commit_hash,
    commit_message,
    branch_name,
    author_name,
    author_email,
    timestamp,
    project_id
  );
}

/**
 * Get git activity for a date range
 */
function getGitActivity(startTime, endTime, projectId = null) {
  if (!db) throw new Error('Database not initialized');

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

  const stmt = db.prepare(query);
  return stmt.all(...params);
}

/**
 * Get git activity summary for a day (aggregated by repo/project)
 */
function getGitActivitySummary(dateString, projectId = null) {
  if (!db) throw new Error('Database not initialized');

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

  const stmt = db.prepare(query);
  return stmt.all(...params);
}

// ==========================================
// Exports
// ==========================================

module.exports = {
  // Initialization
  initDatabase,
  closeDatabase,
  walCheckpoint,

  // Backward compatibility (deprecated, no-ops)
  saveDatabase,
  saveActivityDatabase,
  saveConfigDatabase,
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

  // Focus samples
  insertFocusSample,
  getFocusSamples,
  getFocusSamplesForDomain,
  countFocusSamplesForSession,
  cleanupOldFocusSamples,

  // Cross-database reports
  getDailyReport,
  getDailyReportAll,
  getWorkdayStats,

  // Settings
  getSetting,
  setSetting,

  // Projects
  getProjects,
  getProject,
  createProject,
  updateProject,
  archiveProject,

  // Project domains
  getProjectDomains,
  addProjectDomain,
  removeProjectDomain,
  findProjectByDomain,

  // Project keywords
  getProjectKeywords,
  addProjectKeyword,
  removeProjectKeyword,

  // Calendar
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

  // Git activity
  getGitRepositories,
  getGitRepository,
  createGitRepository,
  updateGitRepository,
  deleteGitRepository,
  insertGitActivity,
  getGitActivity,
  getGitActivitySummary
};
