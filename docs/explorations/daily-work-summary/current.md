# Daily Work Summary - Exploration

## Status
Round: COMPLETE | Started: 2026-01-09 | Last updated: 2026-01-09

## Goal
Create a better, usable summary of what you worked on each day, showing:
- Sum of hours worked
- Estimated workday start time
- Estimated workday end time
- Hours spent on each project (via timeline view)

## Confirmed Requirements

### Location
- **Both Dashboard AND Reports page** - Same enhanced summary on both pages
- Dashboard shows today, Reports allows historical navigation

### Work Time Calculation
- **Browser + non-all-day calendar events** - Include meetings but exclude all-day events
- Total work time = sum(browser session durations) + sum(meeting durations)

### Workday Boundaries
- **Ignore short sessions at edges** - Filter out sessions < 5 minutes when calculating start/end
- Start = MIN(start_time) of significant activities (>= 5 min) across all sources
- End = MAX(end_time) of significant activities (>= 5 min) across all sources

### Summary Cards (Replaces existing 3)
- **Card 1**: Workday Start (e.g., "9:15 AM")
- **Card 2**: Total Hours (e.g., "7h 30m")
- **Card 3**: Workday End (e.g., "5:45 PM")

### Timeline View
- **Resolution**: 30-minute blocks
- **Layout**: Single merged track - all activities on one row, stacked if concurrent
- **Unassigned activity**: Gray/neutral blocks labeled "Unassigned"
- **Interaction**: Hover only - show tooltip with activity details (domain/title, duration, project)

### Calendar Handling
- **Include all by default** - All non-all-day events count as work time
- **Exclusion mechanism**: Settings page toggle per calendar subscription
- No inline/per-event exclusion

### Sparse Days
- **Show what exists** - Display available data without forcing workday estimates
- If insufficient data, show "—" for workday start/end rather than misleading times

## Implementation Specification

### Database Changes
None required - existing schema has all needed data.

### New API Endpoint
`GET /api/workday-stats?date=YYYY-MM-DD`

Response:
```json
{
  "date": "2026-01-09",
  "workday_start": "09:15",
  "workday_end": "17:45",
  "workday_start_timestamp": 1736420100000,
  "workday_end_timestamp": 1736450700000,
  "total_hours": "7h 30m",
  "total_seconds": 27000,
  "browser_seconds": 18000,
  "meeting_seconds": 9000,
  "has_sufficient_data": true,
  "timeline": [
    {
      "slot": "09:00",
      "activities": [
        {
          "type": "browser",
          "project_id": 1,
          "project_name": "Work",
          "project_color": "#3B82F6",
          "domain": "github.com",
          "duration_seconds": 1200
        }
      ]
    },
    // ... 30-min slots from first to last activity
  ],
  "project_breakdown": [
    {
      "project_id": 1,
      "project_name": "Work",
      "project_color": "#3B82F6",
      "total_seconds": 14400,
      "percentage": 53
    },
    {
      "project_id": null,
      "project_name": "Unassigned",
      "project_color": "#9CA3AF",
      "total_seconds": 12600,
      "percentage": 47
    }
  ]
}
```

### Settings Page Addition
Add "Include in work time" toggle per calendar subscription in the existing calendar settings section.

### Database Addition
Add `include_in_worktime` column to `calendar_subscriptions` table (default: 1/true).

### UI Components

#### Summary Cards (replace existing)
```
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│      ⟡         │ │      ⟡         │ │      ⟡         │
│    9:15 AM     │ │    7h 30m      │ │    5:45 PM     │
│  Workday Start │ │  Total Hours   │ │  Workday End   │
│ First activity  │ │ Browser+Mtgs   │ │ Last activity   │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

#### Timeline Component
```
Time   |09:00|09:30|10:00|10:30|11:00|11:30|12:00|...
       ├─────┴─────┼─────┴─────┼─────┴─────┼─────┤
       │  Work (blue)  │Meeting│ Unassigned │ ... │
       │  github.com   │ Sync  │  (gray)    │     │
       └──────────────┴───────┴────────────┴─────┘
```

- Horizontal bar from workday start to end
- 30-min slots with project-colored blocks
- Hover shows: "github.com - Work - 45m" or "Team Sync - Meeting - 30m"
- Concurrent activities stack vertically within slot

## Files to Modify

1. `database/migrations/005_calendar_worktime_flag.sql` - Add include_in_worktime column
2. `database/db.js` - Add getWorkdayStats() function
3. `server/routes/api.js` - Add /api/workday-stats endpoint
4. `server/views/dashboard.html` - Replace summary cards, add timeline
5. `server/views/reports.html` - Same changes as dashboard
6. `server/views/settings.html` - Add calendar work time toggle
7. `public/css/style.css` - Timeline component styles

## Next Steps
This exploration is complete. Use this to create an init.md for RPI implementation, or proceed directly with implementation.
