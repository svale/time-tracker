# Data Storage Solutions - Exploration

## Status
Round: COMPLETE | Started: 2026-01-24 | Last updated: 2026-01-24

## Problem Statement

Data loss occurring with current sql.js (in-memory SQLite) implementation, especially:
- User-provided data (projects, settings) disappearing
- Issues during start/stop cycles
- Problems during migrations when adding features

## Final Decisions

### Storage Solution: better-sqlite3 with WAL mode
- Replace sql.js with better-sqlite3
- Enable WAL mode for safe concurrent access
- Writes go directly to disk (no manual saveDatabase())

### Data Location: `~/.time-tracker/`
- Migrate from `./data/` to `~/.time-tracker/`
- Standard CLI tool convention

### Database Architecture: Single database
- Merge `activity.db` and `config.db` into `timetracker.db`
- WAL mode handles concurrency between daemon and server
- Simpler architecture, fewer files to manage

### Existing Data: Fresh start
- No migration of old data needed
- Activity data can be re-collected
- Early development allows clean breaks

### Settings Storage: Keep in SQLite
- No extraction to YAML/JSON needed
- Simpler, transactional, works well

### Implementation: Feature branch + PR
- Develop on a new branch
- Merge via PR when stable
- Big steps are acceptable in early development

## Concurrency Confirmation

WAL mode is sufficient for our use case (see `research/wal-concurrency.md`):
- Readers never block writers
- Only one writer at a time, but writes are fast (1-50ms)
- `busy_timeout = 5000` means second writer waits rather than failing
- Daemon writes frequently (sessions, focus samples)
- Server writes rarely (settings, projects)

## Implementation Summary

### New Database Setup
```javascript
const Database = require('better-sqlite3');
const os = require('os');
const path = require('path');

const DATA_DIR = path.join(os.homedir(), '.time-tracker');
const DB_PATH = path.join(DATA_DIR, 'timetracker.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
```

### Key Changes
1. **Replace sql.js with better-sqlite3**
2. **Move data to `~/.time-tracker/`**
3. **Merge to single `timetracker.db`**
4. **Remove all `saveDatabase()` calls** - writes are automatic
5. **Remove `reloadDatabase()`** - WAL handles sync
6. **Add WAL checkpoint** - every 5 minutes in daemon
7. **Graceful shutdown** - final checkpoint on SIGTERM

### Schema Merge
Combine tables from both schemas:
- From activity.db: `activity_events`, `activity_sessions`, `focus_samples`, `schema_migrations`
- From config.db: `settings`, `projects`, `project_domains`, `project_calendar_keywords`, `calendar_subscriptions`, `calendar_events`, `git_repositories`, `git_activity`

## Context
- macOS-only currently
- Privacy-focused (no cloud requirement)
- Two-process architecture (daemon + web server)
- Node.js runtime
- Early development stage

## Key Research
- `research/storage-options-comparison.md` - PostgreSQL vs better-sqlite3 analysis
- `research/wal-concurrency.md` - WAL mode concurrency confirmation

## Next Steps

The exploration is complete. Ready to create implementation plan (RPI) with:
1. Create feature branch
2. Install better-sqlite3, remove sql.js
3. Rewrite database/db.js with new architecture
4. Update daemon and server initialization
5. Test concurrent access
6. PR and merge
