import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createManagedSource,
  isWritableSource,
} from './managed-source.js';

test('createManagedSource returns normalized writable user source', () => {
  assert.deepEqual(
    createManagedSource({
      kind: 'user',
      path: '/tmp/home/.claude/settings.json',
      writable: true,
    }),
    {
      kind: 'user',
      path: '/tmp/home/.claude/settings.json',
      writable: true,
    },
  );
});

test('createManagedSource defaults plugin sources to readonly with reason', () => {
  assert.deepEqual(
    createManagedSource({
      kind: 'plugin',
      path: '/tmp/plugin/skills/demo/SKILL.md',
    }),
    {
      kind: 'plugin',
      path: '/tmp/plugin/skills/demo/SKILL.md',
      writable: false,
      reason: '插件来源为只读',
    },
  );
});

test('createManagedSource omits reason for writable sources', () => {
  assert.deepEqual(
    createManagedSource({
      kind: 'user',
      path: '/tmp/home/.claude/settings.json',
      writable: true,
      reason: 'should not be returned',
    }),
    {
      kind: 'user',
      path: '/tmp/home/.claude/settings.json',
      writable: true,
    },
  );
});

test('isWritableSource returns true only for writable sources', () => {
  assert.equal(isWritableSource(null), false);
  assert.equal(isWritableSource(createManagedSource({ kind: 'plugin', path: '/tmp/plugin' })), false);
  assert.equal(isWritableSource(createManagedSource({ kind: 'user', path: '/tmp/user', writable: true })), true);
});
