# Time Tracker - Feature Implementation TODO

**Workplan Reference:** See `/Users/svale/.claude/plans/transient-discovering-dragon.md` for detailed design

**Status Legend:**
- `[ ]` Not Started
- `[→]` In Progress
- `[✓]` Complete

---

## Phase 1: Projects Foundation

**Goal:** Enable project creation and automatic/manual session categorization

### 1.1 Database Setup

- [✓] Create `database/migrations/` directory
- [✓] Create `database/migrations/001_add_projects.sql` with schema
- [✓] Add migration runner to `database/db.js`
  - [✓] Function: `runMigrations()`
  - [✓] Check `schema_migrations` table for applied migrations
  - [✓] Apply pending migrations in order
  - [✓] Track applied migrations

**Success Criteria:**
- ✓ Migration system runs on `initDatabase()`
- ✓ Projects tables created successfully
- ✓ Can track which migrations have been applied

**Tests:**
```bash
# Start server and check database
npm run server
# Check that tables exist
sqlite3 data/activity.db ".tables"
# Should see: projects, project_domains, schema_migrations
```
✓ **TESTED AND WORKING**

---

### 1.2 Database Functions (db.js)

- [✓] Add project CRUD functions:
  - [✓] `getProjects()` - Return all non-archived projects
  - [✓] `getProject(id)` - Return single project
  - [✓] `createProject({ name, description, color })` - Create new project
  - [✓] `updateProject(id, { name, description, color })` - Update project
  - [✓] `archiveProject(id)` - Set is_archived = 1
- [✓] Add domain mapping functions:
  - [✓] `getProjectDomains(projectId)` - Get all domains for project
  - [✓] `addProjectDomain(projectId, domain)` - Add domain mapping
  - [✓] `removeProjectDomain(id)` - Remove domain mapping
- [✓] Add session assignment function:
  - [✓] `assignSessionToProject(sessionId, projectId)` - Manual assignment
- [ ] Modify query functions to include project data:
  - [ ] `getDailyReportAll()` - Include project_id and project_name (JOIN)

**Success Criteria:**
- All functions return expected data
- JOIN query works for project names
- Domain mappings enforce UNIQUE constraint
- Error handling for duplicates

**Tests:**
```javascript
// In node REPL or test script
const db = require('./database/db');
await db.initDatabase();

// Create project
const projectId = db.createProject({ name: 'Work', color: '#3B82F6' });
console.log('Created project:', projectId);

// Add domain
db.addProjectDomain(projectId, 'github.com');
console.log('Domains:', db.getProjectDomains(projectId));

// Get projects
console.log('All projects:', db.getProjects());
```

---

### 1.3 Project Matcher Utility

- [✓] Create `server/utils/project-matcher.js`
- [✓] Function: `matchDomain(domain)` - Returns project_id or null
  - [✓] Query `project_domains` table for matching domain
  - [✓] Return first match (or null if no match)
  - [✓] Handle null/undefined domain gracefully

**Success Criteria:**
- ✓ Function returns correct project_id for matched domains
- ✓ Returns null for unmatched domains
- ✓ No crashes on invalid input

**Tests:**
```javascript
const projectMatcher = require('./server/utils/project-matcher');

// Test with matched domain
const projectId = projectMatcher.matchDomain('github.com');
console.log('github.com matches project:', projectId);

// Test with unmatched domain
const noMatch = projectMatcher.matchDomain('example.com');
console.log('example.com matches:', noMatch); // Should be null
```

---

### 1.4 Daemon Integration

- [✓] Modify `daemon/tracker.js` (around line 42)
- [✓] Import `projectMatcher`
- [✓] Before `db.insertSession()`:
  - [✓] Call `projectMatcher.matchDomain(session.domain)`
  - [✓] Add `project_id` to session object if match found
- [✓] Pass `project_id` to `insertSession()`

**Success Criteria:**
- ✓ New sessions automatically get project_id if domain matches
- ✓ Daemon doesn't crash if no match found
- ✓ Existing functionality still works

