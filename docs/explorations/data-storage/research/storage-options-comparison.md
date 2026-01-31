# Data Storage Options Comparison

**Date:** January 2026
**Context:** Time Tracker - macOS desktop application with two Node.js processes (daemon + web server)
**Current Problem:** sql.js (in-memory SQLite) causes data synchronization issues and potential data loss between processes

---

## Executive Summary

After researching three storage options for our dual-process Node.js time tracker application, **better-sqlite3** emerges as the recommended solution. It provides the right balance of simplicity, performance, and reliability for a single-user desktop application while maintaining compatibility with future cloud hosting and native macOS app development.

| Criteria | PostgreSQL | better-sqlite3 | Hybrid (PG + Files) |
|----------|------------|-----------------|---------------------|
| Setup Complexity | High | Low | Medium |
| Concurrency | Excellent | Good (with WAL) | Mixed |
| Data Safety | Excellent | Excellent | Good |
| Resource Usage | 60-200MB idle | 5-20MB | Variable |
| Cloud Migration | Trivial | Requires planning | Partial |
| Swift Compatibility | Good | Excellent | Mixed |
| Recommendation | Overkill | **Best Choice** | Unnecessary |

---

## Option 1: PostgreSQL (Local via Homebrew/Docker)

### Overview

PostgreSQL is a full-featured client-server relational database. It runs as a background process (daemon) and applications connect via TCP sockets.

### Installation Methods

**Homebrew (simpler):**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Docker (isolated):**
```bash
docker run -d --name timetracker-db \
  -e POSTGRES_PASSWORD=secret \
  -p 5432:5432 postgres:15
```

### Pros

1. **Excellent Concurrency**
   - MVCC (Multi-Version Concurrency Control) means readers never block writers
   - Can handle hundreds of concurrent connections effortlessly
   - No need to think about file locking or WAL checkpoints

2. **Data Safety**
   - ACID compliant with robust write-ahead logging
   - Built-in backup tools (pg_dump, pg_basebackup)
   - Point-in-time recovery capabilities

3. **Cloud Migration Path**
   - Direct migration to hosted PostgreSQL (Supabase, Neon, AWS RDS, Heroku)
   - No schema changes needed when moving to cloud

4. **Rich Feature Set**
   - JSONB for flexible schema portions
   - Full-text search built-in
   - Advanced data types (arrays, ranges, intervals)

### Cons

1. **Significant Setup Burden for End Users**
   - Requires Homebrew or Docker installation
   - Users must manage a database server process
   - Credentials management adds complexity
   - Postgres.app is simpler but system upgrades can break it

2. **Resource Overhead**
   - Idle memory: ~60-200MB with default settings
   - Per-connection: ~1.5-3MB fresh, up to ~10MB after queries with temp tables
   - Constantly running background service consuming resources

3. **Deployment Complexity**
   - Must bundle or require PostgreSQL installation
   - Version compatibility issues between client/server
   - macOS security prompts for network access

### Node.js Ecosystem Support

```javascript
// Using pg (node-postgres) - most popular
const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  database: 'timetracker',
  port: 5432
});

// Or using Drizzle ORM
import { drizzle } from 'drizzle-orm/node-postgres';
```

**Popular libraries:**
- `pg` (node-postgres): 7M+ weekly downloads, mature and stable
- `postgres` (porsager): 400K+ weekly downloads, modern alternative
- ORMs: Prisma, Drizzle, Sequelize all have excellent PostgreSQL support

### Swift/macOS Compatibility

- PostgreSQL can be accessed via libpq (C library) from Swift
- GRDB.swift and similar libraries focus on SQLite, not PostgreSQL
- Would require network communication even for local connections
- Not as seamless as SQLite for native macOS app integration

---

## Option 2: better-sqlite3 (Native SQLite Bindings)

### Overview

better-sqlite3 is a native Node.js binding to SQLite that provides synchronous access to a file-based database with proper file locking. Unlike sql.js, it works directly with database files on disk.

### Why Not sql.js?

Our current sql.js approach has fundamental problems:
- Runs entirely in-memory; requires explicit saves to disk
- No automatic file locking or durability
- Two processes = two separate in-memory databases = data conflicts

### How better-sqlite3 Solves This

```javascript
const Database = require('better-sqlite3');
const db = new Database('data/activity.db');
db.pragma('journal_mode = WAL');  // Critical for multi-process
```

With WAL mode:
- Multiple processes can open the same database file
- One writer + many readers can operate simultaneously
- SQLite handles all file locking automatically

### Pros

1. **Zero Infrastructure Setup**
   - Just a npm package; no external services
   - Database is a single file in the app directory
   - Users don't know or care there's a database

