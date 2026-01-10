/**
 * Git Activity Tracker
 * Tracks local git repository activity without requiring network access
 * Scans git reflogs to detect commits, merges, branches, etc.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const db = require('../database/db');

let trackingInterval = null;
let pollingIntervalMinutes = 5;

/**
 * Find git repositories in common locations
 * Returns array of absolute paths to .git directories
 */
function findGitRepositories() {
  const homeDir = os.homedir();
  const searchPaths = [
    path.join(homeDir, 'projects'),
    path.join(homeDir, 'Documents'),
    path.join(homeDir, 'dev'),
    path.join(homeDir, 'Development'),
    path.join(homeDir, 'code'),
    path.join(homeDir, 'workspace'),
    homeDir // Also check home directory itself
  ];

  const repos = [];
  const maxDepth = 3; // Don't recurse too deep

  function searchDirectory(dir, currentDepth = 0) {
    if (currentDepth > maxDepth) return;

    try {
      // Check if directory exists and is accessible
      if (!fs.existsSync(dir)) return;
      const stat = fs.statSync(dir);
      if (!stat.isDirectory()) return;

      // Check if this directory is a git repo
      const gitDir = path.join(dir, '.git');
      if (fs.existsSync(gitDir)) {
        const gitStat = fs.statSync(gitDir);
        if (gitStat.isDirectory()) {
          repos.push(dir);
          return; // Don't recurse into git repos
        }
      }

      // Recurse into subdirectories
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          // Skip hidden directories, node_modules, etc.
          if (['node_modules', 'vendor', 'dist', 'build', '.cache'].includes(entry.name)) {
            continue;
          }
          searchDirectory(path.join(dir, entry.name), currentDepth + 1);
        }
      }
    } catch (error) {
      // Ignore permission errors, etc.
    }
  }

  // Search each path
  for (const searchPath of searchPaths) {
    searchDirectory(searchPath);
  }

  return repos;
}

/**
 * Parse a single reflog entry
 * Format: <old-sha> <new-sha> <author> <timestamp> <timezone> <action>
 * Example: abc123 def456 John Doe <john@example.com> 1704902400 -0800 commit: Add feature
 */
function parseReflogEntry(line, repoPath) {
  try {
    const parts = line.split('\t');
    if (parts.length < 2) return null;

    const [refs, message] = parts;
    const refParts = refs.split(' ');

    if (refParts.length < 5) return null;

    const oldSha = refParts[0];
    const newSha = refParts[1];
    const authorPart = refParts.slice(2, -2).join(' '); // Everything between sha and timestamp
    const timestamp = parseInt(refParts[refParts.length - 2], 10) * 1000; // Convert to milliseconds

    // Parse author name and email
    const authorMatch = authorPart.match(/^(.+?)\s*<(.+?)>$/);
    const authorName = authorMatch ? authorMatch[1].trim() : authorPart;
    const authorEmail = authorMatch ? authorMatch[2].trim() : '';

    // Determine action type from message
    let actionType = 'commit';
    let commitMessage = message;

    if (message.includes('merge')) {
      actionType = 'merge';
    } else if (message.includes('rebase')) {
      actionType = 'rebase';
    } else if (message.includes('pull')) {
      actionType = 'pull';
    } else if (message.includes('cherry-pick')) {
      actionType = 'cherry-pick';
    } else if (message.includes('branch:')) {
      actionType = 'branch';
    } else if (message.startsWith('commit:')) {
      commitMessage = message.replace(/^commit:\s*/, '');
    }

    // Get current branch name
    let branchName = null;
    try {
      branchName = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: repoPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();
    } catch (error) {
      // Ignore errors
    }

    return {
      oldSha,
      newSha,
      authorName,
      authorEmail,
      timestamp,
      actionType,
      commitMessage,
      branchName
    };
  } catch (error) {
    return null;
  }
}

/**
 * Read git reflog for a repository
 * Returns array of parsed reflog entries
 */
function readGitReflog(repoPath, sinceTimestamp) {
  try {
    const reflogPath = path.join(repoPath, '.git', 'logs', 'HEAD');

    if (!fs.existsSync(reflogPath)) {
      return [];
    }

    const reflogContent = fs.readFileSync(reflogPath, 'utf8');
    const lines = reflogContent.split('\n').filter(line => line.trim());

    const entries = [];
    for (const line of lines) {
      const entry = parseReflogEntry(line, repoPath);
      if (entry && entry.timestamp >= sinceTimestamp) {
        entries.push(entry);
      }
    }

    return entries;
  } catch (error) {
    console.error(`Error reading reflog for ${repoPath}:`, error.message);
    return [];
  }
}

