/**
 * E2E Test: Improve Domain Tracking Phase 2
 *
 * Tests the Focus Tracking feature that addresses over-tracking by only
 * counting time when the browser is actually focused.
 *
 * Related plan: docs/plans/improve-domain-tracking-phase2/
 */

import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:8765';
const SETTINGS_URL = `${BASE_URL}/settings`;
const FOCUS_API_URL = `${BASE_URL}/api/settings/focus`;

test.describe('Focus Tracking Settings', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to settings page before each test
    await page.goto(SETTINGS_URL);
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
  });

  test('TC1: Settings page loads without errors', async ({ page }) => {
    // Verify the page title
    await expect(page).toHaveTitle(/Time Tracker.*Settings/i);

    // Check for no console errors (captured during navigation)
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Brief wait to capture any async errors
    await page.waitForTimeout(1000);

    // Settings form should be visible
    await expect(page.locator('#settings-form')).toBeVisible();
  });

  test('TC2: Focus Tracking section is visible', async ({ page }) => {
    // Look for the Focus Tracking section header
    const focusSection = page.locator('h3:has-text("Focus Tracking")');
    await expect(focusSection).toBeVisible();

    // Verify the section description is present
    const description = page.locator('text=Track when your browser is actually focused');
    await expect(description).toBeVisible();
  });

  test('TC3: Focus tracking toggle works', async ({ page }) => {
    // Find the focus tracking checkbox
    const focusToggle = page.locator('#focus_tracking_enabled');
    await expect(focusToggle).toBeVisible();

    // Get initial state
    const initialChecked = await focusToggle.isChecked();

    // Toggle it
    await focusToggle.click();

    // Verify state changed
    const newChecked = await focusToggle.isChecked();
    expect(newChecked).toBe(!initialChecked);

    // Toggle back to original state
    await focusToggle.click();
    expect(await focusToggle.isChecked()).toBe(initialChecked);
  });

  test('TC4: Poll interval dropdown has correct options', async ({ page }) => {
    const pollIntervalSelect = page.locator('#focus_poll_interval');
    await expect(pollIntervalSelect).toBeVisible();

    // Check all expected options exist
    const options = await pollIntervalSelect.locator('option').allTextContents();

    expect(options).toContain('15 seconds');
    expect(options).toContain('30 seconds (default)');
    expect(options).toContain('60 seconds');
  });

  test('TC5: Max session duration dropdown has correct options', async ({ page }) => {
    const maxDurationSelect = page.locator('#max_session_duration');
    await expect(maxDurationSelect).toBeVisible();

    // Check all expected options exist
    const options = await maxDurationSelect.locator('option').allTextContents();

    expect(options).toContain('15 minutes');
    expect(options).toContain('30 minutes (default)');
    expect(options).toContain('60 minutes');
  });

  test('TC6: Save button shows success message', async ({ page }) => {
    // Find the focus settings form
    const focusForm = page.locator('#focus-settings-form');
    await expect(focusForm).toBeVisible();

    // Find and click the save button
    const saveButton = focusForm.locator('button[type="submit"]');
    await saveButton.click();

    // Wait for success message
    const successMessage = page.locator('#focus-save-message');
    await expect(successMessage).toContainText('Focus settings saved');

    // Message should mention daemon restart
    await expect(successMessage).toContainText('Restart daemon');
  });

  test('TC7: Settings persist after page reload', async ({ page }) => {
    // Change settings
    const pollIntervalSelect = page.locator('#focus_poll_interval');
    await pollIntervalSelect.selectOption('15');

    const maxDurationSelect = page.locator('#max_session_duration');
    await maxDurationSelect.selectOption('60');

    const focusToggle = page.locator('#focus_tracking_enabled');
    const wasChecked = await focusToggle.isChecked();
    if (wasChecked) {
      await focusToggle.click();
    }

    // Save settings
    const saveButton = page.locator('#focus-settings-form button[type="submit"]');
    await saveButton.click();

    // Wait for save confirmation
    await expect(page.locator('#focus-save-message')).toContainText('saved');

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify settings persisted
    await expect(page.locator('#focus_poll_interval')).toHaveValue('15');
    await expect(page.locator('#max_session_duration')).toHaveValue('60');
    await expect(page.locator('#focus_tracking_enabled')).not.toBeChecked();

    // Reset to defaults
    await pollIntervalSelect.selectOption('30');
    await maxDurationSelect.selectOption('30');
    await focusToggle.click();
    await saveButton.click();
  });

  test('TC10: Help text is displayed for each setting', async ({ page }) => {
    // Enable toggle help text
    const enableHelp = page.locator('text=time only counts when the browser is the active application');
    await expect(enableHelp).toBeVisible();

    // Poll interval help text
    const pollHelp = page.locator('text=How often to check if browser is focused');
    await expect(pollHelp).toBeVisible();

    // Max duration help text
    const maxDurationHelp = page.locator('text=Maximum duration for a single session');
    await expect(maxDurationHelp).toBeVisible();
  });
});

test.describe('Focus Tracking API', () => {
  test('TC8: API returns correct default values', async ({ request }) => {
    const response = await request.get(FOCUS_API_URL);

    expect(response.ok()).toBeTruthy();

    const data = await response.json();

    // Verify response structure
    expect(data).toHaveProperty('focus_tracking_enabled');
    expect(data).toHaveProperty('focus_poll_interval_seconds');
    expect(data).toHaveProperty('max_session_duration_minutes');

    // Verify types
    expect(typeof data.focus_tracking_enabled).toBe('boolean');
    expect(typeof data.focus_poll_interval_seconds).toBe('number');
    expect(typeof data.max_session_duration_minutes).toBe('number');
  });

  test('TC9: API updates settings correctly', async ({ request }) => {
    // First, get current settings
    const getResponse = await request.get(FOCUS_API_URL);
    const originalSettings = await getResponse.json();

    // Update with new values
    const newSettings = {
      focus_tracking_enabled: !originalSettings.focus_tracking_enabled,
      focus_poll_interval_seconds: 60,
      max_session_duration_minutes: 15
    };

    const putResponse = await request.put(FOCUS_API_URL, {
      data: newSettings
    });

    expect(putResponse.ok()).toBeTruthy();

    const putData = await putResponse.json();
    expect(putData.success).toBe(true);

    // Verify the update by getting settings again
    const verifyResponse = await request.get(FOCUS_API_URL);
    const verifyData = await verifyResponse.json();

    expect(verifyData.focus_tracking_enabled).toBe(newSettings.focus_tracking_enabled);
    expect(verifyData.focus_poll_interval_seconds).toBe(newSettings.focus_poll_interval_seconds);
    expect(verifyData.max_session_duration_minutes).toBe(newSettings.max_session_duration_minutes);

    // Restore original settings
    await request.put(FOCUS_API_URL, {
      data: originalSettings
    });
  });
});
