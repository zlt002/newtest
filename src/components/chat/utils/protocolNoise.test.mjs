import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractCommandProtocolText,
  isExpandedSkillPromptContent,
  isProtocolOnlyContent,
  sanitizeDisplayText,
  stripRawProtocolNoise,
} from './protocolNoise.ts';

test('stripRawProtocolNoise removes raw task protocol blocks', () => {
  const content = '<task-notification><task-id>a</task-id><tool-use-id>b</tool-use-id><output-file>/tmp/out</output-file><status>completed</status><summary>done</summary></task-notification>';
  assert.equal(stripRawProtocolNoise(content), '');
  assert.equal(isProtocolOnlyContent(content), true);
});

test('sanitizeDisplayText preserves user-facing text while removing protocol noise', () => {
  const content = '天气调研已完成 <task-notification><task-id>a</task-id><output-file>/tmp/out</output-file><status>completed</status><summary>done</summary></task-notification>';
  assert.equal(sanitizeDisplayText(content), '天气调研已完成');
});

test('stripRawProtocolNoise removes local command protocol wrappers', () => {
  const content = '<command-name>/clear</command-name><command-message>clear conversation</command-message><local-command-caveat>Caveat: hidden</local-command-caveat>';
  assert.equal(stripRawProtocolNoise(content), '');
  assert.equal(extractCommandProtocolText(content), '/clear');
  assert.equal(isProtocolOnlyContent(content), false);
  assert.equal(sanitizeDisplayText(content), '/clear');
});

test('expanded skill prompts are protocol-only display noise', () => {
  const content = `Base directory for this skill: /Users/demo/.claude/skills/gen-image

# gen-image

Internal skill instructions that should never become a chat title or bubble.`;

  assert.equal(isExpandedSkillPromptContent(content), true);
  assert.equal(stripRawProtocolNoise(content), '');
  assert.equal(isProtocolOnlyContent(content), true);
  assert.equal(sanitizeDisplayText(content, '新会话'), '新会话');
});

test('sanitizeDisplayText strips hidden context file protocol tags from the displayed user text', () => {
  const content = '<context-file>/workspace/demo/src/App.tsx</context-file>\n请帮我解释这个组件';

  assert.equal(stripRawProtocolNoise(content), '请帮我解释这个组件');
  assert.equal(isProtocolOnlyContent(content), false);
  assert.equal(sanitizeDisplayText(content), '请帮我解释这个组件');
});
