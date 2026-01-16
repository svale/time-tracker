-- Migration: Add matched_keyword column to calendar_events
-- Stores which keyword triggered the auto-match to a project

ALTER TABLE calendar_events ADD COLUMN matched_keyword TEXT;
