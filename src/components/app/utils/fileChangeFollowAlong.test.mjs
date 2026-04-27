import test from 'node:test';
import assert from 'node:assert/strict';

import { getFileChangeFollowAlongDecision } from './fileChangeFollowAlong.ts';

test('getFileChangeFollowAlongDecision opens a markdown file when there is no right pane target', () => {
  const decision = getFileChangeFollowAlongDecision({
    event: {
      type: 'focus_file_changed',
      sessionId: 'session-1',
      toolId: 'tool-1',
      filePath: '/workspace/PRD-CloudVault.md',
      source: 'Write',
      timestamp: '2026-04-17T11:00:00.000Z',
      reason: 'latest_edit',
    },
    rightPaneTarget: null,
    isRightPaneVisible: false,
    projectName: 'html',
  });

  assert.equal(decision.shouldOpenTarget, true);
  assert.equal(decision.target?.type, 'markdown');
  assert.equal(decision.target?.filePath, '/workspace/PRD-CloudVault.md');
});

test('getFileChangeFollowAlongDecision keeps the current file when the same markdown file is already open', () => {
  const decision = getFileChangeFollowAlongDecision({
    event: {
      type: 'focus_file_changed',
      sessionId: 'session-1',
      toolId: 'tool-1',
      filePath: '/workspace/PRD-CloudVault.md',
      source: 'Write',
      timestamp: '2026-04-17T11:00:00.000Z',
      reason: 'latest_edit',
    },
    rightPaneTarget: {
      type: 'markdown',
      filePath: '/workspace/PRD-CloudVault.md',
      fileName: 'PRD-CloudVault.md',
      projectName: 'html',
    },
    isRightPaneVisible: true,
    projectName: 'html',
  });

  assert.equal(decision.shouldOpenTarget, false);
});

test('getFileChangeFollowAlongDecision does not steal focus from an open browser preview', () => {
  const decision = getFileChangeFollowAlongDecision({
    event: {
      type: 'focus_file_changed',
      sessionId: 'session-1',
      toolId: 'tool-1',
      filePath: '/workspace/PRD-CloudVault.md',
      source: 'Write',
      timestamp: '2026-04-17T11:00:00.000Z',
      reason: 'latest_edit',
    },
    rightPaneTarget: {
      type: 'browser',
      url: 'http://localhost:5173',
      source: 'address-bar',
    },
    isRightPaneVisible: true,
    projectName: 'html',
  });

  assert.equal(decision.shouldOpenTarget, false);
});
