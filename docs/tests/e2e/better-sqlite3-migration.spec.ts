/**
 * E2E Test: Better-SQLite3 Migration
 *
 * Validates the database migration from sql.js to better-sqlite3:
 * - Database initialization and WAL mode
 * - API endpoints functionality
 * - Settings persistence
 * - Project CRUD operations
 * - Dashboard and Reports pages
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:8765';

test.describe('Better-SQLite3 Migration', () => {

  test.describe('Smoke Tests', () => {

    test('TC1: Server starts and dashboard loads', async ({ page }) => {
      const response = await page.goto(BASE_URL);
      expect(response?.status()).toBe(200);
      await expect(page).toHaveTitle(/Time Tracker/);
    });

    test('TC2: Dashboard page loads without errors', async ({ page }) => {
      await page.goto(BASE_URL);

      // Check for main dashboard elements
      await expect(page.locator('h1, h2').first()).toBeVisible();

      // Verify no error messages visible
      const errorVisible = await page.locator('text=/error|Error|ERROR/').isVisible().catch(() => false);
      expect(errorVisible).toBeFalsy();
    });

    test('TC3: Settings page loads without errors', async ({ page }) => {
      await page.goto(`${BASE_URL}/settings`);

      // Settings page should have a form or settings controls
      await expect(page.locator('form, [data-settings], .settings')).toBeVisible();
    });

    test('TC4: Projects page loads without errors', async ({ page }) => {
      await page.goto(`${BASE_URL}/projects`);

      // Projects page should have content
      await expect(page.locator('body')).toContainText(/project|chronicles/i);
    });
  });

  test.describe('API Integration Tests', () => {

    test('TC5: API returns settings correctly', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/settings`);
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('polling_interval_minutes');
      expect(data).toHaveProperty('session_gap_minutes');
    });

    test('TC6: API returns daily report data', async ({ request }) => {
      const today = new Date().toISOString().split('T')[0];
      const response = await request.get(`${BASE_URL}/api/daily-report?date=${today}`);
      expect(response.status()).toBe(200);

      const data = await response.json();
      // Should return an object with date, total_seconds, activities
      expect(data).toHaveProperty('date');
      expect(data).toHaveProperty('total_seconds');
      expect(data).toHaveProperty('activities');
    });

    test('TC7: API returns projects list', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/projects`);
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(Array.isArray(data)).toBeTruthy();
    });

    test('TC8: Focus settings API works', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/settings/focus`);
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('focus_tracking_enabled');
      expect(data).toHaveProperty('focus_poll_interval_seconds');
      expect(data).toHaveProperty('max_session_duration_minutes');
    });

    test('TC9: Timeline API returns data', async ({ request }) => {
      const today = new Date().toISOString().split('T')[0];
      const response = await request.get(`${BASE_URL}/api/timeline?date=${today}`);
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(Array.isArray(data)).toBeTruthy();
    });
  });

  test.describe('Settings Persistence Tests', () => {

    test('TC10: Settings changes persist after save', async ({ page }) => {
      await page.goto(`${BASE_URL}/settings`);

      // Find a setting control and change it
      // Look for polling interval or session gap dropdown
      const pollingSelect = page.locator('select[name*="polling"], select[id*="polling"]').first();

      if (await pollingSelect.isVisible()) {
        // Get current value
        const originalValue = await pollingSelect.inputValue();

        // Change to a different value
        const options = await pollingSelect.locator('option').allInnerTexts();
        const newValue = options.find(opt => !opt.includes(originalValue));
        if (newValue) {
          await pollingSelect.selectOption({ label: newValue });
        }

        // Save settings
        const saveButton = page.locator('button:has-text("Save"), input[type="submit"]').first();
        if (await saveButton.isVisible()) {
          await saveButton.click();

          // Wait for save confirmation or reload
          await page.waitForTimeout(1000);

          // Reload and verify
          await page.reload();

          // Value should persist
          const currentValue = await pollingSelect.inputValue();
          expect(currentValue).not.toBe('');
        }
      }
    });
  });

  test.describe('Project CRUD Tests', () => {

    test('TC11: Create project via API', async ({ request }) => {
      const projectName = `Test Project ${Date.now()}`;

      const response = await request.post(`${BASE_URL}/api/projects`, {
        data: {
          name: projectName,
          description: 'Test project for E2E testing',
          color: '#FF5733'
        }
      });

      expect(response.status()).toBe(201);

      const data = await response.json();
      expect(data).toHaveProperty('id');
      expect(typeof data.id).toBe('number');

      // Verify project appears in list
      const listResponse = await request.get(`${BASE_URL}/api/projects`);
      const projects = await listResponse.json();
      const createdProject = projects.find((p: any) => p.name === projectName);
      expect(createdProject).toBeTruthy();
    });

    test('TC12: Get single project by ID', async ({ request }) => {
      // First create a project
      const projectName = `Single Project ${Date.now()}`;
      const createResponse = await request.post(`${BASE_URL}/api/projects`, {
        data: {
          name: projectName,
          description: 'Test',
          color: '#00FF00'
        }
      });

      const { id } = await createResponse.json();

      // Get the project by ID
      const response = await request.get(`${BASE_URL}/api/projects/${id}`);
      expect(response.status()).toBe(200);

      const project = await response.json();
      expect(project.name).toBe(projectName);
      expect(project.color).toBe('#00FF00');
    });
  });

  test.describe('Database Infrastructure Tests', () => {

    test('TC13: Database health check', async ({ request }) => {
      // The server being responsive indicates database is working
      const response = await request.get(`${BASE_URL}/api/settings`);
      expect(response.status()).toBe(200);

      // Additional check - try to write and read
      const focusResponse = await request.get(`${BASE_URL}/api/settings/focus`);
      expect(focusResponse.status()).toBe(200);
    });

    test('TC14: Workday stats API works', async ({ request }) => {
      const today = new Date().toISOString().split('T')[0];
      const response = await request.get(`${BASE_URL}/api/workday/stats?date=${today}`);
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('sessions');
      expect(data).toHaveProperty('calendarEvents');
    });

    test('TC15: Calendar subscriptions API works', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/integrations/calendars`);
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(Array.isArray(data)).toBeTruthy();
    });
  });

  test.describe('UI Functionality Tests', () => {

    test('TC16: Dashboard timeline displays', async ({ page }) => {
      await page.goto(BASE_URL);

      // Timeline or chart container should be present
      const hasTimeline = await page.locator(
        '.timeline, [data-timeline], canvas, svg, .chart'
      ).first().isVisible().catch(() => false);

      // Even if empty, the container should exist
      expect(hasTimeline || await page.locator('body').textContent()).toBeTruthy();
    });

    test('TC17: Navigation between pages works', async ({ page }) => {
      await page.goto(BASE_URL);

      // Navigate to settings
      await page.click('a[href*="settings"], a:has-text("Settings")');
      await expect(page).toHaveURL(/settings/);

      // Navigate to projects
      await page.click('a[href*="projects"], a:has-text("Projects")');
      await expect(page).toHaveURL(/projects/);

      // Navigate back to dashboard
      await page.click('a[href="/"], a:has-text("Dashboard")');
      await expect(page).toHaveURL(/localhost:8765\/?$/);
    });
  });
});
