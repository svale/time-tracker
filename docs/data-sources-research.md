# Data Sources Research: Multi-Signal Time Tracking

**Date**: 2026-01-10
**Status**: Research Document
**Context**: Extending browser history with additional signals for accurate time tracking

---

## Executive Summary

Browser history alone creates overlapping time sessions and inflated totals. By combining multiple data sources, we can:
1. **Validate** browser time with corroborating signals
2. **Fill gaps** when browsers don't capture work (coding, meetings, emails)
3. **Improve accuracy** through cross-signal correlation
4. **Resolve overlaps** by using active signals as tiebreakers

**Current Stack**:
- ✅ Browser History (Chrome, Safari)
- ✅ iCal Calendar Integration (meetings, events)
- 🔄 GitHub Activity (planned)

**Recommendation**: Add 3-4 high-value, low-complexity sources that respect privacy constraints.

---

## Evaluation Criteria

Each data source evaluated on:

| Criterion | Description | Weight |
|-----------|-------------|---------|
| **Privacy** | Permissions required, data sensitivity | HIGH |
| **Complexity** | Implementation effort, maintenance burden | HIGH |
| **Signal Quality** | How well it indicates actual work | MEDIUM |
| **Coverage** | What % of work day it captures | MEDIUM |
| **Overlap Resolution** | Can it help resolve concurrent activities? | LOW |

**Privacy Requirement**: Must not require macOS accessibility permissions (screen recording, input monitoring)

---

## Currently Implemented Sources

### 1. Browser History (Primary Signal)

**Status**: ✅ Implemented

**What it tracks**:
- URL visits from Chrome and Safari
- Timestamps for each page navigation
- Session aggregation (5-minute gap threshold)

**Strengths**:
- No permissions needed
- High coverage for web-based work
- Easy to map domains to projects

**Weaknesses**:
- **Critical flaw**: Overlapping sessions from multiple tabs
- Doesn't capture: local development, IDE work, meetings, emails
- Background tabs inflate time

**Data quality**: Medium (overlap problem)

### 2. iCal Calendar (Meeting Signal)

**Status**: ✅ Implemented (`daemon/ical-sync.js`)

**What it tracks**:
- Calendar events from iCal feeds
- Meeting start/end times
- Event titles, attendees, descriptions
- Maps events to projects via keywords

**Strengths**:
- High accuracy (scheduled time is real time)
- No overlaps (only one meeting at a time)
- Privacy-preserving (user provides iCal URL)
- Captures meeting time browser history misses

**Weaknesses**:
- Only tracks scheduled events
- Doesn't capture ad-hoc work
- Meetings might overlap with coding (multitasking)

**Data quality**: High

**Implementation**: `database/migrations/004_refactor_calendar_to_ical.sql`

### 3. GitHub Activity (Development Signal)

**Status**: 🔄 Planned

**What it will track**:
- Commits with timestamps
- Pull requests created/reviewed
- Issues created/commented
- Repository activity

**Strengths**:
- Captures actual development work
- High signal for software projects
- API is well-documented and stable
- Can map repos to projects automatically

**Weaknesses**:
- Only captures pushed commits (not local work)
- Doesn't track time spent reading code/debugging
- Requires GitHub authentication (personal access token)
- Misses work in private repos (unless token has access)

**Data quality**: Medium-High

**Privacy**: Requires API token, but user-controlled

---

## Proposed Additional Sources

### 4. Local Git Activity ⭐ (HIGH VALUE)

**What it tracks**:
- Local commits (even unpushed)
- Branch switches
- Merge/rebase activity
- Stash operations
- Working directory changes

**How it works**:
```javascript
// Watch .git directories for changes
const gitDirs = findGitRepositories(homeDir);
gitDirs.forEach(dir => {
  watchGitReflog(dir); // Parse .git/logs/HEAD
  detectCommits(dir);  // Track local commits
});
```

**Data structure**:
```sql
CREATE TABLE git_activity (
  id INTEGER PRIMARY KEY,
  repo_path TEXT,
  repo_name TEXT,
  action_type TEXT, -- commit, merge, branch, pull, push
  branch TEXT,
  commit_hash TEXT,
  commit_message TEXT,
  timestamp INTEGER,
  project_id INTEGER
);
```

