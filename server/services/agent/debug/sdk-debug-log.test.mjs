import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { createSdkDebugLog } from './sdk-debug-log.js';

test('sdk debug log appends, lists, trims, and reports availability by session', async () => {
  const db = new Database(':memory:');
  const store = createSdkDebugLog({ db });

  await store.append({
    sessionId: 'sess-1',
    type: 'sdk.message',
    payload: { message: { kind: 'thinking', text: 'one' } },
  });
  await store.append({
    sessionId: 'sess-1',
    type: 'sdk.message',
    payload: { message: { kind: 'thinking', text: 'two' } },
  });
  await store.append({
    sessionId: 'sess-2',
    type: 'session.status',
    payload: { status: 'active' },
  });

  assert.equal(await store.hasSessionLogs('sess-1'), true);
  assert.equal(await store.hasSessionLogs('sess-missing'), false);

  const sessionRows = await store.listBySession('sess-1');
  assert.equal(sessionRows.length, 2);
  assert.equal(sessionRows[0].sessionId, 'sess-1');
  assert.equal(sessionRows[0].type, 'sdk.message');
  assert.deepEqual(sessionRows[1].payload, { message: { kind: 'thinking', text: 'two' } });

  const trimmed = await store.trim({ sessionId: 'sess-1', keepLatest: 1 });
  assert.equal(trimmed, 1);
  const remaining = await store.listBySession('sess-1');
  assert.equal(remaining.length, 1);
  assert.deepEqual(remaining[0].payload, { message: { kind: 'thinking', text: 'two' } });
});
