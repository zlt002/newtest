import test from 'node:test';
import assert from 'node:assert/strict';

import * as projectsModule from './projects.js';
import { isAccessibleProjectDirectory, paginateOfficialSessions } from './projects.js';

test('projects module no longer exports legacy session summary overlay helpers', () => {
  assert.equal('overlaySessionSummariesWithRunInputs' in projectsModule, false);
});

test('isAccessibleProjectDirectory returns true for an existing directory', async () => {
  const result = await isAccessibleProjectDirectory('/repo/demo', {
    accessPath: async (targetPath) => {
      assert.equal(targetPath, '/repo/demo');
    },
    statPath: async (targetPath) => {
      assert.equal(targetPath, '/repo/demo');
      return { isDirectory: () => true };
    },
  });

  assert.equal(result, true);
});

test('isAccessibleProjectDirectory returns false when the path is missing', async () => {
  const result = await isAccessibleProjectDirectory('/repo/missing', {
    accessPath: async () => {
      const error = new Error('missing');
      error.code = 'ENOENT';
      throw error;
    },
    statPath: async () => ({ isDirectory: () => true }),
  });

  assert.equal(result, false);
});

test('isAccessibleProjectDirectory returns false when the path is not a directory', async () => {
  const result = await isAccessibleProjectDirectory('/repo/file', {
    accessPath: async () => {},
    statPath: async () => ({ isDirectory: () => false }),
  });

  assert.equal(result, false);
});

test('paginateOfficialSessions keeps official summary and lastUserMessage intact', () => {
  const result = paginateOfficialSessions([
    {
      id: 'sess-1',
      summary: 'Base directory for this skill: /Users/demo/.claude/skills/pm-brainstorming...',
      lastUserMessage: '展开后的 skill 内容',
      lastActivity: new Date('2026-04-21T13:12:28.369Z'),
    },
    {
      id: 'sess-2',
      summary: '普通消息',
      lastUserMessage: '普通消息',
      lastActivity: new Date('2026-04-21T13:12:30.000Z'),
    },
  ], 5, 0);

  assert.equal(result.total, 2);
  assert.equal(result.hasMore, false);
  assert.equal(result.sessions[0].id, 'sess-2');
  assert.equal(result.sessions[0].summary, '普通消息');
  assert.equal(result.sessions[1].summary, 'Base directory for this skill: /Users/demo/.claude/skills/pm-brainstorming...');
  assert.equal(result.sessions[1].lastUserMessage, '展开后的 skill 内容');
});