/**
 * Get repository name from path
 */
function getRepoName(repoPath) {
  return path.basename(repoPath);
}

/**
 * Scan a repository for new activity
 */
function scanRepository(repoPath, repoId, sinceTimestamp) {
  const entries = readGitReflog(repoPath, sinceTimestamp);

  if (entries.length === 0) {
    return 0;
  }

  // Get project_id for this repo
  const repo = db.getGitRepository(repoId);
  const projectId = repo ? repo.project_id : null;

  let savedCount = 0;
  for (const entry of entries) {
    try {
      db.insertGitActivity({
        repo_id: repoId,
        action_type: entry.actionType,
        commit_hash: entry.newSha,
        commit_message: entry.commitMessage,
        branch_name: entry.branchName,
        author_name: entry.authorName,
        author_email: entry.authorEmail,
        timestamp: entry.timestamp,
        project_id: projectId
      });
      savedCount++;
    } catch (error) {
      // Ignore duplicates (might have already tracked this commit)
    }
  }

  return savedCount;
}

/**
 * Process git activity
 */
async function processGitActivity() {
  try {
    const scanEnabled = db.getSetting('git_scan_enabled', 'true') === 'true';
    if (!scanEnabled) {
      return;
    }

    console.log(`[${new Date().toLocaleTimeString()}] Scanning for git activity...`);

    // Get or create tracked repositories
    let repos = db.getGitRepositories();

    // If no repos in database, scan for them
    if (repos.length === 0) {
      console.log('  No tracked repositories found, scanning filesystem...');
      const foundRepos = findGitRepositories();

      if (foundRepos.length === 0) {
        console.log('  No git repositories found');
        return;
      }

      console.log(`  Found ${foundRepos.length} git repositories`);

      // Add repositories to database
      for (const repoPath of foundRepos) {
        const repoName = getRepoName(repoPath);
        try {
          db.createGitRepository({
            repo_path: repoPath,
            repo_name: repoName,
            is_active: true
          });
        } catch (error) {
          // Might already exist
        }
      }

      // Reload repos
      repos = db.getGitRepositories();
    }

    // Scan each active repository
    let totalActivityCount = 0;
    const activeRepos = repos.filter(r => r.is_active);

    for (const repo of activeRepos) {
      // Get activity since last scan (or last 24 hours)
      const sinceTime = repo.last_scanned || (Date.now() - (24 * 60 * 60 * 1000));

      // Verify repo still exists
      if (!fs.existsSync(repo.repo_path)) {
        console.log(`  Repository no longer exists: ${repo.repo_name}`);
        continue;
      }

      const activityCount = scanRepository(repo.repo_path, repo.id, sinceTime);

      if (activityCount > 0) {
        const projectInfo = repo.project_id ? ` [Project ${repo.project_id}]` : '';
        console.log(`  → ${repo.repo_name}: ${activityCount} new activities${projectInfo}`);
        totalActivityCount += activityCount;
      }

      // Update last_scanned timestamp
      db.updateGitRepository(repo.id, {
        last_scanned: Date.now()
      });
    }

    if (totalActivityCount === 0) {
      console.log('  No new git activity');
    } else {
      console.log(`  Saved ${totalActivityCount} git activities to database`);
    }

  } catch (error) {
    console.error('Error processing git activity:', error.message);
  }
}

/**
 * Start tracking git activity
 */
function startTracking(intervalMinutes = null) {
  if (trackingInterval) {
    console.log('Git tracking already started');
    return;
  }

  // Get polling interval from settings or use default
  if (intervalMinutes) {
    pollingIntervalMinutes = intervalMinutes;
  } else {
    pollingIntervalMinutes = parseInt(db.getSetting('git_scan_interval_minutes', '5'), 10);
  }

  console.log(`✓ Starting git activity tracking (scanning every ${pollingIntervalMinutes} minutes)`);

  // Process immediately
  processGitActivity();

  // Then process at interval
  trackingInterval = setInterval(processGitActivity, pollingIntervalMinutes * 60 * 1000);
}

/**
 * Stop tracking
 */
function stopTracking() {
  if (trackingInterval) {
    clearInterval(trackingInterval);
    trackingInterval = null;
    console.log('✓ Git tracking stopped');
  }
}

/**
 * Force a scan now
 */
function scanNow() {
  return processGitActivity();
}

module.exports = {
  startTracking,
  stopTracking,
  scanNow,
  findGitRepositories
};
