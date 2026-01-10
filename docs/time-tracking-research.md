# Time Tracking Research: Fundamental Assumptions and Improvements

**Date**: 2026-01-10
**Status**: Research Document
**Problem**: Browser history-based time tracking reports impossible values (e.g., 50 hours in one day)

---

## Executive Summary

The current time tracking approach has a **critical flaw**: it treats concurrent browser activities as sequential time, leading to inflated and impossible time totals. A user with 10 browser tabs open for 1 hour will be recorded as having spent 10 hours, not 1 hour.

**Root cause**: Browser history entries are additive, not exclusive. Multiple tabs generate simultaneous history entries, but the app sums all session durations without accounting for temporal overlap.

**Recommendation**: Implement time overlap detection and resolution strategies to ensure daily totals never exceed 24 hours.

---

## Current Implementation Analysis

### How Time Tracking Works Today

1. **Data Collection** (`daemon/browser-history.js`)
   - Reads Chrome and Safari history databases every 5 minutes
   - Extracts URL visits with timestamps
   - Each browser tab navigation creates a history entry

2. **Session Aggregation** (`browser-history.js:260-343`)
   - Groups consecutive visits to the same domain within 5-minute threshold
   - Calculates duration: `session.duration = end_time - start_time`
   - Stores sessions in `activity_sessions` table

3. **Reporting** (`database/db.js:195-241`)
   - Sums all session durations for a given day:
     ```sql
     SUM(s.duration_seconds) as total_seconds
     ```
   - No overlap detection or deduplication

### The Fundamental Problem

**Assumption**: Browser history represents sequential, mutually exclusive time periods.

**Reality**: Browser usage is highly concurrent:
- Users routinely have 10-30+ tabs open simultaneously
- Background tabs generate history entries while inactive
- Switching between tabs rapidly creates overlapping sessions
- Multiple browsers can run concurrently (Chrome + Safari)

**Example scenario**:
```
9:00 AM - Open gmail.com (stays open all day)
9:05 AM - Open github.com in new tab
9:10 AM - Open slack.com in new tab
10:00 AM - Still have all 3 tabs open

Current calculation:
- gmail.com: 60 minutes
- github.com: 55 minutes
- slack.com: 50 minutes
Total: 165 minutes (2h 45m) for 1 hour of work

Correct calculation: 60 minutes of work time
```

### Why This Happens

Browser history stores every page visit with a timestamp, but contains **no information about**:
- Which tab was actively focused
- How long each page was actually viewed
- When tabs were backgrounded or minimized
- Whether the user was actively interacting with the page

The current aggregation logic assumes:
```
If domain X has visits at T1 and T2,
user spent (T2 - T1) time on domain X
```

This is false when multiple domains have overlapping time ranges.

---

## Impact Assessment

### Current Problems

1. **Impossible Daily Totals**
   - Reports can show 30-50+ hours per day
   - Makes all percentage calculations meaningless
   - Destroys trust in the data

2. **Project Time Inflation**
   - Projects with many related domains get massively inflated
   - Example: A project with 5 domains might show 8 hours when actual work was 1 hour

3. **Misleading Insights**
   - Cannot accurately answer "How much time did I spend on Project X today?"
   - Cannot compare time across different days
   - Cannot identify genuine productivity patterns

4. **Loss of Primary Value**
   - App's stated purpose: "track time spent on different projects through the day"
   - Current implementation fails this core objective

---

## Research: Industry Approaches to Time Tracking

### 1. Active Window Tracking (RescueTime, Time Doctor, Hubstaff)

**Method**: Track the currently focused application/window
- Poll system every 5-10 seconds: "What window is active?"
- Only count time for the active window
- Automatically handles overlap (only one window can be active)

**Pros**:
- Accurate: No overlap by definition
- Always totals to actual elapsed time
- Captures actual attention

**Cons**:
- Requires accessibility permissions (screen recording on macOS)
- Privacy concerns (tracks all apps, not just browsers)
- Your app explicitly avoids this for privacy reasons

**Applicability**: Not suitable due to privacy/permission requirements

### 2. Browser Extension Approach (Toggl Track, Clockify browser extensions)

