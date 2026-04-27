import test from 'node:test';
import assert from 'node:assert/strict';
import { getComposerPrimaryAction } from './composerChrome.ts';

test('getComposerPrimaryAction disables send when input is empty', () => {
  assert.deepEqual(
    getComposerPrimaryAction({ isLoading: false, hasInput: false }),
    { kind: 'send', disabled: true },
  );
});

test('getComposerPrimaryAction enables send when input exists', () => {
  assert.deepEqual(
    getComposerPrimaryAction({ isLoading: false, hasInput: true }),
    { kind: 'send', disabled: false },
  );
});

test('getComposerPrimaryAction switches to stop while loading', () => {
  assert.deepEqual(
    getComposerPrimaryAction({ isLoading: true, hasInput: false }),
    { kind: 'stop', disabled: false },
  );
});
