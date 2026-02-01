-- Time Tracker Database Schema (Unified)
-- Single database: ~/.time-tracker/timetracker.db

-- ==========================================
-- Activity Tables (from old activity.db)
-- ==========================================

-- Raw activity events (logged every 5 seconds)
CREATE TABLE IF NOT EXISTS activity_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,           -- Unix timestamp (milliseconds)
    app_name TEXT NOT NULL,               -- Application name (e.g., "Google Chrome")
    app_bundle_id TEXT NOT NULL,          -- Bundle ID (e.g., "com.google.Chrome")
    window_title TEXT,                    -- Window title
    is_idle BOOLEAN DEFAULT 0,            -- Whether user was idle
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_events_timestamp ON activity_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_app_bundle ON activity_events(app_bundle_id);
CREATE INDEX IF NOT EXISTS idx_events_idle ON activity_events(is_idle);

-- Aggregated activity sessions
CREATE TABLE IF NOT EXISTS activity_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    start_time INTEGER NOT NULL,          -- Session start (milliseconds)
    end_time INTEGER NOT NULL,            -- Session end (milliseconds)
    duration_seconds INTEGER NOT NULL,    -- Duration in seconds
    app_name TEXT NOT NULL,
    app_bundle_id TEXT NOT NULL,
    domain TEXT,                          -- Extracted domain for browsers
    category TEXT,                        -- Optional category
    project_id INTEGER,                   -- Foreign key to projects
    page_title TEXT,                      -- Page title for browser sessions
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_time ON activity_sessions(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_sessions_domain ON activity_sessions(domain);
CREATE INDEX IF NOT EXISTS idx_sessions_app ON activity_sessions(app_bundle_id);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON activity_sessions(project_id);

-- Focus samples table for tracking browser focus state
CREATE TABLE IF NOT EXISTS focus_samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,        -- When sample was taken (ms)
    app_name TEXT,                     -- Frontmost app name
    browser TEXT,                      -- 'Chrome', 'Safari', or null
    domain TEXT,                       -- Domain of active tab (if browser focused)
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_focus_timestamp ON focus_samples(timestamp);
CREATE INDEX IF NOT EXISTS idx_focus_domain ON focus_samples(domain);

-- ==========================================
-- Config Tables (from old config.db)
-- ==========================================

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    color TEXT DEFAULT '#3B82F6',
    is_archived BOOLEAN DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(is_archived);

-- Domain to project mapping (for automatic categorization)
CREATE TABLE IF NOT EXISTS project_domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    domain TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE(project_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_project_domains_lookup ON project_domains(domain);

-- Calendar keywords for project matching
CREATE TABLE IF NOT EXISTS project_calendar_keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    keyword TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE(project_id, keyword)
);

CREATE INDEX IF NOT EXISTS idx_project_keywords_lookup ON project_calendar_keywords(keyword);

-- Calendar subscriptions (iCal feeds)
CREATE TABLE IF NOT EXISTS calendar_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    ical_url TEXT NOT NULL,
    provider TEXT DEFAULT 'ical',
    is_active BOOLEAN DEFAULT 1,
    include_in_worktime BOOLEAN DEFAULT 1,
    last_sync INTEGER,
    last_error TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- Calendar events (synced from iCal feeds)
CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT NOT NULL,
    provider TEXT DEFAULT 'ical',
    calendar_id TEXT,
    subscription_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    duration_seconds INTEGER NOT NULL,
    project_id INTEGER,
    matched_keyword TEXT,
    is_all_day BOOLEAN DEFAULT 0,
    location TEXT,
    attendees_count INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (subscription_id) REFERENCES calendar_subscriptions(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    UNIQUE(external_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_time ON calendar_events(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_subscription ON calendar_events(subscription_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_project ON calendar_events(project_id);

-- Git repositories table - stores repos we're tracking
CREATE TABLE IF NOT EXISTS git_repositories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_path TEXT NOT NULL UNIQUE,
    repo_name TEXT NOT NULL,
    project_id INTEGER,
    is_active BOOLEAN DEFAULT 1,
    last_commit_hash TEXT,
    last_scanned INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_git_repositories_project ON git_repositories(project_id);

-- Git activity table - stores individual git events
CREATE TABLE IF NOT EXISTS git_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id INTEGER NOT NULL,
    action_type TEXT NOT NULL,
    commit_hash TEXT,
    commit_message TEXT,
    branch_name TEXT,
    author_name TEXT,
    author_email TEXT,
    timestamp INTEGER NOT NULL,
    project_id INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (repo_id) REFERENCES git_repositories(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_git_activity_timestamp ON git_activity(timestamp);
CREATE INDEX IF NOT EXISTS idx_git_activity_repo ON git_activity(repo_id);
CREATE INDEX IF NOT EXISTS idx_git_activity_project ON git_activity(project_id);

-- ==========================================
-- Shared Tables
-- ==========================================

-- Application settings
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- Migration tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- ==========================================
-- Default settings (merged from both schemas)
-- ==========================================

INSERT OR IGNORE INTO settings (key, value) VALUES ('polling_interval_minutes', '5');
INSERT OR IGNORE INTO settings (key, value) VALUES ('session_gap_minutes', '5');
INSERT OR IGNORE INTO settings (key, value) VALUES ('excluded_domains', '[]');
INSERT OR IGNORE INTO settings (key, value) VALUES ('git_scan_interval_minutes', '5');
INSERT OR IGNORE INTO settings (key, value) VALUES ('git_scan_enabled', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('focus_tracking_enabled', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('focus_poll_interval_seconds', '30');
INSERT OR IGNORE INTO settings (key, value) VALUES ('max_session_duration_minutes', '30');
