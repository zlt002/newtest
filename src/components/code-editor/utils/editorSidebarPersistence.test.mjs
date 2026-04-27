import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  EDITOR_SIDEBAR_STORAGE_KEY,
  readEditorSidebarPreference,
  writeEditorSidebarPreference,
} from './editorSidebarPersistence.ts';

const originalLocalStorage = globalThis.localStorage;

afterEach(() => {
  if (originalLocalStorage === undefined) {
    delete globalThis.localStorage;
    return;
  }

  globalThis.localStorage = originalLocalStorage;
});

test('returns default editor sidebar preference when nothing is stored', () => {
  globalThis.localStorage = {
    getItem() {
      return null;
    },
  };

  assert.deepEqual(readEditorSidebarPreference(), {
    hasManualWidth: false,
    width: 600,
  });
});

test('restores a previously saved manual editor width', () => {
  globalThis.localStorage = {
    getItem(key) {
      if (key === EDITOR_SIDEBAR_STORAGE_KEY) {
        return JSON.stringify({ width: 432 });
      }
      return null;
    },
  };

  assert.deepEqual(readEditorSidebarPreference(), {
    hasManualWidth: true,
    width: 432,
  });
});

test('ignores malformed editor sidebar preferences', () => {
  globalThis.localStorage = {
    getItem() {
      return '{"width":"oops"}';
    },
  };

  assert.deepEqual(readEditorSidebarPreference(), {
    hasManualWidth: false,
    width: 600,
  });
});

test('writes the user-selected editor width to storage', () => {
  let storedKey = null;
  let storedValue = null;

  globalThis.localStorage = {
    setItem(key, value) {
      storedKey = key;
      storedValue = value;
    },
  };

  writeEditorSidebarPreference(480);

  assert.equal(storedKey, EDITOR_SIDEBAR_STORAGE_KEY);
  assert.equal(storedValue, JSON.stringify({ width: 480 }));
});
