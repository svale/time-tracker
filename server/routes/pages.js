/**
 * HTML Page Routes
 */

const express = require('express');

const router = express.Router();

/**
 * Dashboard page
 */
router.get('/', (req, res) => {
  try {
    res.render('dashboard', { activePage: 'dashboard' });
  } catch (error) {
    console.error('Error rendering dashboard:', error);
    res.status(500).send('<h1>Error loading dashboard</h1>');
  }
});

/**
 * Reports page
 */
router.get('/reports', (req, res) => {
  try {
    res.render('reports', { activePage: 'reports' });
  } catch (error) {
    console.error('Error rendering reports:', error);
    res.status(500).send('<h1>Error loading reports</h1>');
  }
});

/**
 * Projects page
 */
router.get('/projects', (req, res) => {
  try {
    res.render('projects', { activePage: 'projects' });
  } catch (error) {
    console.error('Error rendering projects:', error);
    res.status(500).send('<h1>Error loading projects</h1>');
  }
});

/**
 * Settings page
 */
router.get('/settings', (req, res) => {
  try {
    res.render('settings', { activePage: 'settings' });
  } catch (error) {
    console.error('Error rendering settings:', error);
    res.status(500).send('<h1>Error loading settings</h1>');
  }
});

module.exports = router;
