# Chrome Multi-Profile Support - Implementation Plan

## Summary

Add support for tracking browser history from multiple Chrome profiles. Users can select which profiles to track (e.g., work profiles) and exclude others (e.g., personal profiles) via the Settings UI.

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `daemon/browser-history.js` | Modify | Add profile discovery function; modify `readChromeHistory()` to accept profile paths |
| `server/routes/api.js` | Modify | Add `GET /api/chrome-profiles` and `PUT /api/settings/chrome-profiles` endpoints |
| `server/views/settings.njk` | Modify | Add Chrome Profiles section with checkboxes |

## Implementation Steps

### Step 1: Add Profile Discovery Function

In `daemon/browser-history.js` after line 16:

```javascript
const CHROME_BASE = path.join(HOME, 'Library/Application Support/Google/Chrome');

/**
 * Discover all Chrome profiles on the system
 * Returns array of { id, name, email, historyPath }
 */
function discoverChromeProfiles() {
  const profiles = [];

  if (!fs.existsSync(CHROME_BASE)) {
    return profiles;
  }

  const entries = fs.readdirSync(CHROME_BASE, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name !== 'Default' && !entry.name.startsWith('Profile ')) continue;
    if (entry.name === 'Guest Profile') continue; // Skip guest profile

    const prefsPath = path.join(CHROME_BASE, entry.name, 'Preferences');
    const historyPath = path.join(CHROME_BASE, entry.name, 'History');

    if (!fs.existsSync(historyPath)) continue;

    let name = entry.name;
    let email = null;

    try {
      if (fs.existsSync(prefsPath)) {
        const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
        name = prefs.profile?.name || entry.name;
        email = prefs.account_info?.[0]?.email || null;
      }
    } catch (e) {
      console.warn(`Could not read profile preferences for ${entry.name}:`, e.message);
    }

    profiles.push({
      id: entry.name,
      name: name,
      email: email,
      historyPath: historyPath
    });
  }

  return profiles;
}
```

### Step 2: Modify readChromeHistory to Accept Profile Path

Change `readChromeHistory()` (lines 21-103) to accept an optional `historyPath` parameter:

```javascript
async function readChromeHistory(sinceTimestamp = null, historyPath = null) {
  try {
    const targetPath = historyPath || CHROME_HISTORY;

    if (!fs.existsSync(targetPath)) {
      console.log(`Chrome history not found at ${targetPath}`);
      return [];
    }
    // ... rest of function uses targetPath instead of CHROME_HISTORY
```

### Step 3: Modify getAllBrowserHistory to Read Multiple Profiles

Change `getAllBrowserHistory()` (lines 223-233) to loop through enabled profiles:

```javascript
async function getAllBrowserHistory(sinceTimestamp = null, enabledProfileIds = null) {
  let chromeHistory = [];

  // If no specific profiles provided, use Default only (backwards compatible)
  const profileIds = enabledProfileIds || ['Default'];
  const allProfiles = discoverChromeProfiles();

  for (const profileId of profileIds) {
    const profile = allProfiles.find(p => p.id === profileId);
    if (profile) {
      const history = await readChromeHistory(sinceTimestamp, profile.historyPath);
      chromeHistory = chromeHistory.concat(history);
    }
  }

  const safariHistory = await readSafariHistory(sinceTimestamp);
  const allHistory = [...chromeHistory, ...safariHistory];
  allHistory.sort((a, b) => b.timestamp - a.timestamp);

  return allHistory;
}
```

### Step 4: Update Tracker to Pass Enabled Profiles

In `daemon/tracker.js:24`, update call to use setting:

```javascript
const enabledProfiles = JSON.parse(db.getSetting('chrome_profiles_enabled', '["Default"]'));
const history = await browserHistory.getAllBrowserHistory(lastCheck, enabledProfiles);
```

### Step 5: Export discoverChromeProfiles

Add to exports at end of `daemon/browser-history.js`:

```javascript
module.exports = {
  // ... existing exports
  discoverChromeProfiles
};
```

### Step 6: Add API Endpoints

In `server/routes/api.js`, add after line 584:

```javascript
/**
 * GET /api/chrome-profiles
 * Returns all discovered Chrome profiles
 */
router.get('/chrome-profiles', (req, res) => {
  try {
    const browserHistory = require('../../daemon/browser-history');
    const profiles = browserHistory.discoverChromeProfiles();
    const enabledIds = JSON.parse(db.getSetting('chrome_profiles_enabled', '["Default"]'));

    // Add enabled status to each profile
    const profilesWithStatus = profiles.map(p => ({
      ...p,
      enabled: enabledIds.includes(p.id)
    }));

    res.json(profilesWithStatus);
  } catch (error) {
    console.error('Error in GET /api/chrome-profiles:', error);
    res.status(500).json({ error: 'Failed to get Chrome profiles' });
  }
});

/**
 * PUT /api/chrome-profiles
 * Update enabled Chrome profiles
 */
router.put('/chrome-profiles', (req, res) => {
  try {
    const { enabledProfileIds } = req.body;

    if (!Array.isArray(enabledProfileIds)) {
      return res.status(400).json({ error: 'enabledProfileIds must be an array' });
    }

    db.setSetting('chrome_profiles_enabled', JSON.stringify(enabledProfileIds));
    res.json({ success: true, message: 'Chrome profiles updated' });
  } catch (error) {
    console.error('Error in PUT /api/chrome-profiles:', error);
    res.status(500).json({ error: 'Failed to update Chrome profiles' });
  }
});
```

### Step 7: Add UI Section in Settings

In `server/views/settings.njk`, add after the Git Repositories section (after line 143):

```html
<!-- Chrome Profiles -->
<div class="activities-container settings-form-section">
    <h3 class="settings-form-title mb-2">
        Chrome Profiles
    </h3>
    <p class="section-description mb-3">
        Select which Chrome profiles to track. Enable work profiles and disable personal profiles.
    </p>

    <div id="chrome-profile-list">
        <div class="loading-state">
            Loading Chrome profiles...
        </div>
    </div>
</div>
```

### Step 8: Add JavaScript for Chrome Profiles

In the `<script>` section of `settings.njk`, add:

```javascript
// Chrome Profile Management
let chromeProfiles = [];

async function loadChromeProfiles() {
    try {
        const response = await fetch('/api/chrome-profiles');
        chromeProfiles = await response.json();
        renderChromeProfiles();
    } catch (error) {
        console.error('Error loading Chrome profiles:', error);
        document.getElementById('chrome-profile-list').innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--color-warm-gray); font-style: italic;">
                Failed to load Chrome profiles
            </div>
        `;
    }
}

function renderChromeProfiles() {
    const container = document.getElementById('chrome-profile-list');

    if (chromeProfiles.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--color-warm-gray); font-style: italic;">
                No Chrome profiles found. Is Chrome installed?
            </div>
        `;
        return;
    }

    const html = chromeProfiles.map(profile => `
        <div class="calendar-card" style="padding: 12px 16px;">
            <label style="display: flex; align-items: center; cursor: pointer;">
                <input type="checkbox"
                       ${profile.enabled ? 'checked' : ''}
                       onchange="toggleChromeProfile('${profile.id}')"
                       style="margin-right: 12px;">
                <div>
                    <span style="font-weight: 500;">${profile.name}</span>
                    ${profile.email ? `<span style="color: var(--color-warm-gray); font-size: 0.85rem; margin-left: 8px;">${profile.email}</span>` : ''}
                    <span style="color: var(--color-warm-gray); font-size: 0.75rem; margin-left: 8px;">(${profile.id})</span>
                </div>
            </label>
        </div>
    `).join('');

    container.innerHTML = html;
}

async function toggleChromeProfile(profileId) {
    const profile = chromeProfiles.find(p => p.id === profileId);
    if (!profile) return;

    profile.enabled = !profile.enabled;

    const enabledIds = chromeProfiles.filter(p => p.enabled).map(p => p.id);

    try {
        await fetch('/api/chrome-profiles', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabledProfileIds: enabledIds })
        });
    } catch (error) {
        console.error('Error updating Chrome profiles:', error);
        profile.enabled = !profile.enabled; // Revert on error
        renderChromeProfiles();
    }
}

// Add to page load
loadChromeProfiles();
```

## Testing Strategy

### Manual Testing

1. **Profile Discovery**
   - Verify all Chrome profiles are discovered
   - Verify Guest Profile is excluded
   - Verify email addresses are displayed correctly
   - Test with no Chrome installed (should show empty state)

2. **Settings UI**
   - Open Settings page, verify profiles load
   - Toggle profiles on/off, verify persistence on page reload
   - Verify default selection is "Default" profile only

3. **History Tracking**
   - Enable multiple profiles
   - Browse in different Chrome profiles
   - Verify history from enabled profiles appears in reports
   - Verify history from disabled profiles does not appear

4. **Edge Cases**
   - Add new Chrome profile while app is running → refresh settings should show it
   - Delete Chrome profile that was enabled → should skip gracefully
   - Disable all profiles → Safari-only tracking should still work

### Verification Commands

```bash
# Check if daemon picks up multi-profile setting
npm run dev

# Watch logs for profile discovery
tail -f ~/Library/Logs/timetracker.log | grep -i profile
```