**Tests:**
```bash
# Add domain mapping for a site you'll visit
# Start daemon
npm start

# Visit github.com or mapped site
# Check database after a few minutes
sqlite3 data/activity.db "SELECT domain, project_id FROM activity_sessions ORDER BY start_time DESC LIMIT 5;"
# Should see project_id populated for matched domains
```

---

### 1.5 Projects API Routes

- [✓] Create `server/routes/projects.js`
- [✓] Project endpoints:
  - [✓] `GET /api/projects` - List all projects (getProjects)
  - [✓] `POST /api/projects` - Create project (validate name, color)
  - [✓] `GET /api/projects/:id` - Get project details
  - [✓] `PUT /api/projects/:id` - Update project
  - [✓] `DELETE /api/projects/:id` - Archive project
- [✓] Domain mapping endpoints:
  - [✓] `GET /api/projects/:id/domains` - Get project domains
  - [✓] `POST /api/projects/:id/domains` - Add domain (body: { domain })
  - [✓] `DELETE /api/project-domains/:id` - Remove domain
- [✓] Session assignment:
  - [✓] `POST /api/sessions/:id/assign-project` - Manual assignment (body: { project_id })
- [✓] Add input validation and error handling

**Success Criteria:**
- ✓ All endpoints return proper JSON
- ✓ Error cases return 400/404/500 with error messages
- ✓ Validation prevents empty names, invalid colors

**Tests:**
```bash
# Start server
npm run server

# Create project
curl -X POST http://localhost:8765/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"Work","description":"Work projects","color":"#3B82F6"}'

# Get all projects
curl http://localhost:8765/api/projects

# Add domain mapping
curl -X POST http://localhost:8765/api/projects/1/domains \
  -H "Content-Type: application/json" \
  -d '{"domain":"github.com"}'

# Get domains for project
curl http://localhost:8765/api/projects/1/domains
```
✓ **TESTED AND WORKING**

---

### 1.6 Mount Projects Router

- [✓] Modify `server/index.js` (around line 28)
- [✓] Import projects router: `const projectsRouter = require('./routes/projects');`
- [✓] Mount router: `app.use('/api', projectsRouter);`

**Success Criteria:**
- ✓ Projects API accessible at /api/projects
- ✓ No route conflicts with existing /api routes

**Tests:**
```bash
curl http://localhost:8765/api/projects
# Should return [] or list of projects
```

---

### 1.7 Modify Daily Report API

- [✓] Modify `server/routes/api.js`
- [✓] Update `GET /api/daily-report`:
  - [✓] Modify query to LEFT JOIN with projects table
  - [✓] Include `project_id` and `project_name` in response
  - [✓] Add optional `?project_id=X` filter parameter
- [✓] Update `GET /api/daily-summary`:
  - [✓] Include project info in top activities

**Success Criteria:**
- Report includes project information
- Filter by project works correctly
- Unassigned sessions show null project

**Tests:**
```bash
curl "http://localhost:8765/api/daily-report?date=2026-01-02"
# Should include project_id and project_name in activities

curl "http://localhost:8765/api/daily-report?date=2026-01-02&project_id=1"
# Should filter to only project 1 activities
```

---

### 1.8 Projects Management UI

- [✓] Create `server/views/projects.html`
- [✓] Page sections:
  - [✓] Header with "Projects" title
  - [✓] Project list (cards with name, color, domain count)
  - [✓] "New Project" button/form
  - [✓] Edit project modal/form
  - [✓] Domain mapping section (per project)
- [✓] Use editorial design matching dashboard
- [✓] JavaScript for CRUD operations:
  - [✓] Fetch and display projects
  - [✓] Create new project (POST /api/projects)
  - [✓] Edit project (PUT /api/projects/:id)
  - [✓] Archive project (DELETE /api/projects/:id)
  - [✓] Manage domains (add/remove)

**Success Criteria:**
- Page loads without errors
- Can create projects
- Can edit projects
- Can add/remove domain mappings
- Design matches dashboard aesthetic

**Tests:**
- Visit http://localhost:8765/projects
- Create a new project via UI
- Add domain mappings
- Verify in database

---

### 1.9 Dashboard Updates

