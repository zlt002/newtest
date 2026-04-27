import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveContextSidecarBinding } from './contextSidecarBinding.ts';

test('resolveContextSidecarBinding prefers artifact file paths for artifact blocks', () => {
  const binding = resolveContextSidecarBinding({
    id: 'artifact-1',
    kind: 'artifact',
    runId: 'run-1',
    timestamp: '2026-04-20T10:00:00.000Z',
    title: 'README',
    filePath: '/workspace/demo/README.md',
    artifactKind: 'file',
    events: [],
  });

  assert.deepEqual(binding, {
    target: 'file',
    filePath: '/workspace/demo/README.md',
  });
});

test('resolveContextSidecarBinding maps task blocks into task context targets', () => {
  const binding = resolveContextSidecarBinding({
    id: 'task-1',
    kind: 'task',
    runId: 'run-1',
    timestamp: '2026-04-20T10:00:00.000Z',
    title: 'Inspect repository',
    status: 'running',
    summary: '',
    defaultExpanded: true,
    steps: [],
    eventIds: ['evt-1', 'evt-2'],
    events: [],
  });

  assert.deepEqual(binding, {
    target: 'task_context',
    runId: 'run-1',
    eventIds: ['evt-1', 'evt-2'],
  });
});

test('resolveContextSidecarBinding maps recovery blocks into recovery context targets', () => {
  const binding = resolveContextSidecarBinding({
    id: 'recovery-1',
    kind: 'recovery',
    runId: 'run-9',
    timestamp: '2026-04-20T10:00:00.000Z',
    title: 'Resume failed',
    message: 'Please retry',
    canRetry: true,
    canStartNewSession: true,
    events: [],
  });

  assert.deepEqual(binding, {
    target: 'recovery_context',
    runId: 'run-9',
  });
});

test('resolveContextSidecarBinding returns null for non-sidecar blocks', () => {
  const binding = resolveContextSidecarBinding({
    id: 'turn-1',
    kind: 'turn',
    runId: 'run-1',
    timestamp: '2026-04-20T10:00:00.000Z',
    userText: null,
    assistantText: 'Hi',
    events: [],
  });

  assert.equal(binding, null);
});
