# Connect Calendar Events to Projects - Research

## Summary
The backend for keyword-based calendar event matching is **already fully implemented**. The database schema, CRUD functions, API endpoints, and matcher utility all exist. Only the **frontend UI is missing** - specifically the keywords management section on the Projects page and the matched keyword indicator on the dashboard.

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| Database Schema | Complete | `project_calendar_keywords` table exists |
| DB Functions | Complete | CRUD in `database/db.js:607-662` |
| Matching Logic | Complete | `matchCalendarEvent()` in `project-matcher.js:30-59` |
| API Endpoints | Complete | GET/POST/DELETE in `projects.js:248-297` |
| Daemon Integration | Complete | `ical-sync.js:101-105` calls matcher |
| Projects Page UI | **Missing** | Keywords section needed |
| Dashboard Indicator | **Missing** | Show matched keyword |

## Relevant Files

### Backend (Already Complete)

**Database Functions** - `database/db.js`
- `getProjectKeywords(projectId)` - line 614
- `addProjectKeyword(projectId, keyword)` - line 632
- `removeProjectKeyword(id)` - line 654

**Matcher Utility** - `server/utils/project-matcher.js`
- `matchCalendarEvent(title, description)` - lines 30-59
- Case-insensitive substring matching
- Returns first matching project ID

**API Endpoints** - `server/routes/projects.js`
- `GET /api/projects/:id/keywords` - line 251
- `POST /api/projects/:id/keywords` - line 266
- `DELETE /api/project-keywords/:id` - line 288

**Calendar API** - `server/routes/api.js`
- `GET /api/calendar-events` - lines 587-622 (returns events with project info)
- `PUT /api/calendar-events/:id/project` - lines 642-667 (manual assignment)

**Daemon Sync** - `daemon/ical-sync.js`
- Lines 101-105: Calls `matchCalendarEvent()` during sync

### Frontend (Needs Work)

**Projects Page** - `server/views/projects.html`
- Domains modal pattern: lines 102-126
- JS functions for domains: lines 361-428
- **Need to replicate for keywords**

**Dashboard** - `server/views/dashboard.html`
- Calendar events section exists
- **Need to add matched keyword indicator**

## Key Patterns to Follow

### Domain Management Pattern (projects.html)

```html
<!-- Modal structure -->
<div id="domains-modal" class="modal-overlay">
    <div class="modal">
        <h3 class="modal-title">Manage Domains</h3>
        <ul id="domains-list" class="domain-list"></ul>
        <div class="domain-add-form">
            <input type="text" id="new-domain" class="form-input">
            <button onclick="addDomain()">Add Domain</button>
        </div>
    </div>
</div>
```

```javascript
// JavaScript pattern
async function loadDomains() {
    const response = await fetch(`/api/projects/${currentProjectId}/domains`);
    const data = await response.json();
    // render list...
}

async function addDomain() {
    await fetch(`/api/projects/${currentProjectId}/domains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: value })
    });
    loadDomains();
}
```

## Database Schema (Already Exists)

```sql
-- In config.db via migration 003
CREATE TABLE project_calendar_keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    keyword TEXT NOT NULL,
    created_at INTEGER,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_project_keywords ON project_calendar_keywords(project_id);
```

## Missing: `matched_keyword` Column

The exploration identified we need to store which keyword matched. This requires:
- New migration to add `matched_keyword TEXT` to `calendar_events`
- Update `ical-sync.js` to store the matched keyword
- Update `matchCalendarEvent()` to return `{ project_id, keyword }` instead of just ID

## Dependencies
- `database/db.js` - sql.js wrapper (in-memory with saves)
- `daemon/ical-sync.js` - iCal feed parser
- `server/utils/project-matcher.js` - matching utility

## Constraints
- Keywords table is in config.db, calendar events in activity.db (dual-database architecture)
- Matcher runs during daemon sync (not real-time)
- First match wins (order by keyword ID/creation)

## Edge Cases
- Empty keyword (should reject)
- Duplicate keyword for same project (UNIQUE constraint handles)
- Very long keywords
- Special characters in keywords
- Event with no title/description

## Questions
None - exploration phase answered all requirements questions.

## Implementation Plan

### Phase 1: Store Matched Keyword (Backend)
1. Create migration to add `matched_keyword` to `calendar_events`
2. Modify `matchCalendarEvent()` to return `{ projectId, keyword }`
3. Update `ical-sync.js` to store matched keyword
4. Update API responses to include `matched_keyword`

### Phase 2: Projects Page Keywords UI
1. Add "Keywords" button to project cards (alongside Domains)
2. Create keywords modal (copy domains pattern)
3. Implement loadKeywords(), addKeyword(), removeKeyword()

### Phase 3: Dashboard Indicator
1. Add matched keyword display to calendar event rows
2. Style as small label/badge
