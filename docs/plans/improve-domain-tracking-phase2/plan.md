# Improve Domain Tracking Phase 2 - Implementation Plan

## Summary

Implement focus-aware browser time tracking to fix the "over-tracking" problem. Currently, sessions count all time between first and last visit to a domain, even when the browser isn't focused. This plan adds real-time focus polling via osascript to track when the browser is actually the active application, with a 30-minute max session cap as a fallback heuristic.

**Approach**: Strict focus tracking - time only counts when browser is frontmost AND domain is in active tab.

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `daemon/focus-tracker.js` | Create | New module for polling browser focus state via osascript |
| `daemon/tracker.js` | Modify | Integrate focus data into session duration calculation |
| `daemon/browser-history.js` | Modify | Export `extractDomain` for use in focus-tracker |
| `daemon/index.js` | Modify | Start/stop focus tracker alongside browser history tracker |
| `database/schema.sql` | Modify | Add `focus_samples` table for storing focus data |
| `database/db.js` | Modify | Add functions for focus sample CRUD operations |
| `server/routes/api.js` | Modify | Add endpoint for focus tracking settings |
| `server/views/settings.njk` | Modify | Add UI for configuring focus tracking |

## Implementation Steps

### Step 1: Create Focus Tracker Module

Create `daemon/focus-tracker.js`:

```javascript
// Key functions:
// - getFrontmostApp(): Get name of frontmost application via osascript
// - getActiveBrowserTabUrl(browser): Get URL of active tab in Chrome/Safari
// - recordFocusSample(): Poll and record current focus state
// - startFocusTracking(intervalMs): Start polling at specified interval
// - stopFocusTracking(): Stop polling
// - getFocusSamples(startTime, endTime): Get samples for time range
```

**osascript commands (from research):**
- Frontmost app: `osascript -e 'tell application "System Events" to name of first process whose frontmost is true'`
- Chrome active URL: `osascript -e 'tell application "Google Chrome" to get URL of active tab of front window'`
- Safari active URL: `osascript -e 'tell application "Safari" to get URL of current tab of front window'`

**Error handling:**
- Wrap osascript calls in try/catch
- Return null on error (browser not running, no windows open)
- Log errors but don't crash

### Step 2: Add Database Schema for Focus Samples

Add to `database/schema.sql` (via migration):

```sql
CREATE TABLE IF NOT EXISTS focus_samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,        -- When sample was taken (ms)
    app_name TEXT,                     -- Frontmost app name
    browser TEXT,                      -- 'Chrome', 'Safari', or null
    domain TEXT,                       -- Domain of active tab (if browser focused)
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_focus_timestamp ON focus_samples(timestamp);
CREATE INDEX IF NOT EXISTS idx_focus_domain ON focus_samples(domain);
```

### Step 3: Add Database Functions

Add to `database/db.js`:

```javascript
// insertFocusSample({ timestamp, app_name, browser, domain })
// getFocusSamples(startTime, endTime)
// getFocusSamplesForDomain(domain, startTime, endTime)
// cleanupOldFocusSamples(olderThanMs) - for periodic cleanup
```

### Step 4: Modify Session Duration Calculation

Update `daemon/tracker.js` `processHistory()`:

**Current flow:**
1. Read browser history
2. Aggregate into sessions (duration = end_time - start_time)
3. Save sessions

**New flow:**
1. Read browser history
2. Aggregate into raw sessions (duration = end_time - start_time)
3. **For each session, calculate focus-aware duration:**
   - Query focus samples within session time range
   - Count samples where `browser` matches AND `domain` matches
   - `focus_duration = matching_samples × poll_interval_seconds`
   - `final_duration = min(focus_duration, max_session_cap)`
   - If no focus samples in range (edge case), use `min(raw_duration, max_session_cap)`
4. Save sessions with adjusted duration

### Step 5: Add Default Settings

Add new settings to `database/schema.sql`:

```sql
INSERT OR IGNORE INTO settings (key, value) VALUES ('focus_tracking_enabled', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('focus_poll_interval_seconds', '30');
INSERT OR IGNORE INTO settings (key, value) VALUES ('max_session_duration_minutes', '30');
```

### Step 6: Integrate Focus Tracker into Daemon

Update `daemon/index.js`:

```javascript
const focusTracker = require('./focus-tracker');

// In startDaemon():
if (db.getSetting('focus_tracking_enabled', 'true') === 'true') {
  const pollInterval = parseInt(db.getSetting('focus_poll_interval_seconds', '30'), 10) * 1000;
  focusTracker.startFocusTracking(pollInterval);
}

// In shutdown():
focusTracker.stopFocusTracking();
```

### Step 7: Add Settings UI

Update `server/views/settings.njk` to add:
- Toggle for focus tracking enabled/disabled
- Dropdown for poll interval (15s, 30s, 60s)
- Dropdown for max session duration (15m, 30m, 60m)

Add API endpoint in `server/routes/api.js`:
- `GET /api/settings/focus` - get focus settings
- `PUT /api/settings/focus` - update focus settings

### Step 8: Add Periodic Cleanup

In `daemon/index.js`, add cleanup interval:
- Run every 24 hours
- Delete focus samples older than 7 days
- Keeps database size manageable

## Settings Summary

| Setting | Default | Description |
|---------|---------|-------------|
| `focus_tracking_enabled` | `true` | Enable/disable focus tracking |
| `focus_poll_interval_seconds` | `30` | How often to poll browser focus |
| `max_session_duration_minutes` | `30` | Cap on session duration |

## Testing Strategy

### Unit Tests
1. **Focus tracker module:**
   - Mock `child_process.execSync` to return various osascript outputs
   - Test handling of errors (browser not running, no windows)
   - Test domain extraction from URLs

2. **Duration calculation:**
   - Test with various focus sample patterns
   - Test with no focus samples (fallback to capped duration)
   - Test boundary conditions (session exactly at cap)

### Manual Testing
1. Start daemon, verify focus samples being recorded in database
2. Browse normally, check that reported time matches perceived active time
3. Leave browser open but switch to another app - verify time stops accumulating
4. Test with Chrome and Safari
5. Test with browser closed - verify no errors

### Verification Queries
```sql
-- Check focus samples being recorded
SELECT * FROM focus_samples ORDER BY timestamp DESC LIMIT 20;

-- Compare raw vs focus-aware duration
SELECT
  domain,
  (end_time - start_time) / 1000 as raw_seconds,
  duration_seconds as focus_seconds
FROM activity_sessions
WHERE date(start_time/1000, 'unixepoch') = date('now')
ORDER BY start_time DESC;
```

## Edge Cases Handled

1. **Browser not running**: osascript returns error → return null, skip sample
2. **Multiple Chrome profiles**: osascript returns active tab of front window regardless of profile
3. **Private/incognito windows**: May not be accessible → handle gracefully
4. **No browser windows open**: osascript returns error → return null
5. **Multiple displays**: Frontmost app detection works across displays
6. **Daemon starts with existing sessions**: Focus data only applies to new sessions

## Rollback Plan

If issues arise:
1. Set `focus_tracking_enabled` to `'false'` in settings
2. Sessions will use capped raw duration as fallback
3. No data loss - focus_samples table can be dropped safely

## Next Steps

After implementation, consider:
- Adding focus data visualization in dashboard
- Showing "focus ratio" for sessions (focused time / raw time)
- Retroactive analysis option for existing data (using heuristics only)
