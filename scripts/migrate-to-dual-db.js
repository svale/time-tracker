#!/usr/bin/env node

/**
 * Migration Script: Single DB to Dual DB Architecture
 *
 * This script migrates data from the old single activity.db to the new
 * dual database architecture (activity.db + config.db).
 *
 * It extracts config-related tables from activity.db and moves them to config.db:
 * - projects
 * - project_domains
 * - project_calendar_keywords
 * - calendar_subscriptions
 * - calendar_events
 * - settings
 *
 * Usage: node scripts/migrate-to-dual-db.js
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ACTIVITY_DB_PATH = path.join(DATA_DIR, 'activity.db');
const CONFIG_DB_PATH = path.join(DATA_DIR, 'config.db');
const CONFIG_SCHEMA_PATH = path.join(__dirname, '..', 'database', 'config-schema.sql');

async function migrate() {
  console.log('═════════════════════════════════════════════');
  console.log('  Database Migration: Single DB → Dual DB');
  console.log('═════════════════════════════════════════════\n');

  // Check if activity.db exists
  if (!fs.existsSync(ACTIVITY_DB_PATH)) {
    console.log('✗ No activity.db found. Nothing to migrate.');
    process.exit(0);
  }

  // Check if config.db already exists
  if (fs.existsSync(CONFIG_DB_PATH)) {
    console.log('⚠ config.db already exists.');
    console.log('  To re-run migration, delete config.db first.');
    console.log('  Skipping migration.\n');
    process.exit(0);
  }

  const SQL = await initSqlJs();

  // Load old activity database
  console.log('Loading activity.db...');
  const activityBuffer = fs.readFileSync(ACTIVITY_DB_PATH);
  const activityDb = new SQL.Database(activityBuffer);
  console.log('✓ Loaded activity.db\n');

  // Check if old database has the tables we need to migrate
  const tables = [];
  const tableStmt = activityDb.prepare("SELECT name FROM sqlite_master WHERE type='table'");
  while (tableStmt.step()) {
    tables.push(tableStmt.getAsObject().name);
  }
  tableStmt.free();

  console.log('Tables in activity.db:', tables.join(', '));

  // Create new config database
  console.log('\nCreating config.db...');
  const configDb = new SQL.Database();
  const configSchema = fs.readFileSync(CONFIG_SCHEMA_PATH, 'utf8');
  configDb.run(configSchema);
  console.log('✓ Created config.db with schema\n');

  // Migration counters
  const counts = {
    settings: 0,
    projects: 0,
    project_domains: 0,
    project_calendar_keywords: 0,
    calendar_subscriptions: 0,
    calendar_events: 0
  };

  // Migrate settings
  if (tables.includes('settings')) {
    console.log('Migrating settings...');
    try {
      const stmt = activityDb.prepare('SELECT * FROM settings');
      while (stmt.step()) {
        const row = stmt.getAsObject();
        const insertStmt = configDb.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
        insertStmt.run([row.key, row.value, row.updated_at || Date.now()]);
        insertStmt.free();
        counts.settings++;
      }
      stmt.free();
      console.log(`  ✓ Migrated ${counts.settings} settings`);
    } catch (error) {
      console.log(`  ⚠ Settings migration skipped: ${error.message}`);
    }
  }

  // Migrate projects
  if (tables.includes('projects')) {
    console.log('Migrating projects...');
    try {
      const stmt = activityDb.prepare('SELECT * FROM projects');
      while (stmt.step()) {
        const row = stmt.getAsObject();
        const insertStmt = configDb.prepare(`
          INSERT INTO projects (id, name, description, color, is_archived, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        insertStmt.run([row.id, row.name, row.description, row.color, row.is_archived, row.created_at, row.updated_at]);
        insertStmt.free();
        counts.projects++;
      }
      stmt.free();
      console.log(`  ✓ Migrated ${counts.projects} projects`);
    } catch (error) {
      console.log(`  ⚠ Projects migration skipped: ${error.message}`);
    }
  }

  // Migrate project_domains
  if (tables.includes('project_domains')) {
    console.log('Migrating project_domains...');
    try {
      const stmt = activityDb.prepare('SELECT * FROM project_domains');
      while (stmt.step()) {
        const row = stmt.getAsObject();
        const insertStmt = configDb.prepare(`
          INSERT INTO project_domains (id, project_id, domain)
          VALUES (?, ?, ?)
        `);
        insertStmt.run([row.id, row.project_id, row.domain]);
        insertStmt.free();
        counts.project_domains++;
      }
      stmt.free();
      console.log(`  ✓ Migrated ${counts.project_domains} project_domains`);
    } catch (error) {
      console.log(`  ⚠ Project domains migration skipped: ${error.message}`);
    }
  }

  // Migrate project_calendar_keywords
  if (tables.includes('project_calendar_keywords')) {
    console.log('Migrating project_calendar_keywords...');
    try {
      const stmt = activityDb.prepare('SELECT * FROM project_calendar_keywords');
      while (stmt.step()) {
        const row = stmt.getAsObject();
        const insertStmt = configDb.prepare(`
          INSERT INTO project_calendar_keywords (id, project_id, keyword, created_at)
          VALUES (?, ?, ?, ?)
        `);
        insertStmt.run([row.id, row.project_id, row.keyword, row.created_at || Date.now()]);
        insertStmt.free();
        counts.project_calendar_keywords++;
      }
      stmt.free();
      console.log(`  ✓ Migrated ${counts.project_calendar_keywords} project_calendar_keywords`);
    } catch (error) {
      console.log(`  ⚠ Project keywords migration skipped: ${error.message}`);
    }
  }

  // Migrate calendar_subscriptions
  if (tables.includes('calendar_subscriptions')) {
    console.log('Migrating calendar_subscriptions...');
    try {
      const stmt = activityDb.prepare('SELECT * FROM calendar_subscriptions');
      while (stmt.step()) {
        const row = stmt.getAsObject();
        const insertStmt = configDb.prepare(`
          INSERT INTO calendar_subscriptions (id, name, ical_url, provider, is_active, include_in_worktime, last_sync, last_error, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        insertStmt.run([
          row.id, row.name, row.ical_url, row.provider,
          row.is_active, row.include_in_worktime,
          row.last_sync, row.last_error,
          row.created_at, row.updated_at
        ]);
        insertStmt.free();
        counts.calendar_subscriptions++;
      }
      stmt.free();
      console.log(`  ✓ Migrated ${counts.calendar_subscriptions} calendar_subscriptions`);
    } catch (error) {
      console.log(`  ⚠ Calendar subscriptions migration skipped: ${error.message}`);
    }
  }

  // Migrate calendar_events
  if (tables.includes('calendar_events')) {
    console.log('Migrating calendar_events...');
    try {
      const stmt = activityDb.prepare('SELECT * FROM calendar_events');
      while (stmt.step()) {
        const row = stmt.getAsObject();
        const insertStmt = configDb.prepare(`
          INSERT INTO calendar_events (id, external_id, provider, calendar_id, subscription_id, title, description, start_time, end_time, duration_seconds, project_id, is_all_day, location, attendees_count, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        insertStmt.run([
          row.id, row.external_id, row.provider, row.calendar_id, row.subscription_id,
          row.title, row.description, row.start_time, row.end_time, row.duration_seconds,
          row.project_id, row.is_all_day, row.location, row.attendees_count,
          row.created_at, row.updated_at
        ]);
        insertStmt.free();
        counts.calendar_events++;
      }
      stmt.free();
      console.log(`  ✓ Migrated ${counts.calendar_events} calendar_events`);
    } catch (error) {
      console.log(`  ⚠ Calendar events migration skipped: ${error.message}`);
    }
  }

  // Save config database
  console.log('\nSaving config.db...');
  const configData = configDb.export();
  const configBuffer = Buffer.from(configData);
  fs.writeFileSync(CONFIG_DB_PATH, configBuffer);
  console.log('✓ Saved config.db\n');

  // Close databases
  activityDb.close();
  configDb.close();

  // Summary
  console.log('═════════════════════════════════════════════');
  console.log('  Migration Complete!');
  console.log('═════════════════════════════════════════════\n');
  console.log('Summary:');
  console.log(`  Settings:              ${counts.settings}`);
  console.log(`  Projects:              ${counts.projects}`);
  console.log(`  Project Domains:       ${counts.project_domains}`);
  console.log(`  Project Keywords:      ${counts.project_calendar_keywords}`);
  console.log(`  Calendar Subscriptions: ${counts.calendar_subscriptions}`);
  console.log(`  Calendar Events:       ${counts.calendar_events}`);
  console.log('');
  console.log('The old activity.db has been preserved.');
  console.log('Config data is now in config.db.');
  console.log('');
}

// Run migration
migrate().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});