**Map repos to projects**:
- User specifies project ↔ repo path mapping
- Automatic detection via `.git/config` remotes
- Example: `/Users/john/projects/myapp` → "Work Project"

**Strengths**:
- ⭐ Captures actual development activity
- ⭐ Works offline (no network needed)
- ⭐ No API tokens required
- High accuracy (commits = real work)
- Fills gap browser history misses (local coding)

**Weaknesses**:
- Requires file system access (but no special permissions)
- Only captures version-controlled work
- Doesn't track time *between* commits
- Need to scan for git repos periodically

**Complexity**: Low-Medium
- Use `fs.watch()` on `.git` directories
- Parse reflog files (plain text)
- ~200 lines of code

**Privacy**: High (all local data)

**Recommendation**: **IMPLEMENT** - High value, low complexity

---

### 5. File System Activity ⭐ (MEDIUM-HIGH VALUE)

**What it tracks**:
- Recently modified files
- File types being worked on
- Projects/directories with activity

**How it works**:
```javascript
// Watch specific project directories
const projectDirs = [
  '/Users/john/projects/myapp',
  '/Users/john/projects/client-site'
];

projectDirs.forEach(dir => {
  fs.watch(dir, { recursive: true }, (event, filename) => {
    // Track: file modified, timestamp, project
    recordFileActivity(dir, filename, Date.now());
  });
});
```

**Data structure**:
```sql
CREATE TABLE file_activity (
  id INTEGER PRIMARY KEY,
  file_path TEXT,
  file_name TEXT,
  file_extension TEXT,
  project_path TEXT,
  project_id INTEGER,
  modification_type TEXT, -- created, modified, deleted
  timestamp INTEGER
);
```

**Aggregate into sessions**:
- Group file modifications within 5-minute window
- Extract project from file path
- Example: 10 saves in `/myapp/*.js` between 9-10am = 60 min on "MyApp"

**Strengths**:
- ⭐ Captures actual work (not just browsing)
- Fills gap for local development
- Works for non-code files (docs, designs)
- Can detect file type (e.g., `.js`, `.py`, `.md`)
- No permissions needed (user specifies directories)

**Weaknesses**:
- User must configure watched directories
- Generates lots of data (need to aggregate)
- Can't distinguish "meaningful" edits from autosave
- IDE autosave might inflate time
- Doesn't work for files outside watched dirs

**Complexity**: Medium
- Use Node.js `fs.watch()` (built-in)
- Need debouncing/aggregation logic
- Settings UI for directory management
- ~300 lines of code

**Privacy**: High (user controls which dirs to watch)

**Recommendation**: **CONSIDER** - Good signal, moderate complexity

**Implementation tip**: Start with git repos, expand to other directories later

---

### 6. Terminal/Shell History (LOW-MEDIUM VALUE)

**What it tracks**:
- Commands executed in terminal
- Git commands, npm/yarn, docker, ssh, etc.
- Timestamps from shell history

**How it works**:
```javascript
// Read shell history files
const historyFiles = [
  `${homeDir}/.zsh_history`,
  `${homeDir}/.bash_history`,
  `${homeDir}/.history`
];

function parseShellHistory(file) {
  // Parse commands with timestamps
  // Map commands to project context
}
```

**Strengths**:
- Captures CLI-based development
- Can infer project from `cd` commands
- Git commands indicate development activity
- Low overhead (just read log files)

