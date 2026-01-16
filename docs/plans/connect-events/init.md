# Connect Calendar Events to Projects

## Goal
Enable calendar events to be automatically and manually assigned to projects using keyword matching.

## Requirements

### Matching Logic
- Keyword-based matching: Events assigned to projects via keywords
- Search scope: Match keywords against event title + description
- Matching strategy: Case-insensitive substring match
- Conflict resolution: First matching keyword wins (creation order)
- Re-processing: Automatically re-match all events when keywords change

### UI/UX
- Keyword management: On Projects page, add "Keywords" section alongside existing "Domains" section
- Manual override: Inline dropdown on dashboard for each calendar event
- Match indicator: Always show which keyword caused the auto-assignment (small label)

## Scope

### Backend
1. Keyword CRUD API endpoints
2. Calendar event matcher utility
3. Event assignment API
4. Re-processing trigger when keywords change

### Frontend
1. Keywords section on Projects page
2. Inline project dropdown on dashboard calendar events
3. Matched keyword indicator

### Database
- Add `matched_keyword` column to `calendar_events` table

## Out of Scope
- Subscription-level default project assignment
- Regex or complex matching patterns
- Multi-project assignment for single event

## Source
Exploration: `docs/explorations/connect-events/current.md`
