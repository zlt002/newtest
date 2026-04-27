import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildHookExecutionDetail,
  buildHookExecutionList,
} from './claude-hooks-events.js';

test('buildHookExecutionList folds lifecycle events into unique hook executions', () => {
  const events = [
    createEvent({
      eventId: 'evt-1',
      type: 'sdk.hook.started',
      sequence: 10,
      runId: 'run-1',
      sessionId: 'sess-1',
      hookId: 'hook-1',
      hookName: 'beforeStop',
      hookEvent: 'Stop',
    }),
    createEvent({
      eventId: 'evt-2',
      type: 'sdk.hook.progress',
      sequence: 11,
      runId: 'run-1',
      sessionId: 'sess-1',
      hookId: 'hook-1',
      hookName: 'beforeStop',
      hookEvent: 'Stop',
      stdout: 'line-1\n',
    }),
    createEvent({
      eventId: 'evt-3',
      type: 'sdk.hook.response',
      sequence: 12,
      runId: 'run-1',
      sessionId: 'sess-1',
      hookId: 'hook-1',
      hookName: 'beforeStop',
      hookEvent: 'Stop',
      exitCode: 0,
    }),
    createEvent({
      eventId: 'evt-4',
      type: 'sdk.task.progress',
      sequence: 13,
      runId: 'run-1',
      sessionId: 'sess-1',
      taskId: 'task-1',
    }),
    createEvent({
      eventId: 'evt-5',
      type: 'sdk.hook.started',
      sequence: 14,
      runId: 'run-2',
      sessionId: 'sess-2',
      hookId: 'hook-2',
      hookName: 'beforeTool',
      hookEvent: 'PreToolUse',
    }),
  ];

  assert.deepEqual(buildHookExecutionList(events), [
    {
      hookId: 'hook-1',
      hookName: 'beforeStop',
      hookEvent: 'Stop',
      runId: 'run-1',
      sessionId: 'sess-1',
      status: 'completed',
      outcome: null,
      startedAt: events[0].timestamp,
      updatedAt: events[2].timestamp,
    },
    {
      hookId: 'hook-2',
      hookName: 'beforeTool',
      hookEvent: 'PreToolUse',
      runId: 'run-2',
      sessionId: 'sess-2',
      status: 'started',
      outcome: null,
      startedAt: events[4].timestamp,
      updatedAt: events[4].timestamp,
    },
  ]);
});

test('buildHookExecutionDetail exposes top-level lifecycle fields and merges stdout stderr output exitCode and raw lifecycle events', () => {
  const started = createEvent({
    eventId: 'evt-1',
    type: 'sdk.hook.started',
    sequence: 10,
    runId: 'run-1',
    sessionId: 'sess-1',
    hookId: 'hook-1',
    hookName: 'beforeStop',
    hookEvent: 'Stop',
  });
  const progress = createEvent({
    eventId: 'evt-2',
    type: 'sdk.hook.progress',
    sequence: 11,
    runId: 'run-1',
    sessionId: 'sess-1',
    hookId: 'hook-1',
    hookName: 'beforeStop',
    hookEvent: 'Stop',
    stdout: 'line-1\n',
    stderr: 'warn-1\n',
    output: 'progress-1\n',
  });
  const response = createEvent({
    eventId: 'evt-3',
    type: 'sdk.hook.response',
    sequence: 12,
    runId: 'run-1',
    sessionId: 'sess-1',
    hookId: 'hook-1',
    hookName: 'beforeStop',
    hookEvent: 'Stop',
    stdout: 'line-2\n',
    stderr: 'warn-2\n',
    output: 'done\n',
    exitCode: 17,
    outcome: 'error',
  });

  assert.deepEqual(buildHookExecutionDetail([started, progress, response], 'hook-1'), {
    hookId: 'hook-1',
    hookName: 'beforeStop',
    hookEvent: 'Stop',
    runId: 'run-1',
    sessionId: 'sess-1',
    status: 'completed',
    outcome: 'error',
    startedAt: started.timestamp,
    updatedAt: response.timestamp,
    stdout: 'line-1\nline-2\n',
    stderr: 'warn-1\nwarn-2\n',
    output: 'progress-1\ndone\n',
    exitCode: 17,
    started,
    progress: [progress],
    response,
    raw: {
      started,
      progress: [progress],
      response,
    },
  });
});

