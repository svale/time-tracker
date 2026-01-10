# Daily Work Summary - Research

## Summary

This feature adds a comprehensive daily work summary showing workday start/end times, total hours worked, and a visual timeline of activity by project. It requires a new API endpoint (`/api/workday-stats`), a new database migration for the calendar `include_in_worktime` flag, UI updates to both dashboard and reports pages (replacing the existing 3 summary cards), and a new timeline visualization component.

## Relevant Files

### Database Layer
- `database/db.js:200-280` - Existing `getDailyReportAll()` and `getTimelineData()` functions (patterns to follow)
- `database/db.js:852-877` - `getCalendarEvents()` function for querying calendar events
- `database/schema.sql:19-33` - `activity_sessions` table structure
- `database/migrations/003_add_calendar.sql:5-23` - `calendar_events` table structure
- `database/migrations/004_refactor_calendar_to_ical.sql:8-18` - `calendar_subscriptions` table (needs `include_in_worktime` column)

### API Layer
- `server/routes/api.js:29-41` - `formatDuration()` helper function (reuse)
- `server/routes/api.js:46-48` - `getTodayString()` helper function (reuse)
- `server/routes/api.js:54-95` - `/api/daily-summary` endpoint (pattern to follow)
- `server/routes/api.js:140-164` - `/api/timeline` endpoint (pattern to follow)
- `server/routes/api.js:235-267` - `/api/calendar-events` endpoint (pattern to follow)

### UI Layer
- `server/views/dashboard.html:63-75` - Summary section with HTMX (to replace)
- `server/views/dashboard.html:77-86` - Hourly chart section (keep, timeline goes below summary)
- `server/views/reports.html:83-91` - Summary cards section (to replace - same as dashboard)
- `server/views/settings.html:93-161` - Calendar subscriptions section (add toggle here)

### CSS
- `public/css/style.css:319-386` - `.summary-grid`, `.stat-card` styles (reuse/extend)
- `public/css/style.css:9-72` - CSS variables for colors (use these)

## Key Patterns

### Database Query Pattern
```javascript
function getXXXData(dateString) {
  if (!db) throw new Error('Database not initialized');

  const startOfDay = new Date(dateString).setHours(0, 0, 0, 0);
  const endOfDay = new Date(dateString).setHours(23, 59, 59, 999);

  const results = [];
  const stmt = db.prepare(`SELECT ... WHERE start_time >= ? AND start_time <= ?`);
  stmt.bind([startOfDay, endOfDay]);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}
```

### API Route Pattern
```javascript
router.get('/endpoint', (req, res) => {
  try {
    const date = req.query.date || getTodayString();
    const data = db.getSomeData(date);
    // Transform data
    res.json({ date, ...transformedData });
  } catch (error) {
    console.error('Error in /api/endpoint:', error);
    res.status(500).json({ error: 'Failed to get data' });
  }
});
```

### UI Summary Cards Pattern (current)
```html
<div class="summary-grid">
  <div class="stat-card stat-card--primary">
    <div class="stat-ornament">⟡</div>
    <div class="stat-value">${value}</div>
    <div class="stat-label">Label</div>
    <div class="stat-detail">Detail text</div>
  </div>
</div>
```

### Dashboard uses HTMX polling
```html
<div id="summary-cards"
     hx-get="/api/daily-summary"
     hx-trigger="load, every 60s"
     hx-swap="innerHTML">
```

## Dependencies

### Internal
- `database/db.js` - Database access
- `date-fns` - Date formatting (already used in api.js)

### External (existing)
- `sql.js` - SQLite WebAssembly
- `Chart.js` - For existing hourly chart (timeline will be custom HTML/CSS)
- `HTMX` - Dashboard uses for polling (optional to use for new endpoint)

## Constraints

1. **Two separate DB instances**: Daemon and server have separate in-memory DBs, synced via disk. Server calls `db.reloadDatabase()` before each request.

2. **Date handling**: Must use local time calculations like existing code. Pattern: `new Date(dateString).setHours(0, 0, 0, 0)` for start of day.

3. **5-minute threshold for workday boundaries**: Sessions < 5 minutes (300 seconds) at the edges of the day should be ignored when calculating workday start/end.

4. **calendar_subscriptions.include_in_worktime**: New column needs migration. Default to `1` (true).

5. **All-day events excluded**: `calendar_events.is_all_day = 1` should be excluded from work time.

6. **Timeline 30-minute slots**: Need to bucket activity into slots, handling activities that span slot boundaries.

7. **Unassigned project color**: Use gray `#9CA3AF` for activities without project assignment.

8. **Sparse days**: If total significant activity < 5 minutes, don't show workday start/end (show "—").

## Edge Cases

1. **No data for date**: Return `has_sufficient_data: false`, empty timeline, zeros for totals
2. **Only calendar events, no browser activity**: Should still calculate workday from calendar
3. **Only browser activity, no calendar**: Should work with browser-only
4. **Activity spanning midnight**: Sessions are already bounded by day in existing queries
5. **Concurrent browser + calendar**: Both should appear in same slot, stacked vertically
6. **Session exactly at slot boundary**: Assign to slot where it starts
7. **Session spanning multiple slots**: Split duration proportionally into each slot
8. **Excluded calendar subscription**: Events from subscriptions with `include_in_worktime=0` excluded from totals but could still show in timeline (grayed out?) - CLARIFY
9. **Very long day (24 hours)**: Timeline should only show from first to last activity, not full 24h

## Questions for Clarification

1. **Excluded calendar events**: Should events from excluded calendars:
   - A) Not appear at all in timeline/summary?
   - B) Appear in timeline but grayed out and not counted in totals?
   - **Recommendation**: Option A (simpler, consistent with "exclude from work time")

2. **Timeline empty slots**: Between first and last activity, should we show:
   - A) All 30-min slots (including gaps)?
   - B) Only slots with activity?
   - **Recommendation**: Option A (shows the workday shape including breaks)

3. **Project breakdown**: Should unassigned time have its own entry, or be omitted?
   - Already confirmed: Show as "Unassigned" with gray color

## Implementation Notes

### New DB Function: `getWorkdayStats(dateString)`
Should perform 3 queries:
1. Activity sessions for date (with project join)
2. Calendar events for date (non-all-day, from subscriptions with include_in_worktime=1)
3. Combine, calculate min/max timestamps, bucket into 30-min slots

### Timeline Slot Generation
```javascript
// Generate slots from first to last activity
const slots = [];
let slotTime = roundDownTo30Min(workdayStart);
while (slotTime < workdayEnd) {
  slots.push({
    slot: formatSlot(slotTime), // "09:00", "09:30", etc.
    activities: activitiesInSlot(slotTime, slotTime + 30*60*1000)
  });
  slotTime += 30 * 60 * 1000;
}
```

### Calendar Subscription Toggle
Add to existing calendar card in settings.html:
```html
<label>
  <input type="checkbox" checked onchange="toggleWorktime(${cal.id}, this.checked)">
  Include in work time
</label>
```
