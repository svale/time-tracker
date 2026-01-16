# Chrome Profile Research

## Date: 2026-01-16

## Profile Discovery

Chrome stores profiles in `~/Library/Application Support/Google/Chrome/`:
- `Default/` - First profile created
- `Profile N/` - Additional profiles (N = 1, 2, 3...)
- `Guest Profile/` - Guest browsing mode

## Reading Profile Metadata

Profile display name and email stored in `Preferences` JSON file:

```javascript
// Path: ~/Library/Application Support/Google/Chrome/<profile>/Preferences
{
  "profile": {
    "name": "Display Name Here",
    "avatar_index": 26
  },
  "account_info": [
    {
      "email": "user@example.com"
    }
  ]
}
```

## User's Profiles

| Internal Name | Display Name | Email | Type |
|--------------|--------------|-------|------|
| Default | Your Chrome | svale@feed.no | Work |
| Profile 1 | Your Chrome | svale.fossaskaret@netlife.com | Work |
| Profile 2 | Your Chrome | svaleaf@gmail.com | Personal |
| Guest Profile | Guest | N/A | Skip |

## Implementation Notes

1. **Discovery**: Scan Chrome directory for `Profile *` and `Default` folders
2. **Metadata**: Read `Preferences` JSON to get display name and email
3. **Display**: Show email as identifier (more unique than "Your Chrome")
4. **Storage**: Store selected profiles in settings table as JSON array

## Code Approach

```javascript
const CHROME_BASE = path.join(HOME, 'Library/Application Support/Google/Chrome');

async function discoverChromeProfiles() {
  const profiles = [];
  const dirs = fs.readdirSync(CHROME_BASE);

  for (const dir of dirs) {
    if (dir === 'Default' || dir.startsWith('Profile ')) {
      const prefsPath = path.join(CHROME_BASE, dir, 'Preferences');
      if (fs.existsSync(prefsPath)) {
        const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
        profiles.push({
          id: dir,
          name: prefs.profile?.name || dir,
          email: prefs.account_info?.[0]?.email || null,
          historyPath: path.join(CHROME_BASE, dir, 'History')
        });
      }
    }
  }

  return profiles;
}
```