test('buildHookExecutionList keeps two executions separate when the same hookId runs twice', () => {
  const firstStarted = createEvent({
    eventId: 'evt-1',
    type: 'sdk.hook.started',
    sequence: 10,
    runId: 'run-1',
    sessionId: 'sess-1',
    hookId: 'hook-1',
    hookName: 'beforeStop',
    hookEvent: 'Stop',
  });
  const firstResponse = createEvent({
    eventId: 'evt-2',
    type: 'sdk.hook.response',
    sequence: 11,
    runId: 'run-1',
    sessionId: 'sess-1',
    hookId: 'hook-1',
    hookName: 'beforeStop',
    hookEvent: 'Stop',
    output: 'first\n',
    exitCode: 0,
  });
  const secondStarted = createEvent({
    eventId: 'evt-3',
    type: 'sdk.hook.started',
    sequence: 12,
    runId: 'run-1',
    sessionId: 'sess-1',
    hookId: 'hook-1',
    hookName: 'beforeStop',
    hookEvent: 'Stop',
  });
  const secondResponse = createEvent({
    eventId: 'evt-4',
    type: 'sdk.hook.response',
    sequence: 13,
    runId: 'run-1',
    sessionId: 'sess-1',
    hookId: 'hook-1',
    hookName: 'beforeStop',
    hookEvent: 'Stop',
    output: 'second\n',
    exitCode: 0,
  });

  assert.deepEqual(buildHookExecutionList([
    firstStarted,
    firstResponse,
    secondStarted,
    secondResponse,
  ]), [
    {
      hookId: 'hook-1',
      hookName: 'beforeStop',
      hookEvent: 'Stop',
      runId: 'run-1',
      sessionId: 'sess-1',
      status: 'completed',
      outcome: null,
      startedAt: firstStarted.timestamp,
      updatedAt: firstResponse.timestamp,
    },
    {
      hookId: 'hook-1',
      hookName: 'beforeStop',
      hookEvent: 'Stop',
      runId: 'run-1',
      sessionId: 'sess-1',
      status: 'completed',
      outcome: null,
      startedAt: secondStarted.timestamp,
      updatedAt: secondResponse.timestamp,
    },
  ]);
});

test('buildHookExecutionList sorts out-of-order lifecycle events before splitting executions', () => {
  const firstStarted = createEvent({
    eventId: 'evt-1',
    type: 'sdk.hook.started',
    sequence: 20,
    runId: 'run-1',
    sessionId: 'sess-1',
    hookId: 'hook-1',
    hookName: 'beforeStop',
    hookEvent: 'Stop',
  });
  const firstResponse = createEvent({
    eventId: 'evt-2',
    type: 'sdk.hook.response',
    sequence: 21,
    runId: 'run-1',
    sessionId: 'sess-1',
    hookId: 'hook-1',
    hookName: 'beforeStop',
    hookEvent: 'Stop',
    output: 'first\n',
    exitCode: 0,
  });
  const secondStarted = createEvent({
    eventId: 'evt-3',
    type: 'sdk.hook.started',
    sequence: 22,
    runId: 'run-1',
    sessionId: 'sess-1',
    hookId: 'hook-1',
    hookName: 'beforeStop',
    hookEvent: 'Stop',
  });
  const secondProgress = createEvent({
    eventId: 'evt-4',
    type: 'sdk.hook.progress',
    sequence: 23,
    runId: 'run-1',
    sessionId: 'sess-1',
    hookId: 'hook-1',
    hookName: 'beforeStop',
    hookEvent: 'Stop',
    stdout: 'second\n',
  });
  const secondResponse = createEvent({
    eventId: 'evt-5',
    type: 'sdk.hook.response',
    sequence: 24,
    runId: 'run-1',
    sessionId: 'sess-1',
    hookId: 'hook-1',
    hookName: 'beforeStop',
    hookEvent: 'Stop',
    output: 'second\n',
    exitCode: 0,
  });

  const executions = buildHookExecutionList([
    secondResponse,
    firstResponse,
    secondStarted,
    firstStarted,
    secondProgress,
  ]);

  assert.deepEqual(executions.map((execution) => ({
    startedAt: execution.startedAt,
    updatedAt: execution.updatedAt,
    status: execution.status,
  })), [
    {
      startedAt: firstStarted.timestamp,
      updatedAt: firstResponse.timestamp,
      status: 'completed',
    },
    {
      startedAt: secondStarted.timestamp,
      updatedAt: secondResponse.timestamp,
      status: 'completed',
    },
  ]);
});

