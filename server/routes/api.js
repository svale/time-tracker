/**
 * API Routes
 * JSON endpoints for time reports and data
 */

const express = require('express');
const db = require('../../database/db');
const { format } = require('date-fns');

const router = express.Router();

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
 * GET /api/daily-summary
 * Returns today's summary statistics
 */
router.get('/daily-summary', (req, res) => {
  try {
    const date = req.query.date || getTodayString();
    const report = db.getDailyReportAll(date);

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
    const report = db.getDailyReportAll(date);

    // Calculate total for percentages
    const totalSeconds = report.reduce((sum, row) => sum + (row.total_seconds || 0), 0);

    const formatted = report.map(row => ({
      app_name: row.app_name,
      app_bundle_id: row.app_bundle_id,
      domain: row.domain,
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

module.exports = router;
