# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Time Tracker is a privacy-focused macOS application that tracks time by reading browser history (Chrome & Safari) to understand how users spend their work hours. No accessibility permissions required - it works by directly reading browser history database files.

## Core Architecture

### Two-Process System

The application runs as two separate processes:

1. **Daemon Process** (`daemon/index.js`): Background service that periodically reads browser history
2. **Web Server** (`server/index.js`): Express server serving the UI at `http://localhost:8765`

### Data Flow

```
Browser History DBs → daemon reads every 5min → aggregates into sessions → SQLite (data/activity.db) → web server queries → UI displays
```

### Key Components

**Daemon (`daemon/`):**
- `index.js`: Entry point, initializes DB and starts tracking
- `tracker.js`: Orchestrates periodic browser history processing
- `browser-history.js`: Reads Chrome/Safari history databases
  - Copies locked browser DBs to temp files using `sql.js`
  - Chrome: timestamps are microseconds since 1601-01-01
  - Safari: timestamps are seconds since 2001-01-01 (Cocoa epoch)
  - Aggregates visits into sessions (consecutive visits to same domain within 5min threshold)
- `domain-extractor.js`: Extracts domains from URLs

**Database (`database/`):**
- `db.js`: SQLite wrapper using `sql.js` (in-memory with periodic saves)
- `schema.sql`: Two main tables:
  - `activity_events`: Raw events (5-second polls) - currently unused by browser history version
  - `activity_sessions`: Aggregated time sessions with domain/app/duration
  - `settings`: Key-value configuration store

**Server (`server/`):**
- `index.js`: Express server initialization
- `routes/api.js`: REST endpoints for reports, settings
- `routes/pages.js`: Serves HTML views
- `views/`: Static HTML pages (dashboard, reports, settings)

**Scripts (`scripts/`):**
- `install-daemon.sh`: Creates macOS LaunchAgent for auto-start at login
- `uninstall-daemon.sh`: Removes LaunchAgent
- `setup.sh`: Initial setup script

## Common Commands

```bash
# Development
npm install              # Install dependencies
npm start               # Start daemon (background tracker)
npm run server          # Start web server at localhost:8765
npm run dev             # Start daemon with auto-reload (nodemon)

# Installation as background service
bash scripts/install-daemon.sh    # Install LaunchAgent (runs at login)
bash scripts/uninstall-daemon.sh  # Remove LaunchAgent

# Logs (when running as LaunchAgent)
tail -f ~/Library/Logs/timetracker.log
tail -f ~/Library/Logs/timetracker-error.log
```

## Important Implementation Details

### Browser History Reading

- Both Chrome and Safari lock their history databases while running
- Solution: Copy database files to `/tmp` before reading with `sql.js`
- Timestamp conversions are critical:
  - Chrome: `(microseconds_since_1601 - 11644473600000000) / 1000` → JS timestamp
  - Safari: `(seconds_since_2001 + 978307200) * 1000` → JS timestamp

### Session Aggregation Logic

Sessions are created by grouping consecutive visits to the same domain:
- Default gap threshold: 5 minutes (configurable via `session_gap_minutes` setting)
- Visits to same domain within threshold extend the session
- Different domain or gap exceeded → new session
- Minimum session duration: 1 second

### Database Pattern

Uses `sql.js` (SQLite compiled to WebAssembly) running in-memory:
- Database loaded from `data/activity.db` on startup
- `saveDatabase()` writes to disk after each insert (can be optimized)
- Always call `db.saveDatabase()` after mutations
- Always call `db.closeDatabase()` on shutdown to prevent data loss

### Settings Management

Settings stored in `settings` table, accessed via:
- `db.getSetting(key, defaultValue)`
- `db.setSetting(key, value)`

Key settings:
- `polling_interval_minutes`: How often to check browser history (default: 5)
- `session_gap_minutes`: Max gap to group visits into same session (default: 5)
- `excluded_domains`: JSON array of domains to ignore

## macOS-Specific Considerations

- Browser history paths are hardcoded for macOS:
  - Chrome: `~/Library/Application Support/Google/Chrome/Default/History`
  - Safari: `~/Library/Safari/History.db`
- LaunchAgent plist requires absolute paths to node and daemon script
- No accessibility permissions needed (key privacy feature)