test('buildHookExecutionDetail only includes output from the requested single execution', () => {
  const firstStarted = createEvent({
    eventId: 'evt-1',
    type: 'sdk.hook.started',
    sequence: 30,
    runId: 'run-1',
    sessionId: 'sess-1',
    hookId: 'hook-1',
    hookName: 'beforeStop',
    hookEvent: 'Stop',
  });
  const firstProgress = createEvent({
    eventId: 'evt-2',
    type: 'sdk.hook.progress',
    sequence: 31,
    runId: 'run-1',
    sessionId: 'sess-1',
    hookId: 'hook-1',
    hookName: 'beforeStop',
    hookEvent: 'Stop',
    stdout: 'first-stdout\n',
    stderr: 'first-stderr\n',
    output: 'first-output\n',
  });
  const firstResponse = createEvent({
    eventId: 'evt-3',
    type: 'sdk.hook.response',
    sequence: 32,
    runId: 'run-1',
    sessionId: 'sess-1',
    hookId: 'hook-1',
    hookName: 'beforeStop',
    hookEvent: 'Stop',
    stdout: 'first-response\n',
    output: 'first-done\n',
    exitCode: 0,
  });
  const secondStarted = createEvent({
    eventId: 'evt-4',
    type: 'sdk.hook.started',
    sequence: 33,
    runId: 'run-1',
    sessionId: 'sess-1',
    hookId: 'hook-1',
    hookName: 'beforeTool',
    hookEvent: 'PreToolUse',
  });
  const secondProgress = createEvent({
    eventId: 'evt-5',
    type: 'sdk.hook.progress',
    sequence: 34,
    runId: 'run-1',
    sessionId: 'sess-1',
    hookId: 'hook-1',
    hookName: 'beforeTool',
    hookEvent: 'PreToolUse',
    stdout: 'second-stdout\n',
    stderr: 'second-stderr\n',
    output: 'second-output\n',
  });
  const secondResponse = createEvent({
    eventId: 'evt-6',
    type: 'sdk.hook.response',
    sequence: 35,
    runId: 'run-1',
    sessionId: 'sess-1',
    hookId: 'hook-1',
    hookName: 'beforeTool',
    hookEvent: 'PreToolUse',
    stdout: 'second-response\n',
    output: 'second-done\n',
    exitCode: 7,
  });

  const detail = buildHookExecutionDetail([
    firstStarted,
    firstProgress,
    firstResponse,
    secondStarted,
    secondProgress,
    secondResponse,
  ], 'hook-1', {
    runId: 'run-1',
    sessionId: 'sess-1',
    hookEvent: 'Stop',
    hookName: 'beforeStop',
  });

  assert.deepEqual({
    startedAt: detail?.startedAt,
    updatedAt: detail?.updatedAt,
    stdout: detail?.stdout,
    stderr: detail?.stderr,
    output: detail?.output,
    exitCode: detail?.exitCode,
    progress: detail?.progress,
    response: detail?.response,
  }, {
    startedAt: firstStarted.timestamp,
    updatedAt: firstResponse.timestamp,
    stdout: 'first-stdout\nfirst-response\n',
    stderr: 'first-stderr\n',
    output: 'first-output\nfirst-done\n',
    exitCode: 0,
    progress: [firstProgress],
    response: firstResponse,
  });
});