2. **Excellent Performance**
   - ~2x faster than async sqlite3 package
   - Synchronous API actually provides better concurrency for SQLite's serialized nature
   - "With proper indexing, better-sqlite3 has been able to achieve upward of 2000 queries per second"

3. **Low Resource Usage**
   - Memory: Typically 5-20MB depending on database size and cache settings
   - No background process when app isn't running
   - Single file storage (with WAL: db file + -wal + -shm)

4. **Production Ready**
   - 2.4M+ weekly npm downloads (now exceeds sqlite3)
   - Used in Electron apps, CLI tools, and Node.js servers
   - Active maintenance and community

5. **Data Durability**
   - Writes are durable by default (fsync)
   - WAL mode provides crash recovery
   - Easy backup: just copy the .db file (when not writing)

### Cons

1. **Native Module Compilation**
   - Requires node-gyp and C++ toolchain for installation
   - Can fail on some systems (though this is rare on macOS)
   - Adds complexity for Electron packaging

2. **Concurrent Write Limitations**
   - Only one writer at a time (second writer waits with configurable timeout)
   - For our use case: daemon writes, server mostly reads = fine
   - High write contention scenarios need design consideration

3. **Cloud Migration Requires Planning**
   - Can't just point at a cloud PostgreSQL
   - Options exist (Turso, LiteFS) but are less mature
   - May need to implement sync logic or migrate to different DB

4. **WAL Checkpoint Management**
   - Long-running readers can prevent WAL file cleanup
   - Need periodic `PRAGMA wal_checkpoint(RESTART)` for long-running processes
   - Our use case: daemon runs continuously, should checkpoint periodically

### Multi-Process Architecture

```javascript
// daemon/index.js
const Database = require('better-sqlite3');
const db = new Database('data/activity.db');
db.pragma('journal_mode = WAL');

// Periodic checkpoint to prevent WAL growth
setInterval(() => {
  db.pragma('wal_checkpoint(TRUNCATE)');
}, 5 * 60 * 1000); // Every 5 minutes

// server/index.js
const Database = require('better-sqlite3');
const db = new Database('data/activity.db', { readonly: true });
// Read-only mode for the server (since it only reads)
```

### Node.js Ecosystem Support

- **better-sqlite3**: 2.4M+ weekly downloads, actively maintained
- **Drizzle ORM**: Excellent better-sqlite3 support
- **Kysely**: Type-safe query builder with SQLite dialect
- **Knex**: Popular query builder, supports better-sqlite3

### Swift/macOS Compatibility

**Excellent compatibility:**
- SQLite is built into macOS (libsqlite3)
- Can use the same .db file from Swift code
- Popular Swift libraries: GRDB.swift, SQLite.swift
- Core Data uses SQLite as its storage backend
- No network layer needed; direct file access

```swift
// Using GRDB.swift
import GRDB
let dbPath = "path/to/activity.db"
let dbQueue = try DatabaseQueue(path: dbPath)

try dbQueue.read { db in
    let sessions = try ActivitySession.fetchAll(db)
}
```

---

## Option 3: Hybrid Approach (PostgreSQL + Flat Files)

### Overview

This approach uses PostgreSQL for activity/session data while storing settings in YAML/JSON flat files.

### Architecture

```
data/
├── activity.db        # Activity sessions (PostgreSQL or SQLite)
└── config/
    ├── settings.yaml  # User settings (polling interval, excluded domains)
    └── projects.yaml  # Project definitions and domain mappings
```

### Pros

