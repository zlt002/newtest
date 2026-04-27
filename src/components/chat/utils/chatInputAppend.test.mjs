import test from 'node:test';
import assert from 'node:assert/strict';

import { appendTextToChatInput } from './chatInputAppend.ts';

test('returns the appended text when chat input is empty', () => {
  assert.equal(appendTextToChatInput('', '新的修改要求'), '新的修改要求');
});

test('appends text after an existing draft with a blank line separator', () => {
  assert.equal(
    appendTextToChatInput('已有草稿', '新的修改要求'),
    '已有草稿\n\n新的修改要求',
  );
});

test('ignores empty appended text', () => {
  assert.equal(appendTextToChatInput('已有草稿', '   '), '已有草稿');
});
