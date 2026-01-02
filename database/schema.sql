-- Time Tracker Database Schema

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
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_sessions_time ON activity_sessions(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_sessions_domain ON activity_sessions(domain);
CREATE INDEX IF NOT EXISTS idx_sessions_app ON activity_sessions(app_bundle_id);

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

-- Migration tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);
