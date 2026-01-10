-- Config Database Schema
-- Contains user configuration: projects, calendars, settings
-- This database is owned by the server process

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

-- Application settings
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- Default settings
INSERT OR IGNORE INTO settings (key, value) VALUES ('polling_interval_minutes', '5');
INSERT OR IGNORE INTO settings (key, value) VALUES ('session_gap_minutes', '5');
INSERT OR IGNORE INTO settings (key, value) VALUES ('excluded_domains', '[]');

-- Migration tracking for config database
CREATE TABLE IF NOT EXISTS config_schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);
