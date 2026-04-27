import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createServer } from 'vite';

let viteServer;
let HookExecutionsPage;
let HookExecutionDetailPage;
let createHookExecutionsRequestGuard;

const executionList = [
  {
    hookId: 'hook-1',
    hookName: 'beforeStop',
    hookEvent: 'Stop',
    runId: 'run-1',
    sessionId: 'sess-1',
    status: 'completed',
    outcome: 'success',
    startedAt: '2026-04-22T10:00:00Z',
    updatedAt: '2026-04-22T10:00:02Z',
  },
];

const executionDetail = {
  hookId: 'hook-1',
  hookName: 'beforeStop',
  hookEvent: 'Stop',
  runId: 'run-1',
  sessionId: 'sess-1',
  status: 'completed',
  outcome: 'error',
  startedAt: '2026-04-22T10:00:00Z',
  updatedAt: '2026-04-22T10:00:03Z',
  stdout: 'line-1\\nline-2\\n',
  stderr: 'warn-1\\n',
  output: 'done\\n',
  exitCode: 17,
  started: {
    type: 'sdk.hook.started',
    timestamp: '2026-04-22T10:00:00Z',
  },
  progress: [
    {
      type: 'sdk.hook.progress',
      timestamp: '2026-04-22T10:00:01Z',
      payload: {
        output: 'done\\n',
      },
    },
  ],
  response: {
    type: 'sdk.hook.response',
    timestamp: '2026-04-22T10:00:03Z',
    payload: {
      exitCode: 17,
    },
  },
  raw: {
    started: {
      type: 'sdk.hook.started',
      timestamp: '2026-04-22T10:00:00Z',
    },
    progress: [
      {
        type: 'sdk.hook.progress',
        timestamp: '2026-04-22T10:00:01Z',
      },
    ],
    response: {
      type: 'sdk.hook.response',
      timestamp: '2026-04-22T10:00:03Z',
    },
  },
};

before(async () => {
  viteServer = await createServer({
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
  });

  const listModule = await viteServer.ssrLoadModule('/src/components/hooks/view/HookExecutionsPage.tsx');
  HookExecutionsPage = listModule.default;

  const detailModule = await viteServer.ssrLoadModule('/src/components/hooks/view/HookExecutionDetailPage.tsx');
  HookExecutionDetailPage = detailModule.default;

  const hookModule = await viteServer.ssrLoadModule('/src/components/hooks/hooks/useHookExecutions.ts');
  createHookExecutionsRequestGuard = hookModule.createHookExecutionsRequestGuard;
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

test('HookExecutionsPage renders recent execution list from initialData', () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(HookExecutionsPage, { initialData: executionList }),
    ),
  );

  assert.match(markup, /Hook Executions/);
  assert.match(markup, /beforeStop/);
  assert.match(markup, /Stop/);
  assert.match(markup, /run-1/);
  assert.match(markup, /sess-1/);
});

test('HookExecutionDetailPage renders lifecycle stdout stderr exitCode and raw payload from initialData', () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      {
        initialEntries: ['/hooks/executions/hook-1?sessionId=sess-1&runId=run-1&hookEvent=Stop&hookName=beforeStop'],
      },
      React.createElement(
        Routes,
        null,
        React.createElement(Route, {
          path: '/hooks/executions/:hookId',
          element: React.createElement(HookExecutionDetailPage, { initialData: executionDetail }),
        }),
      ),
    ),
  );

  assert.match(markup, /Lifecycle/);
  assert.match(markup, /run-1/);
  assert.match(markup, /sess-1/);
  assert.match(markup, /stdout/);
  assert.match(markup, /stderr/);
  assert.match(markup, /Exit Code/);
  assert.match(markup, /Raw Payload/);
  assert.match(markup, /sdk\.hook\.started/);
  assert.match(markup, /line-1\\\\nline-2\\\\n/);
  assert.match(markup, /warn-1\\\\n/);
  assert.match(markup, /Exit Code/);
  assert.match(markup, /">17<\/div>/);
});

test('hook executions request guard treats only the latest request as current', () => {
  const guard = createHookExecutionsRequestGuard();
  const first = guard.issue();
  const second = guard.issue();

  assert.equal(guard.isCurrent(first), false);
  assert.equal(guard.isCurrent(second), true);
});

test('App registers hook execution and editor routes', async () => {
  const appSource = await fs.readFile(
    path.join(process.cwd(), 'src/App.tsx'),
    'utf8',
  );

  assert.match(appSource, /path="\/hooks\/executions"/);
  assert.match(appSource, /path="\/hooks\/executions\/:hookId"/);
  assert.match(appSource, /path="\/hooks\/edit\/:sourceKind"/);
});
