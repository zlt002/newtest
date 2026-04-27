import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldDismissThinkingModeMenu } from './thinkingModeMenu.ts';

test('shouldDismissThinkingModeMenu keeps menu open when clicking inside trigger container', () => {
  const target = { id: 'trigger-child' };
  const triggerContainer = {
    contains(node) {
      return node === target;
    },
  };

  assert.equal(
    shouldDismissThinkingModeMenu({
      target,
      triggerContainer,
      menuContainer: null,
    }),
    false,
  );
});

test('shouldDismissThinkingModeMenu keeps menu open when clicking inside portal menu', () => {
  const target = { id: 'menu-item' };
  const menuContainer = {
    contains(node) {
      return node === target;
    },
  };

  assert.equal(
    shouldDismissThinkingModeMenu({
      target,
      triggerContainer: null,
      menuContainer,
    }),
    false,
  );
});

test('shouldDismissThinkingModeMenu closes menu when clicking outside both containers', () => {
  const target = { id: 'outside' };
  const triggerContainer = {
    contains() {
      return false;
    },
  };
  const menuContainer = {
    contains() {
      return false;
    },
  };

  assert.equal(
    shouldDismissThinkingModeMenu({
      target,
      triggerContainer,
      menuContainer,
    }),
    true,
  );
});
