import test from 'node:test';
import assert from 'node:assert/strict';

import { getClaudePermissionSuggestion } from './chatPermissions.ts';

function mockLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial));

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    get length() {
      return store.size;
    },
  };
}

test('returns a permission suggestion for permission-related tool errors', () => {
  globalThis.localStorage = mockLocalStorage();

  const suggestion = getClaudePermissionSuggestion({
    type: 'tool_result',
    timestamp: Date.now(),
    toolName: 'Bash',
    toolInput: '{"command":"ls -la /tmp"}',
    toolResult: {
      isError: true,
      content: 'Permission request timed out',
    },
  }, 'claude');

  assert.deepEqual(suggestion, {
    toolName: 'Bash',
    entry: 'Bash(ls:*)',
    isAllowed: false,
  });
});

test('does not return a permission suggestion for command execution errors', () => {
  globalThis.localStorage = mockLocalStorage();

  const suggestion = getClaudePermissionSuggestion({
    type: 'tool_result',
    timestamp: Date.now(),
    toolName: 'Bash',
    toolInput: '{"command":"ls -la /missing/path"}',
    toolResult: {
      isError: true,
      content: 'Exit code 1: ls: /missing/path: No such file or directory',
    },
  }, 'claude');

  assert.equal(suggestion, null);
});

test('does not return a permission suggestion for input validation errors', () => {
  globalThis.localStorage = mockLocalStorage();

  const suggestion = getClaudePermissionSuggestion({
    type: 'tool_result',
    timestamp: Date.now(),
    toolName: 'TodoWrite',
    toolInput: '{"todos":"oops"}',
    toolResult: {
      isError: true,
      content: '<tool_use_error>InputValidationError: parameter `todos` expected array but got string</tool_use_error>',
    },
  }, 'claude');

  assert.equal(suggestion, null);
});
