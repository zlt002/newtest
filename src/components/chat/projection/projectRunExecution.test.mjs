// 验证执行投影会保留事件顺序，并同步最新 run 状态。
import test from 'node:test';
import assert from 'node:assert/strict';

import { projectRunExecution } from './projectRunExecution.ts';

test('projectRunExecution keeps ordered execution events and latest run status', () => {
  const view = projectRunExecution([
    {
      eventId: '1',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 1,
      type: 'run.started',
      timestamp: '2026-04-19T12:00:01.000Z',
      payload: {},
    },
    {
      eventId: '2',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 2,
      type: 'tool.call.started',
      timestamp: '2026-04-19T12:00:02.000Z',
      payload: { toolName: 'Read' },
    },
    {
      eventId: '3',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 3,
      type: 'run.completed',
      timestamp: '2026-04-19T12:00:03.000Z',
      payload: { result: 'done' },
    },
  ]);

  assert.equal(view.status, 'completed');
  assert.equal(view.events.length, 3);
  assert.equal(view.events[1].type, 'tool.call.started');
});

test('projectRunExecution exposes starting and streaming transitions in order', () => {
  const view = projectRunExecution([
    {
      eventId: '1',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 1,
      type: 'run.started',
      timestamp: '2026-04-19T12:00:01.000Z',
      payload: {},
    },
    {
      eventId: '2',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 2,
      type: 'assistant.message.started',
      timestamp: '2026-04-19T12:00:01.500Z',
      payload: {},
    },
    {
      eventId: '3',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 3,
      type: 'assistant.message.delta',
      timestamp: '2026-04-19T12:00:02.000Z',
      payload: { text: 'partial' },
    },
  ]);

  assert.equal(view.status, 'streaming');
  assert.equal(view.assistantText, 'partial');
});

test('projectRunExecution enters starting immediately from optimistic submit events before any transcript sync', () => {
  const view = projectRunExecution([
    {
      eventId: 'optimistic-created',
      runId: 'optimistic-run-1',
      sessionId: 'new-session-123',
      sequence: -1,
      type: 'run.created',
      timestamp: '2026-04-20T12:00:00.000Z',
      payload: {
        userInput: '帮我检查改动',
        optimistic: true,
      },
    },
    {
      eventId: 'optimistic-started',
      runId: 'optimistic-run-1',
      sessionId: 'new-session-123',
      sequence: 0,
      type: 'run.started',
      timestamp: '2026-04-20T12:00:00.001Z',
      payload: {
        optimistic: true,
      },
    },
  ]);

  assert.equal(view.status, 'starting');
  assert.equal(view.assistantText, '');
  assert.equal(view.error, null);
  assert.equal(view.presentationMode, 'active');
});

test('projectRunExecution exposes active vs history presentation mode', () => {
  const active = projectRunExecution([
    {
      eventId: 'evt-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 1,
      type: 'run.started',
      timestamp: '2026-04-20T12:00:00.000Z',
      payload: {},
    },
  ]);

  const history = projectRunExecution([
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
      type: 'run.completed',
      timestamp: '2026-04-20T12:00:05.000Z',
      payload: { result: 'done' },
    },
  ]);

  assert.equal(active.presentationMode, 'active');
  assert.equal(history.presentationMode, 'history');
});

test('projectRunExecution returns to streaming after tool.call.completed', () => {
  const view = projectRunExecution([
    {
      eventId: '1',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 1,
      type: 'tool.call.started',
      timestamp: '2026-04-19T12:00:01.000Z',
      payload: { toolName: 'Read' },
    },
    {
      eventId: '2',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 2,
      type: 'tool.call.completed',
      timestamp: '2026-04-19T12:00:02.000Z',
      payload: { result: 'ok' },
    },
    {
      eventId: '3',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 3,
      type: 'assistant.message.delta',
      timestamp: '2026-04-19T12:00:03.000Z',
      payload: { text: 'after tool' },
    },
  ]);

  assert.equal(view.status, 'streaming');
  assert.equal(view.assistantText, 'after tool');
});

test('projectRunExecution keeps sdk-mapped metadata intact without changing execution state', () => {
  const view = projectRunExecution([
    {
      eventId: '1',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 1,
      type: 'run.started',
      timestamp: '2026-04-19T12:00:01.000Z',
      payload: {},
    },
    {
      eventId: '2',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 2,
      type: 'sdk.system.init',
      timestamp: '2026-04-19T12:00:01.500Z',
      payload: {
        cwd: '/workspace/demo',
        model: 'claude-sonnet',
        sdk: {
          type: 'system',
          subtype: 'init',
          claude_code_version: '1.0.0',
        },
      },
    },
    {
      eventId: '3',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 3,
      type: 'sdk.task.started',
      timestamp: '2026-04-19T12:00:02.000Z',
      payload: {
        taskId: 'task-1',
        sdk: {
          type: 'system',
          subtype: 'task_started',
          task_id: 'task-1',
          description: 'Analyze codebase',
        },
      },
    },
    {
      eventId: '4',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 4,
      type: 'assistant.message.delta',
      timestamp: '2026-04-19T12:00:03.000Z',
      payload: { text: 'partial' },
    },
  ]);

  assert.equal(view.status, 'streaming');
  assert.equal(view.assistantText, 'partial');
  assert.equal(view.events[1].type, 'sdk.system.init');
  assert.equal(view.events[1].payload.sdk.claude_code_version, '1.0.0');
  assert.equal(view.events[2].payload.sdk.task_id, 'task-1');
});

