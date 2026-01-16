/**
 * iCal Calendar Sync Daemon
 * Fetches and parses iCal feeds from multiple calendar subscriptions
 */

const ical = require('node-ical');
const db = require('../database/db');
const projectMatcher = require('../server/utils/project-matcher');

/**
 * Sync all active calendar subscriptions
 */
async function syncAllCalendars() {
  try {
    console.log('[Calendar Sync] Starting sync...');

    // Get all calendar subscriptions
    const subscriptions = db.getCalendarSubscriptions();
    const activeSubscriptions = subscriptions.filter(sub => sub.is_active);

    if (activeSubscriptions.length === 0) {
      console.log('[Calendar Sync] No active calendar subscriptions');
      return;
    }

    console.log(`[Calendar Sync] Syncing ${activeSubscriptions.length} calendar(s)...`);

    let totalInserted = 0;
    let totalUpdated = 0;

    // Sync each calendar
    for (const subscription of activeSubscriptions) {
      try {
        console.log(`[Calendar Sync] Syncing: ${subscription.name}`);
        const { inserted, updated } = await syncCalendar(subscription);
        totalInserted += inserted;
        totalUpdated += updated;

        // Update sync status
        db.updateCalendarSubscriptionSync(subscription.id, {
          last_sync: Date.now(),
          last_error: null
        });
      } catch (error) {
        console.error(`[Calendar Sync] Error syncing ${subscription.name}:`, error.message);

        // Update sync status with error
        db.updateCalendarSubscriptionSync(subscription.id, {
          last_sync: Date.now(),
          last_error: error.message
        });
      }
    }

    console.log(`[Calendar Sync] Complete: ${totalInserted} new, ${totalUpdated} updated`);
  } catch (error) {
    console.error('[Calendar Sync] Error during sync:', error.message);
  }
}

/**
 * Sync a single calendar subscription
 */
async function syncCalendar(subscription) {
  const { id, ical_url, provider, last_sync } = subscription;

  // Fetch and parse iCal feed
  const events = await ical.async.fromURL(ical_url);

  let insertedCount = 0;
  let updatedCount = 0;

  // Process each event
  for (const [uid, event] of Object.entries(events)) {
    try {
      // Only process VEVENT type (skip VTIMEZONE, etc.)
      if (event.type !== 'VEVENT') {
        continue;
      }

      // Skip events without start time
      if (!event.start) {
        continue;
      }

      // Parse start and end times
      const startTime = new Date(event.start).getTime();
      const endTime = event.end ? new Date(event.end).getTime() : startTime + (3600 * 1000); // Default to 1 hour

      // Calculate duration
      const durationSeconds = Math.floor((endTime - startTime) / 1000);

      // Skip if duration is negative or zero
      if (durationSeconds <= 0) {
        continue;
      }

      // Check if this is an all-day event
      const isAllDay = event.start.dateOnly || false;

      // Match event to project via keywords
      const matchResult = projectMatcher.matchCalendarEvent(
        event.summary || '',
        event.description || ''
      );

      // Get attendees count
      const attendeesCount = event.attendee ?
        (Array.isArray(event.attendee) ? event.attendee.length : 1) : 0;

      // Prepare event data
      const eventData = {
        external_id: uid,
        provider: provider,
        calendar_id: event.organizer?.val || null,
        title: event.summary || '(No title)',
        description: event.description || null,
        start_time: startTime,
        end_time: endTime,
        duration_seconds: durationSeconds,
        project_id: matchResult?.projectId || null,
        matched_keyword: matchResult?.keyword || null,
        is_all_day: isAllDay,
        location: event.location || null,
        attendees_count: attendeesCount,
        subscription_id: id
      };

      // Insert or update event (without saving)
      db.insertCalendarEventNoSave(eventData);

      // Track if this is new or updated
      if (last_sync && event.lastmodified && new Date(event.lastmodified) > new Date(last_sync)) {
        updatedCount++;
      } else {
        insertedCount++;
      }
    } catch (error) {
      console.error(`[Calendar Sync] Error processing event ${uid}:`, error.message);
    }
  }

  // Single save after all events processed (calendar is in config db)
  db.saveConfigDatabase();

  return { inserted: insertedCount, updated: updatedCount };
}

module.exports = {
  syncAllCalendars
};
