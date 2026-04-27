import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';

test('initializeDatabase removes legacy agent tables and keeps only thin local metadata tables', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccui-agent-db-'));
  const dbPath = path.join(tempDir, 'auth.db');
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME,
      is_active BOOLEAN DEFAULT 1
    );

    CREATE TABLE agent_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE agent_runs (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      user_input TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE agent_run_events (
      event_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );
  `);

  db.close();

  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { initializeDatabase } from ${JSON.stringify(pathToFileURL(path.join(process.cwd(), 'server/database/db.js')).href)}; await initializeDatabase();`,
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_PATH: dbPath,
      },
      stdio: 'pipe',
    },
  );

  const migratedDb = new Database(dbPath, { readonly: true });
  const tables = migratedDb.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
  `).all().map((row) => row.name);

  assert.equal(tables.includes('agent_sessions'), false);
  assert.equal(tables.includes('agent_runs'), false);
  assert.equal(tables.includes('agent_run_events'), false);
  assert.equal(tables.includes('session_names'), true);
  assert.equal(tables.includes('sdk_debug_log'), true);

  migratedDb.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
