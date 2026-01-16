# Chrome Multi-Profile Support

## Goal
Enable tracking browser history from multiple Chrome profiles, allowing users to select which profiles to include (work profiles) and exclude (personal profiles).

## Background
From exploration: `docs/explorations/improve-domain-tracking/current.md`

Currently, the app only tracks the Chrome "Default" profile. Users with multiple profiles (work accounts, personal accounts) cannot:
1. Track history from their work profiles
2. Exclude personal browsing from time tracking

## Requirements

### Must Have
- Discover all Chrome profiles on the system
- Show profile list in Settings UI with email identifiers
- Allow users to enable/disable tracking per profile
- Merge history from all enabled profiles
- Persist profile selection in settings

### Nice to Have
- Show profile avatar/icon in UI
- Remember when new profiles are added

## User's Profiles
| Internal | Email | Include? |
|----------|-------|----------|
| Default | svale@feed.no | ✓ Work |
| Profile 1 | svale.fossaskaret@netlife.com | ✓ Work |
| Profile 2 | svaleaf@gmail.com | ✗ Personal |
| Guest Profile | (none) | ✗ Skip |

## Technical Context
- Chrome profiles stored in `~/Library/Application Support/Google/Chrome/`
- Profile metadata in `<profile>/Preferences` JSON
- Email address is best identifier (display names often same)
- Safari has single profile (no changes needed)

## Out of Scope
- Over-tracking improvements (Phase 2, separate plan)
- Firefox/other browser support
- Windows/Linux paths
