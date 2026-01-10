# Domain-to-Project Mapping - Exploration

## Status
Round: 1 (Complete) | Started: 2026-01-09 | Last updated: 2026-01-09

## Confirmed
<!-- Requirements/decisions we're 100% sure about -->

### 1. URL-to-Domain Cleanup
- When users paste a full URL (e.g., `https://github.com/anthropics/claude/issues/123`), extract and store only the domain (`github.com`)
- **Strict mode**: Preserve subdomains exactly (e.g., `www.github.com` stays as `www.github.com`)
- Handle edge cases: URLs without protocol, invalid input kept as-is

### 2. Retroactive Domain Assignment
- When a new domain mapping is added, **update ALL existing sessions** that match that domain
- This fixes the root cause: users add domain mappings after sessions already exist

### 3. Subdomain Matching
- **Exact matching only**: `github.com` does NOT match `docs.github.com`
- Users can manually add subdomains as separate mappings if needed

### 4. Duplicate Domain Handling
- Keep current behavior: **Error message** when trying to add a domain already mapped to another project
- One domain = one project only

### 5. Timeline Display
- Timeline already supports project colors via `slot.activities[].project_color`
- No additional timeline work needed - just ensure sessions have `project_id` set

## Open Questions
<!-- Still being explored -->
None - requirements are complete.

## Context
<!-- Background, constraints, goals -->

### Original Request
> Better mapping of domains to projects. Currently it seems it does not work. When we add a domain to the system and map domains to this project, this should be visible in the timeline as assigned slots. Also allow the user to paste full URLs in the domain mapping input and clean it up so that it is stored as a domain.

### Root Cause Analysis
The system works correctly for new sessions. The issue is that:
1. Domain matching only happens when sessions are CREATED
2. Users often add domain mappings AFTER sessions already exist
3. Existing sessions don't get retroactively updated

### Files to Modify
1. `server/routes/projects.js` - POST `/api/projects/:id/domains` endpoint
   - Add URL parsing to extract domain
   - Add retroactive session update logic
2. `database/db.js` - Add function to update sessions by domain

## Key Research
<!-- Summary of CURRENTLY RELEVANT findings -->

### URL Parsing in JavaScript
```javascript
function extractDomain(input) {
  try {
    // Try adding protocol if missing
    let url = input;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase();
  } catch {
    // Not a valid URL, return as-is (trimmed, lowercase)
    return input.trim().toLowerCase();
  }
}
```

### Retroactive Update SQL
```sql
UPDATE activity_sessions
SET project_id = ?
WHERE domain = ? AND project_id IS NULL
```

## Implementation Summary

### Changes Required

1. **URL Parsing** (projects.js:147-166)
   - Before storing domain, parse input to extract hostname
   - Use `new URL()` with fallback for invalid URLs

2. **Retroactive Update** (projects.js + db.js)
   - After inserting domain mapping, run UPDATE query
   - Update all sessions where `domain = ?` and `project_id IS NULL`
   - Return count of updated sessions in API response

3. **No timeline changes needed**
   - Timeline already works when sessions have project_id

### Estimated Scope
- ~20 lines of code changes
- 1 new DB function
- No schema changes
- No frontend changes

## Next Steps
<!-- What happens when user resumes -->
The exploration is complete. Ready to create an init.md for RPI implementation, or proceed directly with implementation.