1. **Settings Portability**
   - Human-readable configuration files
   - Easy manual editing for power users
   - Version control friendly
   - YAML supports comments (JSON doesn't)

2. **Clear Separation of Concerns**
   - Time-series data in proper database
   - Configuration in appropriate format

### Cons

1. **Added Complexity**
   - Two storage systems to manage
   - Settings changes require file watching or restart
   - Atomic updates harder with files (vs database transactions)

2. **Consistency Challenges**
   - No foreign key relationships between settings and data
   - Project references in sessions can become orphaned

3. **Doesn't Solve Core Problem**
   - Still need to choose PostgreSQL or SQLite for activity data
   - Hybrid doesn't avoid the main database decision

### When Flat Files Make Sense

Popular apps like Obsidian use markdown files because their entire value proposition is file portability and user ownership:

> "All notes are simple Markdown files stored in a vault. There is no proprietary database needed for core usage."

For a time tracker, settings in files provide marginal benefit compared to a simple `settings` table:

```sql
-- Current approach: clean and transactional
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME
);
```

**Recommendation:** Keep settings in the database unless there's a specific user requirement for file-based configuration.

---

## What Similar Apps Use

### Time Trackers

| App | Storage Technology | Notes |
|-----|-------------------|-------|
| Anuko Time Tracker | MySQL/MariaDB | Web-based, multi-user |
| Kimai | MySQL/MariaDB | Self-hosted, team focused |
| CLI Time Trackers | SQLite | Single-user, single file |

### Desktop Apps (General)

| App | Storage | Notes |
|-----|---------|-------|
| Obsidian | Markdown files | Note-taking; files ARE the product |
| VS Code | JSON + SQLite | Settings in JSON, state in SQLite |
| Slack Desktop | SQLite | Local cache and state |
| Discord | SQLite (LevelDB for cache) | Local data storage |
| 1Password | SQLite | Encrypted local vault |

### Pattern Observed

- **Single-user desktop apps overwhelmingly use SQLite**
- PostgreSQL is used when multi-user collaboration is a core requirement
- Flat files are used when user portability/editability is a feature (note apps, config files)

---

## Cloud Hosting Compatibility

### SQLite Cloud Options

1. **Turso (libSQL)**
   - SQLite-compatible, distributed database
   - Embedded replicas for offline-first apps
   - Free tier available
   - "A complete SQLite drop-in replacement"

2. **LiteFS (Fly.io)**
   - Distributed SQLite replication
   - FUSE-based file system approach
   - Managed backups with point-in-time recovery

3. **Cloudflare D1**
   - SQLite-based serverless database
   - Designed for Workers/edge deployment

4. **Manual Sync**
   - Export/import SQL dumps
   - Sync library (Turso embedded replicas)
   - Custom sync protocol

### PostgreSQL Cloud Options

- Supabase (generous free tier)
- Neon (serverless, scale-to-zero)
- Railway, Render, Heroku
- AWS RDS, Google Cloud SQL

**Verdict:** PostgreSQL has more mature cloud hosting, but SQLite cloud options (especially Turso) are rapidly improving. For a single-user app that may someday want cloud sync, either path is viable.

---

## Detailed Comparison

### Ease of Setup for End Users

| Criteria | PostgreSQL | better-sqlite3 |
|----------|------------|----------------|
| Installation | Requires Homebrew/Docker + database creation | `npm install` only |
| Configuration | Connection strings, credentials | File path only |
| First-run Experience | Multiple steps, possible errors | Automatic |
| Troubleshooting | Database server issues | Rare file permission issues |
| **Score** | 2/5 | 5/5 |

### Concurrency Handling

| Criteria | PostgreSQL | better-sqlite3 (WAL) |
|----------|------------|---------------------|
| Concurrent Reads | Unlimited | Unlimited |
| Concurrent Writes | Unlimited (MVCC) | One at a time (queued) |
| Read-Write Mix | No blocking | Readers don't block writers |
| Our Use Case | Overkill | Sufficient |
| **Score** | 5/5 | 4/5 |

### Data Safety/Durability

| Criteria | PostgreSQL | better-sqlite3 |
|----------|------------|----------------|
| ACID Compliance | Full | Full (with WAL) |
| Crash Recovery | Automatic | Automatic (WAL) |
| Corruption Risk | Very low | Very low |
| Backup Complexity | pg_dump or streaming | Copy file |
| **Score** | 5/5 | 5/5 |

### Resource Usage

| Criteria | PostgreSQL | better-sqlite3 |
|----------|------------|----------------|
| Memory (idle) | 60-200MB | 5-20MB |
| CPU (idle) | Background process | None |
| Disk | Database cluster | Single file |
| Battery Impact | Constant service | On-demand only |
| **Score** | 2/5 | 5/5 |

### Cloud Hosting Compatibility

| Criteria | PostgreSQL | better-sqlite3 |
|----------|------------|----------------|
| Hosted Options | Many (mature) | Growing (Turso, D1) |
| Migration Effort | Point and connect | Requires planning |
| Multi-device Sync | Built-in replication | Needs sync layer |
| **Score** | 5/5 | 3/5 |

### Swift/Native macOS Compatibility

| Criteria | PostgreSQL | better-sqlite3 |
|----------|------------|----------------|
| Library Support | Limited (libpq) | Excellent (GRDB, etc.) |
| Integration Model | Network (localhost) | Direct file access |
| macOS Built-in | No | Yes (libsqlite3) |
| Core Data Compatible | No | Uses SQLite backend |
| **Score** | 2/5 | 5/5 |

---

## Is PostgreSQL Overkill?

**Yes, for this use case.**

PostgreSQL excels at:
- Multi-user applications with concurrent writes
- Complex queries across large datasets
- Applications requiring advanced data types
- Server deployments where it's already running

Our time tracker has:
- Single user
- Two processes (one writer, one reader)
- Simple relational schema
- Desktop deployment on user's machine

> "For most small to medium self-hosting projects where simplicity and good read performance are paramount, SQLite has proven to be a more than capable option."

The overhead of requiring users to install and manage PostgreSQL far outweighs any benefits for this application.

---

## Recommendation

### Primary: better-sqlite3 with WAL Mode

**Implementation plan:**

1. **Replace sql.js with better-sqlite3**
   ```javascript
   const Database = require('better-sqlite3');
   const db = new Database('data/activity.db');
   db.pragma('journal_mode = WAL');
   db.pragma('busy_timeout = 5000');  // Wait up to 5s if locked
   ```

2. **Daemon writes, Server reads**
   - Daemon: Opens database in read-write mode
   - Server: Opens database in read-only mode (or read-write for settings)

3. **Periodic WAL checkpointing**
   ```javascript
   // In daemon, prevent WAL file growth
   setInterval(() => {
     db.pragma('wal_checkpoint(TRUNCATE)');
   }, 5 * 60 * 1000);
   ```

4. **Graceful shutdown**
   ```javascript
   process.on('SIGTERM', () => {
     db.pragma('wal_checkpoint(TRUNCATE)');
     db.close();
     process.exit(0);
   });
   ```

### Future Cloud Migration Path

When/if cloud sync is needed:

1. **Turso embedded replicas** - Sync local SQLite to cloud
2. **Export/import** - Periodic sync of data
3. **PostgreSQL migration** - Full migration if multi-user features needed

### Alternative: Hybrid with JSON Settings

If human-editable settings become a user requirement:

```
data/
├── activity.db          # SQLite (better-sqlite3)
└── settings.json        # node-config compatible
```

But only implement this if users specifically request it.

---

## Migration Steps from sql.js

1. **Install better-sqlite3**
   ```bash
   npm install better-sqlite3
   npm uninstall sql-js  # if no longer needed
   ```

2. **Update database/db.js**
   - Replace sql.js initialization with better-sqlite3
   - Enable WAL mode on connection
   - Remove manual `saveDatabase()` calls (writes are automatic)

3. **Update daemon and server initialization**
   - Ensure both processes use WAL mode
   - Add checkpoint logic to daemon

4. **Data migration**
   - Existing data in `data/activity.db` is compatible
   - sql.js uses standard SQLite format
   - First run with better-sqlite3 converts journal to WAL

5. **Testing**
   - Run daemon and server simultaneously
   - Verify writes from daemon appear in server queries
   - Test graceful shutdown preserves data

---

## References

### better-sqlite3
- [NPM Package](https://www.npmjs.com/package/better-sqlite3) - 2.4M+ weekly downloads
- [GitHub Repository](https://github.com/WiseLibs/better-sqlite3)
- [Performance Documentation](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md)
- [Multi-process Access Discussion](https://github.com/JoshuaWise/better-sqlite3/issues/250)
- [DEV Community Guide](https://dev.to/lovestaco/understanding-better-sqlite3-the-fastest-sqlite-library-for-nodejs-4n8)

### PostgreSQL
- [Homebrew Installation Guide](https://dev.to/uponthesky/postgresql-installing-postgresql-through-homebrew-on-macos-388h)
- [PostgreSQL Memory Tuning](https://www.enterprisedb.com/postgres-tutorials/how-tune-postgresql-memory)
- [AWS: Idle Connection Resources](https://aws.amazon.com/blogs/database/resources-consumed-by-idle-postgresql-connections/)
- [PostgreSQL vs SQLite Comparison](https://dev.to/lovestaco/postgresql-vs-sqlite-dive-into-two-very-different-databases-5a90)

### SQLite General
- [SQLite File Locking](https://sqlite.org/lockingv3.html)
- [WAL Mode with Multiple Processes](https://sqlite.org/forum/forumpost/c4dbf6ca17)

### Cloud SQLite
- [Turso](https://turso.tech/) - Distributed SQLite
- [LiteFS (Fly.io)](https://fly.io/docs/litefs/) - SQLite replication
- [PowerSync Blog: SQLite Persistence on Web](https://www.powersync.com/blog/sqlite-persistence-on-the-web)

### Swift/macOS
- [GRDB.swift](https://github.com/groue/GRDB.swift)
- [SQLite vs Core Data](https://holyswift.app/sqlite-vs-core-data-in-ios-development-which-one-should-you-choose/)

### Electron Apps
- [Electron + better-sqlite3 Guide](https://dev.to/arindam1997007/a-step-by-step-guide-to-integrating-better-sqlite3-with-electron-js-app-using-create-react-app-3k16)
- [RxDB Electron Database Options](https://rxdb.info/electron-database.html)

### Similar Apps
- [Obsidian Data Storage](https://help.obsidian.md/data-storage)
- [Anuko Time Tracker Database](https://www.anuko.com/time-tracker/faq/database-tables.htm)
