import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldResetComposerAfterBuiltInAction,
  shouldResetComposerImmediatelyAfterSlashCommandIntercept,
} from './builtInCommandBehavior.ts';

test('compact built-in action keeps the generated composer input for auto-submit', () => {
  assert.equal(shouldResetComposerAfterBuiltInAction('compact'), false);
});

test('other built-in actions still clear the composer after execution', () => {
  assert.equal(shouldResetComposerAfterBuiltInAction('open_settings_tab'), true);
  assert.equal(shouldResetComposerAfterBuiltInAction('help'), true);
  assert.equal(shouldResetComposerAfterBuiltInAction('clear'), true);
  assert.equal(shouldResetComposerAfterBuiltInAction('skill_prompt'), true);
});

test('slash command interception does not clear the composer before the command execution flow decides', () => {
  assert.equal(shouldResetComposerImmediatelyAfterSlashCommandIntercept(), false);
});
