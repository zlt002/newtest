import test from 'node:test';
import assert from 'node:assert/strict';

import { projectInlineRuntimeActivity } from './projectInlineRuntimeActivity.ts';

test('projectInlineRuntimeActivity maps raw V2 events into ordered feed lines', () => {
  const lines = projectInlineRuntimeActivity([
    {
      eventId: 'evt-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 1,
      type: 'run.started',
      timestamp: '2026-04-20T12:00:00.000Z',
      payload: {},
    },
    {
      eventId: 'evt-2',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 2,
      type: 'sdk.system.init',
      timestamp: '2026-04-20T12:00:01.000Z',
      payload: { cwd: '/workspace/html' },
    },
    {
      eventId: 'evt-3',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 3,
      type: 'run.body.segment_appended',
      timestamp: '2026-04-20T12:00:02.000Z',
      payload: { segment: { kind: 'phase', text: '正在汇总结果' } },
    },
  ]);

  assert.deepEqual(lines.map((line) => line.kind), [
    'run',
    'system',
    'assistant',
  ]);
  assert.equal(lines[1].summary.includes('/workspace/html'), true);
});

test('projectInlineRuntimeActivity surfaces markdown write progress as readable activity', () => {
  const lines = projectInlineRuntimeActivity([
    {
      eventId: 'evt-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 1,
      type: 'tool.call.started',
      timestamp: '2026-04-20T12:00:00.000Z',
      payload: {
        toolName: 'Write',
        input: {
          file_path: '/workspace/docs/PRD-MoneyLens.md',
        },
      },
    },
    {
      eventId: 'evt-2',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 2,
      type: 'tool.call.completed',
      timestamp: '2026-04-20T12:00:03.000Z',
      payload: {
        toolName: 'Write',
        input: {
          file_path: '/workspace/docs/PRD-MoneyLens.md',
        },
      },
    },
  ]);

  assert.deepEqual(lines.map((line) => line.kind), [
    'tool',
    'tool',
  ]);
  assert.match(lines[0].summary, /Markdown/);
  assert.match(lines[0].summary, /写入中/);
  assert.match(lines[1].summary, /Markdown/);
  assert.match(lines[1].summary, /已写入完成/);
});

test('projectInlineRuntimeActivity falls back to readable generic tool summaries when the tool name is missing', () => {
  const lines = projectInlineRuntimeActivity([
    {
      eventId: 'evt-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 1,
      type: 'tool.call.completed',
      timestamp: '2026-04-20T12:00:03.000Z',
      payload: {
        result: 'ok',
      },
    },
  ]);

  assert.equal(lines.length, 1);
  assert.equal(lines[0].summary, '工具调用已完成');
  assert.notEqual(lines[0].summary, 'unknown');
});

test('projectInlineRuntimeActivity prefers outputFile over toolId when toolName is missing', () => {
  const lines = projectInlineRuntimeActivity([
    {
      eventId: 'evt-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 1,
      type: 'tool.call.completed',
      timestamp: '2026-04-20T12:00:03.000Z',
      payload: {
        toolId: 'tool-123',
        outputFile: '/workspace/reports/final-summary.md',
      },
    },
  ]);

  assert.equal(lines.length, 1);
  assert.equal(lines[0].summary, '工具调用已完成 · final-summary.md');
  assert.notEqual(lines[0].summary, 'tool-123');
});

test('projectInlineRuntimeActivity surfaces assistant thinking text from fallback activity events', () => {
  const lines = projectInlineRuntimeActivity([
    {
      eventId: 'evt-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 1,
      type: 'run.activity.appended',
      timestamp: '2026-04-21T03:08:55.190Z',
      payload: {
        activity: {
          kind: 'sdk_fallback',
          sourceType: 'assistant',
          summary: 'assistant',
          raw: {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'thinking',
                  thinking: 'The user wants me to decide on a PRD topic. Let me create a practical PRD.',
                },
              ],
            },
          },
        },
      },
    },
  ]);

  assert.equal(lines.length, 1);
  assert.equal(lines[0].kind, 'assistant');
  assert.match(lines[0].summary, /The user wants me to decide on a PRD topic/);
});