- [✓] Modify `server/views/dashboard.html`
- [✓] Add project filter dropdown in header:
  - [✓] "All Projects" option
  - [✓] List of projects from API
  - [✓] Filter activities on selection
- [✓] Modify activity entries:
  - [✓] Show project badge/pill with color
  - [✓] Display project name
- [✓] Update JavaScript:
  - [✓] Fetch projects on load
  - [✓] Filter daily report by selected project

**Success Criteria:**
- Project filter dropdown populates
- Filtering works correctly
- Project badges display with correct colors
- Unassigned sessions show "No Project"

**Tests:**
- Visit http://localhost:8765
- Select a project from filter
- Verify only that project's activities show
- Check that colors match

---

### 1.10 Navigation Updates

- [✓] Add `/projects` link to navigation in all views
- [✓] Update `server/routes/pages.js` to serve projects.html

**Success Criteria:**
- Can navigate to projects page from dashboard/reports/settings
- Projects page loads correctly

**Tests:**
- Click "Projects" link from dashboard
- Verify page loads

---

### Phase 1 Final Testing

- [✓] Create 2-3 sample projects
- [✓] Add domain mappings (e.g., "github.com" → "Work", "stackoverflow.com" → "Work")
- [✓] Verify all API endpoints working
- [✓] Verify all pages accessible
- [✓] Verify database migration applied
- [✓] Verify project filter functionality
- [✓] Verify navigation works on all pages

**Success Criteria:**
✓ Users can create and manage projects
✓ Browser sessions will auto-assign to projects via domain mapping (verified in daemon code)
✓ Manual override available via API
✓ Dashboard shows project breakdown with filters and badges
✓ All CRUD operations work correctly

**PHASE 1 COMPLETE! ✓**

---

## Phase 2: Google Calendar Integration

**Goal:** Sync Google Calendar events and assign to projects via keywords

### 2.1 Encryption Utility

- [ ] Create `server/utils/encryption.js`
- [ ] Functions:
  - [ ] `getOrCreateEncryptionKey()` - Generate or retrieve 32-byte key
  - [ ] `encrypt(text)` - AES-256-GCM encryption, return iv:authTag:encrypted
  - [ ] `decrypt(encryptedData)` - Decrypt and return plain text
- [ ] Store encryption key in settings table or environment variable
- [ ] Add error handling for decryption failures

**Success Criteria:**
- Encryption/decryption roundtrip works
- Key persists across restarts
- Errors handled gracefully

**Tests:**
```javascript
const { encrypt, decrypt } = require('./server/utils/encryption');

const plaintext = 'sensitive-token-12345';
const encrypted = encrypt(plaintext);
console.log('Encrypted:', encrypted);

const decrypted = decrypt(encrypted);
console.log('Decrypted:', decrypted);
console.assert(decrypted === plaintext, 'Encryption roundtrip failed!');
```

---

### 2.2 Database Schema for Calendar

- [ ] Create `database/migrations/002_add_calendar.sql`
- [ ] Tables:
  - [ ] `calendar_events` with all fields
  - [ ] `project_calendar_keywords`
  - [ ] `oauth_tokens`
- [ ] Indexes for performance

**Success Criteria:**
- Migration creates tables successfully
- UNIQUE constraints work
- Foreign keys enforced

**Tests:**
```bash
sqlite3 data/activity.db ".schema calendar_events"
sqlite3 data/activity.db ".schema oauth_tokens"
```

---

### 2.3 Database Functions for Calendar

- [ ] Add to `database/db.js`:
  - [ ] `getOAuthToken(provider)` - Fetch, decrypt, return token object
  - [ ] `setOAuthToken(provider, tokenData)` - Encrypt and store tokens
  - [ ] `deleteOAuthToken(provider)` - Remove tokens
  - [ ] `insertCalendarEvent(eventData)` - Insert event (handle duplicates)
  - [ ] `getCalendarEvents(dateString)` - Get events for date
  - [ ] `assignCalendarEventToProject(eventId, projectId)` - Manual assignment
  - [ ] `getProjectKeywords(projectId)` - Get keywords for project
  - [ ] `addProjectKeyword(projectId, keyword)` - Add keyword
  - [ ] `removeProjectKeyword(id)` - Remove keyword

