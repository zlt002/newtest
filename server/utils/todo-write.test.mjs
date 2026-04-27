import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeTodoWriteInput } from './todo-write.js';

test('normalizeTodoWriteInput parses a JSON array string into todos array', () => {
  const normalized = normalizeTodoWriteInput({
    todos: JSON.stringify([
      { content: 'Write spec', status: 'pending', priority: 'high' },
      { content: 'Review draft', status: 'in_progress' },
    ]),
  });

  assert.deepEqual(normalized, {
    todos: [
      { content: 'Write spec', status: 'pending', priority: 'high' },
      { content: 'Review draft', status: 'in_progress' },
    ],
  });
});

test('normalizeTodoWriteInput unwraps todos from a JSON object string', () => {
  const normalized = normalizeTodoWriteInput({
    todos: JSON.stringify({
      todos: [{ content: 'Ship fix', status: 'completed' }],
    }),
    source: 'model',
  });

  assert.deepEqual(normalized, {
    todos: [{ content: 'Ship fix', status: 'completed' }],
    source: 'model',
  });
});

test('normalizeTodoWriteInput leaves unrelated input untouched when todos is not recoverable', () => {
  const input = { todos: 'not-json', foo: 'bar' };
  assert.equal(normalizeTodoWriteInput(input), input);
});
