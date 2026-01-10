# Daily Work Summary - Implementation Plan

## Summary

Add a comprehensive daily work summary feature that displays:
1. **Workday start/end times** - calculated from first/last significant activity
2. **Total hours worked** - combining browser activity + calendar events (with `include_in_worktime` flag)
3. **Visual timeline** - 30-minute slots showing activity by project with color coding

This replaces the existing 3 summary cards on dashboard and reports pages with a richer workday overview.

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `database/migrations/005_add_calendar_worktime.sql` | Create | Add `include_in_worktime` column to `calendar_subscriptions` |
| `database/db.js` | Modify | Add `getWorkdayStats()` function and migration runner update |
| `server/routes/api.js` | Modify | Add `/api/workday-stats` endpoint |
| `server/views/dashboard.html` | Modify | Replace summary cards with new workday summary component |
| `server/views/reports.html` | Modify | Replace summary cards with same workday summary component |
| `server/views/settings.html` | Modify | Add "Include in work time" toggle to calendar cards |
| `public/css/style.css` | Modify | Add styles for workday summary and timeline visualization |

## Implementation Steps

### Step 1: Database Migration

Create `database/migrations/005_add_calendar_worktime.sql`:
```sql
-- Add include_in_worktime flag to calendar_subscriptions (default true)
ALTER TABLE calendar_subscriptions ADD COLUMN include_in_worktime INTEGER DEFAULT 1;
```

Update `database/db.js` migration runner to include migration 005.

### Step 2: Database Function - `getWorkdayStats(dateString)`

Add to `database/db.js` (after `getTimelineData` around line 280):

```javascript
function getWorkdayStats(dateString) {
  if (!db) throw new Error('Database not initialized');

  const startOfDay = new Date(dateString).setHours(0, 0, 0, 0);
  const endOfDay = new Date(dateString).setHours(23, 59, 59, 999);

  // 1. Get activity sessions with project info
  const sessions = [];
  const sessionStmt = db.prepare(`
    SELECT s.start_time, s.end_time, s.duration_seconds,
           s.domain, s.project_id, p.name as project_name, p.color as project_color
    FROM activity_sessions s
    LEFT JOIN projects p ON s.project_id = p.id
    WHERE s.start_time >= ? AND s.start_time <= ?
    ORDER BY s.start_time
  `);
  sessionStmt.bind([startOfDay, endOfDay]);
  while (sessionStmt.step()) {
    sessions.push(sessionStmt.getAsObject());
  }
  sessionStmt.free();

  // 2. Get calendar events (non-all-day, from subscriptions with include_in_worktime=1)
  const calendarEvents = [];
  const calStmt = db.prepare(`
    SELECT e.start_time, e.end_time, e.title, e.project_id,
           p.name as project_name, p.color as project_color
    FROM calendar_events e
    LEFT JOIN projects p ON e.project_id = p.id
    JOIN calendar_subscriptions cs ON e.subscription_id = cs.id
    WHERE e.start_time >= ? AND e.end_time <= ?
      AND e.is_all_day = 0
      AND cs.include_in_worktime = 1
    ORDER BY e.start_time
  `);
  calStmt.bind([startOfDay, endOfDay]);
  while (calStmt.step()) {
    calendarEvents.push(calStmt.getAsObject());
  }
  calStmt.free();

  return { sessions, calendarEvents };
}
```

Export from db.js module.

### Step 3: API Endpoint - `/api/workday-stats`

Add to `server/routes/api.js` (after `/api/daily-summary` around line 95):

