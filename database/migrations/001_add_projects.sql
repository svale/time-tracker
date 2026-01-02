-- Migration 001: Add Projects Feature
-- Creates projects, project_domains tables and adds project_id to activity_sessions

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

-- Add project_id to activity_sessions
ALTER TABLE activity_sessions ADD COLUMN project_id INTEGER REFERENCES projects(id);

CREATE INDEX IF NOT EXISTS idx_sessions_project ON activity_sessions(project_id);

-- Migration tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);
