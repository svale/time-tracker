# Chrome Multi-Profile Support - Research

## Summary

Implementing multi-profile Chrome support requires: (1) a profile discovery function that reads Chrome's Preferences JSON files to extract email/display names, (2) a new setting to store enabled profiles, (3) API endpoints for profile management, (4) settings UI with checkboxes, and (5) modifying `readChromeHistory()` to loop through enabled profiles.

## Relevant Files

### Core Implementation
- `daemon/browser-history.js:15-16` - Hardcoded `CHROME_HISTORY` path (Default only)
- `daemon/browser-history.js:21-103` - `readChromeHistory()` function to modify
- `daemon/browser-history.js:223-233` - `getAllBrowserHistory()` that calls readChromeHistory
- `daemon/tracker.js:24` - Calls `browserHistory.getAllBrowserHistory()`

### Settings & API
- `server/routes/api.js:544-584` - Settings GET/POST endpoints pattern
- `database/db.js:424-458` - `getSetting()`/`setSetting()` functions
- `database/db.js:715-716` - Settings exported from db module

### Settings UI
- `server/views/settings.njk:17-56` - Tracking Settings section (pattern to follow)
- `server/views/settings.njk:129-143` - Git Repositories section (similar checkbox pattern)
- `server/views/settings.njk:486-499` - loadGitRepos() fetch pattern

## Key Patterns

### Settings Storage
```javascript
// Reading: getSetting(key, defaultValue)
const value = db.getSetting('chrome_profiles_enabled', '["Default"]');
const profiles = JSON.parse(value);

// Writing: setSetting(key, value)
db.setSetting('chrome_profiles_enabled', JSON.stringify(profileIds));
```

### API Endpoint Pattern
```javascript
router.get('/chrome-profiles', (req, res) => {
  try {
    // Return discovered profiles
    res.json(profiles);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get profiles' });
  }
});
```

### UI Pattern (from Git repos)
- Fetch data on page load
- Render list with checkboxes
- Update via PUT/POST on change
- Pattern in `settings.njk:486-564`

## Dependencies

### Node.js (already available)
- `fs` - Read Chrome Preferences files
- `path` - Construct profile paths
- `os` - Get home directory

### Chrome Profile Structure
```
~/Library/Application Support/Google/Chrome/
├── Default/
│   ├── History          ← SQLite database
│   └── Preferences      ← JSON with profile metadata
├── Profile 1/
│   ├── History
│   └── Preferences
├── Profile 2/
│   └── ...
└── Guest Profile/
    └── ...
```

### Preferences JSON Structure
```json
{
  "profile": {
    "name": "Display Name"
  },
  "account_info": [
    { "email": "user@example.com" }
  ]
}
```

## Constraints

1. **macOS only** - Hardcoded path `~/Library/Application Support/Google/Chrome/`
2. **File locking** - Chrome locks History files (existing copy-to-temp pattern handles this)
3. **Preferences parsing** - Must handle malformed JSON gracefully
4. **Guest profile** - Has no email, should likely be skipped
5. **New profiles** - Need to re-discover when user adds new Chrome profiles

## Edge Cases

1. **No Chrome installed** - Chrome directory doesn't exist → return empty list
2. **Corrupted Preferences** - JSON parse fails → skip that profile, log warning
3. **Profile without email** - Guest profile or not signed in → show internal name
4. **Profile added after app starts** - Re-run discovery on settings page load
5. **Profile deleted** - Enabled profile no longer exists → skip, maybe warn
6. **Empty selection** - User disables all profiles → still track Safari if available

## Implementation Approach

### Phase 1: Profile Discovery (daemon/browser-history.js)
```javascript
const CHROME_BASE = path.join(HOME, 'Library/Application Support/Google/Chrome');

function discoverChromeProfiles() {
  const profiles = [];
  if (!fs.existsSync(CHROME_BASE)) return profiles;

  const entries = fs.readdirSync(CHROME_BASE, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name !== 'Default' && !entry.name.startsWith('Profile ')) continue;

    const prefsPath = path.join(CHROME_BASE, entry.name, 'Preferences');
    if (!fs.existsSync(prefsPath)) continue;

    try {
      const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
      profiles.push({
        id: entry.name,
        name: prefs.profile?.name || entry.name,
        email: prefs.account_info?.[0]?.email || null,
        historyPath: path.join(CHROME_BASE, entry.name, 'History')
      });
    } catch (e) {
      console.warn(`Could not read profile ${entry.name}:`, e.message);
    }
  }
  return profiles;
}
```

### Phase 2: Modify readChromeHistory
- Add optional `profileIds` parameter
- If not provided, use setting `chrome_profiles_enabled`
- Loop through enabled profiles, merge results
- Add `profile` field to each result for debugging

### Phase 3: API Endpoints
- `GET /api/chrome-profiles` - Returns discovered profiles
- `PUT /api/settings/chrome-profiles` - Save enabled profile IDs

### Phase 4: Settings UI
- New "Chrome Profiles" section
- List profiles with checkbox + email display
- Save button updates setting
- Refresh button re-discovers profiles

## Questions for Planning

1. Should profile discovery happen once at startup or every time settings page loads?
   - **Recommendation**: Re-discover on settings page load (simpler, handles new profiles)

2. Should we add profile ID to session data in database?
   - **Recommendation**: Not needed for Phase 1, could add later if useful for filtering

3. Default behavior for new installs?
   - **Recommendation**: Enable "Default" profile only (matches current behavior)

## Applicable Standards

From `CLAUDE.md`:
- Edit `.njk` source files, not generated `.html` files
- Settings stored in `settings` table via `getSetting()`/`setSetting()`
- Always call `db.saveDatabase()` after mutations
- Follow existing API route patterns

## Testing Strategy

1. **Unit tests** for `discoverChromeProfiles()` with mocked filesystem
2. **Manual testing** with real Chrome profiles
3. **Edge cases**: No Chrome, corrupted Preferences, missing profiles
4. **UI testing**: Enable/disable profiles, verify tracking behavior
