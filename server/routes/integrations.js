/**
 * Calendar Integration Routes
 * Manage iCal calendar subscriptions
 */

const express = require('express');
const router = express.Router();
const db = require('../../database/db');

/**
 * GET /api/integrations/calendars
 * List all calendar subscriptions
 */
router.get('/calendars', (req, res) => {
  try {
    const subscriptions = db.getCalendarSubscriptions();

    // Don't return the actual iCal URL (for security), just metadata
    const sanitized = subscriptions.map(sub => ({
      id: sub.id,
      name: sub.name,
      provider: sub.provider,
      is_active: sub.is_active,
      last_sync: sub.last_sync,
      last_error: sub.last_error,
      has_url: !!sub.ical_url,
      created_at: sub.created_at,
      updated_at: sub.updated_at
    }));

    res.json(sanitized);
  } catch (error) {
    console.error('Error in GET /api/integrations/calendars:', error);
    res.status(500).json({ error: 'Failed to get calendar subscriptions' });
  }
});

/**
 * GET /api/integrations/calendars/:id
 * Get a single calendar subscription
 */
router.get('/calendars/:id', (req, res) => {
  try {
    const { id } = req.params;
    const subscription = db.getCalendarSubscription(parseInt(id, 10));

    if (!subscription) {
      return res.status(404).json({ error: 'Calendar subscription not found' });
    }

    // Don't return the actual iCal URL
    const sanitized = {
      id: subscription.id,
      name: subscription.name,
      provider: subscription.provider,
      is_active: subscription.is_active,
      last_sync: subscription.last_sync,
      last_error: subscription.last_error,
      has_url: !!subscription.ical_url,
      created_at: subscription.created_at,
      updated_at: subscription.updated_at
    };

    res.json(sanitized);
  } catch (error) {
    console.error('Error in GET /api/integrations/calendars/:id:', error);
    res.status(500).json({ error: 'Failed to get calendar subscription' });
  }
});

/**
 * POST /api/integrations/calendars
 * Add a new calendar subscription
 */
router.post('/calendars', (req, res) => {
  try {
    const { name, ical_url, provider } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Calendar name is required' });
    }

    if (!ical_url || ical_url.trim() === '') {
      return res.status(400).json({ error: 'iCal URL is required' });
    }

    // Basic validation - must be HTTPS URL
    if (!ical_url.startsWith('https://') && !ical_url.startsWith('http://')) {
      return res.status(400).json({ error: 'iCal URL must be a valid HTTP(S) URL' });
    }

    // Detect provider from URL if not specified
    let detectedProvider = provider || 'other';
    if (ical_url.includes('google.com/calendar')) {
      detectedProvider = 'google';
    } else if (ical_url.includes('outlook')) {
      detectedProvider = 'outlook';
    } else if (ical_url.includes('icloud.com')) {
      detectedProvider = 'apple';
    }

    const id = db.addCalendarSubscription({
      name: name.trim(),
      ical_url: ical_url.trim(),
      provider: detectedProvider
    });

    const subscription = db.getCalendarSubscription(id);

    // Return sanitized version
    res.status(201).json({
      id: subscription.id,
      name: subscription.name,
      provider: subscription.provider,
      is_active: subscription.is_active,
      message: 'Calendar subscription added successfully'
    });
  } catch (error) {
    console.error('Error in POST /api/integrations/calendars:', error);
    res.status(500).json({ error: 'Failed to add calendar subscription' });
  }
});

/**
 * PUT /api/integrations/calendars/:id
 * Update a calendar subscription
 */
router.put('/calendars/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, ical_url, provider, is_active } = req.body;

    const subscription = db.getCalendarSubscription(parseInt(id, 10));
    if (!subscription) {
      return res.status(404).json({ error: 'Calendar subscription not found' });
    }

    // Validate URL if provided
    if (ical_url !== undefined) {
      if (!ical_url.startsWith('https://') && !ical_url.startsWith('http://')) {
        return res.status(400).json({ error: 'iCal URL must be a valid HTTP(S) URL' });
      }
    }

    db.updateCalendarSubscription(parseInt(id, 10), {
      name,
      ical_url,
      provider,
      is_active
    });

    const updated = db.getCalendarSubscription(parseInt(id, 10));

    res.json({
      id: updated.id,
      name: updated.name,
      provider: updated.provider,
      is_active: updated.is_active,
      message: 'Calendar subscription updated successfully'
    });
  } catch (error) {
    console.error('Error in PUT /api/integrations/calendars/:id:', error);
    res.status(500).json({ error: 'Failed to update calendar subscription' });
  }
});

/**
 * DELETE /api/integrations/calendars/:id
 * Remove a calendar subscription (and all its events)
 */
router.delete('/calendars/:id', (req, res) => {
  try {
    const { id } = req.params;

    const subscription = db.getCalendarSubscription(parseInt(id, 10));
    if (!subscription) {
      return res.status(404).json({ error: 'Calendar subscription not found' });
    }

    db.deleteCalendarSubscription(parseInt(id, 10));

    res.json({
      success: true,
      message: 'Calendar subscription removed successfully'
    });
  } catch (error) {
    console.error('Error in DELETE /api/integrations/calendars/:id:', error);
    res.status(500).json({ error: 'Failed to remove calendar subscription' });
  }
});

/**
 * POST /api/integrations/calendars/:id/sync
 * Manually trigger sync for a specific calendar
 */
router.post('/calendars/:id/sync', async (req, res) => {
  try {
    const { id } = req.params;

    const subscription = db.getCalendarSubscription(parseInt(id, 10));
    if (!subscription) {
      return res.status(404).json({ error: 'Calendar subscription not found' });
    }

    // Trigger sync by requiring the ical-sync module
    const icalSync = require('../../daemon/ical-sync');
    await icalSync.syncAllCalendars();

    res.json({
      success: true,
      message: 'Calendar sync triggered successfully'
    });
  } catch (error) {
    console.error('Error in POST /api/integrations/calendars/:id/sync:', error);
    res.status(500).json({ error: 'Failed to sync calendar' });
  }
});

module.exports = router;