**Success Criteria:**
- Token encryption/decryption works in DB layer
- Calendar events can be inserted and queried
- Keywords can be managed

**Tests:**
```javascript
// Test OAuth token storage
db.setOAuthToken('google', {
  access_token: 'token123',
  refresh_token: 'refresh123',
  expires_at: Date.now() + 3600000
});

const token = db.getOAuthToken('google');
console.log('Token:', token); // Should be decrypted
```

---

### 2.4 Google Cloud Console Setup

- [ ] Create Google Cloud project
- [ ] Enable Google Calendar API
- [ ] Create OAuth 2.0 credentials (Desktop app)
- [ ] Configure consent screen
- [ ] Add redirect URI: `http://localhost:8765/api/integrations/google/callback`
- [ ] Download credentials
- [ ] Create `.env` file with `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- [ ] Add `.env` to `.gitignore`
- [ ] Create `.env.example` template

**Success Criteria:**
- OAuth app created in Google Cloud
- Credentials stored in .env
- .env not committed to git

---

### 2.5 OAuth Integration Routes

- [ ] Create `server/routes/integrations.js`
- [ ] Google Calendar OAuth endpoints:
  - [ ] `GET /api/integrations/google/auth` - Redirect to Google OAuth
  - [ ] `GET /api/integrations/google/callback` - Handle callback, store tokens
  - [ ] `POST /api/integrations/google/disconnect` - Revoke and delete tokens
  - [ ] `GET /api/integrations/google/status` - Check connection status
- [ ] Token refresh logic when access_token expires
- [ ] Error handling for OAuth failures

**Success Criteria:**
- OAuth flow redirects to Google
- Tokens stored encrypted after callback
- Refresh works automatically
- Disconnect clears tokens

**Tests:**
- Visit http://localhost:8765/api/integrations/google/auth
- Complete OAuth flow
- Check database for encrypted tokens
- Test disconnect

---

### 2.6 Project Matcher Enhancement

- [ ] Modify `server/utils/project-matcher.js`
- [ ] Add function: `matchCalendarEvent(title, description)`
  - [ ] Query project keywords
  - [ ] Check if title or description contains any keyword
  - [ ] Return project_id or null
  - [ ] Case-insensitive matching

**Success Criteria:**
- Keywords in title match correctly
- Keywords in description match correctly
- Returns null if no match

**Tests:**
```javascript
const { matchCalendarEvent } = require('./server/utils/project-matcher');

// Add keyword "Project A" to a project
// Test matching
const projectId = matchCalendarEvent('Daily standup for Project A', '');
console.log('Matched project:', projectId);
```

---

### 2.7 Calendar Sync Daemon

- [ ] Install googleapis: `npm install googleapis`
- [ ] Create `daemon/calendar-sync.js`
- [ ] Function: `syncCalendarEvents()`
  - [ ] Get OAuth token from database (decrypt)
  - [ ] Handle missing token gracefully
  - [ ] Initialize Google Calendar API client
  - [ ] Fetch events (last 7 days on first sync, incremental after)
  - [ ] Transform to standard format (timestamps to milliseconds)
  - [ ] Match events to projects via keywords
  - [ ] Insert into calendar_events (handle duplicates with UNIQUE constraint)
  - [ ] Handle token expiration (refresh if needed)
  - [ ] Error handling and logging
- [ ] Export function

**Success Criteria:**
- Syncs events without crashing
- Timestamps converted correctly
- Duplicate events skipped
- Project assignment works
- Token refresh works

**Tests:**
```bash
# Manually trigger sync
node -e "require('./daemon/calendar-sync').syncCalendarEvents().then(() => console.log('Done'))"

