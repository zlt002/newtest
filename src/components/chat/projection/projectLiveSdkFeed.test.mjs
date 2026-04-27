import test from 'node:test';
import assert from 'node:assert/strict';

import { projectLiveSdkFeed } from './projectLiveSdkFeed.ts';

test('projectLiveSdkFeed keeps thinking, tool, and interaction blocks visible', () => {
  const blocks = projectLiveSdkFeed([
    {
      id: 'evt-1',
      type: 'sdk.message',
      sessionId: 'sess-1',
      timestamp: '2026-04-22T10:00:00.000Z',
      message: { kind: 'thinking', text: 'Working...' },
    },
    {
      id: 'evt-2',
      type: 'sdk.message',
      sessionId: 'sess-1',
      timestamp: '2026-04-22T10:00:01.000Z',
      message: { kind: 'tool.call.started', toolName: 'Read', input: { file_path: 'a.js' } },
    },
    {
      id: 'evt-3',
      type: 'interaction.required',
      sessionId: 'sess-1',
      timestamp: '2026-04-22T10:00:02.000Z',
      requestId: 'req-1',
      interaction: { kind: 'permission', toolName: 'Bash' },
    },
  ]);

  assert.deepEqual(blocks.map((block) => block.type), ['thinking', 'tool_use', 'interaction_required']);
});

test('projectLiveSdkFeed treats assistant.message.delta as a visible delta block', () => {
  const blocks = projectLiveSdkFeed([
    {
      id: 'evt-delta-1',
      type: 'sdk.message',
      sessionId: 'sess-1',
      timestamp: '2026-04-22T10:00:00.000Z',
      message: { kind: 'assistant.message.delta', text: '最新输出' },
    },
  ]);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'delta');
  assert.equal(blocks[0].body, '最新输出');
});

test('projectLiveSdkFeed no longer treats legacy stream_delta as a primary delta block', () => {
  const blocks = projectLiveSdkFeed([
    {
      id: 'evt-legacy-delta-1',
      type: 'sdk.message',
      sessionId: 'sess-1',
      timestamp: '2026-04-22T10:00:00.000Z',
      message: { kind: 'stream_delta', text: '旧增量输出' },
    },
  ]);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'notice');
  assert.equal(blocks[0].title, 'stream_delta');
});

test('projectLiveSdkFeed no longer treats legacy tool_use_partial and tool_result as primary tool blocks', () => {
  const blocks = projectLiveSdkFeed([
    {
      id: 'evt-legacy-tool-use',
      type: 'sdk.message',
      sessionId: 'sess-1',
      timestamp: '2026-04-22T10:00:00.000Z',
      message: { kind: 'tool_use_partial', toolName: 'Read', input: { file_path: 'a.js' } },
    },
    {
      id: 'evt-legacy-tool-result',
      type: 'sdk.message',
      sessionId: 'sess-1',
      timestamp: '2026-04-22T10:00:01.000Z',
      message: { kind: 'tool_result', toolName: 'Read', output: 'done' },
    },
  ]);

  assert.deepEqual(blocks.map((block) => block.type), ['notice', 'notice']);
  assert.deepEqual(blocks.map((block) => block.title), ['tool_use_partial', 'tool_result']);
});

test('projectLiveSdkFeed projects session status and debug refs', () => {
  const blocks = projectLiveSdkFeed([
    {
      id: 'evt-4',
      type: 'session.status',
      sessionId: 'sess-1',
      timestamp: '2026-04-22T10:00:03.000Z',
      status: 'completed',
      detail: 'run finished',
    },
    {
      id: 'evt-5',
      type: 'debug.ref',
      sessionId: 'sess-1',
      timestamp: '2026-04-22T10:00:04.000Z',
      ref: { label: 'sdk_debug_log#42' },
    },
  ]);

  assert.deepEqual(blocks.map((block) => block.type), ['session_status', 'debug_ref']);
  assert.match(blocks[1].body, /sdk_debug_log#42/);
});

test('projectLiveSdkFeed projects interaction resolved events as visible blocks', () => {
  const blocks = projectLiveSdkFeed([
    {
      id: 'evt-6',
      type: 'interaction.resolved',
      sessionId: 'sess-1',
      timestamp: '2026-04-22T10:00:05.000Z',
      requestId: 'req-1',
      outcome: 'accepted',
      message: '允许继续执行',
    },
  ]);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'interaction_resolved');
  assert.equal(blocks[0].title, 'Interaction Resolved · accepted');
  assert.match(blocks[0].body, /允许继续执行/);
  assert.equal(blocks[0].tone, 'success');
  assert.equal(blocks[0].requestId, 'req-1');
});
