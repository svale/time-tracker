-- Migration 005: Add Git Activity Tracking
-- Track local git repository activity (commits, branches, merges)

-- Git repositories table - stores repos we're tracking
CREATE TABLE IF NOT EXISTS git_repositories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_path TEXT NOT NULL UNIQUE,          -- Absolute path to repo (e.g., /Users/john/projects/myapp)
    repo_name TEXT NOT NULL,                 -- Extracted name (e.g., "myapp")
    project_id INTEGER,                      -- Associated project
    is_active BOOLEAN DEFAULT 1,             -- Whether to track this repo
    last_commit_hash TEXT,                   -- Last commit we've seen
    last_scanned INTEGER,                    -- Last time we scanned this repo
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

-- Git activity table - stores individual git events
CREATE TABLE IF NOT EXISTS git_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id INTEGER NOT NULL,                -- Which repository
    action_type TEXT NOT NULL,               -- commit, merge, branch, rebase, pull, cherry-pick
    commit_hash TEXT,                        -- Full commit SHA
    commit_message TEXT,                     -- Commit message (first line)
    branch_name TEXT,                        -- Branch where action occurred
    author_name TEXT,                        -- Git author name
    author_email TEXT,                       -- Git author email
    timestamp INTEGER NOT NULL,              -- When the action happened (from git)
    project_id INTEGER,                      -- Cached project_id for faster queries
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (repo_id) REFERENCES git_repositories(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_git_activity_timestamp ON git_activity(timestamp);
CREATE INDEX IF NOT EXISTS idx_git_activity_repo ON git_activity(repo_id);
CREATE INDEX IF NOT EXISTS idx_git_activity_project ON git_activity(project_id);
CREATE INDEX IF NOT EXISTS idx_git_activity_type ON git_activity(action_type);
CREATE INDEX IF NOT EXISTS idx_git_repositories_project ON git_repositories(project_id);

-- Settings for git tracking
INSERT OR IGNORE INTO settings (key, value) VALUES ('git_scan_interval_minutes', '5');
INSERT OR IGNORE INTO settings (key, value) VALUES ('git_scan_enabled', 'true');
