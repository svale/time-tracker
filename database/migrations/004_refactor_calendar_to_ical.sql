-- Migration 004: Refactor Calendar to use iCal feeds instead of OAuth
-- Replace oauth_tokens with calendar_subscriptions for multiple calendar support

-- Drop OAuth tokens table (no longer needed)
DROP TABLE IF EXISTS oauth_tokens;

-- Create calendar subscriptions table for iCal feeds
CREATE TABLE IF NOT EXISTS calendar_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,                  -- User-friendly name (e.g., "Work Calendar", "Personal")
    ical_url TEXT NOT NULL,              -- iCal feed URL (encrypted)
    provider TEXT DEFAULT 'google',      -- google, outlook, apple, other
    is_active BOOLEAN DEFAULT 1,
    last_sync INTEGER,                   -- Last successful sync timestamp
    last_error TEXT,                     -- Last error message if sync failed
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- Add subscription_id to calendar_events to track which calendar it came from
-- First check if column exists (in case migration runs multiple times)
ALTER TABLE calendar_events ADD COLUMN subscription_id INTEGER REFERENCES calendar_subscriptions(id) ON DELETE CASCADE;

-- Create index for querying events by subscription
CREATE INDEX IF NOT EXISTS idx_calendar_events_subscription ON calendar_events(subscription_id);