test('buildHookExecutionDetail prefers the execution that matches run session and hook filters', () => {
  const firstStarted = createEvent({
    eventId: 'evt-1',
    type: 'sdk.hook.started',
    sequence: 40,
    runId: 'run-1',
    sessionId: 'sess-1',
    hookId: 'hook-1',
    hookName: 'beforeStop',
    hookEvent: 'Stop',
  });
  const firstResponse = createEvent({
    eventId: 'evt-2',
    type: 'sdk.hook.response',
    sequence: 41,
    runId: 'run-1',
    sessionId: 'sess-1',
    hookId: 'hook-1',
    hookName: 'beforeStop',
    hookEvent: 'Stop',
    output: 'first\n',
    exitCode: 0,
  });
  const secondStarted = createEvent({
    eventId: 'evt-3',
    type: 'sdk.hook.started',
    sequence: 42,
    runId: 'run-2',
    sessionId: 'sess-2',
    hookId: 'hook-1',
    hookName: 'beforeTool',
    hookEvent: 'PreToolUse',
  });
  const secondResponse = createEvent({
    eventId: 'evt-4',
    type: 'sdk.hook.response',
    sequence: 43,
    runId: 'run-2',
    sessionId: 'sess-2',
    hookId: 'hook-1',
    hookName: 'beforeTool',
    hookEvent: 'PreToolUse',
    output: 'second\n',
    exitCode: 9,
  });

  const detail = buildHookExecutionDetail(
    [firstStarted, firstResponse, secondStarted, secondResponse],
    'hook-1',
    {
      runId: 'run-2',
      sessionId: 'sess-2',
      hookEvent: 'PreToolUse',
      hookName: 'beforeTool',
    },
  );

  assert.deepEqual({
    runId: detail?.runId,
    sessionId: detail?.sessionId,
    hookEvent: detail?.hookEvent,
    hookName: detail?.hookName,
    output: detail?.output,
    exitCode: detail?.exitCode,
  }, {
    runId: 'run-2',
    sessionId: 'sess-2',
    hookEvent: 'PreToolUse',
    hookName: 'beforeTool',
    output: 'second\n',
    exitCode: 9,
  });
});

test('buildHookExecutionDetail returns null when filters do not match any execution', () => {
  const started = createEvent({
    eventId: 'evt-1',
    type: 'sdk.hook.started',
    sequence: 50,
    runId: 'run-1',
    sessionId: 'sess-1',
    hookId: 'hook-1',
    hookName: 'beforeStop',
    hookEvent: 'Stop',
  });
  const response = createEvent({
    eventId: 'evt-2',
    type: 'sdk.hook.response',
    sequence: 51,
    runId: 'run-1',
    sessionId: 'sess-1',
    hookId: 'hook-1',
    hookName: 'beforeStop',
    hookEvent: 'Stop',
    output: 'done\n',
    exitCode: 0,
  });

  assert.equal(buildHookExecutionDetail([started, response], 'hook-1', {
    runId: 'run-x',
    sessionId: 'sess-x',
    hookEvent: 'PreToolUse',
    hookName: 'beforeTool',
  }), null);
});

function createEvent({
  eventId,
  type,
  sequence,
  runId,
  sessionId,
  ...payload
}) {
  return {
    eventId,
    type,
    sequence,
    runId,
    sessionId,
    timestamp: `2026-04-21T00:00:${String(sequence).padStart(2, '0')}.000Z`,
    payload,
  };
}
