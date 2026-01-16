# Improve Domain Tracking - Exploration

## Status
Round: 2 | Started: 2026-01-16 | Last updated: 2026-01-16

## Confirmed Requirements

### Issue 1: Multiple Chrome Profiles (PRIORITY - implement first)

- **Settings UI with checkboxes** for each discovered profile
- **Show email as identifier** (display names are all "Your Chrome", not useful)
- Read profile metadata from Chrome's `Preferences` JSON file
- Store selected profiles in settings table

**User's Profiles:**
| Internal | Email | Include? |
|----------|-------|----------|
| Default | svale@feed.no | ✓ Work |
| Profile 1 | svale.fossaskaret@netlife.com | ✓ Work |
| Profile 2 | svaleaf@gmail.com | ✗ Personal |
| Guest Profile | (none) | ✗ Skip |

### Issue 2: Over-tracking (PHASE 2 - after profiles)

- **Goal**: Track time with domain as **active/focused** tab
- **Approach**: Hybrid (browser history + "is browser frontmost" check via osascript)
- **Heuristics**: Cap max session duration + weight by visit count
- Browser focus check should integrate with session duration calculation
- Question 2.4 (visit_duration research) left unanswered - defer to Phase 2

## Open Questions

### For Phase 1 (Profiles):
- None - ready to implement

### For Phase 2 (Over-tracking):
- What's a good max session duration cap? (15 min? 30 min?)
- How to weight visit count vs duration?
- How often to poll browser focus? (every 30s? 1 min?)
- Should we research Chrome's visit_duration field more?

## Context

- Privacy-focused: no accessibility permissions
- macOS only
- Safari has single profile (simpler, no changes needed)
- osascript can check frontmost app without permissions

## Key Research

### Chrome Profile Structure
- Profiles in `~/Library/Application Support/Google/Chrome/`
- `Default/`, `Profile 1/`, `Profile 2/`, `Guest Profile/`
- Metadata in `<profile>/Preferences` JSON
- Email more useful than display name for identification
- See `research/chrome-profiles.md` for details

## Implementation Plan (Phase 1)

1. **Profile Discovery Function** (`daemon/browser-history.js`)
   - Scan Chrome directory for profile folders
   - Read `Preferences` to get email/display name
   - Return list of available profiles

2. **Database/Settings**
   - New setting: `chrome_profiles_enabled` (JSON array of profile IDs)
   - Default: `["Default"]` (current behavior)

3. **Settings API**
   - `GET /api/chrome-profiles` - list discovered profiles
   - `PUT /api/settings/chrome-profiles` - save selected profiles

4. **Settings UI**
   - New section: "Chrome Profiles"
   - Checkboxes for each profile (show email)
   - Save button

5. **Update History Reading**
   - Modify `readChromeHistory()` to accept profile list
   - Loop through enabled profiles, merge results

## Next Steps

Phase 1 exploration is complete. Ready to create implementation plan (RPI) for multi-profile support.

Phase 2 (over-tracking) will be explored after Phase 1 is implemented.