test('projectRunExecution marks tool.call.failed as a terminal failure', () => {
  const view = projectRunExecution([
    {
      eventId: '1',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 1,
      type: 'tool.call.started',
      timestamp: '2026-04-19T12:00:01.000Z',
      payload: { toolName: 'Read' },
    },
    {
      eventId: '2',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 2,
      type: 'tool.call.failed',
      timestamp: '2026-04-19T12:00:02.000Z',
      payload: { subtype: 'tool_error', error: 'no access' },
    },
  ]);

  assert.equal(view.status, 'failed');
  assert.equal(view.error, 'no access');
  assert.equal(view.failureSubtype, 'tool_error');
  assert.equal(view.canStartNewSession, false);
});

test('projectRunExecution lets a run recover after tool.call.failed when later events complete successfully', () => {
  const view = projectRunExecution([
    {
      eventId: '1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 1,
      type: 'run.started',
      timestamp: '2026-04-21T03:37:34.735Z',
      payload: {},
    },
    {
      eventId: '2',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 2,
      type: 'tool.call.started',
      timestamp: '2026-04-21T03:38:03.478Z',
      payload: { toolName: 'Write' },
    },
    {
      eventId: '3',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 3,
      type: 'tool.call.failed',
      timestamp: '2026-04-21T03:38:03.487Z',
      payload: { error: 'File has not been read yet. Read it first before writing to it.' },
    },
    {
      eventId: '4',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 4,
      type: 'tool.call.started',
      timestamp: '2026-04-21T03:38:07.848Z',
      payload: { toolName: 'Read' },
    },
    {
      eventId: '5',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 5,
      type: 'tool.call.completed',
      timestamp: '2026-04-21T03:38:08.503Z',
      payload: { result: 'ok' },
    },
    {
      eventId: '6',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 6,
      type: 'run.body.segment_appended',
      timestamp: '2026-04-21T03:39:54.889Z',
      payload: { segment: { kind: 'phase', text: 'PRD 已写入 `PRD.md`。' } },
    },
    {
      eventId: '7',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 7,
      type: 'run.completed',
      timestamp: '2026-04-21T03:39:54.897Z',
      payload: { result: 'PRD 已写入 `PRD.md`。' },
    },
  ]);

  assert.equal(view.status, 'completed');
  assert.equal(view.error, null);
  assert.equal(view.failureSubtype, null);
  assert.equal(view.assistantText, 'PRD 已写入 `PRD.md`。');
});

test('projectRunExecution surfaces assistant text and failure details from events', () => {
  const view = projectRunExecution([
    {
      eventId: '1',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 1,
      type: 'run.started',
      timestamp: '2026-04-19T12:00:01.000Z',
      payload: {},
    },
    {
      eventId: '2',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 2,
      type: 'assistant.message.delta',
      timestamp: '2026-04-19T12:00:02.000Z',
      payload: { text: 'partial' },
    },
    {
      eventId: '3',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 3,
      type: 'run.failed',
      timestamp: '2026-04-19T12:00:03.000Z',
      payload: { error: 'boom' },
    },
  ]);

  assert.equal(view.assistantText, 'partial');
  assert.equal(view.error, 'boom');
  assert.equal(view.status, 'failed');
});

test('projectRunExecution keeps the active run on realtime events while surfacing degraded persistence from run.status_changed', () => {
  const view = projectRunExecution([
    {
      eventId: '1',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 1,
      type: 'run.started',
      timestamp: '2026-04-19T12:00:01.000Z',
      payload: {},
    },
    {
      eventId: '2',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 2,
      type: 'assistant.message.delta',
      timestamp: '2026-04-19T12:00:02.000Z',
      payload: { text: 'partial' },
    },
    {
      eventId: '3',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 3,
      type: 'run.status_changed',
      timestamp: '2026-04-19T12:00:02.500Z',
      payload: {
        status: 'persistence_degraded',
        detail: 'slow lane persistence failed',
      },
    },
  ]);

  assert.equal(view.status, 'streaming');
  assert.equal(view.assistantText, 'partial');
  assert.match(view.error || '', /persistence/i);
});