```javascript
router.get('/workday-stats', (req, res) => {
  try {
    const date = req.query.date || getTodayString();
    const { sessions, calendarEvents } = db.getWorkdayStats(date);

    // Combine all activities for workday boundary calculation
    const allActivities = [
      ...sessions.map(s => ({ start: s.start_time, end: s.end_time, duration: s.duration_seconds, ...s, type: 'browser' })),
      ...calendarEvents.map(e => ({ start: e.start_time, end: e.end_time, duration: Math.floor((e.end_time - e.start_time) / 1000), ...e, type: 'calendar' }))
    ].sort((a, b) => a.start - b.start);

    // Calculate workday boundaries (ignore sessions < 5 min at edges)
    const MIN_EDGE_DURATION = 300; // 5 minutes
    const significantActivities = allActivities.filter(a => a.duration >= MIN_EDGE_DURATION);

    const hasSufficientData = significantActivities.length > 0;
    const workdayStart = hasSufficientData ? Math.min(...significantActivities.map(a => a.start)) : null;
    const workdayEnd = hasSufficientData ? Math.max(...significantActivities.map(a => a.end)) : null;

    // Calculate totals
    const browserSeconds = sessions.reduce((sum, s) => sum + s.duration_seconds, 0);
    const calendarSeconds = calendarEvents.reduce((sum, e) => sum + Math.floor((e.end_time - e.start_time) / 1000), 0);
    const totalSeconds = browserSeconds + calendarSeconds;

    // Generate 30-minute timeline slots
    const slots = [];
    if (hasSufficientData) {
      const slotDuration = 30 * 60 * 1000; // 30 minutes in ms
      let slotStart = roundDownTo30Min(workdayStart);
      const slotEnd = roundUpTo30Min(workdayEnd);

      while (slotStart < slotEnd) {
        const slotEndTime = slotStart + slotDuration;
        const slotActivities = getActivitiesInSlot(allActivities, slotStart, slotEndTime);
        slots.push({
          time: formatSlotTime(slotStart),
          activities: slotActivities
        });
        slotStart = slotEndTime;
      }
    }

    // Project breakdown
    const projectTotals = {};
    allActivities.forEach(a => {
      const key = a.project_id || 'unassigned';
      if (!projectTotals[key]) {
        projectTotals[key] = {
          project_id: a.project_id,
          project_name: a.project_name || 'Unassigned',
          project_color: a.project_color || '#9CA3AF',
          seconds: 0
        };
      }
      projectTotals[key].seconds += a.duration;
    });

    res.json({
      date,
      has_sufficient_data: hasSufficientData,
      workday_start: workdayStart ? new Date(workdayStart).toISOString() : null,
      workday_end: workdayEnd ? new Date(workdayEnd).toISOString() : null,
      workday_start_formatted: workdayStart ? formatTime(workdayStart) : '—',
      workday_end_formatted: workdayEnd ? formatTime(workdayEnd) : '—',
      total_seconds: totalSeconds,
      total_time: formatDuration(totalSeconds),
      browser_seconds: browserSeconds,
      calendar_seconds: calendarSeconds,
      timeline_slots: slots,
      project_breakdown: Object.values(projectTotals).sort((a, b) => b.seconds - a.seconds)
    });
  } catch (error) {
    console.error('Error in /api/workday-stats:', error);
    res.status(500).json({ error: 'Failed to get workday stats' });
  }
});
```

Add helper functions in api.js:
- `roundDownTo30Min(timestamp)` - Round timestamp down to nearest 30-minute mark
- `roundUpTo30Min(timestamp)` - Round timestamp up to nearest 30-minute mark
- `formatSlotTime(timestamp)` - Format as "HH:mm"
- `formatTime(timestamp)` - Format as "h:mm a" (e.g., "9:30 AM")
- `getActivitiesInSlot(activities, slotStart, slotEnd)` - Get activities overlapping the slot, split proportionally

### Step 4: Settings UI - Calendar "Include in Work Time" Toggle

Update `server/views/settings.html` calendar card rendering (in the `renderCalendars()` function):

Add a checkbox toggle in each calendar card:
```html
<label class="calendar-worktime-toggle">
  <input type="checkbox"
         ${cal.include_in_worktime ? 'checked' : ''}
         onchange="toggleCalendarWorktime(${cal.id}, this.checked)">
  Include in work time
</label>
```

Add JavaScript function:
```javascript
async function toggleCalendarWorktime(calendarId, includeInWorktime) {
  try {
    await fetch(`/api/calendar-subscriptions/${calendarId}/worktime`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ include_in_worktime: includeInWorktime })
    });
  } catch (error) {
    console.error('Error updating calendar worktime setting:', error);
  }
}
```

Add API endpoint in `server/routes/api.js`:
```javascript
router.put('/calendar-subscriptions/:id/worktime', async (req, res) => {
  try {
    const { id } = req.params;
    const { include_in_worktime } = req.body;
    db.updateCalendarSubscriptionWorktime(id, include_in_worktime ? 1 : 0);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating calendar worktime:', error);
    res.status(500).json({ error: 'Failed to update calendar subscription' });
  }
});
```

