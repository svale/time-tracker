/**
 * API Routes
 * JSON endpoints for time reports and data
 */

const express = require('express');
const db = require('../../database/db');
const { format } = require('date-fns');

const router = express.Router();

/**
 * Middleware: Reload database before each API request
 * This ensures we always have the latest data from disk (daemon updates)
 */
router.use(async (req, res, next) => {
  try {
    await db.reloadDatabase();
    next();
  } catch (error) {
    console.error('Error reloading database:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * Helper: Format seconds to human-readable time
 */
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * Helper: Get today's date string
 */
function getTodayString() {
  return format(new Date(), 'yyyy-MM-dd');
}

/**
 * Helper: Round timestamp down to nearest 30-minute mark
 */
function roundDownTo30Min(timestamp) {
  const date = new Date(timestamp);
  const minutes = date.getMinutes();
  date.setMinutes(minutes < 30 ? 0 : 30, 0, 0);
  return date.getTime();
}

/**
 * Helper: Round timestamp up to nearest 30-minute mark
 */
function roundUpTo30Min(timestamp) {
  const date = new Date(timestamp);
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  const ms = date.getMilliseconds();

  // If already on 30-min boundary, don't round up
  if ((minutes === 0 || minutes === 30) && seconds === 0 && ms === 0) {
    return timestamp;
  }

  date.setMinutes(minutes < 30 ? 30 : 60, 0, 0);
  return date.getTime();
}

/**
 * Helper: Format timestamp as "HH:mm"
 */
function formatSlotTime(timestamp) {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Helper: Format timestamp as "h:mm a" (e.g., "9:30 AM")
 */
function formatTime(timestamp) {
  const date = new Date(timestamp);
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 should be 12
  return `${hours}:${minutes} ${ampm}`;
}

/**
 * Helper: Get activities overlapping a time slot, with proportional fill
 */
function getActivitiesInSlot(activities, slotStart, slotEnd) {
  const slotDuration = slotEnd - slotStart;
  const result = [];

  activities.forEach(activity => {
    const actStart = activity.start;
    const actEnd = activity.end;

    // Check for overlap
    if (actEnd <= slotStart || actStart >= slotEnd) {
      return; // No overlap
    }

    // Calculate overlap
    const overlapStart = Math.max(actStart, slotStart);
    const overlapEnd = Math.min(actEnd, slotEnd);
    const overlapMs = overlapEnd - overlapStart;
    const fillPercent = Math.round((overlapMs / slotDuration) * 100);

    if (fillPercent > 0) {
      result.push({
        type: activity.type,
        project_id: activity.project_id,
        project_name: activity.project_name,
        project_color: activity.project_color,
        fill_percent: fillPercent
      });
    }
  });

  return result;
}

/**
 * GET /api/workday-stats
 * Returns workday statistics including start/end times, totals, and timeline
 */
router.get('/workday-stats', (req, res) => {
  try {
    const date = req.query.date || getTodayString();
    const { sessions, calendarEvents } = db.getWorkdayStats(date);

    // Combine all activities for workday boundary calculation
    const allActivities = [
      ...sessions.map(s => ({
        start: s.start_time,
        end: s.end_time,
        duration: s.duration_seconds,
        project_id: s.project_id,
        project_name: s.project_name,
        project_color: s.project_color,
        type: 'browser'
      })),
      ...calendarEvents.map(e => ({
        start: e.start_time,
        end: e.end_time,
        duration: Math.floor((e.end_time - e.start_time) / 1000),
        project_id: e.project_id,
        project_name: e.project_name,
        project_color: e.project_color,
        type: 'calendar'
      }))
    ].sort((a, b) => a.start - b.start);

    // Calculate workday boundaries (ignore sessions < 5 min at edges)
    const MIN_EDGE_DURATION = 300; // 5 minutes in seconds
    const significantActivities = allActivities.filter(a => a.duration >= MIN_EDGE_DURATION);

    const hasSufficientData = significantActivities.length > 0;
    const workdayStart = hasSufficientData ? Math.min(...significantActivities.map(a => a.start)) : null;
    const workdayEnd = hasSufficientData ? Math.max(...significantActivities.map(a => a.end)) : null;

    // Calculate totals
    const browserSeconds = sessions.reduce((sum, s) => sum + s.duration_seconds, 0);
    const calendarSeconds = calendarEvents.reduce((sum, e) => sum + Math.floor((e.end_time - e.start_time) / 1000), 0);
    const totalSeconds = browserSeconds + calendarSeconds;

    // Generate 30-minute timeline slots
    const slots = [];
    if (hasSufficientData) {
      const slotDuration = 30 * 60 * 1000; // 30 minutes in ms
      let slotStart = roundDownTo30Min(workdayStart);
      const slotEnd = roundUpTo30Min(workdayEnd);

      while (slotStart < slotEnd) {
        const slotEndTime = slotStart + slotDuration;
        const slotActivities = getActivitiesInSlot(allActivities, slotStart, slotEndTime);
        slots.push({
          time: formatSlotTime(slotStart),
          activities: slotActivities
        });
        slotStart = slotEndTime;
      }
    }

    // Project breakdown
    const projectTotals = {};
    allActivities.forEach(a => {
      const key = a.project_id || 'unassigned';
      if (!projectTotals[key]) {
        projectTotals[key] = {
          project_id: a.project_id,
          project_name: a.project_name || 'Unassigned',
          project_color: a.project_color || '#9CA3AF',
          seconds: 0
        };
      }
      projectTotals[key].seconds += a.duration;
    });

    res.json({
      date,
      has_sufficient_data: hasSufficientData,
      workday_start: workdayStart ? new Date(workdayStart).toISOString() : null,
      workday_end: workdayEnd ? new Date(workdayEnd).toISOString() : null,
      workday_start_formatted: workdayStart ? formatTime(workdayStart) : null,
      workday_end_formatted: workdayEnd ? formatTime(workdayEnd) : null,
      total_seconds: totalSeconds,
      total_time: formatDuration(totalSeconds),
      browser_seconds: browserSeconds,
      calendar_seconds: calendarSeconds,
      timeline_slots: slots,
      project_breakdown: Object.values(projectTotals).sort((a, b) => b.seconds - a.seconds)
    });
  } catch (error) {
    console.error('Error in /api/workday-stats:', error);
    res.status(500).json({ error: 'Failed to get workday stats' });
  }
});

/**
 * GET /api/daily-summary
 * Returns today's summary statistics
 */
router.get('/daily-summary', (req, res) => {
  try {
    const date = req.query.date || getTodayString();
    const projectId = req.query.project_id ? parseInt(req.query.project_id, 10) : null;
    const report = db.getDailyReportAll(date, projectId);

    // Calculate totals
    let totalSeconds = 0;
    let totalSessions = 0;

    report.forEach(row => {
      totalSeconds += row.total_seconds || 0;
      totalSessions += row.session_count || 0;
    });

    // Get top 5 apps/domains
    const topActivities = report.slice(0, 5);

    const summary = {
      date,
      total_time: formatDuration(totalSeconds),
      total_seconds: totalSeconds,
      total_sessions: totalSessions,
      top_activities: topActivities.map(row => ({
        app: row.app_name,
        domain: row.domain,
        project_id: row.project_id || null,
        project_name: row.project_name || null,
        project_color: row.project_color || null,
        page_titles: row.page_titles || null,
        time: formatDuration(row.total_seconds || 0),
        seconds: row.total_seconds || 0,
        percentage: totalSeconds > 0 ? Math.round((row.total_seconds / totalSeconds) * 100) : 0
      }))
    };

    res.json(summary);
  } catch (error) {
    console.error('Error in /api/daily-summary:', error);
    res.status(500).json({ error: 'Failed to get daily summary' });
  }
});

/**
 * GET /api/daily-report
 * Returns full daily report
 */
router.get('/daily-report', (req, res) => {
  try {
    const date = req.query.date || getTodayString();
    const projectId = req.query.project_id ? parseInt(req.query.project_id, 10) : null;
    const report = db.getDailyReportAll(date, projectId);

    // Calculate total for percentages
    const totalSeconds = report.reduce((sum, row) => sum + (row.total_seconds || 0), 0);

    const formatted = report.map(row => ({
      app_name: row.app_name,
      app_bundle_id: row.app_bundle_id,
      domain: row.domain,
      project_id: row.project_id || null,
      project_name: row.project_name || null,
      project_color: row.project_color || null,
      page_titles: row.page_titles || null,
      time: formatDuration(row.total_seconds || 0),
      seconds: row.total_seconds || 0,
      session_count: row.session_count || 0,
      percentage: totalSeconds > 0 ? Math.round((row.total_seconds / totalSeconds) * 100) : 0
    }));

    res.json({
      date,
      total_seconds: totalSeconds,
      total_time: formatDuration(totalSeconds),
      activities: formatted
    });
  } catch (error) {
    console.error('Error in /api/daily-report:', error);
    res.status(500).json({ error: 'Failed to get daily report' });
  }
});

/**
 * GET /api/timeline
 * Returns timeline data for charts (hourly breakdown)
 */
router.get('/timeline', (req, res) => {
  try {
    const date = req.query.date || getTodayString();
    const timeline = db.getTimelineData(date);

    // Fill in missing hours with 0
    const hours = Array.from({ length: 24 }, (_, i) => {
      const hour = i.toString().padStart(2, '0') + ':00';
      const data = timeline.find(t => t.hour === hour);
      return {
        hour,
        seconds: data ? (data.total_seconds || 0) : 0,
        minutes: data ? Math.round((data.total_seconds || 0) / 60) : 0
      };
    });

    res.json({
      date,
      timeline: hours
    });
  } catch (error) {
    console.error('Error in /api/timeline:', error);
    res.status(500).json({ error: 'Failed to get timeline' });
  }
});

/**
 * GET /api/recent-events
 * Returns recent activity events (for debugging)
 */
router.get('/recent-events', (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '20', 10);
    const events = db.getRecentEvents(limit);

    res.json({
      count: events.length,
      events
    });
  } catch (error) {
    console.error('Error in /api/recent-events:', error);
    res.status(500).json({ error: 'Failed to get recent events' });
  }
});

/**
 * GET /api/settings
 * Get all settings
 */
router.get('/settings', (req, res) => {
  try {
    const settings = {
      polling_interval_minutes: parseInt(db.getSetting('polling_interval_minutes', '5'), 10),
      session_gap_minutes: parseInt(db.getSetting('session_gap_minutes', '5'), 10),
      excluded_domains: JSON.parse(db.getSetting('excluded_domains', '[]'))
    };

    res.json(settings);
  } catch (error) {
    console.error('Error in /api/settings:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

/**
 * POST /api/settings
 * Update settings
 */
router.post('/settings', (req, res) => {
  try {
    const { polling_interval_minutes, session_gap_minutes, excluded_domains } = req.body;

    if (polling_interval_minutes !== undefined) {
      db.setSetting('polling_interval_minutes', polling_interval_minutes.toString());
    }

    if (session_gap_minutes !== undefined) {
      db.setSetting('session_gap_minutes', session_gap_minutes.toString());
    }

    if (excluded_domains !== undefined) {
      db.setSetting('excluded_domains', JSON.stringify(excluded_domains));
    }

    res.json({ success: true, message: 'Settings updated' });
  } catch (error) {
    console.error('Error in POST /api/settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

/**
 * GET /api/calendar-events
 * Returns calendar events for a specific date
 */
router.get('/calendar-events', (req, res) => {
  try {
    const date = req.query.date || getTodayString();
    const events = db.getCalendarEvents(date);

    const formatted = events.map(event => ({
      id: event.id,
      external_id: event.external_id,
      provider: event.provider,
      title: event.title,
      description: event.description,
      start_time: event.start_time,
      end_time: event.end_time,
      duration_seconds: event.duration_seconds,
      duration: formatDuration(event.duration_seconds || 0),
      project_id: event.project_id || null,
      project_name: event.project_name || null,
      project_color: event.project_color || null,
      is_all_day: event.is_all_day === 1,
      location: event.location,
      attendees_count: event.attendees_count || 0
    }));

    res.json({
      date,
      count: formatted.length,
      events: formatted
    });
  } catch (error) {
    console.error('Error in /api/calendar-events:', error);
    res.status(500).json({ error: 'Failed to get calendar events' });
  }
});

/**
 * PUT /api/calendar-subscriptions/:id/worktime
 * Update calendar subscription include_in_worktime setting
 */
router.put('/calendar-subscriptions/:id/worktime', (req, res) => {
  try {
    const { id } = req.params;
    const { include_in_worktime } = req.body;

    db.updateCalendarSubscriptionWorktime(id, include_in_worktime ? 1 : 0);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating calendar worktime:', error);
    res.status(500).json({ error: 'Failed to update calendar subscription' });
  }
});

/**
 * PUT /api/calendar-events/:id/project
 * Manually assign a calendar event to a project
 */
router.put('/calendar-events/:id/project', (req, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    const { project_id } = req.body;

    if (!eventId) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    // Allow null to unassign
    const projectId = project_id === null ? null : parseInt(project_id, 10);

    db.assignCalendarEventToProject(eventId, projectId);

    res.json({
      success: true,
      message: projectId ? 'Event assigned to project' : 'Event unassigned from project'
    });
  } catch (error) {
    console.error('Error in PUT /api/calendar-events/:id/project:', error);
    res.status(500).json({ error: 'Failed to assign event to project' });
  }
});

/**
 * GET /api/git-repositories
 * Get all tracked git repositories
 */
router.get('/git-repositories', (req, res) => {
  try {
    const repos = db.getGitRepositories();
    res.json(repos);
  } catch (error) {
    console.error('Error in /api/git-repositories:', error);
    res.status(500).json({ error: 'Failed to get git repositories' });
  }
});

/**
 * PUT /api/git-repositories/:id
 * Update git repository (mainly for project assignment)
 */
router.put('/git-repositories/:id', (req, res) => {
  try {
    const repoId = parseInt(req.params.id, 10);
    const { project_id, is_active } = req.body;

    if (!repoId) {
      return res.status(400).json({ error: 'Invalid repository ID' });
    }

    const updates = {};
    if (project_id !== undefined) {
      updates.project_id = project_id === null ? null : parseInt(project_id, 10);
    }
    if (is_active !== undefined) {
      updates.is_active = is_active;
    }

    db.updateGitRepository(repoId, updates);

    res.json({
      success: true,
      message: 'Repository updated'
    });
  } catch (error) {
    console.error('Error in PUT /api/git-repositories/:id:', error);
    res.status(500).json({ error: 'Failed to update repository' });
  }
});

/**
 * DELETE /api/git-repositories/:id
 * Remove a git repository from tracking
 */
router.delete('/git-repositories/:id', (req, res) => {
  try {
    const repoId = parseInt(req.params.id, 10);

    if (!repoId) {
      return res.status(400).json({ error: 'Invalid repository ID' });
    }

    db.deleteGitRepository(repoId);

    res.json({
      success: true,
      message: 'Repository removed from tracking'
    });
  } catch (error) {
    console.error('Error in DELETE /api/git-repositories/:id:', error);
    res.status(500).json({ error: 'Failed to delete repository' });
  }
});

/**
 * GET /api/git-activity
 * Get git activity for a specific date
 */
router.get('/git-activity', (req, res) => {
  try {
    const date = req.query.date || getTodayString();
    const projectId = req.query.project_id ? parseInt(req.query.project_id, 10) : null;

    const startOfDay = new Date(date).setHours(0, 0, 0, 0);
    const endOfDay = new Date(date).setHours(23, 59, 59, 999);

    const activities = db.getGitActivity(startOfDay, endOfDay, projectId);

    // Format activity data
    const formatted = activities.map(activity => ({
      id: activity.id,
      repo_name: activity.repo_name,
      repo_path: activity.repo_path,
      action_type: activity.action_type,
      commit_hash: activity.commit_hash ? activity.commit_hash.substring(0, 7) : null, // Short hash
      commit_message: activity.commit_message,
      branch_name: activity.branch_name,
      author_name: activity.author_name,
      timestamp: activity.timestamp,
      project_id: activity.project_id || null,
      project_name: activity.project_name || null,
      project_color: activity.project_color || null
    }));

    res.json({
      date,
      count: formatted.length,
      activities: formatted
    });
  } catch (error) {
    console.error('Error in /api/git-activity:', error);
    res.status(500).json({ error: 'Failed to get git activity' });
  }
});

/**
 * GET /api/git-activity-summary
 * Get aggregated git activity summary for a date
 */
router.get('/git-activity-summary', (req, res) => {
  try {
    const date = req.query.date || getTodayString();
    const projectId = req.query.project_id ? parseInt(req.query.project_id, 10) : null;

    const summary = db.getGitActivitySummary(date, projectId);

    // Format summary data
    const formatted = summary.map(item => ({
      repo_id: item.repo_id,
      repo_name: item.repo_name,
      repo_path: item.repo_path,
      project_id: item.project_id || null,
      project_name: item.project_name || null,
      project_color: item.project_color || null,
      activity_count: item.activity_count || 0,
      commit_count: item.commit_count || 0,
      merge_count: item.merge_count || 0,
      first_activity: item.first_activity,
      last_activity: item.last_activity
    }));

    res.json({
      date,
      count: formatted.length,
      summary: formatted
    });
  } catch (error) {
    console.error('Error in /api/git-activity-summary:', error);
    res.status(500).json({ error: 'Failed to get git activity summary' });
  }
});

module.exports = router;
