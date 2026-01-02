/**
 * Time Tracker Web Server
 * Serves the web UI for viewing time reports
 */

const express = require('express');
const path = require('path');
const db = require('../database/db');
const api = require('./routes/api');
const pages = require('./routes/pages');

const app = express();
const PORT = process.env.PORT || 8765;

/**
 * Initialize server
 */
async function initServer() {
  // Initialize database
  console.log('Initializing database...');
  await db.initDatabase();

  // Middleware
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Routes
  app.use('/api', api);
  app.use('/', pages);

  // 404 handler
  app.use((req, res) => {
    res.status(404).send('<h1>404 Not Found</h1>');
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).send('<h1>500 Internal Server Error</h1>');
  });

  return app;
}

/**
 * Start server
 */
async function start() {
  try {
    await initServer();

    app.listen(PORT, () => {
      console.log('\n═════════════════════════════════════════════');
      console.log('  Time Tracker Web UI');
      console.log('═════════════════════════════════════════════\n');
      console.log(`  ✓ Server running at http://localhost:${PORT}`);
      console.log(`  ✓ Database: data/activity.db\n`);
      console.log('  Pages:');
      console.log(`    - Dashboard:  http://localhost:${PORT}/`);
      console.log(`    - Reports:    http://localhost:${PORT}/reports`);
      console.log(`    - Settings:   http://localhost:${PORT}/settings\n`);
      console.log('  Press Ctrl+C to stop\n');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  db.closeDatabase();
  process.exit(0);
});

// Start if run directly
if (require.main === module) {
  start();
}

module.exports = { app, initServer };
