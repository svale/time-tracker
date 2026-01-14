# Dashboard Redesign - Exploration

## Status
Round: 2 (Complete) | Started: 2026-01-10 | Last updated: 2026-01-10

## Confirmed Design

### Layout (top to bottom)

```
┌─────────────────────────────────────────────────────────────┐
│  Today | Yesterday | Mon | Tue | Wed | Thu | Fri    [←] [→] │  ← Date navigation tabs
├─────────────────────────────────────────────────────────────┤
│  9:15 AM - 5:30 PM  •  6h 23m total                         │  ← Workday summary bar
├─────────────────────────────────────────────────────────────┤
│  PROJECT BREAKDOWN                                          │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Project Alpha                              3h 15m  ████░││  ← Horizontal bars
│  │   📄 github.com (1h 20m)                                ││
│  │   📅 Sprint Planning (45m)                              ││  ← Full detail visible
│  │   💾 12 commits                                         ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ Project Beta                               2h 05m  ██░░░││
│  │   📄 figma.com (1h 30m), notion.so (35m)                ││
│  │   📅 Design Review (30m)                                ││
│  └─────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────┤
│  HOURLY TIMELINE                                            │
│  [Stacked bar chart - each hour shows project colors]       │
├─────────────────────────────────────────────────────────────┤
│  [ Calendar Events ] [ Git Activity ] [ Domain List ]       │  ← Tabbed interface
│  ┌─────────────────────────────────────────────────────────┐│
│  │  (Tab content - one visible at a time)                  ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Component Specifications

1. **Date Navigation** (top of page)
   - Horizontal tabs/pills
   - Shows: Today, Yesterday, weekdays for current week
   - Arrow buttons for previous/next week

2. **Workday Summary Bar** (compact header strip)
   - Format: "Start Time - End Time • Total Active Time"
   - Single line, always visible

3. **Project Breakdown** (primary focus)
   - Horizontal progress bars for each project
   - Project color as bar fill
   - Shows time in hours/minutes
   - Full detail always visible:
     - Domains (with individual times)
     - Calendar events
     - Git activity (commit count)

4. **Hourly Timeline**
   - Stacked bar chart (one bar per hour)
   - Each segment colored by project
   - Visual representation of when work happened

5. **Detail Tabs** (lower priority sections)
   - Tabbed interface: Calendar | Git | Domains
   - Only one tab visible at a time
   - Keeps dashboard focused

### Removed Elements
- Current time clock display (removed entirely)
- Decorative separators
- Redundant "hourly distribution" section title

## Technical Notes
- Chart.js supports stacked bar charts natively
- Project colors already stored in database
- Need new API endpoint for per-project activity breakdown
- Date navigation requires parameterized API calls

## Open Questions
None - design is complete.

## Next Steps
Ready for implementation. Can create RPI init.md or proceed directly.
