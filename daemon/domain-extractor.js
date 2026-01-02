/**
 * Domain Extractor
 * Extracts domains from browser window titles
 */

const BROWSER_BUNDLES = [
  'com.google.Chrome',
  'com.google.Chrome.canary',
  'com.apple.Safari',
  'com.apple.SafariTechnologyPreview',
  'org.mozilla.firefox',
  'org.mozilla.firefoxdeveloperedition',
  'com.microsoft.edgemac',
  'com.microsoft.edgemac.Dev',
  'com.brave.Browser',
  'com.operasoftware.Opera',
  'com.vivaldi.Vivaldi'
];

/**
 * Check if the app is a browser
 */
function isBrowser(bundleId) {
  return BROWSER_BUNDLES.includes(bundleId);
}

/**
 * Extract domain from browser window title
 *
 * Examples:
 *  "GitHub - Dashboard" → "github.com"
 *  "localhost:3000 - My App" → "localhost:3000"
 *  "Google" → "google.com"
 *  "192.168.1.1 - Router" → "192.168.1.1"
 */
function extractDomain(bundleId, windowTitle) {
  if (!isBrowser(bundleId) || !windowTitle) {
    return null;
  }

  // Clean the window title
  const title = windowTitle.toLowerCase().trim();

  // Pattern 1: Look for localhost with port
  const localhostMatch = title.match(/localhost:(\d+)/);
  if (localhostMatch) {
    return `localhost:${localhostMatch[1]}`;
  }

  // Pattern 2: Look for localhost without port
  if (title.includes('localhost')) {
    return 'localhost';
  }

  // Pattern 3: Look for IP addresses (e.g., 192.168.1.1, 10.0.0.1)
  const ipMatch = title.match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/);
  if (ipMatch) {
    return ipMatch[1];
  }

  // Pattern 4: Look for standard domains (e.g., github.com, stackoverflow.com)
  // Match domain pattern: word.word or word.word.word
  const domainMatch = title.match(/\b([a-z0-9-]+\.)+[a-z]{2,}\b/);
  if (domainMatch) {
    return domainMatch[0];
  }

  // Pattern 5: Extract from common browser title formats
  // "Title - Domain" or "Domain - Title"
  const parts = title.split(/\s*[-–—]\s*/);
  for (const part of parts) {
    const cleanPart = part.trim();
    // Check if this part looks like a domain
    if (/\b([a-z0-9-]+\.)+[a-z]{2,}\b/.test(cleanPart)) {
      const match = cleanPart.match(/\b([a-z0-9-]+\.)+[a-z]{2,}\b/);
      if (match) {
        return match[0];
      }
    }
  }

  // Pattern 6: Try to extract from URL-like patterns
  const urlMatch = title.match(/https?:\/\/([^\/\s]+)/);
  if (urlMatch) {
    return urlMatch[1];
  }

  // If no domain found, return null
  return null;
}

/**
 * Get a friendly name for common domains
 */
function getDomainDisplayName(domain) {
  if (!domain) return null;

  const domainMap = {
    'github.com': 'GitHub',
    'stackoverflow.com': 'Stack Overflow',
    'google.com': 'Google',
    'youtube.com': 'YouTube',
    'twitter.com': 'Twitter',
    'linkedin.com': 'LinkedIn',
    'facebook.com': 'Facebook',
    'reddit.com': 'Reddit',
    'medium.com': 'Medium',
    'dev.to': 'DEV Community',
    'vercel.com': 'Vercel',
    'netlify.com': 'Netlify',
    'figma.com': 'Figma'
  };

  return domainMap[domain] || domain;
}

module.exports = {
  isBrowser,
  extractDomain,
  getDomainDisplayName,
  BROWSER_BUNDLES
};
