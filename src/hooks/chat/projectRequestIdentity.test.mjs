import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getProjectRequestIdentity,
  resolveProjectRequestName,
  resolveProjectRequestPath,
} from './projectRequestIdentity.ts';

test('getProjectRequestIdentity 对相同项目请求上下文保持稳定，即使对象引用变化', () => {
  const firstProject = {
    name: 'claude-code-viewer-main',
    path: '/Users/zhanglt21/Desktop/claude-code-viewer-main',
    fullPath: '/Users/zhanglt21/Desktop/claude-code-viewer-main',
    sessions: [{ id: 'session-1' }],
  };

  const refreshedProject = {
    name: 'claude-code-viewer-main',
    path: '/Users/zhanglt21/Desktop/claude-code-viewer-main',
    fullPath: '/Users/zhanglt21/Desktop/claude-code-viewer-main',
    sessions: [{ id: 'session-1' }, { id: 'session-2' }],
    updatedAt: '2026-04-18T10:00:00.000Z',
  };

  assert.equal(
    getProjectRequestIdentity(firstProject),
    getProjectRequestIdentity(refreshedProject),
  );
});

test('resolveProjectRequestPath 优先使用 fullPath，再回退到 path', () => {
  assert.equal(
    resolveProjectRequestPath({
      path: '/workspace/path-only',
      fullPath: '  /workspace/full-path  ',
    }),
    '/workspace/full-path',
  );

  assert.equal(
    resolveProjectRequestPath({
      path: '  /workspace/path-only  ',
      fullPath: '   ',
    }),
    '/workspace/path-only',
  );
});

test('resolveProjectRequestName 会返回裁剪后的项目名', () => {
  assert.equal(resolveProjectRequestName({ name: '  demo-project  ' }), 'demo-project');
  assert.equal(resolveProjectRequestName({ name: '' }), '');
  assert.equal(resolveProjectRequestName(null), '');
});
