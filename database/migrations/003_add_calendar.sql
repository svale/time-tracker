-- Migration 003: Add Google Calendar Integration
-- Calendar events, OAuth tokens, and project calendar keywords

-- Calendar events table
CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'google',
    calendar_id TEXT,
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
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    UNIQUE(provider, external_id)
);

-- Index for querying events by time range
CREATE INDEX IF NOT EXISTS idx_calendar_events_time ON calendar_events(start_time, end_time);

-- Index for querying events by project
CREATE INDEX IF NOT EXISTS idx_calendar_events_project ON calendar_events(project_id);

-- Project calendar keywords for automatic event matching
CREATE TABLE IF NOT EXISTS project_calendar_keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    keyword TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Index for keyword lookups
CREATE INDEX IF NOT EXISTS idx_project_keywords ON project_calendar_keywords(project_id);

-- OAuth tokens table (tokens stored encrypted)
CREATE TABLE IF NOT EXISTS oauth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL UNIQUE,
    access_token TEXT NOT NULL,      -- ENCRYPTED
    refresh_token TEXT,               -- ENCRYPTED
    expires_at INTEGER,               -- Timestamp in milliseconds
    scope TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);
