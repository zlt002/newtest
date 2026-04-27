import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

let viteServer;
let HooksPage;
let getRecentExecutionKey;
let createHooksOverviewRequestGuard;

const overview = {
  sources: [
    {
      id: 'project',
      kind: 'project',
      label: 'Project',
      writable: true,
      path: '/tmp/project/.claude/settings.json',
    },
  ],
  entries: [
    {
      id: 'project:Stop:0',
      sourceId: 'project',
      event: 'Stop',
      matcher: '',
      hooks: [{ type: 'command', command: 'echo stop' }],
      origin: 'project',
    },
  ],
  diagnostics: [
    {
      code: 'missing-session',
      message: 'Session context missing.',
    },
  ],
  capabilities: {
    writableKinds: ['project'],
    readonlyKinds: ['plugin'],
  },
  effective: {
    sources: [
      {
        id: 'project',
        kind: 'project',
        label: 'Project',
        writable: true,
      },
    ],
    entries: [
      {
        id: 'project:Stop:0',
        sourceId: 'project',
        event: 'Stop',
        matcher: '',
        hooks: [{ type: 'command', command: 'echo stop' }],
        origin: 'project',
      },
    ],
    groupedByEvent: {
      Stop: [
        {
          id: 'project:Stop:0',
          sourceId: 'project',
          event: 'Stop',
          matcher: '',
          hooks: [{ type: 'command', command: 'echo stop' }],
          origin: 'project',
        },
      ],
    },
    writableSources: [
      {
        id: 'project',
        kind: 'project',
        label: 'Project',
        writable: true,
      },
    ],
    readonlySources: [],
    sessionHooks: [],
    diagnostics: [],
  },
  recentExecutions: [
    {
      hookId: 'hook-1',
      hookName: 'beforeStop',
      hookEvent: 'Stop',
      runId: 'run-1',
      sessionId: 'sess-1',
      startedAt: '2026-04-22T10:00:00Z',
    },
    {
      hookId: 'hook-1',
      hookName: 'beforeStop',
      hookEvent: 'Stop',
      runId: 'run-2',
      sessionId: 'sess-1',
      startedAt: '2026-04-22T10:05:00Z',
    },
  ],
};

before(async () => {
  viteServer = await createServer({
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
  });

  const module = await viteServer.ssrLoadModule('/src/components/hooks/view/HooksPage.tsx');
  HooksPage = module.default;
  getRecentExecutionKey = module.getRecentExecutionKey;

  const hookModule = await viteServer.ssrLoadModule('/src/components/hooks/hooks/useHooksOverview.ts');
  createHooksOverviewRequestGuard = hookModule.createHooksOverviewRequestGuard;
});

after(async () => {
  if (!viteServer) {
    return;
  }

  viteServer.ws?.close();
  await viteServer.watcher?.close();
  await viteServer.close();
  await viteServer.httpServer?.close?.();
});

test('HooksPage renders the four required sections from initialData', () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(HooksPage, { initialData: overview }),
    ),
  );

  assert.match(markup, /Effective Hooks/);
  assert.match(markup, /Sources/);
  assert.match(markup, /Recent Executions/);
  assert.match(markup, /Diagnostics/);
  assert.match(markup, /project:Stop:0/);
  assert.match(markup, /beforeStop/);
  assert.match(markup, /missing-session/);
});

test('HooksPage renders source detail links from initialData', () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(HooksPage, { initialData: overview }),
    ),
  );

  assert.match(markup, /href="\/hooks\/sources\/project"/);
  assert.match(markup, /Project/);
  assert.match(markup, /\/tmp\/project\/\.claude\/settings\.json/);
});

test('getRecentExecutionKey differentiates executions that share a hookId', () => {
  const firstKey = getRecentExecutionKey(overview.recentExecutions[0], 0);
  const secondKey = getRecentExecutionKey(overview.recentExecutions[1], 1);

  assert.notEqual(firstKey, secondKey);
  assert.match(firstKey, /run-1/);
  assert.match(secondKey, /run-2/);
});

test('overview request guard treats only the latest request as current', () => {
  const guard = createHooksOverviewRequestGuard();
  const first = guard.issue();
  const second = guard.issue();

  assert.equal(guard.isCurrent(first), false);
  assert.equal(guard.isCurrent(second), true);
});
