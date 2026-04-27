import test from 'node:test';
import assert from 'node:assert/strict';

import { getToolConfig, isBenignToolResultError, shouldHideToolResult } from './toolConfigs.ts';

test('isBenignToolResultError treats repeated no-op edit attempts as benign', () => {
  assert.equal(
    isBenignToolResultError('Edit', {
      isError: true,
      content: '<tool_use_error>No changes to make: old_string and new_string are exactly the same.</tool_use_error>',
    }),
    true,
  );
});

test('isBenignToolResultError keeps real edit failures visible', () => {
  assert.equal(
    isBenignToolResultError('Edit', {
      isError: true,
      content: '<tool_use_error>String to replace not found in file.</tool_use_error>',
    }),
    false,
  );
});

test('shouldHideToolResult hides benign no-op edit errors', () => {
  assert.equal(
    shouldHideToolResult('Edit', {
      isError: true,
      content: '<tool_use_error>No changes to make: old_string and new_string are exactly the same.</tool_use_error>',
    }),
    true,
  );
});

test('shouldHideToolResult hides tool results that are explicitly marked hidden by the presentation layer', () => {
  assert.equal(
    shouldHideToolResult('Edit', {
      isError: true,
      content: '<tool_use_error>Found 2 matches of the string to replace.</tool_use_error>',
      hideInUi: true,
    }),
    true,
  );
});

test('TaskCreate uses Task Master labeling to avoid confusion with Claude subagents', () => {
  const config = getToolConfig('TaskCreate');
  assert.equal(config.input.label, 'Task Master');
  assert.equal(config.input.getValue({}), 'Create local task');
});

test('Skill uses a dedicated tool config instead of falling back to generic parameters/details', () => {
  const config = getToolConfig('Skill');
  assert.notEqual(config, getToolConfig('Default'));
  assert.equal(config.input.type, 'one-line');
});

test('WebFetch uses a dedicated tool config instead of falling back to generic parameters/details', () => {
  const config = getToolConfig('WebFetch');
  assert.notEqual(config, getToolConfig('Default'));
  assert.equal(config.input.type, 'one-line');
});
