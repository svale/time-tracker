# Improve Domain Tracking - Phase 2: Over-tracking Fix

## Background

Phase 1 (Chrome multi-profile support) is complete. Phase 2 addresses the "ghost time" / over-tracking problem where browser sessions are counted even when the browser isn't the active application.

## Requirements (from exploration)

### Goal
Track time with domain as **active/focused** tab, not just time with tabs open.

### Approach
Hybrid solution combining:
1. Browser history reading (existing)
2. "Is browser frontmost" check via osascript (new)
3. Heuristics: max session duration cap + visit count weighting

### Constraints
- Privacy-focused: **NO accessibility permissions**
- macOS only
- osascript can check frontmost app without permissions

## Open Questions

1. What's a good max session duration cap? (15 min? 30 min?)
2. How to weight visit count vs duration?
3. How often to poll browser focus? (every 30s? 1 min?)
4. Should Chrome's visit_duration field be used? (research needed)
