# Phase 1 Testing Guide

## Test 1: Migration System

**Goal:** Verify migrations run automatically and create tables

```bash
# 1. Check current database state
sqlite3 data/activity.db ".tables"

# Expected: Should see projects, project_domains, schema_migrations tables

# 2. Check migration was tracked
sqlite3 data/activity.db "SELECT * FROM schema_migrations;"

# Expected: version=1, applied_at=(timestamp)

# 3. Verify projects table structure
sqlite3 data/activity.db "PRAGMA table_info(projects);"

# Expected: Columns: id, name, description, color, is_archived, created_at, updated_at

# 4. Verify activity_sessions has project_id
sqlite3 data/activity.db "PRAGMA table_info(activity_sessions);"

# Expected: Should include project_id column
```

**Success Criteria:**
- ✓ All tables exist
- ✓ Migration tracked in schema_migrations
- ✓ Tables have correct structure
- ✓ project_id added to activity_sessions

---

## Test 2: Projects CRUD API

**Goal:** Verify all project management endpoints work

### Start the server
```bash
npm run server
```

### Test Create Project
```bash
# Create first project
curl -X POST http://localhost:8765/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"Work","description":"Work-related activities","color":"#3B82F6"}'

# Expected: Returns project object with id=1

# Create second project
curl -X POST http://localhost:8765/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"Personal","description":"Personal projects","color":"#10B981"}'

# Expected: Returns project object with id=2

# Try duplicate name (should fail)
curl -X POST http://localhost:8765/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"Work","color":"#EF4444"}'

# Expected: 400 error - "Project name already exists"
```

### Test List Projects
```bash
curl http://localhost:8765/api/projects

# Expected: Returns array with 2 projects (Work, Personal)
```

### Test Get Single Project
```bash
curl http://localhost:8765/api/projects/1

# Expected: Returns Work project details
```

### Test Update Project
```bash
curl -X PUT http://localhost:8765/api/projects/1 \
  -H "Content-Type: application/json" \
  -d '{"description":"Updated description"}'

# Expected: Returns updated project with new description

# Verify update persisted
curl http://localhost:8765/api/projects/1
```

### Test Archive Project
```bash
# Archive project 2
curl -X DELETE http://localhost:8765/api/projects/2

# Expected: {"success":true,"message":"Project archived"}

# Verify it's no longer in list
curl http://localhost:8765/api/projects

# Expected: Only returns project 1 (archived projects filtered out)
```

**Success Criteria:**
- ✓ Can create projects
- ✓ Duplicate names rejected
- ✓ Can list projects
- ✓ Can get single project
- ✓ Can update projects
- ✓ Can archive projects
- ✓ Archived projects don't appear in list

---

## Test 3: Domain Mappings API

**Goal:** Verify domain-to-project mapping works

```bash
# Add github.com to Work project
curl -X POST http://localhost:8765/api/projects/1/domains \
  -H "Content-Type: application/json" \
  -d '{"domain":"github.com"}'

# Expected: Returns array with new domain mapping

# Add more domains
curl -X POST http://localhost:8765/api/projects/1/domains \
  -H "Content-Type: application/json" \
  -d '{"domain":"stackoverflow.com"}'

curl -X POST http://localhost:8765/api/projects/1/domains \
  -H "Content-Type: application/json" \
  -d '{"domain":"docs.google.com"}'

# Get all domains for project
curl http://localhost:8765/api/projects/1/domains

# Expected: Returns array with 3 domain mappings

# Try duplicate domain (should fail)
curl -X POST http://localhost:8765/api/projects/1/domains \
  -H "Content-Type: application/json" \
  -d '{"domain":"github.com"}'

# Expected: 400 error - "Domain already mapped to this project"

# Remove a domain mapping (use id from previous response)
curl -X DELETE http://localhost:8765/api/project-domains/1

# Expected: {"success":true,"message":"Domain mapping removed"}

# Verify removal
curl http://localhost:8765/api/projects/1/domains

# Expected: Only 2 domains remain
```

**Success Criteria:**
- ✓ Can add domains to projects
- ✓ Duplicate domains rejected
- ✓ Can list project domains
- ✓ Can remove domain mappings

---

## Test 4: Daemon Auto-Assignment

**Goal:** Verify daemon automatically assigns sessions to projects based on domains

### Setup
```bash
# Ensure we have domain mappings (from Test 3)
# github.com should be mapped to project 1
# If not, add it:
curl -X POST http://localhost:8765/api/projects/1/domains \
  -H "Content-Type: application/json" \
  -d '{"domain":"github.com"}'

curl -X POST http://localhost:8765/api/projects/1/domains \
  -H "Content-Type: application/json" \
  -d '{"domain":"stackoverflow.com"}'
```

### Run Daemon
```bash
# In a new terminal, start the daemon
npm start

# Watch the logs
# You should see lines like:
# "Running browser history tracker..."
# "Found X history entries"
# "Aggregated into Y sessions"
```

