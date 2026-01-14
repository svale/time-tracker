# Create Project from Git Repository - Exploration

## Status
Round: 1 | Started: 2026-01-14 | Last updated: 2026-01-14

## Confirmed Requirements

1. **Location**: Git Repositories section already exists in Settings page (below Calendar Subscriptions) - no new page needed

2. **Keep existing UI**: Repo cards should remain as-is with repo name, path, Active checkbox, project dropdown, last scanned date

3. **Add "Create Project" button**: Each repo card that doesn't have a project should show a "Create Project" button alongside the existing dropdown

4. **Modal form behavior**:
   - Clicking "Create Project" opens the existing New Project modal
   - Modal is pre-filled with the repo name as project name
   - Color selector should default to a **random color** (not static #3B82F6)
   - After saving, the new project is automatically linked to the repo

5. **Random color for all new projects**: The color randomization should also apply to the normal "New Project" modal in the Projects page

6. **Keep existing dropdown**: The dropdown to link to existing projects should remain unchanged

## Implementation Summary

### Changes needed:

**Settings page (`settings.html` or equivalent):**
- Add "Create Project" button to repo cards (for repos with no project)
- Add modal HTML (can reuse from projects.html)
- Add JavaScript to:
  - Open modal with pre-filled repo name
  - Generate random color
  - Create project via API
  - Link repo to new project via API

**Projects page (`projects.html`):**
- Change default color from `#3B82F6` to random color generator

### API endpoints (already exist):
- `POST /api/projects` - Create project
- `PUT /api/git-repositories/:id` - Update repo with project_id

## Open Questions
None - requirements are clear.

## Next Steps
This exploration is complete. Ready to create init.md for RPI implementation.
