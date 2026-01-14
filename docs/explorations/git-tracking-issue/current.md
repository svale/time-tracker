# Git Tracking Issue - Exploration

## Status
Round: 1 | Started: 2026-01-14 | Last updated: 2026-01-14 | **RESOLVED**

## Problem Summary
Git activity tracking was not showing up on the dashboard despite the code being in place.

## Root Causes Identified

### Issue 1: Stale Daemon Process
The daemon running as a LaunchAgent was started on **Jan 6, 2026** and was running an **older version** of the code that doesn't include the git tracking feature. The git tracking feature was added on **Jan 10, 2026**.

### Issue 2: Stale Server Process
The web server had been running since **Jan 12** with an in-memory database cache. Even after restarting the daemon, the server's stale database connection caused it to return 0 activities.

### Issue 3: Historical Data Not Captured
When the daemon finally scanned, the `last_scanned` timestamps had been updated, so commits from Jan 10-13 were missed. Required resetting timestamps and re-scanning.

## Resolution Steps Taken

1. **Restarted daemon** via launchctl to load git tracking code
2. **Reset `last_scanned`** timestamps to 5 days ago for all repos
3. **Restarted daemon again** to pick up fresh timestamps
4. **Restarted server** to clear stale database connection
5. **Verified** API returns correct git activity data

## Final State
- 22 git activities now in database
- 17 from NFI (Jan 12-13)
- 5 from time-tracker (Jan 10)
- Dashboard Git Activity tab working
- Project summary shows git commit counts

## Lessons Learned

1. **Daemon must be restarted** after code changes (LaunchAgent doesn't auto-reload)
2. **Server also needs restart** - the reload middleware doesn't fully refresh in-memory SQLite
3. **Historical data requires manual backfill** - scanner only looks at commits since `last_scanned`

## Recommended Improvements

1. Add version tracking to daemon startup logs
2. Consider implementing a "backfill" feature to scan older reflog entries
3. Add a way to force-reload server database without full restart