### Test Auto-Assignment
```bash
# 1. Open your browser and visit github.com and stackoverflow.com
#    Spend at least 1 minute on each site

# 2. Wait 5-6 minutes for daemon to process history

# 3. Check database for new sessions with project_id
sqlite3 data/activity.db "
  SELECT
    domain,
    project_id,
    duration_seconds,
    datetime(start_time/1000, 'unixepoch', 'localtime') as start_time
  FROM activity_sessions
  WHERE domain IN ('github.com', 'stackoverflow.com')
  ORDER BY start_time DESC
  LIMIT 10;
"

# Expected: Sessions for github.com and stackoverflow.com should have project_id=1
```

### Test Unmatched Domains
```bash
# Visit a site NOT mapped to any project (e.g., youtube.com)
# Wait 5-6 minutes for daemon processing

# Check database
sqlite3 data/activity.db "
  SELECT
    domain,
    project_id,
    duration_seconds
  FROM activity_sessions
  WHERE domain LIKE '%youtube%'
  ORDER BY start_time DESC
  LIMIT 5;
"

# Expected: project_id should be NULL for unmapped domains
```

**Success Criteria:**
- ✓ Daemon runs without errors
- ✓ New browser sessions are created
- ✓ Matched domains (github.com, stackoverflow.com) have project_id=1
- ✓ Unmatched domains have project_id=NULL
- ✓ Daemon logs show "[Project X]" for matched sessions

---

## Test 5: Database Persistence

**Goal:** Verify data persists across server restarts

```bash
# 1. Stop the server (Ctrl+C)

# 2. Restart the server
npm run server

# 3. Verify projects still exist
curl http://localhost:8765/api/projects

# Expected: Returns same projects as before

# 4. Verify domain mappings persist
curl http://localhost:8765/api/projects/1/domains

# Expected: Returns same domain mappings

# 5. Check database directly
sqlite3 data/activity.db "SELECT * FROM projects;"
sqlite3 data/activity.db "SELECT * FROM project_domains;"

# Expected: Data is still there
```

**Success Criteria:**
- ✓ Projects persist across restarts
- ✓ Domain mappings persist across restarts
- ✓ Sessions persist with project_id intact

---

## Test 6: Manual Session Assignment

**Goal:** Verify we can manually assign/reassign sessions to projects

```bash
# 1. Find a session ID without a project
sqlite3 data/activity.db "
  SELECT id, domain, project_id
  FROM activity_sessions
  WHERE project_id IS NULL
  LIMIT 1;
"

# 2. Manually assign it to project 1 (use the id from above)
curl -X POST http://localhost:8765/api/sessions/SESSION_ID/assign-project \
  -H "Content-Type: application/json" \
  -d '{"project_id":1}'

# Expected: {"success":true,"message":"Session assigned to project"}

# 3. Verify assignment
sqlite3 data/activity.db "SELECT id, domain, project_id FROM activity_sessions WHERE id=SESSION_ID;"

# Expected: project_id should now be 1

# 4. Unassign (set to null)
curl -X POST http://localhost:8765/api/sessions/SESSION_ID/assign-project \
  -H "Content-Type: application/json" \
  -d '{"project_id":null}'

# Expected: {"success":true,"message":"Session assigned to project"}

# 5. Verify null assignment
sqlite3 data/activity.db "SELECT id, domain, project_id FROM activity_sessions WHERE id=SESSION_ID;"

# Expected: project_id should be NULL
```

**Success Criteria:**
- ✓ Can manually assign sessions to projects
- ✓ Can reassign sessions to different projects
- ✓ Can unassign sessions (set to null)

---

## Summary Checklist

Before committing, verify all these work:

- [ ] Test 1: Migration System ✓
- [ ] Test 2: Projects CRUD API ✓
- [ ] Test 3: Domain Mappings API ✓
- [ ] Test 4: Daemon Auto-Assignment ✓
- [ ] Test 5: Database Persistence ✓
- [ ] Test 6: Manual Session Assignment ✓

If all tests pass, Phase 1 foundation is solid and ready to commit!

---

## Quick Test Script

For convenience, here's a script to run basic tests:

```bash
#!/bin/bash
# Save as test-phase1.sh

echo "=== Phase 1 Quick Tests ==="

echo -e "\n1. Starting server..."
npm run server &
SERVER_PID=$!
sleep 3

echo -e "\n2. Creating test projects..."
curl -s -X POST http://localhost:8765/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"TestWork","color":"#3B82F6"}' | jq .

echo -e "\n3. Listing projects..."
curl -s http://localhost:8765/api/projects | jq .

echo -e "\n4. Adding domain mapping..."
curl -s -X POST http://localhost:8765/api/projects/1/domains \
  -H "Content-Type: application/json" \
  -d '{"domain":"github.com"}' | jq .

echo -e "\n5. Getting domains..."
curl -s http://localhost:8765/api/projects/1/domains | jq .

echo -e "\n6. Stopping server..."
kill $SERVER_PID

echo -e "\n=== Tests Complete ==="
```

Run with: `bash test-phase1.sh`
