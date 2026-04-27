import test from 'node:test';
import assert from 'node:assert/strict';
import { getSelectLabel } from './Select.shared.ts';

test('getSelectLabel returns matching option label', () => {
  const options = [
    { value: 'projects', label: '项目' },
    { value: 'conversations', label: '对话' },
  ];

  assert.equal(getSelectLabel(options, 'conversations'), '对话');
});

test('getSelectLabel falls back to first option label when value is unknown', () => {
  const options = [
    { value: 'projects', label: '项目' },
    { value: 'conversations', label: '对话' },
  ];

  assert.equal(getSelectLabel(options, 'missing'), '项目');
});