# Check database
sqlite3 data/activity.db "SELECT title, start_time, project_id FROM calendar_events;"
```

---

### 2.8 Integrate Calendar Sync in Daemon

- [ ] Modify `daemon/index.js`
- [ ] Import calendar-sync
- [ ] Start sync interval: `setInterval(syncCalendarEvents, 15 * 60 * 1000)`
- [ ] Initial sync on startup (with delay to allow DB init)
- [ ] Handle sync errors (don't crash daemon)

**Success Criteria:**
- Calendar syncs every 15 minutes
- Daemon doesn't crash on sync errors
- Initial sync runs on startup

**Tests:**
```bash
npm start
# Wait 15 minutes or check logs for sync activity
tail -f ~/Library/Logs/timetracker.log | grep -i calendar
```

---

### 2.9 Calendar API Endpoints

- [ ] Add to `server/routes/api.js`:
  - [ ] `GET /api/calendar-events` - List events for date range
  - [ ] `PUT /api/calendar-events/:id/project` - Manual project assignment
- [ ] Add to `server/routes/projects.js`:
  - [ ] `GET /api/projects/:id/keywords` - Get keywords
  - [ ] `POST /api/projects/:id/keywords` - Add keyword (body: { keyword })
  - [ ] `DELETE /api/project-keywords/:id` - Remove keyword

**Success Criteria:**
- Can fetch calendar events via API
- Can manually assign events to projects
- Can manage keywords

**Tests:**
```bash
curl "http://localhost:8765/api/calendar-events?date=2026-01-02"
curl http://localhost:8765/api/projects/1/keywords
```

---

### 2.10 Settings Page - Calendar Integration

- [ ] Modify `server/views/settings.html`
- [ ] Add "Google Calendar Integration" section
- [ ] UI elements:
  - [ ] "Connect Google Calendar" button
  - [ ] Connection status (connected/disconnected)
  - [ ] Last sync time
  - [ ] "Disconnect" button (when connected)
  - [ ] Privacy notice about calendar access
- [ ] JavaScript:
  - [ ] Fetch connection status on load
  - [ ] Handle connect button (redirect to auth)
  - [ ] Handle disconnect button (POST to disconnect endpoint)
  - [ ] Show success/error messages

**Success Criteria:**
- Can connect calendar via UI
- Status shows correctly
- Disconnect works
- User feedback on actions

**Tests:**
- Visit http://localhost:8765/settings
- Click "Connect Google Calendar"
- Complete OAuth flow
- Verify status updates to "Connected"
- Test disconnect

---

### 2.11 Dashboard - Display Calendar Events

- [ ] Modify `server/views/dashboard.html`
- [ ] Update activity log to include calendar events
- [ ] Distinct styling for calendar events (calendar icon, different color)
- [ ] Show event details on hover (attendees, location)
- [ ] Include calendar events in timeline/hourly chart
- [ ] Modify data fetching to combine sessions and calendar events

**Success Criteria:**
- Calendar events appear in activity log
- Visually distinct from browser sessions
- Timeline includes calendar time
- Hover shows event details

**Tests:**
- Visit dashboard after calendar sync
- Verify events display correctly
- Check timeline includes event time

---

### Phase 2 Final Testing

- [ ] Complete OAuth flow
- [ ] Verify events sync within 30 minutes
- [ ] Add keywords to projects
- [ ] Verify automatic event-to-project matching
- [ ] Manually assign some events to projects
- [ ] Verify token encryption in database
- [ ] Test disconnect and reconnect
- [ ] Simulate token expiration and verify refresh

**Success Criteria:**
✓ OAuth flow completes successfully
✓ Calendar events sync within 30 minutes of changes
✓ 50%+ of events auto-assign via keyword matching
✓ Manual override available
✓ No token security issues

---

## Phase 3: GitHub Integration

**Goal:** Track development activity via GitHub commits and PRs

### 3.1 Database Schema for GitHub

- [ ] Create `database/migrations/003_add_github.sql`
- [ ] Tables:
  - [ ] `github_events`
  - [ ] `project_repositories`
- [ ] Indexes

**Success Criteria:**
- Migration creates tables
- UNIQUE constraints work

**Tests:**
```bash
sqlite3 data/activity.db ".schema github_events"
```

---

### 3.2 Database Functions for GitHub

- [ ] Add to `database/db.js`:
  - [ ] `insertGitHubEvent(eventData)` - Insert event (handle duplicates)
  - [ ] `getGitHubEvents(dateString)` - Get events for date
  - [ ] `getProjectRepositories(projectId)` - Get repos for project
  - [ ] `addProjectRepository(projectId, repository)` - Add repo mapping
  - [ ] `removeProjectRepository(id)` - Remove repo mapping

**Success Criteria:**
- GitHub events can be inserted and queried
- Repository mappings work

---

### 3.3 GitHub Username Helper

- [ ] Create `server/utils/github-username.js`
- [ ] Function: `getGitHubUsername(token)`
  - [ ] Call `GET https://api.github.com/user` with PAT
  - [ ] Return username
  - [ ] Handle errors