**Method**: Browser extension tracks active tab
- Detects tab focus/blur events
- Only counts time when tab is visible and focused
- Can detect idle time (no mouse/keyboard activity)

**Pros**:
- Accurate for browser-based work
- No system permissions needed
- Can detect actual engagement

**Cons**:
- Requires user to install browser extension
- Doesn't work for multiple browsers simultaneously
- More complex deployment

**Applicability**: Could be explored as an option, but changes the deployment model

### 3. Time Overlap Resolution (Proposed approach for this app)

**Method**: Detect and resolve overlapping time sessions
- Keep existing data collection (browser history)
- Add post-processing to detect temporal overlaps
- Apply resolution strategies to eliminate double-counting

**Pros**:
- No new permissions required
- Maintains privacy-focused design
- Can be added to existing system

**Cons**:
- Cannot know which tab was "actually" active
- Must use heuristics to resolve conflicts
- Less accurate than active tracking, but much better than current

**Applicability**: **Best fit for this app's constraints**

---

## Proposed Solution: Time Overlap Resolution

### Strategy Overview

Since we cannot know which browser tab was actively focused (without accessibility permissions), we must:
1. **Detect overlapping sessions** in the same time period
2. **Apply resolution rules** to prevent double-counting
3. **Ensure daily totals** never exceed elapsed time (max 24 hours/day)

### Resolution Strategies

#### Option A: Equal Time Split
When sessions overlap, split the time equally among them.

```
9:00-10:00: gmail.com, github.com, slack.com (3 overlapping sessions)
Resolution: Each gets 20 minutes
Total: 60 minutes ✓
```

**Pros**: Fair, simple, guaranteed to not exceed elapsed time
**Cons**: May not reflect actual usage (user might have focused on one tab)

#### Option B: Proportional Split by Visit Count
Weight time by number of history entries (visits).

```
9:00-10:00:
- gmail.com: 15 visits
- github.com: 30 visits
- slack.com: 5 visits
Total visits: 50

Resolution:
- gmail.com: 60 * (15/50) = 18 minutes
- github.com: 60 * (30/50) = 36 minutes
- slack.com: 60 * (5/50) = 6 minutes
Total: 60 minutes ✓
```

**Pros**: Rewards "active" tabs with more visits
**Cons**: Background tabs with auto-refresh can skew results

#### Option C: Most Recent Activity Wins
Give time to the session with the most recent activity in each time slice.

```
Divide day into 1-minute buckets
For each bucket, assign time to session with most recent visit
```

**Pros**: Reflects recency of interaction
**Cons**: Complex to implement, can still be gamed by auto-refresh

#### Option D: Primary Session (Recommended)
For each overlapping time period, designate a "primary" session:
- Longest session is primary (gets full time)
- Other sessions get no time for overlapping period

```
9:00-10:00:
- gmail.com: 9:00-17:00 (all day)
- github.com: 9:05-10:30
- slack.com: 9:10-11:00

Resolution:
- gmail.com is primary (longest) → gets time
- github.com and slack.com overlap with gmail → get 0 for 9:00-10:00
- But github.com gets credit for 10:00-10:30 (non-overlapping with others)
```

**Pros**: Simple, intuitive, prevents background tabs from inflating time
**Cons**: May undercount rapid task-switching

### Recommended Implementation

**Phase 1: Add Overlap Detection**
- Create function to identify overlapping sessions
- Add `overlap_group_id` to sessions that share time
- Display warning when overlaps detected

**Phase 2: Implement Resolution**
- Use **Option D (Primary Session)** as default
- Apply resolution when calculating daily reports
- Show original vs. resolved time in UI for transparency

**Phase 3: Make It Configurable**
- Let users choose resolution strategy
- Add setting: `overlap_resolution_strategy: primary|split|proportional`

---

## Implementation Sketch

### New Database Function

