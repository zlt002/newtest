import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldIgnoreWatchedPath } from './projects-watcher.js';

test('shouldIgnoreWatchedPath ignores heavy generated directories and temp files', () => {
  assert.equal(
    shouldIgnoreWatchedPath('/Users/demo/.claude/projects/foo/123/subagents/result.json'),
    true,
  );
  assert.equal(
    shouldIgnoreWatchedPath('/Users/demo/.claude/projects/foo/123/tool-results/output.json'),
    true,
  );
  assert.equal(
    shouldIgnoreWatchedPath('/Users/demo/.claude/projects/foo/node_modules/react/index.js'),
    true,
  );
  assert.equal(
    shouldIgnoreWatchedPath('/Users/demo/.claude/projects/foo/.git/index'),
    true,
  );
  assert.equal(
    shouldIgnoreWatchedPath('/Users/demo/.claude/projects/foo/.DS_Store'),
    true,
  );
  assert.equal(
    shouldIgnoreWatchedPath('/Users/demo/.claude/projects/foo/file.tmp'),
    true,
  );
});

test('shouldIgnoreWatchedPath keeps top-level Claude project session files watchable', () => {
  assert.equal(
    shouldIgnoreWatchedPath('/Users/demo/.claude/projects/foo/session.jsonl'),
    false,
  );
  assert.equal(
    shouldIgnoreWatchedPath('/Users/demo/.claude/projects/foo/memory.jsonl'),
    false,
  );
  assert.equal(
    shouldIgnoreWatchedPath('/Users/demo/.claude/projects/foo/project-config.json'),
    false,
  );
});
