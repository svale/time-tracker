-- Migration 002: Add Page Titles
-- Adds page_title column to activity_sessions for storing browser page titles

-- Add page_title to activity_sessions
ALTER TABLE activity_sessions ADD COLUMN page_title TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_title ON activity_sessions(page_title);