```javascript
/**
 * Get daily report with overlap resolution
 * Returns time allocations that never exceed elapsed time
 */
function getDailyReportWithOverlapResolution(dateString, strategy = 'primary') {
  // 1. Get all sessions for the day
  const sessions = getAllSessionsForDay(dateString);

  // 2. Sort by start_time
  sessions.sort((a, b) => a.start_time - b.start_time);

  // 3. Build timeline of overlapping sessions
  const timeline = buildOverlapTimeline(sessions);

  // 4. Apply resolution strategy
  const resolved = applyResolutionStrategy(timeline, strategy);

  // 5. Sum up resolved durations
  return aggregateByDomain(resolved);
}

function buildOverlapTimeline(sessions) {
  // Create time intervals where different sets of sessions overlap
  // Return: [{ start, end, sessions: [session1, session2, ...] }]
}

function applyResolutionStrategy(timeline, strategy) {
  return timeline.map(interval => {
    const duration = interval.end - interval.start;
    const sessions = interval.sessions;

    if (sessions.length === 1) {
      // No overlap, full time to this session
      return { session: sessions[0], duration };
    }

    // Multiple overlapping sessions
    switch (strategy) {
      case 'primary':
        // Give all time to longest session
        const primary = sessions.reduce((longest, s) =>
          s.duration > longest.duration ? s : longest
        );
        return { session: primary, duration };

      case 'split':
        // Split equally among all sessions
        return sessions.map(s => ({
          session: s,
          duration: duration / sessions.length
        }));

      case 'proportional':
        // Weight by visit count
        const totalVisits = sessions.reduce((sum, s) => sum + s.visit_count, 0);
        return sessions.map(s => ({
          session: s,
          duration: duration * (s.visit_count / totalVisits)
        }));
    }
  });
}
```

### Algorithm: Primary Session Resolution

```
For each minute M in the day:
  1. Find all sessions S that overlap minute M
  2. If len(S) == 1: assign 60 seconds to that session
  3. If len(S) > 1:
     - Sort sessions by duration (longest first)
     - Assign 60 seconds to S[0] (primary)
     - Assign 0 seconds to S[1..n]

Sum up allocated time for each domain
```

**Guarantee**: Daily total = elapsed time (no more than 1440 minutes/day)

---

## Alternative: Hybrid Approaches

### Approach 1: Focus Detection Heuristics

Without accessibility permissions, we can infer focus:
- **Title changes** = likely focused (user navigated)
- **High visit frequency** = likely active tab
- **Browser type** = if only Chrome open, prioritize Chrome sessions

Could implement scoring:
```javascript
function calculateFocusScore(session, timestamp) {
  let score = 0;

  // Recent visit = likely focused
  const timeSinceLastVisit = timestamp - session.last_visit_time;
  if (timeSinceLastVisit < 30000) score += 50; // Within 30 seconds

  // Many visits = likely active
  score += session.visit_count * 2;

  // Title changes = user interaction
  score += session.title_changes * 10;

  return score;
}

// Assign time proportionally to focus scores
```

### Approach 2: Session Priorities by Project

Let users define project priorities:
```
Project A (high priority): Gets time when overlapping with low-priority
Project B (low priority): Only gets time when no high-priority sessions
```

This acknowledges that users have primary and secondary tasks.

### Approach 3: Time Caps per Domain

Set maximum daily time per domain:
```
No domain can exceed 8 hours per day (typical workday)
Cap sessions at this limit, redistribute excess time
```

Prevents runaway inflation from always-open tabs.

---

## Recommendations

### Immediate Actions (Short-term)

1. **Implement Warning System**
   - Calculate daily total time
   - If total > 24 hours, show warning: "Time data contains overlaps"
   - Display message: "Multiple browser tabs open simultaneously may inflate time totals"

2. **Add Raw vs. Adjusted Views**
   - Keep current "raw" time calculations
   - Add "adjusted" view with overlap resolution
   - Let users compare and understand the difference

3. **Document the Limitation**
   - Update UI with explanation
   - Add FAQ: "Why is my daily time more than 24 hours?"
   - Transparency builds trust

### Medium-term Implementation (Recommended)

1. **Implement Primary Session Resolution** (Option D)
   - Add `getDailyReportWithOverlapResolution()` function
   - Make it default for all reports
   - Show "Adjusted for overlapping browser tabs" indicator

