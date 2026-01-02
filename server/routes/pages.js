/**
 * HTML Page Routes
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();

/**
 * Read HTML template
 */
function readTemplate(templateName) {
  const templatePath = path.join(__dirname, '..', 'views', templateName);
  return fs.readFileSync(templatePath, 'utf8');
}

/**
 * Dashboard page
 */
router.get('/', (req, res) => {
  try {
    const html = readTemplate('dashboard.html');
    res.send(html);
  } catch (error) {
    res.status(500).send('<h1>Error loading dashboard</h1>');
  }
});

/**
 * Reports page
 */
router.get('/reports', (req, res) => {
  try {
    const html = readTemplate('reports.html');
    res.send(html);
  } catch (error) {
    res.status(500).send('<h1>Error loading reports</h1>');
  }
});

/**
 * Settings page
 */
router.get('/settings', (req, res) => {
  try {
    const html = readTemplate('settings.html');
    res.send(html);
  } catch (error) {
    res.status(500).send('<h1>Error loading settings</h1>');
  }
});

module.exports = router;
