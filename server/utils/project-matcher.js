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
 * @param {string} title - Event title
 * @param {string} description - Event description (optional)
 * @returns {{projectId: number, keyword: string}|null} - Project ID and matched keyword if found, null otherwise
 */
function matchCalendarEvent(title, description = '') {
  if (!title) return null;

  try {
    // Get all projects
    const projects = db.getProjects();

    // Combine title and description for matching
    const searchText = `${title} ${description || ''}`.toLowerCase();

    // Check each project's keywords
    for (const project of projects) {
      const keywords = db.getProjectKeywords(project.id);

      for (const keywordRow of keywords) {
        const keyword = keywordRow.keyword.toLowerCase();

        // Check if the keyword appears in title or description
        if (searchText.includes(keyword)) {
          return {
            projectId: project.id,
            keyword: keywordRow.keyword  // Return original casing
          };
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error matching calendar event to project:', error.message);
    return null;
  }
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