**Weaknesses**:
- Not all shells save timestamps (bash doesn't by default)
- Commands alone don't indicate time spent
- Privacy: some commands contain sensitive data
- Hard to map commands to projects
- Many commands are quick (not indicative of work duration)

**Complexity**: Low
- Just parse text files
- ~100 lines of code

**Privacy**: Medium (commands may contain secrets, paths)

**Recommendation**: **SKIP** - Low signal quality, privacy concerns

---

### 7. IDE/Editor Plugins ⭐ (HIGH VALUE, HIGH COMPLEXITY)

**What it tracks**:
- Active files in editor
- Actual editing time (not just file saves)
- Language/framework detection
- Test runs, debugger sessions

**How it works**:
- Build plugins for popular editors:
  - VS Code extension
  - JetBrains plugin (IntelliJ, PyCharm, WebStorm)
  - Vim/Neovim plugin
  - Sublime Text plugin

**Data collection**:
```javascript
// VS Code extension
vscode.window.onDidChangeActiveTextEditor(editor => {
  sendToTimeTracker({
    file: editor.document.fileName,
    language: editor.document.languageId,
    timestamp: Date.now()
  });
});

vscode.workspace.onDidChangeTextDocument(event => {
  // User is actively typing
  recordActivity(event.document.fileName);
});
```

**Strengths**:
- ⭐⭐ Highest quality signal for development work
- ⭐ Captures actual active editing (not just file saves)
- Can detect focus (which file is open)
- Solves overlap problem (only one file focused at a time)
- Maps files to projects via workspace/folder

**Weaknesses**:
- ⭐ **High complexity**: Need to build multiple plugins
- ⭐ Requires users to install editor extensions
- Maintenance burden (each editor's API changes)
- Doesn't work for editors without plugin APIs
- Version compatibility issues

**Complexity**: High
- VS Code: ~500 lines (TypeScript)
- JetBrains: ~800 lines (Java/Kotlin)
- Need to publish to extension marketplaces
- Separate repos/versioning for each plugin

**Privacy**: High (all local, user controls what's sent)

**Recommendation**: **LONG-TERM** - Very high value, but significant investment

**Phased approach**:
1. Phase 1: VS Code only (most popular)
2. Phase 2: Add JetBrains support
3. Phase 3: Vim/Neovim

**Reference implementations**:
- WakaTime (open source plugins)
- Toggl Track (editor extensions)
- RescueTime (editor plugins)

---

### 8. Communication Tools (MEDIUM VALUE)

**What it tracks**:
- Slack messages sent/received
- Email activity (sent/read)
- Team communication patterns

#### 8a. Slack API

**How it works**:
```javascript
// Slack API
const { WebClient } = require('@slack/web-api');
const slack = new WebClient(userToken);

// Get user's message history
const history = await slack.conversations.history({
  channel: channelId,
  oldest: startOfDay,
  latest: endOfDay
});

// Filter messages by current user
const myMessages = history.messages.filter(
  msg => msg.user === myUserId
);

// Track: timestamp, channel, message count
```

**Strengths**:
- Captures communication time (often missed)
- Can map channels to projects
- API is stable and well-documented
- Shows actual engagement (sent messages)

**Weaknesses**:
- Requires Slack OAuth token (privacy concern)
- Only tracks active participation (sending)
- Doesn't capture time spent reading
- Not all users use Slack
- Rate limits on API

**Complexity**: Medium
- OAuth flow: ~300 lines
- API integration: ~200 lines
- Need secure token storage

**Privacy**: Medium-Low (requires workspace access)

#### 8b. Email (IMAP/Gmail API)

**How it works**:
```javascript
// Gmail API
const { google } = require('googleapis');
const gmail = google.gmail('v1');

// Get sent emails for the day
const messages = await gmail.users.messages.list({
  userId: 'me',
  q: `after:${startOfDay} before:${endOfDay}`
});

// Track: timestamp, recipient, subject
```

**Strengths**:
- Universal (everyone uses email)
- Can map recipients/subjects to projects
- Shows work activity

**Weaknesses**:
- ⭐ **Major privacy concern**: Reading user's email
- Requires OAuth (Gmail) or IMAP credentials
- Difficult to accurately time (email drafting time unknown)
- People check email throughout the day

**Complexity**: Medium-High
- OAuth flow for Gmail
- IMAP parsing for other providers
- ~400 lines of code

**Privacy**: LOW - Very sensitive data

**Recommendation**: **SKIP** - Privacy concerns outweigh benefits

---

### 9. Project Management Tools (MEDIUM VALUE)

**What it tracks**:
- Jira/Linear/Asana tasks updated
- Issues assigned/completed
- Comments added
- Time estimates vs. actual

#### 9a. Jira API

**How it works**:
```javascript
// Jira REST API
const jira = require('jira-client');

// Get user's activity for the day
const issueHistory = await jira.getIssueChangelog(issueKey);
const myUpdates = issueHistory.filter(
  entry => entry.author.accountId === myAccountId
);

// Track: timestamp, issue key, project
```

**Strengths**:
- Direct mapping to projects (via Jira projects)
- Captures task-based work
- Can compare estimated vs. actual time
- Integrates with development workflow

**Weaknesses**:
- Not all teams use Jira/Linear/etc.
- Requires API credentials (privacy)
- Updates are discrete events, not continuous time
- Admin/PM work, not coding

**Complexity**: Medium
- API integration: ~250 lines per tool
- OAuth for some tools
- Need to support multiple tools (Jira, Linear, Asana, etc.)

**Privacy**: Medium (work data, but less sensitive)

**Recommendation**: **CONSIDER** - Good for teams that use these tools

---

### 10. Application Launch/Focus (LOW-MEDIUM VALUE)

**What it tracks**:
- Which applications are launched
- When apps are quit
- App names (e.g., "VS Code", "Figma", "Slack")

**How it works (macOS)**:
```javascript
// Use Launch Services API (no permissions needed)
const { exec } = require('child_process');

// List running applications
exec('osascript -e "tell application \\"System Events\\" to get name of every process"',
  (err, stdout) => {
    const apps = stdout.split(',').map(s => s.trim());
    // Track: app names, timestamp
  }
);
```

**Alternative**: Poll `ps aux` for running processes

**Strengths**:
- No special permissions (just process list)
- Simple to implement
- Shows tool usage (IDE, browser, Slack, Figma)

**Weaknesses**:
- ⚠️ **Critical**: Can't tell which app is focused without accessibility permissions
- Launching ≠ active use (apps stay open all day)
- Same overlap problem as browser tabs
- Coarse-grained (app-level, not project-level)

**Complexity**: Low (~100 lines)

**Privacy**: High (process names only)

**Recommendation**: **SKIP** - Same overlap problem, low signal quality

---

### 11. Music/Podcast Listening (LOW VALUE)

**What it tracks**:
- Spotify/Apple Music playback
- Podcasts listened to
- Listening patterns (focus music vs. podcasts)

**How it works**:
```javascript
// Spotify API
const spotifyApi = new SpotifyWebApi();

// Get recently played tracks
const recentTracks = await spotifyApi.getMyRecentlyPlayedTracks({
  limit: 50
});

// Track: song, artist, timestamp, duration
```

**Strengths**:
- Shows work patterns (music during coding)
- Can indicate focused work time
- Easy API access

**Weaknesses**:
- Doesn't directly indicate work (just listening)
- Not everyone listens to music while working
- Listening ≠ working (can listen while doing anything)
- Privacy: music taste is personal

**Complexity**: Low (~150 lines)

**Privacy**: Medium

**Recommendation**: **SKIP** - Interesting but not valuable for time tracking

---

### 12. Clipboard History (LOW VALUE)

**What it tracks**:
- Copied text/code
- Paste events
- Clipboard patterns

**How it works (macOS)**:
```javascript
// Poll system clipboard
const { exec } = require('child_process');

setInterval(() => {
  exec('pbpaste', (err, stdout) => {
    const clipboardContent = stdout;
    // Track if changed from last poll
  });
}, 5000);
```

**Strengths**:
- Shows active work (copying/pasting)
- Simple to implement

**Weaknesses**:
- ⚠️ **Major privacy issue**: Clipboard can contain passwords, secrets
- Low signal quality (many irrelevant copies)
- Doesn't map to projects
- Can't distinguish work from personal use

**Complexity**: Low (~50 lines)

**Privacy**: VERY LOW - Extremely sensitive

**Recommendation**: **NEVER** - Privacy nightmare

---

### 13. Network Activity Monitoring (MEDIUM VALUE)

**What it tracks**:
- Which external services are accessed
- API calls to work services (GitHub, AWS, Vercel)
- Database connections
- SSH sessions

**How it works**:
```javascript
// Parse network connections
const { exec } = require('child_process');

exec('lsof -i -P -n', (err, stdout) => {
  // Parse open connections
  // Extract: process, remote address, port
});
```

**Strengths**:
- Shows actual service usage
- Can map services to projects (e.g., AWS account → project)
- No permissions needed (reading own connections)

**Weaknesses**:
- Coarse-grained (connection exists ≠ active use)
- Hard to map connections to projects
- Background processes create noise
- Privacy: may expose sensitive services

**Complexity**: Medium (~200 lines)

**Privacy**: Medium-Low

**Recommendation**: **SKIP** - Complexity outweighs value

---

### 14. Docker/Container Activity (LOW-MEDIUM VALUE)

**What it tracks**:
- Containers started/stopped
- Container names (often match projects)
- Docker compose activity

**How it works**:
```javascript
// Docker API
const Docker = require('dockerode');
const docker = new Docker();

// Get running containers
const containers = await docker.listContainers();

// Track: container name, image, start time
// Map container names to projects
```

**Strengths**:
- Direct mapping to projects (container/image names)
- Shows active development
- API is stable

**Weaknesses**:
- Only useful for Docker users
- Container running ≠ active development
- Containers often stay running all day

**Complexity**: Low (~100 lines)

**Privacy**: High

**Recommendation**: **MAYBE** - Niche, but low effort

---

### 15. Package Manager Activity (LOW VALUE)

**What it tracks**:
- npm/yarn/pip/composer commands
- Packages installed
- Build commands run

**How it works**:
- Parse `npm-debug.log` files
- Watch package lock files
- Monitor `.npm`, `.yarn` cache directories

**Strengths**:
- Shows development activity
- Can infer project from package.json path

**Weaknesses**:
- Infrequent events (not continuous)
- Hard to track reliably
- Not all installs logged

**Complexity**: Medium

**Privacy**: High

**Recommendation**: **SKIP** - Too infrequent to be useful

---

## Recommended Data Source Stack

### Tier 1: Implement Now ⭐

These provide high value with manageable complexity:

1. **Browser History** (✅ Implemented)
   - Primary signal for web-based work
   - Add overlap resolution (see `time-tracking-research.md`)

2. **iCal Calendar** (✅ Implemented)
   - High-quality signal for meetings
   - No overlaps, accurate timing

3. **Local Git Activity** ⭐ NEW
   - Tracks actual development work
   - Fills gap browser history misses
   - Low complexity, high privacy
   - **Action**: Implement git reflog monitoring

4. **GitHub Activity** (🔄 Planned)
   - Complements local git
   - Tracks collaboration (PRs, reviews)
   - **Action**: Complete planned implementation

### Tier 2: Consider for Phase 2

5. **File System Activity**
   - Good signal for local work
   - Moderate complexity
   - User-configurable (privacy)
   - **Action**: Add after git tracking working

6. **Project Management Tools** (Jira/Linear)
   - Good for teams using these tools
   - Direct project mapping
   - **Action**: Survey users, implement if demanded

### Tier 3: Long-term/Optional

7. **IDE Plugins** (VS Code → JetBrains → Vim)
   - Highest quality signal
   - Significant investment
   - **Action**: Prototype VS Code extension, gauge interest

8. **Slack API**
   - Captures communication time
   - Moderate privacy concerns
   - **Action**: Add if users request

### Never Implement ❌

- Email monitoring (privacy)
- Clipboard history (privacy)
- Application focus (requires permissions)
- Network monitoring (complexity)
- Music tracking (not relevant)

---

## Multi-Signal Time Resolution Strategy

With multiple data sources, use **corroboration** to resolve overlaps:

### Algorithm: Weighted Signal Priority

```javascript
function resolveOverlappingTime(minute, signals) {
  // signals = [{ source: 'browser', domain: 'github.com' },
  //            { source: 'git', repo: 'myapp', action: 'commit' },
  //            { source: 'calendar', event: 'Team Standup' }]

  // Priority ranking
  const priority = {
    calendar: 10,     // Meetings are definite
    git: 8,           // Active development is high signal
    file_system: 7,   // File edits indicate work
    github: 6,        // Remote activity
    browser: 5        // Lowest (overlap problem)
  };

  // Sort by priority
  signals.sort((a, b) => priority[b.source] - priority[a.source]);

  // Assign time to highest priority signal
  return signals[0];
}
```

### Example: Multi-Signal Day

```
9:00-9:30: Calendar event "Team Standup"
  → Calendar wins (priority 10)
  → Ignore browser history during this time

9:30-10:00: Browser (github.com) + Git commit + File edits
  → Git wins (priority 8)
  → Assign time to project from git repo

10:00-11:00: Browser (gmail.com, slack.com, docs.google.com)
  → No other signals
  → Use browser overlap resolution (see research doc)
  → Split time among domains

11:00-12:00: Calendar event "Client Call" + Browser (client-site.com)
  → Calendar wins
  → Meeting time takes precedence
```

**Result**:
- No overlapping time
- High-confidence signals prioritized
- Daily total = actual elapsed time

---

## Implementation Roadmap

### Phase 1: Core Signals (4-6 weeks)

**Week 1-2: Git Activity**
- [ ] Scan for git repositories in common paths
- [ ] Parse `.git/logs/HEAD` reflog files
- [ ] Extract: commits, branches, timestamps
- [ ] UI: Settings page to map repos → projects
- [ ] Test: Verify commits tracked accurately

**Week 3-4: GitHub Integration**
- [ ] OAuth flow for GitHub API
- [ ] Fetch commits, PRs, issues
- [ ] Map repos → projects
- [ ] Test: Compare local git vs. GitHub data

**Week 5-6: Overlap Resolution**
- [ ] Implement multi-signal priority algorithm
- [ ] Add browser overlap detection
- [ ] Update reports to use resolved time
- [ ] Test: Verify daily totals ≤ 24 hours

### Phase 2: Extended Signals (6-8 weeks)

**Week 7-10: File System Monitoring**
- [ ] Settings UI to configure watched directories
- [ ] Implement `fs.watch()` on selected dirs
- [ ] Aggregate file changes into sessions
- [ ] Map file paths → projects
- [ ] Test: Verify file edits tracked

**Week 11-14: Project Management Integration**
- [ ] Research API requirements (Jira, Linear, Asana)
- [ ] Implement OAuth flows
- [ ] Fetch issue/task updates
- [ ] Map to projects
- [ ] Test: User acceptance testing

### Phase 3: Advanced Features (Future)

**VS Code Extension** (8-12 weeks)
- [ ] Create VS Code extension project
- [ ] Implement activity tracking
- [ ] Publish to VS Code Marketplace
- [ ] Documentation and onboarding

---

## Privacy & Security Considerations

### Data Minimization

Only collect what's necessary:
- ✅ Domains (not full URLs with query params)
- ✅ File names (not file contents)
- ✅ Commit messages (user's own commits)
- ❌ Email content
- ❌ Clipboard content
- ❌ Passwords/secrets

### Secure Storage

- Store all data in local SQLite database
- Encrypt API tokens in database
- Use macOS Keychain for sensitive credentials
- No cloud sync (user controls their data)

### User Control

- Clear UI showing what's being tracked
- Per-source enable/disable toggles
- Easy data export/deletion
- Transparent about what permissions needed

### Token Security

```javascript
// Encrypt tokens before storage
const crypto = require('crypto');

function encryptToken(token, masterKey) {
  const cipher = crypto.createCipher('aes-256-cbc', masterKey);
  return cipher.update(token, 'utf8', 'hex') + cipher.final('hex');
}

// Master key derived from machine ID
const machineId = require('node-machine-id').machineIdSync();
```

---

## Comparison: Other Time Tracking Tools

| Tool | Signals Used | Privacy | Complexity |
|------|-------------|---------|------------|
| **RescueTime** | Active window (requires permissions), browser extension | Low | High |
| **Toggl Track** | Manual timers, browser extension, calendar | High | Low |
| **WakaTime** | IDE plugins | High | Medium |
| **Clockify** | Manual timers, browser extension | High | Low |
| **Time Doctor** | Active window, screenshots, keyboard/mouse | Very Low | High |
| **This App (Proposed)** | Browser history, calendar, git, file system | High | Medium |

**Differentiator**: Privacy-first, automatic tracking without invasive permissions

---

## Testing Multi-Signal Integration

### Test Scenario 1: Development Work

**Activities**:
- 9:00-9:30: Reading docs on GitHub (browser)
- 9:30-11:00: Coding locally (git commits, file edits)
- 11:00-11:30: Code review on GitHub (browser + GitHub API)

**Expected Results**:
- 9:00-9:30: Browser → github.com → 30 min
- 9:30-11:00: Git → local repo → 90 min
- 11:00-11:30: GitHub → PR review → 30 min
- **Total: 150 min (2.5 hours)** ✓

### Test Scenario 2: Meeting + Multitasking

**Activities**:
- 14:00-15:00: Calendar event "All Hands Meeting"
- 14:00-15:00: Browser tabs open (email, docs)
- 14:00-15:00: Slack messages sent

**Expected Results**:
- Calendar wins (priority 10)
- 14:00-15:00: Calendar → "All Hands Meeting" → 60 min
- Browser and Slack ignored during meeting time
- **Total: 60 min (1 hour)** ✓

### Test Scenario 3: Context Switching

**Activities**:
- 10:00-10:15: Git commit on Project A
- 10:15-10:30: Browser on Project B domain
- 10:30-10:45: File edit in Project A
- 10:45-11:00: Browser on Project A domain

**Expected Results**:
- 10:00-10:15: Project A (git) → 15 min
- 10:15-10:30: Project B (browser) → 15 min
- 10:30-10:45: Project A (file) → 15 min
- 10:45-11:00: Project A (browser) → 15 min
- **Total: 60 min, split across projects** ✓

---

## Conclusion

### Recommended Approach

**Tier 1 Stack (Implement immediately)**:
1. Browser History (fix overlaps)
2. iCal Calendar (already done)
3. Local Git Activity ⭐
4. GitHub API

**Expected Outcome**:
- Covers 80% of knowledge work
- Maintains privacy (no invasive permissions)
- Reasonable complexity (8-12 weeks implementation)
- Solves overlap problem through signal prioritization

### Key Insights

1. **More signals ≠ better tracking**: Focus on high-quality, non-overlapping sources
2. **Calendar is gold standard**: Use it as ground truth when available
3. **Git commits are high signal**: Direct evidence of work, maps to projects
4. **Browser history needs overlap resolution**: Critical to implement (see `time-tracking-research.md`)
5. **Privacy is a feature**: Avoiding invasive permissions differentiates this tool

### Next Steps

1. **Implement git activity tracking** (highest ROI)
2. **Add multi-signal resolution algorithm**
3. **Update UI to show data source per session** (transparency)
4. **Test with real users** (validate assumptions)
5. **Consider file system monitoring** (Phase 2)

With these additions, the app will provide accurate, trustworthy time tracking without compromising user privacy.

---

## Appendix: Data Source Decision Matrix

| Source | Privacy | Complexity | Signal Quality | Coverage | Implement? |
|--------|---------|------------|----------------|----------|------------|
| Browser History | ⭐⭐⭐ | ⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ✅ Done |
| iCal Calendar | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ✅ Done |
| GitHub API | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | 🔄 Planned |
| Local Git | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐ Recommended |
| File System | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | 🔄 Phase 2 |
| IDE Plugins | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 🔮 Long-term |
| Slack API | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | 🤔 Consider |
| Jira/Linear | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | 🤔 Consider |
| Email | ⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ❌ Skip |
| App Focus | ⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ❌ Skip |
| Clipboard | ⭐ | ⭐ | ⭐ | ⭐ | ❌ Never |
| Network | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ❌ Skip |
| Docker | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐ | 🤔 Maybe |
| Terminal History | ⭐⭐ | ⭐ | ⭐⭐ | ⭐⭐ | ❌ Skip |
| Music/Podcasts | ⭐⭐⭐ | ⭐⭐ | ⭐ | ⭐⭐ | ❌ Skip |

Legend: ⭐ = Stars (more is better for Privacy/Quality/Coverage, fewer is better for Complexity)
