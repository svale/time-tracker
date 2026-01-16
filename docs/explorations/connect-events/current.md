# Connect Calendar Events to Projects - Exploration

## Status
Round: 2 (Complete) | Started: 2026-01-15 | Last updated: 2026-01-15

## Confirmed

### Matching Logic
- **Keyword-based matching**: Events assigned to projects via keywords (no subscription-level defaults)
- **Search scope**: Match keywords against event title + description
- **Matching strategy**: Case-insensitive substring match
- **Conflict resolution**: First matching keyword wins (creation order, kept simple)
- **Re-processing**: Automatically re-match all events when keywords change

### UI/UX
- **Keyword management**: On Projects page, add "Keywords" section alongside existing "Domains" section
- **Manual override**: Inline dropdown on dashboard for each calendar event
- **Match indicator**: Always show which keyword caused the auto-assignment (small label)

## Open Questions
*(None - exploration complete)*

## Context
### Existing System
- **Projects**: Have `id`, `name`, `description`, `color`, managed via `/projects` UI
- **Project Domains**: `project_domains` table maps domains → projects for browser sessions
- **Project Keywords**: `project_calendar_keywords` table exists (needs wiring)
- **Calendar Events**: `calendar_events` table has `project_id` column (nullable)

### Database Schema (already exists)
```sql
-- project_calendar_keywords table
CREATE TABLE project_calendar_keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    keyword TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

## Implementation Summary

### Backend Tasks
1. **Keyword CRUD API** (in `server/routes/projects.js`):
   - `GET /api/projects/:id/keywords` - List keywords for project
   - `POST /api/projects/:id/keywords` - Add keyword `{ keyword: "standup" }`
   - `DELETE /api/project-keywords/:id` - Remove keyword

2. **Calendar Event Matcher** (new utility or extend `project-matcher.js`):
   - `matchCalendarEvent(title, description)` - Returns `{ project_id, matched_keyword }` or null
   - Case-insensitive substring search across all keywords
   - First match wins (by keyword creation order/id)

3. **Event Assignment API**:
   - `PUT /api/calendar-events/:id/project` - Manual assignment `{ project_id }`
   - Should clear `matched_keyword` when manually assigned

4. **Re-processing trigger**:
   - When keyword added/removed, re-run matcher on all events
   - Could be in keyword POST/DELETE handlers

### Frontend Tasks
1. **Projects page** (`/projects`):
   - Add "Keywords" section to each project card (similar to Domains section)
   - Add/remove keywords UI

2. **Dashboard** (calendar events display):
   - Add inline project dropdown to each calendar event row
   - Show matched keyword as small label (e.g., "matched: standup")
   - Dropdown should list all projects + "None" option

### Database Changes
- Add `matched_keyword TEXT` column to `calendar_events` (to show what matched)

## Next Steps
This exploration is complete. Ready to create `init.md` for RPI implementation.
