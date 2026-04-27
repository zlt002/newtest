import test from 'node:test';
import assert from 'node:assert/strict';

import { getDraftPreviewFollowAlongDecision } from './draftPreviewFollowAlong.ts';

test('getDraftPreviewFollowAlongDecision requests opening markdown targets on preview delta', () => {
  const decision = getDraftPreviewFollowAlongDecision({
    event: {
      type: 'file_change_preview_delta',
      sessionId: 'session-1',
      toolId: 'tool-1',
      filePath: '/workspace/PRD-MoneyLens.md',
      timestamp: '2026-04-17T10:00:00.000Z',
      operation: {
        toolId: 'tool-1',
        filePath: '/workspace/PRD-MoneyLens.md',
        timestamp: '2026-04-17T10:00:00.000Z',
        source: 'Write',
        mode: 'write',
        newText: '# MoneyLens',
        status: 'pending',
        lineRange: null,
      },
    },
    rightPaneTarget: null,
    projectName: 'html',
  });

  assert.equal(decision.supportsDraftPreview, true);
  assert.equal(decision.shouldOpenTarget, true);
  assert.equal(decision.target?.type, 'markdown');
  assert.equal(decision.target?.filePath, '/workspace/PRD-MoneyLens.md');
});

test('getDraftPreviewFollowAlongDecision does not reopen the same markdown file', () => {
  const decision = getDraftPreviewFollowAlongDecision({
    event: {
      type: 'file_change_preview_delta',
      sessionId: 'session-1',
      toolId: 'tool-1',
      filePath: '/workspace/PRD-MoneyLens.md',
      timestamp: '2026-04-17T10:00:00.000Z',
      operation: {
        toolId: 'tool-1',
        filePath: '/workspace/PRD-MoneyLens.md',
        timestamp: '2026-04-17T10:00:00.000Z',
        source: 'Write',
        mode: 'write',
        newText: '# MoneyLens',
        status: 'pending',
        lineRange: null,
      },
    },
    rightPaneTarget: {
      type: 'markdown',
      filePath: '/workspace/PRD-MoneyLens.md',
      fileName: 'PRD-MoneyLens.md',
      projectName: 'html',
    },
    projectName: 'html',
  });

  assert.equal(decision.supportsDraftPreview, true);
  assert.equal(decision.shouldOpenTarget, false);
});

test('getDraftPreviewFollowAlongDecision resolves code targets for non-markdown preview deltas', () => {
  const decision = getDraftPreviewFollowAlongDecision({
    event: {
      type: 'file_change_preview_delta',
      sessionId: 'session-1',
      toolId: 'tool-1',
      filePath: '/workspace/login.css',
      timestamp: '2026-04-17T10:00:00.000Z',
      operation: {
        toolId: 'tool-1',
        filePath: '/workspace/login.css',
        timestamp: '2026-04-17T10:00:00.000Z',
        source: 'Edit',
        mode: 'replace',
        oldText: '.footer { text-align: center; }',
        newText: '.footer { text-align: left; }',
        replaceAll: false,
        status: 'pending',
        lineRange: null,
      },
    },
    rightPaneTarget: null,
    projectName: 'html',
  });

  assert.equal(decision.supportsDraftPreview, true);
  assert.equal(decision.shouldOpenTarget, true);
  assert.equal(decision.target?.type, 'code');
});

test('getDraftPreviewFollowAlongDecision requests opening code targets on preview delta', () => {
  const decision = getDraftPreviewFollowAlongDecision({
    event: {
      type: 'file_change_preview_delta',
      sessionId: 'session-1',
      toolId: 'tool-1',
      filePath: '/workspace/login.css',
      timestamp: '2026-04-17T10:00:00.000Z',
      operation: {
        toolId: 'tool-1',
        filePath: '/workspace/login.css',
        timestamp: '2026-04-17T10:00:00.000Z',
        source: 'Edit',
        mode: 'replace',
        oldText: '.footer { text-align: center; }',
        newText: '.footer { text-align: left; }',
        replaceAll: false,
        status: 'pending',
        lineRange: null,
      },
    },
    rightPaneTarget: null,
    projectName: 'html',
  });

  assert.equal(decision.supportsDraftPreview, true);
  assert.equal(decision.shouldOpenTarget, true);
  assert.equal(decision.target?.type, 'code');
});

test('getDraftPreviewFollowAlongDecision requests opening markdown targets on preview committed', () => {
  const decision = getDraftPreviewFollowAlongDecision({
    event: {
      type: 'file_change_preview_committed',
      sessionId: 'session-1',
      toolId: 'tool-1',
      filePath: '/workspace/PRD-MoneyLens.md',
      timestamp: '2026-04-17T10:00:02.000Z',
    },
    rightPaneTarget: null,
    projectName: 'html',
  });

  assert.equal(decision.supportsDraftPreview, true);
  assert.equal(decision.shouldOpenTarget, true);
  assert.equal(decision.target?.type, 'markdown');
  assert.equal(decision.target?.filePath, '/workspace/PRD-MoneyLens.md');
});

test('getDraftPreviewFollowAlongDecision does not reopen the same markdown file on preview committed', () => {
  const decision = getDraftPreviewFollowAlongDecision({
    event: {
      type: 'file_change_preview_committed',
      sessionId: 'session-1',
      toolId: 'tool-1',
      filePath: '/workspace/PRD-MoneyLens.md',
      timestamp: '2026-04-17T10:00:02.000Z',
    },
    rightPaneTarget: {
      type: 'markdown',
      filePath: '/workspace/PRD-MoneyLens.md',
      fileName: 'PRD-MoneyLens.md',
      projectName: 'html',
    },
    projectName: 'html',
  });

  assert.equal(decision.supportsDraftPreview, true);
  assert.equal(decision.shouldOpenTarget, false);
});