Add db function `updateCalendarSubscriptionWorktime(id, value)` in `database/db.js`.

### Step 5: Dashboard/Reports UI - New Workday Summary Component

Replace the existing summary cards section in both `dashboard.html` (lines 63-75) and `reports.html` (lines 83-91) with:

```html
<section class="summary-section">
  <h2 class="section-title">Today's Workday</h2>
  <div id="workday-summary"
       hx-get="/api/workday-stats"
       hx-trigger="load, every 60s"
       hx-swap="innerHTML">
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>Calculating workday...</p>
    </div>
  </div>
</section>
```

Add JavaScript function `renderWorkdaySummary(event)` that renders:

1. **Workday header** - Start time, End time, Total hours (3 stat cards)
2. **Timeline visualization** - Horizontal bar with 30-min slots, colored by project
3. **Project breakdown** - Small bar chart or list showing time per project

### Step 6: CSS Styles

Add to `public/css/style.css`:

```css
/* Workday Summary */
.workday-header {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.workday-stat {
  text-align: center;
  padding: 1rem;
  background: var(--color-parchment);
  border-radius: 8px;
  border: 1px solid var(--color-border);
}

.workday-stat-value {
  font-size: 1.5rem;
  font-weight: 600;
  font-family: var(--font-mono);
  color: var(--color-ink);
}

.workday-stat-label {
  font-size: 0.85rem;
  color: var(--color-warm-gray);
  margin-top: 0.25rem;
}

/* Timeline */
.workday-timeline {
  margin: 1.5rem 0;
  padding: 1rem;
  background: var(--color-parchment);
  border-radius: 8px;
  border: 1px solid var(--color-border);
}

.timeline-slots {
  display: flex;
  gap: 2px;
  height: 40px;
}

.timeline-slot {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 20px;
}

.timeline-slot-bar {
  flex: 1;
  border-radius: 4px;
  background: var(--color-cream);
}

.timeline-slot-label {
  font-size: 0.65rem;
  text-align: center;
  color: var(--color-warm-gray);
  margin-top: 4px;
}

/* Project breakdown */
.project-breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-top: 1rem;
}

.project-chip {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.75rem;
  background: var(--color-cream);
  border-radius: 16px;
  font-size: 0.85rem;
}

.project-chip-color {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

/* Settings toggle */
.calendar-worktime-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: var(--color-warm-gray);
  cursor: pointer;
  margin-top: 0.5rem;
}

.calendar-worktime-toggle input {
  cursor: pointer;
}
```

## Testing Strategy

### Manual Testing

1. **Migration**: Verify `include_in_worktime` column exists with default value 1
   ```bash
   sqlite3 data/activity.db ".schema calendar_subscriptions"
   ```

2. **API Endpoint**: Test `/api/workday-stats` returns correct structure
   ```bash
   curl http://localhost:8765/api/workday-stats
   curl http://localhost:8765/api/workday-stats?date=2025-01-08
   ```

3. **Edge Cases**:
   - Day with no activity → `has_sufficient_data: false`, empty timeline
   - Day with only short sessions (<5 min) → `has_sufficient_data: false`
   - Day with only calendar events → workday calculated from calendar
   - Day with only browser activity → workday calculated from browser

4. **Settings Toggle**:
   - Toggle off a calendar → verify its events excluded from workday stats
   - Refresh dashboard → verify totals update

5. **UI Verification**:
   - Dashboard shows workday start/end times
   - Timeline shows colored slots matching project colors
   - Project breakdown shows correct totals
   - Reports page shows same data for selected date

### Browser Testing

- Open dashboard at http://localhost:8765
- Verify workday summary loads and displays correctly
- Change date in reports → verify timeline updates
- Test with different data scenarios (calendar only, browser only, mixed)

## Notes

- Timeline slots only show from first to last activity (not full 24 hours)
- Sessions < 5 minutes at day edges are excluded from workday boundaries but included in totals
- Unassigned activities show in gray (#9CA3AF)
- Calendar events with `include_in_worktime=0` are completely excluded (not shown grayed out)
