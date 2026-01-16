# Connect Calendar Events to Projects - Implementation Plan

## Summary

Add UI for managing project calendar keywords and display matched keywords on the dashboard. The backend is already complete - this plan focuses on:
1. Adding a "Keywords" modal to the Projects page (mirroring the existing Domains modal)
2. Storing which keyword matched each calendar event (new `matched_keyword` column)
3. Displaying the matched keyword as a label on calendar events in the dashboard

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `database/config-schema.sql` | Modify | Add `matched_keyword` column to `calendar_events` |
| `database/migrations/006_add_matched_keyword.sql` | Create | Migration for existing databases |
| `server/utils/project-matcher.js` | Modify | Return `{ projectId, keyword }` instead of just ID |
| `daemon/ical-sync.js` | Modify | Store `matched_keyword` when inserting events |
| `database/db.js` | Modify | Update `insertCalendarEvent` to accept `matched_keyword` |
| `server/routes/api.js` | Modify | Include `matched_keyword` in calendar events response |
| `server/views/projects.html` | Modify | Add Keywords modal and button (mirror Domains pattern) |
| `server/views/dashboard.html` | Modify | Display matched keyword label on calendar events |

## Implementation Steps

### Phase 1: Backend - Store Matched Keyword

**Step 1.1: Create migration for `matched_keyword` column**
- Create `database/migrations/006_add_matched_keyword.sql`
- Add `matched_keyword TEXT` column to `calendar_events` table

**Step 1.2: Update config-schema.sql**
- Add `matched_keyword TEXT` to `calendar_events` table definition (line 67, after `project_id`)

**Step 1.3: Modify `matchCalendarEvent()` in `project-matcher.js`**
- Change return type from `number|null` to `{ projectId: number, keyword: string }|null`
- Return the matching keyword along with project ID (lines 30-59)

**Step 1.4: Update `insertCalendarEvent` in `database/db.js`**
- Add `matched_keyword` to INSERT statement
- Accept `matched_keyword` in `eventData` parameter

**Step 1.5: Update `ical-sync.js` daemon**
- Capture both `projectId` and `keyword` from matcher (line 102-105)
- Pass `matched_keyword` to `eventData` object (line 121)

**Step 1.6: Update calendar events API response**
- In `server/routes/api.js`, add `matched_keyword` to formatted event (line 595-611)

### Phase 2: Frontend - Projects Page Keywords UI

**Step 2.1: Add Keywords modal HTML** (in `projects.html`)
- Copy the domains modal structure (lines 102-126)
- Create `keywords-modal` with same pattern
- Add list container `keywords-list` and input `new-keyword`

**Step 2.2: Add "Keywords" button to project cards**
- Modify the `renderProjects()` function (line 192-194)
- Add a "Keywords" button alongside "Manage Domains"
- Add keyword count stat similar to domain count

**Step 2.3: Implement JavaScript functions**
- `openKeywordsModal(projectId)` - mirror `openDomainsModal()`
- `closeKeywordsModal()` - mirror `closeDomainsModal()`
- `loadKeywords()` - fetch from `/api/projects/:id/keywords`
- `addKeyword()` - POST to `/api/projects/:id/keywords`
- `removeKeyword(id)` - DELETE to `/api/project-keywords/:id`
- `loadKeywordCount(projectId)` - display count on card

**Step 2.4: Wire up modal close handlers**
- Add escape key handler for keywords modal
- Add overlay click handler for keywords modal

### Phase 3: Frontend - Dashboard Matched Keyword Indicator

**Step 3.1: Update calendar event rendering**
- In `loadCalendarEvents()` function (lines 458-506)
- After the project badge, add a matched keyword label if present
- Style as a small secondary badge showing "via: [keyword]"

## Testing Strategy

### Unit Testing
1. Verify `matchCalendarEvent()` returns both `projectId` and `keyword`
2. Test with multiple keywords - first match should win
3. Test case-insensitivity

### Integration Testing
1. Add keyword to project → sync calendar → verify event gets `matched_keyword` stored
2. Manually override project → verify `matched_keyword` remains unchanged
3. Remove keyword → re-sync → verify events lose auto-match

### UI Testing
1. **Projects page:**
   - Create project → Add keywords → Keywords appear in list
   - Remove keyword → Disappears from list
   - Keyword count updates on project card

2. **Dashboard:**
   - Calendar event with auto-match shows keyword label
   - Manually assigned event shows no keyword label
   - Unassigned event shows neither badge nor label

### Edge Cases
- Empty keyword (should reject with validation error)
- Very long keyword (UI should handle gracefully)
- Special characters in keyword
- Event with no title/description (should not crash)