**Success Criteria:**
- Returns username for valid PAT
- Handles invalid PAT gracefully

---

### 3.4 GitHub Sync Daemon

- [ ] Install @octokit/rest: `npm install @octokit/rest`
- [ ] Create `daemon/github-sync.js`
- [ ] Function: `syncGitHubEvents()`
  - [ ] Get PAT from database (decrypt)
  - [ ] Handle missing token gracefully
  - [ ] Get username from token
  - [ ] Fetch events: `GET /users/:username/events`
  - [ ] Filter PushEvent, PullRequestEvent, IssuesEvent
  - [ ] Extract repository, timestamp, title
  - [ ] Match repository to projects
  - [ ] Insert into github_events
  - [ ] Error handling

**Success Criteria:**
- Syncs events successfully
- Repositories matched to projects
- Duplicates skipped

**Tests:**
```bash
node -e "require('./daemon/github-sync').syncGitHubEvents().then(() => console.log('Done'))"
```

---

### 3.5 Integrate GitHub Sync in Daemon

- [ ] Modify `daemon/index.js`
- [ ] Import github-sync
- [ ] Start sync interval: `setInterval(syncGitHubEvents, 30 * 60 * 1000)`
- [ ] Initial sync on startup

**Success Criteria:**
- GitHub syncs every 30 minutes
- Daemon doesn't crash on errors

---

### 3.6 GitHub Integration Routes

- [ ] Add to `server/routes/integrations.js`:
  - [ ] `POST /api/integrations/github/connect` - Store PAT (encrypted)
  - [ ] `POST /api/integrations/github/disconnect` - Remove PAT
  - [ ] `GET /api/integrations/github/status` - Connection status
- [ ] Add to `server/routes/api.js`:
  - [ ] `GET /api/github-events` - List events
- [ ] Add to `server/routes/projects.js`:
  - [ ] `GET /api/projects/:id/repositories` - Get repos
  - [ ] `POST /api/projects/:id/repositories` - Add repo
  - [ ] `DELETE /api/project-repositories/:id` - Remove repo

**Success Criteria:**
- Can connect with PAT
- Can disconnect
- Can fetch events
- Can manage repository mappings

---

### 3.7 Settings Page - GitHub Integration

- [ ] Modify `server/views/settings.html`
- [ ] Add "GitHub Integration" section
- [ ] UI elements:
  - [ ] PAT input field
  - [ ] Instructions with link to GitHub PAT page
  - [ ] "Connect" button
  - [ ] Connection status
  - [ ] Last sync time
  - [ ] "Disconnect" button
- [ ] JavaScript for connect/disconnect

**Success Criteria:**
- Can connect via PAT
- Status shows correctly
- Disconnect works

---

### 3.8 Dashboard - Display GitHub Events

- [ ] Modify `server/views/dashboard.html`
- [ ] Add GitHub events to activity log
- [ ] Icons for commits/PRs/issues
- [ ] Show commit messages/PR titles
- [ ] Link to GitHub URLs
- [ ] Include in timeline (as activity markers)

**Success Criteria:**
- GitHub events display
- Links work
- Visually distinct

---

### 3.9 Projects Page - Repository Mappings

- [ ] Modify `server/views/projects.html`
- [ ] Add repository mapping section per project
- [ ] UI to add/remove repositories
- [ ] Format: "owner/repo"

**Success Criteria:**
- Can add repositories to projects
- Can remove repositories
- Events auto-assign based on mappings

---

