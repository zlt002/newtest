import test from 'node:test';
import assert from 'node:assert/strict';
import { localizeClaudeStatusText } from './claudeStatusText.ts';

test('localizeClaudeStatusText translates common in-progress English labels', () => {
  assert.equal(localizeClaudeStatusText('Thinking...'), '思考中...');
  assert.equal(localizeClaudeStatusText('Processing...'), '处理中...');
  assert.equal(localizeClaudeStatusText('Analyzing...'), '分析中...');
  assert.equal(localizeClaudeStatusText('Working...'), '执行中...');
});

test('localizeClaudeStatusText keeps unknown text unchanged', () => {
  assert.equal(localizeClaudeStatusText('Custom backend status'), 'Custom backend status');
});
