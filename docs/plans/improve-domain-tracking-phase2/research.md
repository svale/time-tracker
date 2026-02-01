# Improve Domain Tracking Phase 2 - Research

## Summary

This research investigates solutions for the "over-tracking" problem where browser sessions are counted even when the browser isn't the active application. The key finding is that osascript can detect both the frontmost app AND the active browser tab URL without requiring accessibility permissions, enabling a hybrid approach that combines browser history with real-time focus tracking.

## Relevant Files

| File | Purpose | Key Lines |
|------|---------|-----------|
| `daemon/browser-history.js` | Browser history reader | Lines 326-409: `aggregateIntoSessions()` |
| `daemon/tracker.js` | Orchestrates periodic history processing | Lines 18-80: `processHistory()` |
| `daemon/index.js` | Daemon entry point, manages intervals | Lines 17-94: `startDaemon()` |
| `database/db.js` | Database functions | `insertSession()`, `getSetting()` |

## Key Patterns

### Current Session Aggregation (browser-history.js:326-409)
- Groups consecutive visits to same domain within a time gap (default 5 min)
- Duration = `end_time - start_time`
- Minimum 1 second per visit if no duration calculated
- Tracks visit count and most frequent page title

### Current Tracking Flow (tracker.js)
1. Every 5 minutes (configurable), read browser history since last check
2. Aggregate into sessions based on domain grouping
3. Insert sessions into database
4. Sessions with `duration_seconds >= 1` are saved

## Research Findings

### 1. osascript Capabilities (No Permissions Required)

**Get frontmost application:**
```bash
osascript -e 'tell application "System Events" to name of first process whose frontmost is true'
# Returns: "Google Chrome", "Safari", "iTerm2", etc.
```

**Get active Chrome tab URL:**
```bash
osascript -e 'tell application "Google Chrome" to get URL of active tab of front window'
# Returns: full URL of active tab
```

**Get active Safari tab URL:**
```bash
osascript -e 'tell application "Safari" to get URL of current tab of front window'
# Returns: full URL of active tab
```

**Get Chrome active tab title:**
```bash
osascript -e 'tell application "Google Chrome" to get title of active tab of front window'
```

All of these work WITHOUT accessibility permissions.

### 2. Chrome visit_duration Field Analysis

Chrome's `visit_duration` (in microseconds) is unreliable for our purposes:

**Schema:** `visits.visit_duration INTEGER DEFAULT 0 NOT NULL`

**Distribution from real data (last 7 days, 5159 visits):**
| Duration Bucket | Count |
|-----------------|-------|
| < 1 min | 21,566 |
| 1-5 min | 1,613 |
| 5-15 min | 814 |
| 15min-1hr | 658 |
| > 1 hr | 749 |

**Problem:** Many durations exceed 1 hour (up to 195+ hours seen), indicating this field measures "time until next navigation in that tab" - not actual viewing time. Tabs left open overnight inflate this value.

**Recommendation:** Don't rely on `visit_duration` for accurate time tracking.

### 3. Current Duration Calculation Problem

The current approach:
```javascript
session.duration_seconds = Math.floor((session.end_time - session.start_time) / 1000);
if (session.duration_seconds === 0) {
  session.duration_seconds = session.visit_count * 1;
}
```

This counts ALL time between first and last visit to a domain, even if:
- The browser wasn't the active application
- A different tab was active in the browser
- The user was away from the computer

## Proposed Solution Architecture

### Hybrid Approach: Browser History + Focus Polling

**New Component: `daemon/focus-tracker.js`**

Poll every 30-60 seconds to record:
1. Is a browser (Chrome/Safari) the frontmost app?
2. If yes, what domain is in the active tab?

Store focus samples in a new table or in-memory buffer.

**Modified Session Calculation:**

When aggregating sessions, cross-reference with focus samples:
- Session duration = time where domain was BOTH in history AND in focus
- Apply max duration cap as fallback heuristic

### Heuristics (Fallback/Enhancement)

1. **Max Session Duration Cap**: Default 30 minutes
   - Any session > cap gets reduced to cap
   - Configurable via settings

2. **Visit Count Weighting**:
   - Sessions with more visits are more likely to be active
   - Could multiply duration by `log(visit_count)` factor

3. **Browser Focus Ratio**:
   - If focus data available: `duration = raw_duration × focus_ratio`
   - Example: 10 min session, browser focused 6 min → 6 min counted

## Dependencies

- **osascript**: Built into macOS, no npm packages needed
- **child_process.execSync**: Node.js built-in for running osascript

## Constraints

1. **macOS only**: osascript is macOS-specific
2. **No accessibility permissions**: Must use System Events with basic frontmost check only
3. **Performance**: Focus polling must be lightweight (osascript calls are ~50-100ms)
4. **Battery**: Frequent polling impacts laptop battery life

## Edge Cases

1. **Multiple browser windows**: osascript returns active tab of FRONT window only
2. **Browser not running**: osascript returns error, must handle gracefully
3. **New browser installation**: Need to handle missing browsers
4. **Private/incognito windows**: May not be accessible via osascript
5. **Screen sharing/presentations**: Browser may be "active" but user presenting
6. **Multiple displays**: Frontmost app may be on different display
7. **Full-screen apps**: May affect frontmost detection

## Questions for User Clarification

1. **Polling frequency**: 30 seconds vs 60 seconds? More frequent = more accurate but more CPU/battery usage

2. **Max session cap**: 15 minutes, 30 minutes, or configurable?

3. **Focus requirement**: Should time ONLY count when browser is focused, or use focus as a weighting factor?
   - Option A: Time only counts when browser focused (strict)
   - Option B: Time counts fully when focused, reduced when not (weighted)
   - Option C: Time always counts but capped at max duration (heuristic only)

4. **Retroactive application**: Apply new algorithm to existing data, or only new sessions?

## Applicable Standards

- Follow existing daemon patterns (see `daemon/index.js` for interval management)
- Use `db.getSetting()` for configuration
- Log significant events to console (matches existing pattern in tracker.js)

## Testing Strategy

1. **Unit tests**: Mock osascript responses, test duration calculations
2. **Integration tests**: Verify focus data is captured correctly
3. **Manual testing**: Use app normally, compare reported time vs perceived time

## Next Steps

After user clarifies questions above, proceed to plan phase with:
1. New `daemon/focus-tracker.js` module
2. Modified `aggregateIntoSessions()` logic
3. Settings UI for configuration
4. Migration for focus data storage (if needed)
