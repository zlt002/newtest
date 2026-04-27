import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveFileChangeEvents } from './chatFileChangeEvents.ts';

test('deriveFileChangeEvents emits started, applied, and focus events for a successful Edit tool use', () => {
  const events = deriveFileChangeEvents([
    {
      id: 'tool-1',
      kind: 'tool_use',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:00.000Z',
      toolName: 'Edit',
      toolId: 'tool-1',
      toolInput: {
        file_path: '/workspace/login.html',
        old_string: '<p class="footer-text">',
        new_string: '<p class="footer-text left">',
      },
      toolResult: {
        isError: false,
        content: 'Done',
      },
    },
  ]);

  assert.equal(events.length, 3);
  assert.deepEqual(
    events.map((event) => event.type),
    ['file_change_started', 'file_change_applied', 'focus_file_changed'],
  );
  assert.deepEqual(
    events.map((event) => event.filePath),
    ['/workspace/login.html', '/workspace/login.html', '/workspace/login.html'],
  );
  assert.deepEqual(
    events.map((event) => event.sessionId),
    ['session-1', 'session-1', 'session-1'],
  );
  assert.deepEqual(
    events.map((event) => event.toolId),
    ['tool-1', 'tool-1', 'tool-1'],
  );
  assert.deepEqual(
    events.map((event) => event.source),
    ['Edit', 'Edit', 'Edit'],
  );
  assert.equal(events[0].timestamp, '2026-04-16T10:00:00.000Z');
  assert.equal(events[2].reason, 'latest_edit');
});

test('deriveFileChangeEvents emits started and failed events for a failed Edit tool use', () => {
  const events = deriveFileChangeEvents([
    {
      id: 'tool-2',
      kind: 'tool_use',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:00.000Z',
      toolName: 'Edit',
      toolId: 'tool-2',
      toolInput: {
        file_path: '/workspace/login.html',
        old_string: 'text-align: center;',
        new_string: 'text-align: left;',
      },
      toolResult: {
        isError: true,
        content: '<tool_use_error>String to replace not found</tool_use_error>',
      },
    },
  ]);

  assert.equal(events.length, 2);
  assert.deepEqual(
    events.map((event) => event.type),
    ['file_change_started', 'file_change_failed'],
  );
  assert.equal(events[1].filePath, '/workspace/login.html');
  assert.equal(events[1].toolId, 'tool-2');
  assert.equal(events[1].source, 'Edit');
  assert.match(events[1].error, /String to replace not found/);
});

test('deriveFileChangeEvents ignores non-file editing tools', () => {
  const events = deriveFileChangeEvents([
    {
      id: 'tool-3',
      kind: 'tool_use',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:00.000Z',
      toolName: 'Bash',
      toolId: 'tool-3',
      toolInput: {
        command: 'ls',
      },
      toolResult: {
        isError: false,
        content: 'login.html',
      },
    },
  ]);

  assert.deepEqual(events, []);
});

test('deriveFileChangeEvents only emits started when no tool result is available', () => {
  const events = deriveFileChangeEvents([
    {
      id: 'tool-no-result',
      kind: 'tool_use',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:00.000Z',
      toolName: 'Edit',
      toolId: 'tool-no-result',
      toolInput: {
        file_path: '/workspace/no-result.html',
      },
    },
  ]);

  assert.deepEqual(events.map((event) => event.type), ['file_change_started']);
  assert.equal(events[0].filePath, '/workspace/no-result.html');
});

test('deriveFileChangeEvents uses tool_result matched by toolId for a successful edit', () => {
  const events = deriveFileChangeEvents([
    {
      id: 'tool-success',
      kind: 'tool_use',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:00.000Z',
      toolName: 'Edit',
      toolId: 'tool-success',
      toolInput: {
        file_path: '/workspace/success-by-id.html',
      },
    },
    {
      id: 'tool-success-result',
      kind: 'tool_result',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:01.000Z',
      toolId: 'tool-success',
      content: 'Done',
      isError: false,
    },
  ]);

  assert.deepEqual(events.map((event) => event.type), [
    'file_change_started',
    'file_change_applied',
    'focus_file_changed',
  ]);
  assert.equal(events[2].reason, 'latest_edit');
});

test('deriveFileChangeEvents uses tool_result matched by toolId for a failed edit', () => {
  const events = deriveFileChangeEvents([
    {
      id: 'tool-failed',
      kind: 'tool_use',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:00.000Z',
      toolName: 'Edit',
      toolId: 'tool-failed',
      toolInput: {
        file_path: '/workspace/failed-by-id.html',
      },
    },
    {
      id: 'tool-failed-result',
      kind: 'tool_result',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:01.000Z',
      toolId: 'tool-failed',
      content: '<tool_use_error>String to replace not found</tool_use_error>',
      isError: true,
    },
  ]);

  assert.deepEqual(events.map((event) => event.type), [
    'file_change_started',
    'file_change_failed',
  ]);
  assert.equal(events[1].error, '<tool_use_error>String to replace not found</tool_use_error>');
});

test('deriveFileChangeEvents preserves existing line range hints from tool input', () => {
  const events = deriveFileChangeEvents([
    {
      id: 'tool-4',
      kind: 'tool_use',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:00.000Z',
      toolName: 'Edit',
      toolId: 'tool-4',
      toolInput: {
        file_path: '/workspace/line-range-a.html',
        lineRange: {
          startLine: 3,
          endLine: 7,
        },
      },
      toolResult: {
        isError: false,
        content: 'Done',
      },
    },
    {
      id: 'tool-5',
      kind: 'tool_use',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:01.000Z',
      toolName: 'Edit',
      toolId: 'tool-5',
      toolInput: {
        file_path: '/workspace/line-range-b.html',
        line_range: {
          start_line: 10,
          end_line: 12,
        },
      },
      toolResult: {
        isError: false,
        content: 'Done',
      },
    },
    {
      id: 'tool-6',
      kind: 'tool_use',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:02.000Z',
      toolName: 'Edit',
      toolId: 'tool-6',
      toolInput: {
        file_path: '/workspace/line-range-c.html',
        range: {
          start: 20,
          end: 22,
        },
      },
      toolResult: {
        isError: false,
        content: 'Done',
      },
    },
  ]);

  const startedEvents = events.filter((event) => event.type === 'file_change_started');
  const focusEvents = events.filter((event) => event.type === 'focus_file_changed');

  assert.deepEqual(startedEvents.map((event) => event.lineRange), [
    { startLine: 3, endLine: 7 },
    { startLine: 10, endLine: 12 },
    { startLine: 20, endLine: 22 },
  ]);
  assert.deepEqual(focusEvents.map((event) => event.reason), [
    'latest_edit',
    'latest_edit',
    'latest_edit',
  ]);
});
