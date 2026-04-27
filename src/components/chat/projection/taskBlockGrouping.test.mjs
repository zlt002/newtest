import test from 'node:test';
import assert from 'node:assert/strict';

import { groupTaskBlockEvents } from './taskBlockGrouping.ts';

function createEvent({
  eventId,
  runId = 'run-1',
  sequence,
  type,
  payload = {},
}) {
  return {
    eventId,
    conversationId: 'conv-1',
    runId,
    sessionId: 'sess-1',
    sequence,
    type,
    timestamp: `2026-04-19T12:00:0${sequence}.000Z`,
    payload,
  };
}

test('groupTaskBlockEvents groups contiguous task and tool progress into one task block model', () => {
  const started = createEvent({
    eventId: 'evt-1',
    sequence: 1,
    type: 'sdk.task.started',
    payload: { taskId: 'task-1', description: 'Analyze codebase' },
  });
  const progress = createEvent({
    eventId: 'evt-2',
    sequence: 2,
    type: 'sdk.task.progress',
    payload: { taskId: 'task-1', description: 'Reading files' },
  });
  const tool = createEvent({
    eventId: 'evt-3',
    sequence: 3,
    type: 'sdk.tool.progress',
    payload: { taskId: 'task-1', toolName: 'Read' },
  });
  const notification = createEvent({
    eventId: 'evt-4',
    sequence: 4,
    type: 'sdk.task.notification',
    payload: { taskId: 'task-1', status: 'completed', summary: 'Done' },
  });

  const groups = groupTaskBlockEvents([started, progress, tool, notification]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].title, 'Analyze codebase');
  assert.equal(groups[0].status, 'completed');
  assert.equal(groups[0].summary, 'Done');
  assert.equal(groups[0].defaultExpanded, false);
  assert.equal(groups[0].steps.length, 4);
  assert.deepEqual(groups[0].events, [started, progress, tool, notification]);
});

test('groupTaskBlockEvents splits groups when task identity changes', () => {
  const groups = groupTaskBlockEvents([
    createEvent({
      eventId: 'evt-1',
      sequence: 1,
      type: 'sdk.task.started',
      payload: { taskId: 'task-1', description: 'Analyze codebase' },
    }),
    createEvent({
      eventId: 'evt-2',
      sequence: 2,
      type: 'sdk.task.progress',
      payload: { taskId: 'task-1', description: 'Reading files' },
    }),
    createEvent({
      eventId: 'evt-3',
      sequence: 3,
      type: 'sdk.task.started',
      payload: { taskId: 'task-2', description: 'Write tests' },
    }),
  ]);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].title, 'Analyze codebase');
  assert.equal(groups[1].title, 'Write tests');
});

test('groupTaskBlockEvents falls back to notification summary when task descriptions are missing', () => {
  const groups = groupTaskBlockEvents([
    createEvent({
      eventId: 'evt-1',
      sequence: 1,
      type: 'sdk.task.started',
      payload: { taskId: 'task-1' },
    }),
    createEvent({
      eventId: 'evt-2',
      sequence: 2,
      type: 'sdk.task.progress',
      payload: { taskId: 'task-1', toolName: 'Read' },
    }),
    createEvent({
      eventId: 'evt-3',
      sequence: 3,
      type: 'sdk.task.notification',
      payload: { taskId: 'task-1', status: 'completed', summary: '已完成代码检查' },
    }),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].title, '已完成代码检查');
  assert.equal(groups[0].summary, '已完成代码检查');
  assert.equal(groups[0].steps[1].label, 'Read');
});

test('groupTaskBlockEvents falls back to tool labels or output files when summaries are missing', () => {
  const groups = groupTaskBlockEvents([
    createEvent({
      eventId: 'evt-1',
      sequence: 1,
      type: 'sdk.task.started',
      payload: { taskId: 'task-2' },
    }),
    createEvent({
      eventId: 'evt-2',
      sequence: 2,
      type: 'sdk.tool.progress',
      payload: { taskId: 'task-2', toolName: 'Bash' },
    }),
    createEvent({
      eventId: 'evt-3',
      sequence: 3,
      type: 'sdk.task.notification',
      payload: {
        taskId: 'task-2',
        status: 'completed',
        outputFile: '/workspace/reports/final-summary.md',
      },
    }),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].title, 'Bash');
  assert.equal(groups[0].summary, 'Bash');
  assert.equal(groups[0].steps[2].label, 'final-summary.md');
});

test('groupTaskBlockEvents uses output files as a title fallback when no description or tool label is available', () => {
  const groups = groupTaskBlockEvents([
    createEvent({
      eventId: 'evt-1',
      sequence: 1,
      type: 'sdk.task.started',
      payload: { taskId: 'task-3' },
    }),
    createEvent({
      eventId: 'evt-2',
      sequence: 2,
      type: 'sdk.task.notification',
      payload: {
        taskId: 'task-3',
        status: 'completed',
        outputFile: '/workspace/reports/final-summary.md',
      },
    }),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].title, 'final-summary.md');
  assert.equal(groups[0].summary, 'final-summary.md');
});
