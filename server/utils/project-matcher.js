/**
 * Project Matcher Utility
 * Automatically matches domains and calendar events to projects
 */

const db = require('../../database/db');

/**
 * Match a domain to a project
 * @param {string} domain - The domain to match (e.g., "github.com")
 * @returns {number|null} - Project ID if match found, null otherwise
 */
function matchDomain(domain) {
  if (!domain) return null;

  try {
    return db.findProjectByDomain(domain);
  } catch (error) {
    console.error('Error matching domain to project:', error.message);
    return null;
  }
}

/**
 * Match a calendar event to a project based on keywords
 * NOTE: Calendar keywords table doesn't exist yet (Phase 2)
 * This is a placeholder for future implementation
 * @param {string} title - Event title
 * @param {string} description - Event description (optional)
 * @returns {number|null} - Project ID if match found, null otherwise
 */
function matchCalendarEvent(title, description = '') {
  // TODO: Implement in Phase 2 when project_calendar_keywords table exists
  return null;
}

/**
 * Match a GitHub repository to a project
 * NOTE: Repository mappings table doesn't exist yet (Phase 3)
 * This is a placeholder for future implementation
 * @param {string} repository - Repository in "owner/repo" format
 * @returns {number|null} - Project ID if match found, null otherwise
 */
function matchRepository(repository) {
  // TODO: Implement in Phase 3 when project_repositories table exists
  return null;
}

module.exports = {
  matchDomain,
  matchCalendarEvent,
  matchRepository
};