test('projectRunExecution keeps persistence_degraded visible after run.completed', () => {
  const view = projectRunExecution([
    {
      eventId: '1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 1,
      type: 'run.started',
      timestamp: '2026-04-19T12:00:01.000Z',
      payload: {},
    },
    {
      eventId: '2',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 2,
      type: 'run.status_changed',
      timestamp: '2026-04-19T12:00:02.000Z',
      payload: {
        status: 'persistence_degraded',
        detail: 'slow lane persistence failed',
      },
    },
    {
      eventId: '3',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 3,
      type: 'run.completed',
      timestamp: '2026-04-19T12:00:03.000Z',
      payload: { result: 'done' },
    },
  ]);

  assert.equal(view.status, 'completed');
  assert.equal(view.assistantText, 'done');
  assert.match(view.error || '', /persistence/i);
});

test('projectRunExecution keeps terminal failure reason when persistence_degraded arrives later', () => {
  const view = projectRunExecution([
    {
      eventId: '1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 1,
      type: 'run.started',
      timestamp: '2026-04-19T12:00:01.000Z',
      payload: {},
    },
    {
      eventId: '2',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 2,
      type: 'run.failed',
      timestamp: '2026-04-19T12:00:02.000Z',
      payload: { error: 'boom' },
    },
    {
      eventId: '3',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 3,
      type: 'run.status_changed',
      timestamp: '2026-04-19T12:00:03.000Z',
      payload: {
        status: 'persistence_degraded',
        detail: 'slow lane persistence failed',
      },
    },
  ]);

  assert.equal(view.status, 'failed');
  assert.match(view.error || '', /boom/);
  assert.match(view.error || '', /persistence/i);
});

test('projectRunExecution maps error_during_execution into a user-facing resume failure message', () => {
  const view = projectRunExecution([
    {
      eventId: '1',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 1,
      type: 'run.started',
      timestamp: '2026-04-19T12:00:01.000Z',
      payload: {},
    },
    {
      eventId: '2',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 2,
      type: 'run.failed',
      timestamp: '2026-04-19T12:00:02.000Z',
      payload: { subtype: 'error_during_execution' },
    },
  ]);

  assert.equal(view.status, 'failed');
  assert.match(view.error, /旧会话/);
  assert.match(view.error, /新建会话/);
  assert.equal(view.failureSubtype, 'error_during_execution');
  assert.equal(view.canStartNewSession, true);
});

test('projectRunExecution treats raw error_during_execution as a resumable failure even without subtype', () => {
  const view = projectRunExecution([
    {
      eventId: '1',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 1,
      type: 'run.started',
      timestamp: '2026-04-19T12:00:01.000Z',
      payload: {},
    },
    {
      eventId: '2',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 2,
      type: 'run.failed',
      timestamp: '2026-04-19T12:00:02.000Z',
      payload: { error: 'error_during_execution' },
    },
  ]);

  assert.equal(view.status, 'failed');
  assert.equal(view.error, '该旧会话已无法继续，建议新建会话后重试。');
  assert.equal(view.failureSubtype, 'error_during_execution');
  assert.equal(view.canStartNewSession, true);
});

test('projectRunExecution prefers the resume failure message even when the raw error matches', () => {
  const view = projectRunExecution([
    {
      eventId: '1',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 1,
      type: 'run.started',
      timestamp: '2026-04-19T12:00:01.000Z',
      payload: {},
    },
    {
      eventId: '2',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 2,
      type: 'run.failed',
      timestamp: '2026-04-19T12:00:02.000Z',
      payload: { subtype: 'error_during_execution', error: 'error_during_execution' },
    },
  ]);

  assert.equal(view.status, 'failed');
  assert.equal(view.error, '该旧会话已无法继续，建议新建会话后重试。');
});

test('projectRunExecution reflects aborted runs without disturbing assistant text', () => {
  const view = projectRunExecution([
    {
      eventId: '1',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 1,
      type: 'assistant.message.delta',
      timestamp: '2026-04-19T12:00:01.000Z',
      payload: { text: 'partial' },
    },
    {
      eventId: '2',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 2,
      type: 'run.aborted',
      timestamp: '2026-04-19T12:00:02.000Z',
      payload: {},
    },
  ]);

  assert.equal(view.status, 'aborted');
  assert.equal(view.assistantText, 'partial');
  assert.equal(view.error, null);
});

test('projectRunExecution treats terminal states as absorbing', () => {
  const view = projectRunExecution([
    {
      eventId: '1',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 1,
      type: 'run.completed',
      timestamp: '2026-04-19T12:00:01.000Z',
      payload: { result: 'done' },
    },
    {
      eventId: '2',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 2,
      type: 'assistant.message.delta',
      timestamp: '2026-04-19T12:00:02.000Z',
      payload: { text: 'should be ignored' },
    },
    {
      eventId: '3',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 3,
      type: 'run.failed',
      timestamp: '2026-04-19T12:00:03.000Z',
      payload: { error: 'late failure' },
    },
  ]);

  assert.equal(view.status, 'completed');
  assert.equal(view.assistantText, 'done');
  assert.equal(view.error, null);
});
