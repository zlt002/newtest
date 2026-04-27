import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createServer } from 'vite';

let viteServer;
let HookSourcePage;
let createHookSourceDetailRequestGuard;

const sourceDetail = {
  source: {
    id: 'plugin:git',
    kind: 'plugin',
    label: 'git-helper',
    writable: false,
    path: '/tmp/plugins/git/hooks.json',
  },
  raw: {
    hooks: {
      Stop: [{ matcher: '', hooks: [] }],
    },
  },
  normalized: {
    entries: [
      {
        id: 'plugin:git:Stop:0',
        sourceId: 'plugin:git',
        event: 'Stop',
        matcher: '',
        hooks: [],
        origin: 'plugin',
      },
    ],
  },
  aboutSource: {
    id: 'plugin:git',
    kind: 'plugin',
    label: 'git-helper',
    writable: false,
    path: '/tmp/plugins/git/hooks.json',
    description: 'Read-only hook source contributed by a Claude plugin.',
  },
};

before(async () => {
  viteServer = await createServer({
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
  });

  const pageModule = await viteServer.ssrLoadModule('/src/components/hooks/view/HookSourcePage.tsx');
  HookSourcePage = pageModule.default;

  const hookModule = await viteServer.ssrLoadModule('/src/components/hooks/hooks/useHookSourceDetail.ts');
  createHookSourceDetailRequestGuard = hookModule.createHookSourceDetailRequestGuard;
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

test('HookSourcePage renders the three required sections and back link from initialData', () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      { initialEntries: ['/hooks/sources/plugin%3Agit?sessionId=sess-1'] },
      React.createElement(
        Routes,
        null,
        React.createElement(Route, {
          path: '/hooks/sources/:sourceId',
          element: React.createElement(HookSourcePage, { initialData: sourceDetail }),
        }),
      ),
    ),
  );

  assert.match(markup, /Normalized/);
  assert.match(markup, /Raw/);
  assert.match(markup, /About Source/);
  assert.match(markup, /Back to Hooks/);
  assert.match(markup, /href="\/hooks\?sessionId=sess-1"/);
  assert.match(markup, /plugin:git:Stop:0/);
  assert.match(markup, /git-helper/);
  assert.match(markup, /read-only|不可编辑/i);
  assert.match(markup, /plugin/i);
  assert.match(markup, /上游|modify/i);
});

test('request guard treats only the latest request as current', () => {
  const guard = createHookSourceDetailRequestGuard();
  const first = guard.issue();
  const second = guard.issue();

  assert.equal(guard.isCurrent(first), false);
  assert.equal(guard.isCurrent(second), true);
});
