# Test Plan: Improve Domain Tracking Phase 2

**Created**: 2026-01-18
**Target**: Focus tracking feature for accurate browser time measurement
**Related Plan**: `docs/plans/improve-domain-tracking-phase2/`

## Objectives

This test plan validates the Phase 2 improvements to domain tracking:
1. Focus Tracking Settings UI works correctly
2. Focus tracking settings are persisted via API
3. Settings page displays all focus tracking controls
4. Integration with existing settings functionality

## Background

Phase 2 addresses the "over-tracking" problem where browser sessions are counted even when the browser isn't the active application. The solution uses:
- osascript polling to detect frontmost app
- Focus samples stored in database
- Configurable settings for polling interval and max session duration

## User Flows

### 1. View Focus Tracking Settings
- Navigate to Settings page
- Verify Focus Tracking section is visible
- Verify all controls are present (enable toggle, poll interval, max duration)

### 2. Enable/Disable Focus Tracking
- Toggle the "Enable Focus Tracking" checkbox
- Save settings
- Verify settings persist after page reload

### 3. Configure Poll Interval
- Select different poll interval (15s, 30s, 60s)
- Save settings
- Verify selection persists

### 4. Configure Max Session Duration
- Select different max duration (15m, 30m, 60m)
- Save settings
- Verify selection persists

### 5. API Integration
- Verify GET /api/settings/focus returns correct defaults
- Verify PUT /api/settings/focus updates settings
- Verify settings survive page reload

## Test Cases

| ID | Description | Priority | Type |
|----|-------------|----------|------|
| TC1 | Settings page loads without errors | High | Smoke |
| TC2 | Focus Tracking section is visible | High | Functional |
| TC3 | Focus tracking toggle works | High | Functional |
| TC4 | Poll interval dropdown has correct options | Medium | Functional |
| TC5 | Max session duration dropdown has correct options | Medium | Functional |
| TC6 | Save button shows success message | High | Functional |
| TC7 | Settings persist after page reload | High | Functional |
| TC8 | API returns correct default values | High | Integration |
| TC9 | API updates settings correctly | High | Integration |
| TC10 | Help text is displayed for each setting | Low | UI |

## Prerequisites

- Time Tracker web server running on localhost:8765
- Database initialized with default settings
- No authentication required (local-only app)

## Test Data

Default focus tracking settings:
- `focus_tracking_enabled`: true
- `focus_poll_interval_seconds`: 30
- `max_session_duration_minutes`: 30

## Success Criteria

- All High priority tests pass
- No console errors during test execution
- Settings changes are reflected in the UI
- API responses match expected format
- Settings persist across page reloads

## Test Environment

- Browser: Chrome (via Playwright MCP or Chrome DevTools)
- Base URL: http://localhost:8765
- Settings page: http://localhost:8765/settings

## Notes

- The daemon must be restarted for focus tracking changes to take effect (this is noted in the UI)
- Focus tracking uses osascript which is macOS-only
- The test focuses on UI and API, not the actual osascript functionality
