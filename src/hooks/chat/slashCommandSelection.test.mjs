import test from 'node:test';
import assert from 'node:assert/strict';

import { insertSlashCommandIntoInput } from './slashCommandSelection.ts';

test('insertSlashCommandIntoInput replaces the current slash query with the selected command', () => {
  assert.equal(
    insertSlashCommandIntoInput('/buil', 0, '/build-mcpb'),
    '/build-mcpb ',
  );
});

test('insertSlashCommandIntoInput preserves text before the slash trigger', () => {
  assert.equal(
    insertSlashCommandIntoInput('请帮我 /buil', 4, '/build-mcpb'),
    '请帮我 /build-mcpb ',
  );
});

test('insertSlashCommandIntoInput keeps any trailing argument text after the query', () => {
  assert.equal(
    insertSlashCommandIntoInput('/buil 已有参数', 0, '/build-mcpb'),
    '/build-mcpb  已有参数',
  );
});