### Phase 3 Final Testing

- [ ] Generate GitHub PAT
- [ ] Connect via settings
- [ ] Verify events sync
- [ ] Map repositories to projects
- [ ] Verify automatic assignment
- [ ] Check PAT encryption
- [ ] Verify events in dashboard

**Success Criteria:**
✓ GitHub PAT connection works
✓ Events sync every 30 minutes
✓ Repository mappings auto-assign events to projects
✓ Events display in dashboard

---

## Phase 4: Workday Tracking

**Goal:** Calculate and display workday start, end, and duration

### 4.1 Workday Calculation Function

- [ ] Add to `database/db.js`:
  - [ ] Function: `getWorkdayStats(dateString)`
  - [ ] Query MIN(start_time) from activity_sessions
  - [ ] Query MIN(start_time) from calendar_events
  - [ ] Query MIN(timestamp) from github_events
  - [ ] Take minimum of all three as workday_start
  - [ ] Query MAX(end_time) from activity_sessions
  - [ ] Query MAX(end_time) from calendar_events
  - [ ] Query MAX(timestamp) from github_events
  - [ ] Take maximum of all three as workday_end
  - [ ] Calculate duration: workday_end - workday_start
  - [ ] Format start/end as HH:MM
  - [ ] Format duration as "Xh Ym"
  - [ ] Handle no data case

**Success Criteria:**
- Calculates correctly across all sources
- Handles missing data gracefully
- Formats times correctly

**Tests:**
```javascript
const workday = db.getWorkdayStats('2026-01-02');
console.log('Workday:', workday);
// Should show start, end, duration
```

---

### 4.2 API Integration

- [ ] Modify `server/routes/api.js`
- [ ] Update `GET /api/daily-summary`:
  - [ ] Call `db.getWorkdayStats(date)`
  - [ ] Add to response: `workday_start`, `workday_end`, `workday_duration`
  - [ ] Handle null values (no data for day)

**Success Criteria:**
- Summary includes workday stats
- Null values handled gracefully

**Tests:**
```bash
curl "http://localhost:8765/api/daily-summary?date=2026-01-02"
# Should include workday_start, workday_end, workday_duration
```

---

### 4.3 Dashboard UI

- [ ] Modify `server/views/dashboard.html`
- [ ] Add three new stat cards:
  - [ ] "Workday Start" with time (e.g., "9:15 AM")
  - [ ] "Workday Duration" with duration (e.g., "9h 30m")
  - [ ] "Workday End" with time (e.g., "6:45 PM")
- [ ] Update grid layout to accommodate 6 cards
- [ ] Update JavaScript to render workday data
- [ ] Handle no data case (show "--" or "No data")

**Success Criteria:**
- Cards display correctly
- Layout looks good with 6 cards
- Data updates with daily summary
- No data case handled gracefully

**Tests:**
- Visit dashboard
- Verify workday cards show correct times
- Check with date that has no data

---

### Phase 4 Final Testing

- [ ] Test with only browser sessions
- [ ] Test with calendar events added
- [ ] Test with GitHub events added
- [ ] Verify workday spans all sources
- [ ] Test edge cases (no data, single event, large gaps)
- [ ] Verify UI displays correctly

**Success Criteria:**
✓ Workday calculation accurate across all sources
✓ Dashboard shows clear workday summary
✓ Handles edge cases gracefully

---

## Final Integration Testing

- [ ] All four phases working together
- [ ] Projects created and sessions auto-assigned
- [ ] Calendar events syncing and assigned to projects
- [ ] GitHub events syncing and assigned to projects
- [ ] Workday tracking includes all sources
- [ ] Dashboard shows comprehensive view
- [ ] All manual overrides work
- [ ] Performance acceptable (page loads quickly)
- [ ] No errors in browser console or server logs

---

## Documentation

- [ ] Update CLAUDE.md with TODO.md reference
- [ ] Add usage instructions to README (if needed)
- [ ] Document OAuth setup process
- [ ] Document GitHub PAT setup
- [ ] Add troubleshooting section

---

**Current Status:** Ready to begin Phase 1.1 - Database Setup