2. **Add Timeline Visualization**
   - Show sessions on timeline with overlaps visible
   - Users can see where inflation occurs
   - Helps understand the adjustment

3. **Make Strategy Configurable**
   - Add setting: "When multiple tabs are open..."
     - "Count the longest session" (Primary)
     - "Split time equally" (Equal Split)
     - "Weight by activity" (Proportional)

### Long-term Exploration

1. **Optional Browser Extension**
   - For users who want accuracy
   - Tracks active tab with focus events
   - Syncs with main app database
   - Entirely optional, preserves core privacy model

2. **Machine Learning Focus Prediction**
   - Train model on visit patterns
   - Predict which tab was likely focused
   - Improve resolution accuracy over time

3. **Integration with Calendar/Meetings**
   - If calendar shows meeting 2-3pm, ignore browser history during that time
   - Use calendar as ground truth for time allocation
   - Prevents "meeting + open tabs" from double-counting

---

## Comparison with Manual Time Tracking

Manual time trackers (Toggl, Harvest) require users to:
- Start timer when beginning task
- Stop timer when ending task
- Manually categorize time

This is accurate but burdensome. The tradeoff:

| Approach | Accuracy | Effort | Privacy |
|----------|----------|--------|---------|
| Manual tracking | High | High | High |
| Active window tracking | High | Low | Low (requires permissions) |
| Browser history (current) | Very Low | None | High |
| Browser history + overlap resolution | Medium | None | High |
| Browser extension | High | Low | Medium |

**Conclusion**: Overlap resolution offers the best balance for this app's goals.

---

## Testing Strategy

### Validation Scenarios

1. **Single tab, single session**
   - Expected: Full time counted
   - Test: Open gmail.com 9-10am, verify shows 60 minutes

2. **Multiple tabs, fully overlapping**
   - Expected: Total time = elapsed time (60 minutes)
   - Test: Open 5 tabs 9-10am, verify total ≤ 60 minutes

3. **Multiple tabs, partially overlapping**
   - Expected: Non-overlapping portions counted separately
   - Test: Tab A 9-11am, Tab B 10-12pm
   - Should show: Tab A gets time for 9-10 + share of 10-11, Tab B gets share of 10-11 + 11-12

4. **Edge case: All-day background tab**
   - Expected: Doesn't dominate all time
   - Test: Gmail open 8am-6pm, work on GitHub 9-5pm
   - Primary strategy: GitHub should get most time

### Success Metrics

- Daily totals never exceed 24 hours
- Users report time totals are "believable"
- Project time allocations match user expectations
- Ability to answer: "Did I spend 4 hours on Project X today?" with confidence

---

## References and Further Reading

1. **RescueTime's Approach**: Active window tracking with idle detection
   - Requires accessibility permissions
   - Polls every 5 seconds for active window

2. **Browser Extension APIs**:
   - Chrome: `chrome.tabs.onActivated` event
   - Chrome: `chrome.idle.queryState()` for idle detection
   - Firefox: Similar `browser.tabs` API

3. **Research Papers**:
   - "Automatic Time Tracking of Knowledge Workers" (CHI 2010)
   - "Challenges in Time Tracking Software" (IEEE Software 2018)

4. **Privacy-Preserving Time Tracking**:
   - App Store guidelines on tracking
   - GDPR considerations for time tracking
   - macOS permission models

---

## Conclusion

The current browser history-based approach violates a fundamental assumption: that tracked time periods are mutually exclusive. In reality, users work with many concurrent browser tabs, leading to severe time inflation.

**The fix is tractable**: Implement overlap detection and resolution to ensure daily totals represent actual elapsed time. The "Primary Session" strategy is recommended as a starting point, being simple to implement and understand.

This change is critical for the app's stated purpose: helping users track time spent on projects throughout the day. Without it, the data is not actionable.

**Next steps**:
1. Implement overlap detection function
2. Add primary session resolution algorithm
3. Update UI to show adjusted times
4. Add transparency about methodology
5. Make resolution strategy configurable

With these changes, the app can provide believable, actionable time tracking data while maintaining its privacy-focused, permission-free approach.
