# WAL Mode Concurrency - Research Note

**Date:** January 2026
**Question:** Is WAL mode sufficient for two processes (daemon + server) writing to the same database?

## Answer: Yes, with proper configuration

### How WAL Works

SQLite WAL (Write-Ahead Logging) mode:
- **Readers never block writers, writers never block readers**
- Multiple readers can operate simultaneously
- Only one writer at a time, but writes are fast
- Second writer waits (with configurable timeout) rather than failing

### Our Use Case

**Daemon process:**
- Writes activity sessions (every 5 minutes)
- Writes focus samples (every 30 seconds)
- High-frequency writes, but small transactions

**Server process:**
- Writes settings, projects, calendar subscriptions (rare, user-initiated)
- Reads activity data for reports (frequent)

### Concurrency Analysis

With `busy_timeout = 5000` (5 seconds):
- If daemon is writing when server wants to write settings → server waits up to 5s
- Typical SQLite write takes 1-50ms → wait is imperceptible
- Reads continue unimpeded during writes

### Implementation

```javascript
const Database = require('better-sqlite3');
const db = new Database('~/.time-tracker/timetracker.db');
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');  // Wait up to 5s if another writer is active
```

### When This Would Be a Problem

WAL concurrency would fail if:
- Multiple processes writing continuously (not our case)
- Very long transactions (our writes are simple INSERTs)
- No busy_timeout configured (would get SQLITE_BUSY errors)

### Conclusion

**Single database with WAL mode is safe for this application.**

The previous two-database architecture was needed because sql.js ran in-memory with no real file locking. better-sqlite3 uses native SQLite which handles this correctly.

## References
- [SQLite WAL Mode](https://sqlite.org/wal.html)
- [better-sqlite3 Concurrency](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/threads.md)
