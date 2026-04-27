import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

test('init.sql remains compatible with legacy agent tables before migrations add session_id indexes', () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME,
      is_active BOOLEAN DEFAULT 1
    );

    CREATE TABLE agent_conversations (
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

  const initSqlPath = path.join(process.cwd(), 'server/database/init.sql');
  const initSql = fs.readFileSync(initSqlPath, 'utf8');

  assert.doesNotThrow(() => {
    db.exec(initSql);
  });

  const tables = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
  `).all().map((row) => row.name);

  assert.equal(tables.includes('session_names'), true);
  assert.equal(tables.includes('sdk_debug_log'), true);

  db.close();
});

test('init.sql initializes a thin local schema for fresh databases', () => {
  const db = new Database(':memory:');
  const initSqlPath = path.join(process.cwd(), 'server/database/init.sql');
  const initSql = fs.readFileSync(initSqlPath, 'utf8');
  db.exec(initSql);

  const tables = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
  `).all().map((row) => row.name);

  assert.equal(tables.includes('agent_sessions'), false);
  assert.equal(tables.includes('agent_runs'), false);
  assert.equal(tables.includes('agent_run_events'), false);
  assert.equal(tables.includes('agent_conversations'), false);
  assert.equal(tables.includes('agent_conversation_runtime_binding'), false);
  assert.equal(tables.includes('session_names'), true);
  assert.equal(tables.includes('sdk_debug_log'), true);

  db.close();
});
