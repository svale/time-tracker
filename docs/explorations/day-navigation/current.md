# Day Navigation Refactoring - Exploration

## Status
**COMPLETED** | Started: 2025-01-15 | Completed: 2025-01-15

## Confirmed
- **Location**: Dashboard view at `/server/views/dashboard.njk` (lines 11-19 HTML, lines 119-204 JavaScript)
- **Bug identified**: Clicking a day tab selects the previous day due to timezone issue at line 159:
  ```javascript
  currentDate = new Date(tab.dataset.date + 'T00:00:00');  // Parsed as UTC, displayed as local
  ```
- **Current behavior issues**:
  1. "Today" and "Yesterday" labels are inconsistent with other days (show text only, not "Wed 15/1" format)
  2. Left/right arrows shift the 7-day window, not the active/selected day
  3. No URL state management - refreshing loses the selected day

## Decisions Made (Round 1)
1. **Arrow behavior**: Move selected day only, auto-scroll window when selection goes out of view
2. **Label format**: Use `Wed 15/1` format for ALL days (remove special "Today"/"Yesterday" text)
3. **URL state**: Use `replaceState` - URL updates but no browser history entries
4. **Window position**: Center the selected date in the 7-day window when loading from URL

## Implementation Summary
All changes made to `/server/views/dashboard.njk`:

1. **Fixed `getDateString()`** - Changed from `toISOString()` (UTC) to local date components to fix timezone bug
2. **Fixed click handlers** - Parse date strings as local components instead of UTC
3. **Removed `isYesterday()` function** - No longer needed
4. **Unified label format** - All days now show `Wed 15/1` format
5. **Arrow buttons** - Now move selected day (not window), with `ensureDateVisible()` helper
6. **URL state** - Added `updateURL()` using `replaceState`, initialization reads `?date=` param

## Context
The dashboard (`/server/views/dashboard.njk`) has a date navigation bar with:
- Left/right arrow buttons (currently shift the 7-day window)
- 7 day tabs (showing week at a glance)
- "Today" quick-jump button
- Date picker input

**Current JS state variables**:
- `currentDate` - the selected/active date (Date object)
- `windowStartDate` - first day of the visible 7-day window

**URL**: Currently NO query parameter for date. Each navigation only updates in-memory state.

## Key Research

### Bug Root Cause (line 159)
```javascript
tab.addEventListener('click', () => {
    currentDate = new Date(tab.dataset.date + 'T00:00:00');  // BUG
    // ...
});
```
When `T00:00:00` is appended without timezone specifier, JavaScript interprets it as UTC midnight. In timezones west of UTC (e.g., PST = UTC-8), this displays as the previous day.

**Fix**: Use `T12:00:00` (noon) to avoid boundary issues, or parse date components directly.

### Arrow Buttons (lines 166-181)
Currently shift `windowStartDate` without changing `currentDate`:
```javascript
document.getElementById('prev-day').addEventListener('click', () => {
    windowStartDate.setDate(windowStartDate.getDate() - 1);
    renderDateTabs();
    // Does NOT call loadAllData() or change currentDate
});
```

### Label Format (lines 131-141)
```javascript
if (isTodayDate) {
    label = 'Today';
} else if (isYesterdayDate) {
    label = 'Yesterday';
} else {
    const dayName = dayNames[day.getDay()];
    const dayNum = day.getDate();
    const month = day.getMonth() + 1;
    label = `${dayName} ${dayNum}/${month}`;
}
```

## Files to Modify
- `/server/views/dashboard.njk` - main changes
- `/public/css/style.css` - possibly adjust `.date-tab` styling if label format changes

## Next Steps
Awaiting user answers on format preferences and arrow behavior before finalizing implementation plan.
