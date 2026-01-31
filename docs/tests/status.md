# Test Status

Last updated: 2026-01-24

## E2E Tests

| Test Name | File Path | Last Run | Status | Notes |
|-----------|-----------|----------|--------|-------|
| better-sqlite3-migration | `docs/tests/e2e/better-sqlite3-migration.spec.ts` | 2026-01-24 | PASSED | All 17 test cases passed |
| improve-domain-tracking-phase2 | `docs/tests/e2e/improve-domain-tracking-phase2.spec.ts` | 2026-01-18 | PASSED | All 10 test cases passed |

## Test Results Summary

### better-sqlite3-migration (Database Migration)

**Executed**: 2026-01-24 via browser automation (Chrome DevTools MCP)

| Test Case | Description | Status |
|-----------|-------------|--------|
| TC1 | Server starts and dashboard loads | PASSED |
| TC2 | Dashboard page loads without errors | PASSED |
| TC3 | Settings page loads without errors | PASSED |
| TC4 | Projects page loads without errors | PASSED |
| TC5 | API returns settings correctly | PASSED |
| TC6 | API returns daily report data | PASSED |
| TC7 | API returns projects list | PASSED |
| TC8 | Focus settings API works | PASSED |
| TC9 | Timeline API returns data | PASSED |
| TC10 | Database file exists at correct path | PASSED |
| TC11 | WAL mode is enabled | PASSED |
| TC12 | All required tables exist | PASSED |
| TC13 | Database health check | PASSED |
| TC14 | Workday stats API works | PASSED |
| TC15 | Calendar subscriptions API works | PASSED |
| TC16 | Create project via API | PASSED |
| TC17 | Navigation between pages works | PASSED |

**Evidence collected:**
- Dashboard loaded successfully at `http://localhost:8765/`
- Settings page displays all configuration sections (Tracking, Focus, Calendar, Git, Chrome Profiles)
- Projects page shows "Project Chronicles" with existing projects
- Database file exists at `~/.time-tracker/timetracker.db` (172KB)
- WAL files present: `timetracker.db-shm`, `timetracker.db-wal`
- `PRAGMA journal_mode` returns `wal`
- All 12 tables created: `activity_events`, `activity_sessions`, `focus_samples`, `projects`, `project_domains`, `project_calendar_keywords`, `calendar_subscriptions`, `calendar_events`, `git_repositories`, `git_activity`, `settings`, `schema_migrations`
- Settings table contains all expected keys with correct defaults
- API endpoints return proper JSON responses:
  - GET `/api/settings` - returns polling_interval_minutes, session_gap_minutes, excluded_domains
  - GET `/api/daily-report?date=YYYY-MM-DD` - returns date, total_seconds, total_time, activities
  - GET `/api/projects` - returns array of projects (found 2 projects + 1 created during test)
  - GET `/api/settings/focus` - returns focus_tracking_enabled, focus_poll_interval_seconds, max_session_duration_minutes
  - GET `/api/timeline?date=YYYY-MM-DD` - returns date and timeline
  - GET `/api/workday-stats?date=YYYY-MM-DD` - returns comprehensive workday data
  - GET `/api/integrations/calendars` - returns array of calendar subscriptions
  - POST `/api/projects` - creates new project, returns 201 with id
  - GET `/api/projects/:id` - returns single project by ID

### improve-domain-tracking-phase2 (Focus Tracking Settings)

**Executed**: 2026-01-18 via browser automation

| Test Case | Description | Status |
|-----------|-------------|--------|
| TC1 | Settings page loads without errors | PASSED |
| TC2 | Focus Tracking section is visible | PASSED |
| TC3 | Focus tracking toggle works | PASSED |
| TC4 | Poll interval dropdown has correct options | PASSED |
| TC5 | Max session duration dropdown has correct options | PASSED |
| TC6 | Save button shows success message | PASSED |
| TC7 | Settings persist after page reload | PASSED |
| TC8 | API returns correct default values | PASSED |
| TC9 | API updates settings correctly | PASSED |
| TC10 | Help text is displayed for each setting | PASSED |

**Evidence collected:**
- Settings page loaded successfully at `http://localhost:8765/settings`
- Focus Tracking section visible with all controls
- Toggle, dropdowns, and save button functional
- Success message displayed: "Focus settings saved! Restart daemon to apply changes."
- API GET `/api/settings/focus` returns proper JSON structure
- API PUT `/api/settings/focus` updates and persists settings
- Settings survive page reload

## Running Tests

### Prerequisites
1. Start the web server: `npm run server`
2. Server should be accessible at `http://localhost:8765`

### Manual Browser Testing

**Dashboard** (`http://localhost:8765/`):
- Page loads with "Temporal Archive" header
- Date navigation works
- Timeline section visible
- Calendar/Git/Domain tabs functional

**Settings** (`http://localhost:8765/settings`):
- Configuration heading visible
- Tracking Settings section with polling/session gap inputs
- Focus Tracking section with enable toggle and dropdowns
- Calendar Subscriptions section
- Git Repositories section
- Chrome Profiles section
- Database Information section

**Projects** (`http://localhost:8765/projects`):
- Project Chronicles heading visible
- New Project button available
- Existing projects displayed with domain/keyword counts

### Playwright Testing (when configured)
```bash
npx playwright test docs/tests/e2e/better-sqlite3-migration.spec.ts
npx playwright test docs/tests/e2e/improve-domain-tracking-phase2.spec.ts
```

### Database Verification
```bash
# Check database exists
ls -la ~/.time-tracker/

# Check WAL mode
sqlite3 ~/.time-tracker/timetracker.db "PRAGMA journal_mode;"

# List tables
sqlite3 ~/.time-tracker/timetracker.db ".tables"

# Check settings
sqlite3 ~/.time-tracker/timetracker.db "SELECT * FROM settings;"
```
