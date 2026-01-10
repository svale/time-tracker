# Data Persistence Bug - Exploration

## Status
Round: 1 (Root Cause Found) | Started: 2026-01-09 | Last updated: 2026-01-09

## Root Cause

**Race condition between daemon and server sharing the same SQLite database via sql.js (in-memory).**

### The Problem

Both daemon and server:
1. Load the entire database into memory on startup
2. Have **separate in-memory copies** of the database
3. Save their copy to disk after mutations
4. Periodically reload from disk

### Data Loss Scenario

1. Database on disk has: sessions + projects + calendars
2. Daemon starts → loads DB into memory (has everything)
3. Server starts → loads DB into memory (has everything)
4. User adds a project via server → server saves to disk ✓
5. Daemon still has OLD copy in memory (no project)
6. Daemon inserts a session → **daemon saves its stale copy to disk**
7. **Project is overwritten/lost!**

The daemon only reloads from disk every 60 seconds, creating a 60-second window where any server changes can be lost.

### Code Evidence

```javascript
// daemon/index.js:38-49 - Only reloads every 60 seconds
const DB_RELOAD_INTERVAL = 60 * 1000;

// database/db.js:170 - Every session insert saves to disk
function insertSession(...) {
  ...
  saveDatabase(); // Overwrites disk with daemon's (possibly stale) copy
}
```

## Confirmed Requirements

- User data (projects, calendars, settings) MUST NOT be lost
- Activity logging should not interfere with user configuration
- Solution should work with the two-process architecture (daemon + server)

## Solutions Considered

### Option A: Reload Before Every Save (Quick Fix)

Change `saveDatabase()` to reload first, then merge changes.

**Pros:** Minimal code change
**Cons:**
- Performance hit (reload on every insert)
- Still has tiny race window
- Complex merge logic needed

### Option B: Separate Database Files (Recommended)

Split into two databases:
- `activity.db` - Sessions only (high-write, daemon-owned)
- `config.db` - Projects, calendars, settings (low-write, server-owned)

**Pros:**
- Clean separation of concerns
- No race conditions
- Each process owns its database
- Follows single-writer principle

**Cons:**
- Migration needed
- Some queries need adjustment (JOINs won't work across DBs)

### Option C: Single Writer Architecture

Only the daemon writes to the database. Server sends commands via IPC/file/socket.

**Pros:** Eliminates race condition entirely
**Cons:** Major architecture change, complex IPC

### Option D: Use Real SQLite (not sql.js)

Use `better-sqlite3` which works with file locking.

**Pros:** Industry standard, proper locking
**Cons:** Requires native compilation, may have issues with sql.js migrations

## Recommended Solution: Option B (Separate Databases)

**Rationale:**
1. Clean separation: daemon owns activity data, server owns config data
2. No complex synchronization needed
3. Each database can be optimized for its use case
4. Minimal runtime overhead
5. Server can still read activity.db for reports (read-only)

### Implementation Plan

1. Create `config.db` with tables: `projects`, `project_domains`, `project_calendar_keywords`, `calendar_subscriptions`, `calendar_events`, `settings`
2. Keep `activity.db` with: `activity_events`, `activity_sessions`
3. Modify daemon to ONLY write to `activity.db`
4. Modify server to write config to `config.db`, read from both
5. Remove cross-DB foreign keys (use application-level joins)
6. Migration script to move existing data

## Next Steps

1. Confirm this solution approach
2. Create detailed implementation plan
3. Write migration script
4. Update db.js to handle two databases
