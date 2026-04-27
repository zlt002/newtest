import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  createDesktopSessionRowViewModel,
  getAllSessions,
  readProjectSortOrder,
  reconcileAdditionalSessions,
} from './utils.ts';

const originalLocalStorage = globalThis.localStorage;

afterEach(() => {
  if (originalLocalStorage === undefined) {
    delete globalThis.localStorage;
    return;
  }

  globalThis.localStorage = originalLocalStorage;
});

test('readProjectSortOrder defaults to recent activity when settings are missing', () => {
  globalThis.localStorage = {
    getItem() {
      return null;
    },
  };

  assert.equal(readProjectSortOrder(), 'date');
});

test('readProjectSortOrder preserves an explicit name sort preference', () => {
  globalThis.localStorage = {
    getItem(key) {
      if (key === 'claude-settings') {
        return JSON.stringify({ projectSortOrder: 'name' });
      }
      return null;
    },
  };

  assert.equal(readProjectSortOrder(), 'name');
});

test('createDesktopSessionRowViewModel returns single-line session content', () => {
  const viewModel = createDesktopSessionRowViewModel(
    {
      summary: '优化侧边栏布局',
      lastActivity: '2026-04-14T12:00:00.000Z',
      messageCount: 42,
    },
    new Date('2026-04-14T13:00:00.000Z'),
    (key, options) => {
      if (key === 'time.oneHourAgo') return '1 小时前';
      if (key === 'projects.newSession') return '新会话';
      return options?.defaultValue ?? key;
    },
  );

  assert.equal(viewModel.sessionName, '优化侧边栏布局');
  assert.equal(viewModel.sessionTime, '2026-04-14T12:00:00.000Z');
  assert.equal(viewModel.isActive, false);
});

test('getAllSessions deduplicates repeated session ids across initial and paged results', () => {
  const project = {
    name: 'html',
    sessions: [
      {
        id: 'sess-1',
        summary: 'Base directory for this skill: /Users/foo',
        lastActivity: '2026-04-23T08:49:42.000Z',
      },
      {
        id: 'sess-2',
        summary: '11111111',
        lastActivity: '2026-04-23T08:50:00.000Z',
      },
    ],
  };

  const sessions = getAllSessions(project, {
    html: [
      {
        id: 'sess-1',
        summary: 'Base directory for this skill: /Users/foo',
        lastActivity: '2026-04-23T08:49:42.000Z',
      },
      {
        id: 'sess-3',
        summary: '使用 context7 mcp 工具帮我阅读',
        lastActivity: '2026-04-23T08:40:00.000Z',
      },
    ],
  });

  assert.deepEqual(
    sessions.map((session) => session.id),
    ['sess-2', 'sess-1', 'sess-3'],
  );
});

test('reconcileAdditionalSessions preserves loaded history across project refreshes', () => {
  const projects = [
    {
      name: 'html',
      sessions: [
        {
          id: 'sess-1',
          summary: '123',
          lastActivity: '2026-04-23T10:32:18.000Z',
        },
      ],
    },
  ];

  const reconciled = reconcileAdditionalSessions(projects, {
    html: [
      {
        id: 'sess-2',
        summary: '使用 context7 mcp工具帮我阅读下',
        lastActivity: '2026-04-23T09:59:00.000Z',
      },
      {
        id: 'sess-3',
        summary: 'Base directory for this skill',
        lastActivity: '2026-04-23T09:49:00.000Z',
      },
    ],
    ccui: [
      {
        id: 'other-1',
        summary: 'should be dropped with missing project',
        lastActivity: '2026-04-23T09:40:00.000Z',
      },
    ],
  });

  assert.deepEqual(Object.keys(reconciled), ['html']);
  assert.deepEqual(
    reconciled.html.map((session) => session.id),
    ['sess-2', 'sess-3'],
  );
});

test('reconcileAdditionalSessions drops extras that have been absorbed into base project sessions', () => {
  const projects = [
    {
      name: 'html',
      sessions: [
        {
          id: 'sess-1',
          summary: '123',
          lastActivity: '2026-04-23T10:32:18.000Z',
        },
        {
          id: 'sess-2',
          summary: '使用 context7 mcp工具帮我阅读下',
          lastActivity: '2026-04-23T09:59:00.000Z',
        },
      ],
    },
  ];

  const reconciled = reconcileAdditionalSessions(projects, {
    html: [
      {
        id: 'sess-2',
        summary: '使用 context7 mcp工具帮我阅读下',
        lastActivity: '2026-04-23T09:59:00.000Z',
      },
      {
        id: 'sess-3',
        summary: 'Base directory for this skill',
        lastActivity: '2026-04-23T09:49:00.000Z',
      },
    ],
  });

  assert.deepEqual(
    reconciled.html.map((session) => session.id),
    ['sess-3'],
  );
});
