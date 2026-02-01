# Test Plan: Better-SQLite3 Migration

**Created**: 2026-01-24
**Target**: Database migration from sql.js to better-sqlite3 with unified schema
**Related Plan**: `docs/plans/better-sqlite3-migration/plan.md`

## Objectives

This test plan validates the better-sqlite3 migration:
1. Database initialization creates the correct file at `~/.time-tracker/timetracker.db`
2. WAL mode is enabled for safe concurrent access
3. All database tables are created correctly
4. Settings are persisted and readable
5. Both daemon and server can access the database concurrently
6. Data persists across process restarts
7. Graceful shutdown properly checkpoints and closes the database

## Background

The migration addresses data loss issues by:
- Replacing sql.js (in-memory) with better-sqlite3 (native SQLite)
- Moving data to `~/.time-tracker/timetracker.db`
- Merging two databases (activity.db + config.db) into single unified database
- Enabling WAL mode for concurrent access (daemon + server)
- Removing manual save/reload logic

## User Flows

### 1. Fresh Database Initialization
- Start server with no existing database
- Verify database file created at correct path
- Verify WAL files created (-wal, -shm)
- Verify all tables exist

### 2. Settings Persistence
- Navigate to Settings page
- Modify a setting
- Refresh page
- Verify setting persists

### 3. Concurrent Access
- Start daemon and server simultaneously
- Verify both can read/write without errors
- Create data in one, verify readable in other

### 4. Dashboard Data Display
- Navigate to Dashboard
- Verify activity sessions are displayed
- Verify timeline data loads correctly

### 5. Projects Page
- Navigate to Projects
- Verify projects list displays
- Verify project cards show domain/keyword counts

### 6. Projects CRUD
- Create a new project
- Verify project appears in list
- Add domain mapping to project
- Verify domain mapping persists

## Test Cases

| ID | Description | Priority | Type |
|----|-------------|----------|------|
| TC1 | Server starts and initializes database | High | Smoke |
| TC2 | Dashboard page loads without errors | High | Smoke |
| TC3 | Settings page loads without errors | High | Smoke |
| TC4 | Projects page loads without errors | High | Smoke |
| TC5 | API returns settings correctly | High | Integration |
| TC6 | API returns daily report data | High | Integration |
| TC7 | API returns projects list | High | Integration |
| TC8 | Settings changes persist after save | High | Functional |
| TC9 | Create project via API | High | Functional |
| TC10 | Database file exists at correct path | High | Infrastructure |
| TC11 | WAL mode is enabled | High | Infrastructure |
| TC12 | All required tables exist | High | Infrastructure |
| TC13 | Timeline data loads on dashboard | Medium | Functional |
| TC14 | Project domains can be added | Medium | Functional |
| TC15 | Calendar events display (if any) | Low | Functional |

## Prerequisites

- Time Tracker web server running on localhost:8765
- Node.js installed with better-sqlite3
- No existing database (for fresh init tests) OR existing database (for persistence tests)

## Test Data

Default settings expected:
- `polling_interval_minutes`: '5'
- `session_gap_minutes`: '5'
- `excluded_domains`: '[]'
- `git_scan_interval_minutes`: '5'
- `focus_tracking_enabled`: 'true'
- `focus_poll_interval_seconds`: '30'

## Success Criteria

- All High priority tests pass
- No console errors during test execution
- Server starts without database errors
- All API endpoints return valid JSON responses
- Settings persist across page reloads
- Database file exists at `~/.time-tracker/timetracker.db`

## Test Environment

- Browser: Chrome (via Playwright MCP or Chrome DevTools)
- Base URL: http://localhost:8765
- Dashboard: http://localhost:8765/
- Projects: http://localhost:8765/projects
- Settings: http://localhost:8765/settings

## API Endpoints to Validate

| Endpoint | Method | Expected Response |
|----------|--------|-------------------|
| `/api/settings` | GET | JSON with settings object |
| `/api/settings/focus` | GET | JSON with focus tracking settings |
| `/api/settings/focus` | PUT | 200 OK on save |
| `/api/daily-report` | GET | JSON with date, total_seconds, activities |
| `/api/timeline` | GET | JSON array with hourly data |
| `/api/projects` | GET | JSON array of projects |
| `/api/projects` | POST | 201 Created with project ID |

## Notes

- WAL mode creates two additional files: `.db-wal` and `.db-shm`
- The daemon should be stopped to test server-only scenarios
- better-sqlite3 is synchronous, so no async/await needed for DB operations
- Calendar and git integrations may have no data in test environment
