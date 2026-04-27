import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createServer } from 'vite';

let viteServer;
let HookEditorPage;
let createHookEditorRequestGuard;

const editorData = {
  source: {
    id: 'project',
    kind: 'project',
    label: 'Project hooks',
    writable: true,
    path: '/tmp/project/.claude/settings.json',
  },
  raw: {
    hooks: {
      Stop: [
        {
          matcher: '',
          hooks: [
            { type: 'command', command: 'echo done' },
            { type: 'http', url: 'https://example.com/hooks', method: 'POST' },
            { type: 'prompt', prompt: 'Summarize changes' },
            { type: 'agent', agent: 'reviewer', prompt: 'Review this diff' },
          ],
        },
      ],
    },
  },
  normalized: {
    entries: [
      {
        id: 'project:Stop:0',
        sourceId: 'project',
        event: 'Stop',
        matcher: '',
        hooks: [
          { type: 'command', command: 'echo done' },
          { type: 'http', url: 'https://example.com/hooks', method: 'POST' },
          { type: 'prompt', prompt: 'Summarize changes' },
          { type: 'agent', agent: 'reviewer', prompt: 'Review this diff' },
        ],
      },
    ],
  },
  aboutSource: {
    id: 'project',
    kind: 'project',
    writable: true,
    path: '/tmp/project/.claude/settings.json',
  },
};

before(async () => {
  viteServer = await createServer({
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
  });

  const pageModule = await viteServer.ssrLoadModule('/src/components/hooks/view/HookEditorPage.tsx');
  HookEditorPage = pageModule.default;

  const hookModule = await viteServer.ssrLoadModule('/src/components/hooks/hooks/useHookEditor.ts');
  createHookEditorRequestGuard = hookModule.createHookEditorRequestGuard;
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

test('HookEditorPage renders four supported action types and write target details from initialData', () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      { initialEntries: ['/hooks/edit/project?projectPath=%2Ftmp%2Fproject'] },
      React.createElement(
        Routes,
        null,
        React.createElement(Route, {
          path: '/hooks/edit/:sourceKind',
          element: React.createElement(HookEditorPage, { initialData: editorData }),
        }),
      ),
    ),
  );

  assert.match(markup, /Hook Editor/);
  assert.match(markup, /Write Target/);
  assert.match(markup, /project/);
  assert.match(markup, /\/tmp\/project\/\.claude\/settings\.json/);
  assert.match(markup, /command/);
  assert.match(markup, /http/);
  assert.match(markup, /prompt/);
  assert.match(markup, /agent/);
  assert.match(markup, /echo done/);
  assert.match(markup, /https:\/\/example\.com\/hooks/);
  assert.match(markup, /Summarize changes/);
  assert.match(markup, /Review this diff/);
  assert.match(markup, /Event Selector/);
  assert.match(markup, /Action List Editor/);
  assert.match(markup, /Raw JSON Drawer/);
  assert.match(markup, /<select/);
  assert.match(markup, /<textarea/);
  assert.match(markup, /name="command"/);
});

test('Hook editor request guard treats only the latest request as current', () => {
  const guard = createHookEditorRequestGuard();
  const first = guard.issue();
  const second = guard.issue();

  assert.equal(guard.isCurrent(first), false);
  assert.equal(guard.isCurrent(second), true);
});

test('HookEditorPage shows session-memory scope hint near the write target', () => {
  const sessionMemoryData = {
    ...editorData,
    source: {
      id: 'session-memory:sess-1',
      kind: 'session-memory',
      label: 'Session memory hooks',
      writable: true,
      path: null,
    },
    aboutSource: {
      id: 'session-memory:sess-1',
      kind: 'session-memory',
      writable: true,
    },
  };

  const markup = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      { initialEntries: ['/hooks/edit/session-memory?sessionId=sess-1'] },
      React.createElement(
        Routes,
        null,
        React.createElement(Route, {
          path: '/hooks/edit/:sourceKind',
          element: React.createElement(HookEditorPage, { initialData: sessionMemoryData }),
        }),
      ),
    ),
  );

  assert.match(markup, /session-memory/);
  assert.match(markup, /仅当前会话生效|current session/i);
});
