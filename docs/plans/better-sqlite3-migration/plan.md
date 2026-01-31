# Better-SQLite3 Migration Plan

## Summary

Replace sql.js (in-memory SQLite) with better-sqlite3 (native SQLite bindings) to fix data loss issues. This migration also:
- Moves data from `./data/` to `~/.time-tracker/`
- Merges two databases (`activity.db` + `config.db`) into single `timetracker.db`
- Removes manual save/reload logic (better-sqlite3 writes directly to disk)
- Enables WAL mode for safe concurrent access between daemon and server

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `package.json` | Modify | Add better-sqlite3, remove sql.js |
| `database/db.js` | Rewrite | Complete rewrite for better-sqlite3 |
| `database/schema.sql` | Rewrite | Merge both schemas into one |
| `database/config-schema.sql` | Delete | No longer needed |
| `daemon/index.js` | Modify | Remove db reload interval, add WAL checkpoint |
| `server/index.js` | Modify | Minor cleanup (remove reload if any) |
| `.gitignore` | Modify | Update data directory path |

## Implementation Steps

### Step 1: Create Feature Branch

```bash
git checkout -b feature/better-sqlite3-migration
```

### Step 2: Update Dependencies

```bash
npm uninstall sql.js
npm install better-sqlite3
```

Update `package.json` to remove sql.js and add better-sqlite3.

### Step 3: Create Unified Schema

Create new `database/schema.sql` that merges both schemas:

```sql
-- Time Tracker Database Schema (Unified)
-- Single database: ~/.time-tracker/timetracker.db

-- ==========================================
-- Activity Tables (from old activity.db)
-- ==========================================

CREATE TABLE IF NOT EXISTS activity_events (...);
CREATE TABLE IF NOT EXISTS activity_sessions (...);
CREATE TABLE IF NOT EXISTS focus_samples (...);

-- ==========================================
-- Config Tables (from old config.db)
-- ==========================================

CREATE TABLE IF NOT EXISTS projects (...);
CREATE TABLE IF NOT EXISTS project_domains (...);
CREATE TABLE IF NOT EXISTS project_calendar_keywords (...);
CREATE TABLE IF NOT EXISTS calendar_subscriptions (...);
CREATE TABLE IF NOT EXISTS calendar_events (...);
CREATE TABLE IF NOT EXISTS git_repositories (...);
CREATE TABLE IF NOT EXISTS git_activity (...);

-- ==========================================
-- Shared Tables
-- ==========================================

CREATE TABLE IF NOT EXISTS settings (...);
CREATE TABLE IF NOT EXISTS schema_migrations (...);

-- Default settings (merged from both)
INSERT OR IGNORE INTO settings (key, value) VALUES (...);
```

### Step 4: Rewrite database/db.js

Key changes:

**Initialization (synchronous with better-sqlite3):**
```javascript
const Database = require('better-sqlite3');
const os = require('os');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(os.homedir(), '.time-tracker');
const DB_PATH = path.join(DATA_DIR, 'timetracker.db');

let db = null;

function initDatabase() {
  // Ensure directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Open database (creates if not exists)
  db = new Database(DB_PATH);

  // Enable WAL mode and busy timeout
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

  // Run schema if new database
  const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'").get();
  if (!tableCheck) {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    db.exec(schema);
    console.log('✓ Database initialized');
  } else {
    console.log('✓ Database loaded');
  }

  // Run migrations
  runMigrations();

  return db;
}
```

**Remove these functions entirely:**
- `saveActivityDatabase()` - writes are automatic
- `saveConfigDatabase()` - writes are automatic
- `saveDatabase()` - writes are automatic
- `reloadActivityDatabase()` - WAL handles sync
- `reloadConfigDatabase()` - WAL handles sync
- `reloadDatabase()` - WAL handles sync
- All `activityDb` / `configDb` separation - single `db`

**Update all database operations:**
- Change from `activityDb.prepare()` / `configDb.prepare()` to `db.prepare()`
- Remove all `saveDatabase()` calls after writes
- Use synchronous API (better-sqlite3 is sync)

**Add WAL checkpoint function:**
```javascript
function walCheckpoint() {
  if (db) {
    db.pragma('wal_checkpoint(TRUNCATE)');
  }
}
```

**Add graceful close:**
```javascript
function closeDatabase() {
  if (db) {
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    db = null;
  }
}
```

### Step 5: Update daemon/index.js

Remove the database reload interval (no longer needed):
```javascript
// DELETE THIS:
const dbReloadInterval = setInterval(async () => {
  await db.reloadDatabase();
}, 60 * 1000);
```

Add WAL checkpoint interval:
```javascript
// ADD THIS:
const WAL_CHECKPOINT_INTERVAL = 5 * 60 * 1000; // 5 minutes
const walCheckpointInterval = setInterval(() => {
  db.walCheckpoint();
}, WAL_CHECKPOINT_INTERVAL);
```

Update shutdown to call checkpoint:
```javascript
function shutdown() {
  // ... existing cleanup ...
  db.closeDatabase(); // This now does checkpoint + close
}
```

Change `initDatabase()` call from async to sync:
```javascript
// Change from:
await db.initDatabase();
// To:
db.initDatabase();
```

### Step 6: Update server/index.js

Change `initDatabase()` call from async to sync:
```javascript
// Change from:
await db.initDatabase();
// To:
db.initDatabase();
```

### Step 7: Update .gitignore

Change data directory reference:
```gitignore
# Old
data/

# New - data is in ~/.time-tracker/ now
# No change needed to .gitignore, but remove old data/ exclusion if desired
```

### Step 8: Delete Obsolete Files

```bash
rm database/config-schema.sql
```

### Step 9: Test

1. **Start daemon:**
   ```bash
   npm start
   ```
   - Verify database created at `~/.time-tracker/timetracker.db`
   - Verify WAL files created (`-wal`, `-shm`)
   - Check activity sessions being recorded

2. **Start server (separate terminal):**
   ```bash
   npm run server
   ```
   - Verify can read sessions from dashboard
   - Verify settings page works
   - Create a project, verify it persists

3. **Concurrent access test:**
   - With both running, create project in UI
   - Check daemon logs - no errors
   - Stop and restart daemon - project still exists

4. **Crash recovery test:**
   - Kill daemon with `kill -9`
   - Restart - verify no data loss

## Testing Strategy

### Manual Tests
1. Fresh install - database created correctly
2. Daemon + Server concurrent access
3. Settings persistence across restarts
4. Project creation and domain mapping
5. Calendar subscription sync
6. Focus samples recording
7. Kill -9 recovery (no data loss)

### Verification Queries
```sql
-- Check database opened correctly
.tables

-- Check WAL mode enabled
PRAGMA journal_mode;  -- Should return 'wal'

-- Check settings exist
SELECT * FROM settings;

-- Check sessions being recorded
SELECT COUNT(*) FROM activity_sessions;
```

## Rollback Plan

If issues arise:
1. Revert to main branch
2. Old `./data/` databases are untouched
3. No data loss path

## Migration Checklist

- [ ] Create feature branch
- [ ] Update package.json dependencies
- [ ] Create merged schema.sql
- [ ] Rewrite database/db.js
- [ ] Update daemon/index.js
- [ ] Update server/index.js
- [ ] Delete config-schema.sql
- [ ] Test fresh install
- [ ] Test concurrent access
- [ ] Test crash recovery
- [ ] Create PR
- [ ] Merge to main
