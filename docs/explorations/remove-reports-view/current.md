# Remove Reports View - Exploration

## Status
Round: 1 (Complete) | Started: 2026-01-14 | Last updated: 2026-01-14

## Confirmed Requirements

### 1. Remove Reports View
- Delete `/reports` route from `server/routes/pages.js`
- Delete `server/views/reports.njk`
- Remove "Reports" from navigation menu

### 2. Date Tab Display Format
- Format: "Tue 14/1" (weekday + day/month)
- Keep "Today" and "Yesterday" labels for those specific days
- Example: `Today | Yesterday | Mon 12/1 | Tue 13/1 | Wed 14/1 | Thu 15/1 | Fri 16/1`

### 3. Navigation Behavior
- **7-day sliding window**: Show 7 days at a time
- **Arrows shift by 1 day**: Left/right arrows move the entire window by one day
- Selected date remains highlighted in the window

### 4. "Today" Button
- Always visible in the navigation area
- Allows quick return to current date from any date

### 5. Date Picker
- Add a subtle/secondary date picker input
- Allows jumping to arbitrary dates without arrow navigation
- Should be unobtrusive (not the primary navigation method)

### 6. No Project Filter
- Project filter NOT needed on Dashboard
- The project breakdown section already shows per-project data

### 7. Navigation Menu
- Remove Reports link
- Keep: Dashboard, Projects, Settings

## Implementation Summary

```
Current Dashboard Date Nav:
[←] Today | Yesterday | Mon | Tue | Wed | Thu | Fri [→]
     ↑ week arrows

New Dashboard Date Nav:
[←] [→] Today | Yesterday | Mon 12/1 | Sun 13/1 | ... [Today] [📅]
  ↑ day arrows                                          ↑       ↑
                                            quick-jump    date picker
```

## Files to Modify
1. `server/views/dashboard.njk` - Update date navigation JS
2. `public/css/style.css` - Style updates for new controls
3. `server/routes/pages.js` - Remove /reports route
4. `server/views/reports.njk` - Delete file
5. Navigation template (likely in layouts) - Remove Reports link

## Open Questions
None - requirements are complete.

## Next Steps
Ready for implementation. Can create RPI init.md or proceed directly.
