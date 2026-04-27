import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDraftSessionRouteId,
  mergeResolvedRouteSessionIntoProjects,
  preserveRoutedSessionInProjects,
  resolveDraftProjectNameFromSessionRoute,
  resolveSessionSelectionFromRoute,
} from './useProjectsRouteSelection.ts';

test('returns no session selection when the route has no session id', () => {
  assert.deepEqual(
    resolveSessionSelectionFromRoute({
      sessionId: undefined,
      projects: [
        {
          name: 'demo',
          sessions: [{ id: 'session-1', title: 'Old chat' }],
        },
      ],
    }),
    {
      project: null,
      session: null,
      isDraftSessionRoute: false,
    },
  );
});

test('finds the matching project and session for a session route', () => {
  const matchedSession = { id: 'session-2', title: 'Target chat' };
  const matchedProject = {
    name: 'demo',
    sessions: [{ id: 'session-1', title: 'Old chat' }, matchedSession],
  };

  assert.deepEqual(
    resolveSessionSelectionFromRoute({
      sessionId: 'session-2',
      projects: [
        { name: 'other', sessions: [{ id: 'session-x', title: 'Other chat' }] },
        matchedProject,
      ],
    }),
    {
      project: matchedProject,
      session: matchedSession,
      isDraftSessionRoute: false,
    },
  );
});

test('returns no selection when the route session id is unknown', () => {
  assert.deepEqual(
    resolveSessionSelectionFromRoute({
      sessionId: 'missing-session',
      projects: [{ name: 'demo', sessions: [{ id: 'session-1', title: 'Old chat' }] }],
    }),
    {
      project: null,
      session: null,
      isDraftSessionRoute: false,
    },
  );
});

test('resolves a draft session route back to its project without selecting a real session', () => {
  const htmlProject = {
    name: 'html',
    sessions: [{ id: 'session-1', title: 'Old chat' }],
  };

  assert.deepEqual(
    resolveSessionSelectionFromRoute({
      sessionId: createDraftSessionRouteId('html', 123),
      projects: [
        { name: 'other', sessions: [] },
        htmlProject,
      ],
    }),
    {
      project: htmlProject,
      session: null,
      isDraftSessionRoute: true,
    },
  );
});

test('parses the project name from a draft session route id', () => {
  assert.equal(
    resolveDraftProjectNameFromSessionRoute(createDraftSessionRouteId('cloudcli demo', 456)),
    'cloudcli demo',
  );
});

test('mergeResolvedRouteSessionIntoProjects prepends a route-restored session into the matching project', () => {
  const projects = [
    {
      name: 'html',
      sessions: [{ id: 'session-1', title: 'Old chat' }],
      sessionMeta: { total: 5, hasMore: true },
    },
  ];

  const merged = mergeResolvedRouteSessionIntoProjects({
    projects,
    projectName: 'html',
    session: { id: 'session-2', title: 'Restored chat' },
  });

  assert.equal(merged[0].sessions[0].id, 'session-2');
  assert.equal(merged[0].sessions[0].__projectName, 'html');
  assert.equal(merged[0].sessions[1].id, 'session-1');
  assert.equal(merged[0].sessionMeta.total, 5);
});

test('mergeResolvedRouteSessionIntoProjects replaces an existing restored session instead of duplicating it', () => {
  const merged = mergeResolvedRouteSessionIntoProjects({
    projects: [
      {
        name: 'html',
        sessions: [
          { id: 'session-2', title: 'Stale title' },
          { id: 'session-1', title: 'Old chat' },
        ],
        sessionMeta: { total: 2, hasMore: false },
      },
    ],
    projectName: 'html',
    session: { id: 'session-2', title: 'Fresh title' },
  });

  assert.equal(merged[0].sessions.length, 2);
  assert.equal(merged[0].sessions[0].title, 'Fresh title');
});

test('preserveRoutedSessionInProjects keeps the current routed historical session when background project refresh omits it', () => {
  const preserved = preserveRoutedSessionInProjects({
    projects: [
      {
        name: 'html',
        sessions: [{ id: 'session-1', title: 'Latest visible chat' }],
        sessionMeta: { total: 10, hasMore: true },
      },
    ],
    routedSessionId: 'session-legacy',
    selectedProject: {
      name: 'html',
      sessions: [{ id: 'session-legacy', title: 'Restored routed chat' }],
      sessionMeta: { total: 10, hasMore: true },
    },
    selectedSession: { id: 'session-legacy', title: 'Restored routed chat' },
  });

  assert.equal(preserved[0].sessions[0].id, 'session-legacy');
  assert.equal(preserved[0].sessions[1].id, 'session-1');
});

test('preserveRoutedSessionInProjects leaves projects unchanged when the routed session is already present', () => {
  const projects = [
    {
      name: 'html',
      sessions: [
        { id: 'session-legacy', title: 'Restored routed chat' },
        { id: 'session-1', title: 'Latest visible chat' },
      ],
      sessionMeta: { total: 10, hasMore: true },
    },
  ];

  const preserved = preserveRoutedSessionInProjects({
    projects,
    routedSessionId: 'session-legacy',
    selectedProject: {
      name: 'html',
      sessions: [{ id: 'session-legacy', title: 'Restored routed chat' }],
      sessionMeta: { total: 10, hasMore: true },
    },
    selectedSession: { id: 'session-legacy', title: 'Restored routed chat' },
  });

  assert.deepEqual(preserved, projects);
});
