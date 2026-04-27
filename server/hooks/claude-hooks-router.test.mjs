import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import { buildEffectiveHooksView } from './claude-hooks-effective.js';
import { createClaudeHooksRouter, createDefaultClaudeHooksServices } from './claude-hooks-router.js';

test('buildEffectiveHooksView groups entries and separates writable, readonly, and session hooks', () => {
  const sources = [
    {
      id: 'project',
      kind: 'project',
      writable: true,
    },
    {
      id: 'plugin',
      kind: 'plugin',
      writable: false,
    },
    {
      id: 'session-memory:sess-1',
      kind: 'session-memory',
      writable: true,
    },
  ];

  const entries = [
    {
      id: 'project:Stop:0',
      sourceId: 'project',
      event: 'Stop',
      origin: 'project',
    },
    {
      id: 'plugin:PreToolUse:0',
      sourceId: 'plugin',
      event: 'PreToolUse',
      origin: 'plugin',
    },
    {
      id: 'session-memory:sess-1:Stop:0',
      sourceId: 'session-memory:sess-1',
      event: 'Stop',
      origin: 'session-memory-source',
    },
  ];

  const result = buildEffectiveHooksView({ sources, entries });

  assert.deepEqual(result.groupedByEvent, {
    Stop: [result.entries[0], result.entries[2]],
    PreToolUse: [result.entries[1]],
  });
  assert.deepEqual(result.writableSources, [sources[0], sources[2]]);
  assert.deepEqual(result.readonlySources, [sources[1]]);
  assert.deepEqual(result.sessionHooks.map((entry) => entry.id), ['session-memory:sess-1:Stop:0']);
  assert.equal(result.sessionHooks[0].origin, 'session-memory');
  assert.equal(result.entries[2].origin, 'session-memory');
  assert.deepEqual(result.diagnostics, []);
});

test('hooks router serves overview and effective views from injected services', async () => {
  let overviewArgs = null;
  let effectiveArgs = null;
  const router = createClaudeHooksRouter({
    services: {
      getOverview: async (input) => {
        overviewArgs = input;
        return {
        sources: [{ id: 'project', kind: 'project', writable: true }],
        entries: [{ id: 'project:Stop:0', sourceId: 'project', event: 'Stop', origin: 'project' }],
        diagnostics: [],
        capabilities: {
          writableKinds: ['project'],
          readonlyKinds: [],
        },
        };
      },
      getEffective: async (input) => {
        effectiveArgs = input;
        return {
          sources: [{ id: 'project', kind: 'project', writable: true }],
          entries: [{ id: 'project:Stop:0', sourceId: 'project', event: 'Stop', origin: 'project' }],
          groupedByEvent: {
            Stop: [{ id: 'project:Stop:0', sourceId: 'project', event: 'Stop', origin: 'project' }],
          },
          writableSources: [{ id: 'project', kind: 'project', writable: true }],
          readonlySources: [],
          sessionHooks: [],
          diagnostics: [],
        };
      },
    },
  });

  const app = express();
  app.use(express.json());
  app.use('/api/hooks', router);
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const overviewResponse = await fetch(`http://127.0.0.1:${port}/api/hooks/overview?projectPath=%2Ftmp%2Fproject&sessionId=sess-1&settingSources=%5B%22user%22%2C%22project%22%5D&plugins=%5B%7B%22id%22%3A%22plugin%3Agit%22%7D%5D`);
    const overviewBody = await overviewResponse.json();
    assert.equal(overviewResponse.status, 200);
    assert.deepEqual(overviewArgs, {
      projectPath: '/tmp/project',
      sessionId: 'sess-1',
      settingSources: ['user', 'project'],
      plugins: [{ id: 'plugin:git' }],
    });
    assert.deepEqual(overviewBody, {
      sources: [{ id: 'project', kind: 'project', writable: true }],
      entries: [{ id: 'project:Stop:0', sourceId: 'project', event: 'Stop', origin: 'project' }],
      diagnostics: [],
      capabilities: {
        writableKinds: ['project'],
        readonlyKinds: [],
      },
    });

    const effectiveResponse = await fetch(`http://127.0.0.1:${port}/api/hooks/effective?projectPath=%2Ftmp%2Fproject&sessionId=sess-1&settingSources=%5B%22user%22%2C%22project%22%5D&plugins=%5B%7B%22id%22%3A%22plugin%3Agit%22%7D%5D`);
    const effectiveBody = await effectiveResponse.json();
    assert.equal(effectiveResponse.status, 200);
    assert.deepEqual(effectiveArgs, {
      projectPath: '/tmp/project',
      sessionId: 'sess-1',
      settingSources: ['user', 'project'],
      plugins: [{ id: 'plugin:git' }],
    });
    assert.deepEqual(effectiveBody, {
      sources: [{ id: 'project', kind: 'project', writable: true }],
      entries: [{ id: 'project:Stop:0', sourceId: 'project', event: 'Stop', origin: 'project' }],
      groupedByEvent: {
        Stop: [{ id: 'project:Stop:0', sourceId: 'project', event: 'Stop', origin: 'project' }],
      },
      writableSources: [{ id: 'project', kind: 'project', writable: true }],
      readonlySources: [],
      sessionHooks: [],
      diagnostics: [],
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('hooks router serves execution list and detail from injected services', async () => {
  let executionsArgs = null;
  let executionDetailArgs = null;
  const router = createClaudeHooksRouter({
    services: {
      getOverview: async () => ({ sources: [], entries: [], diagnostics: [], capabilities: { writableKinds: [], readonlyKinds: [] } }),
      getEffective: async () => ({ sources: [], entries: [], groupedByEvent: {}, writableSources: [], readonlySources: [], sessionHooks: [], diagnostics: [] }),
      getExecutions: async (input) => {
        executionsArgs = input;
        return [{ hookId: 'hook-1', hookName: 'beforeStop', hookEvent: 'Stop', runId: 'run-1', sessionId: 'sess-1' }];
      },
      getExecutionDetail: async (input) => {
        executionDetailArgs = input;
        return {
          hookId: input.hookId,
          hookName: 'beforeStop',
          hookEvent: 'Stop',
          runId: 'run-1',
          sessionId: 'sess-1',
          stdout: 'ok\n',
          stderr: '',
          output: 'ok\n',
          exitCode: 0,
          started: null,
          progress: [],
          response: null,
          raw: { started: null, progress: [], response: null },
        };
      },
    },
  });

  const app = express();
  app.use(express.json());
  app.use('/api/hooks', router);
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const listResponse = await fetch(`http://127.0.0.1:${port}/api/hooks/events?sessionId=sess-1&runId=run-1&hookEvent=Stop&hookName=beforeStop`);
    const detailResponse = await fetch(`http://127.0.0.1:${port}/api/hooks/events/hook-1?sessionId=sess-1&runId=run-1&hookEvent=Stop&hookName=beforeStop`);

    assert.equal(listResponse.status, 200);
    assert.equal(detailResponse.status, 200);
    assert.deepEqual(executionsArgs, {
      sessionId: 'sess-1',
      runId: 'run-1',
      hookEvent: 'Stop',
      hookName: 'beforeStop',
    });
    assert.deepEqual(executionDetailArgs, {
      hookId: 'hook-1',
      sessionId: 'sess-1',
      runId: 'run-1',
      hookEvent: 'Stop',
      hookName: 'beforeStop',
    });
    assert.deepEqual(await listResponse.json(), [
      { hookId: 'hook-1', hookName: 'beforeStop', hookEvent: 'Stop', runId: 'run-1', sessionId: 'sess-1' },
    ]);
    assert.deepEqual(await detailResponse.json(), {
      hookId: 'hook-1',
      hookName: 'beforeStop',
      hookEvent: 'Stop',
      runId: 'run-1',
      sessionId: 'sess-1',
      stdout: 'ok\n',
      stderr: '',
      output: 'ok\n',
      exitCode: 0,
      started: null,
      progress: [],
      response: null,
      raw: { started: null, progress: [], response: null },
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('hooks router normalizes repeated query array values before invoking services', async () => {
  let overviewArgs = null;
  let effectiveArgs = null;
  const router = createClaudeHooksRouter({
    services: {
      getOverview: async (input) => {
        overviewArgs = input;
        return {
          sources: [],
          entries: [],
          diagnostics: [],
          capabilities: {
            writableKinds: [],
            readonlyKinds: [],
          },
        };
      },
      getEffective: async (input) => {
        effectiveArgs = input;
        return {
          sources: [],
          entries: [],
          groupedByEvent: {},
          writableSources: [],
          readonlySources: [],
          sessionHooks: [],
          diagnostics: [],
        };
      },
    },
  });

  const app = express();
  app.use(express.json());
  app.use('/api/hooks', router);
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const query = 'projectPath=%2Fa&projectPath=%2Fb&sessionId=&sessionId=sess-1&settingSources=user&settingSources=project&settingSources=%5B%22local%22%5D&plugins=%7B%22id%22%3A%22plugin%3Afirst%22%7D&plugins=%5B%7B%22id%22%3A%22plugin%3Asecond%22%7D%5D';
    const overviewResponse = await fetch(`http://127.0.0.1:${port}/api/hooks/overview?${query}`);
    const effectiveResponse = await fetch(`http://127.0.0.1:${port}/api/hooks/effective?${query}`);

    assert.equal(overviewResponse.status, 200);
    assert.equal(effectiveResponse.status, 200);
    assert.deepEqual(overviewArgs, {
      projectPath: '/b',
      sessionId: 'sess-1',
      settingSources: ['local'],
      plugins: [{ id: 'plugin:second' }],
    });
    assert.deepEqual(effectiveArgs, {
      projectPath: '/b',
      sessionId: 'sess-1',
      settingSources: ['local'],
      plugins: [{ id: 'plugin:second' }],
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('hooks router supports mutation routes and source details route', async () => {
  const calls = [];
  const router = createClaudeHooksRouter({
    services: {
      getOverview: async () => ({ sources: [], entries: [], diagnostics: [], capabilities: { writableKinds: [], readonlyKinds: [] } }),
      getEffective: async () => ({ sources: [], entries: [], groupedByEvent: {}, writableSources: [], readonlySources: [], sessionHooks: [], diagnostics: [] }),
      updateSource: async (input) => {
        calls.push({ type: 'updateSource', input });
        return { ok: true, sourceKind: input.sourceKind, sourceId: input.sourceKind === 'session-memory' ? `session-memory:${input.sessionId}` : input.sourceKind };
      },
      deleteEntry: async (input) => {
        calls.push({ type: 'deleteEntry', input });
        return { ok: true, ...input };
      },
      getSourceDetail: async (input) => {
        calls.push({ type: 'getSourceDetail', input });
        return {
          source: { id: input.sourceId, kind: 'project', writable: true },
          raw: { hooks: { Stop: [] } },
          normalized: { entries: [] },
          aboutSource: { description: 'Project settings source' },
        };
      },
    },
  });

  const app = express();
  app.use(express.json());
  app.use('/api/hooks', router);
  app.use((error, req, res, next) => {
    res.status(error?.statusCode || 500).json({ error: error?.message || 'Unknown error' });
  });
  const server = app.listen(0);

  try {
    const { port } = server.address();

    const userResponse = await fetch(`http://127.0.0.1:${port}/api/hooks/user?projectPath=%2Ftmp%2Fproject`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hooks: { Stop: [{ matcher: '', hooks: [] }] } }),
    });
    assert.equal(userResponse.status, 200);

    const sessionResponse = await fetch(`http://127.0.0.1:${port}/api/hooks/session-memory?projectPath=%2Ftmp%2Fproject&sessionId=sess-1`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hooks: { UserPromptSubmit: [{ matcher: '', hooks: [] }] } }),
    });
    assert.equal(sessionResponse.status, 200);

    const deleteResponse = await fetch(`http://127.0.0.1:${port}/api/hooks/project/project:Stop:0?projectPath=%2Ftmp%2Fproject`, {
      method: 'DELETE',
    });
    assert.equal(deleteResponse.status, 200);
    assert.deepEqual(await deleteResponse.json(), {
      ok: true,
      sourceKind: 'project',
      entryId: 'project:Stop:0',
      projectPath: '/tmp/project',
    });

    const sourceResponse = await fetch(`http://127.0.0.1:${port}/api/hooks/sources/project?projectPath=%2Ftmp%2Fproject&sessionId=sess-1`);
    assert.equal(sourceResponse.status, 200);
    assert.deepEqual(await sourceResponse.json(), {
      source: { id: 'project', kind: 'project', writable: true },
      raw: { hooks: { Stop: [] } },
      normalized: { entries: [] },
      aboutSource: { description: 'Project settings source' },
    });

    assert.deepEqual(calls, [
      {
        type: 'updateSource',
        input: {
          sourceKind: 'user',
          projectPath: '/tmp/project',
          sessionId: undefined,
          hooks: { Stop: [{ matcher: '', hooks: [] }] },
        },
      },
      {
        type: 'updateSource',
        input: {
          sourceKind: 'session-memory',
          projectPath: '/tmp/project',
          sessionId: 'sess-1',
          hooks: { UserPromptSubmit: [{ matcher: '', hooks: [] }] },
        },
      },
      {
        type: 'deleteEntry',
        input: {
          sourceKind: 'project',
          entryId: 'project:Stop:0',
          projectPath: '/tmp/project',
          sessionId: undefined,
        },
      },
      {
        type: 'getSourceDetail',
        input: {
          sourceId: 'project',
          projectPath: '/tmp/project',
          sessionId: 'sess-1',
        },
      },
    ]);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('hooks router returns readonly mutation rejection as http error', async () => {
  const router = createClaudeHooksRouter({
    services: {
      getOverview: async () => ({ sources: [], entries: [], diagnostics: [], capabilities: { writableKinds: [], readonlyKinds: [] } }),
      getEffective: async () => ({ sources: [], entries: [], groupedByEvent: {}, writableSources: [], readonlySources: [], sessionHooks: [], diagnostics: [] }),
      updateSource: async () => {
        const error = new Error('plugin is read-only');
        error.statusCode = 400;
        throw error;
      },
      deleteEntry: async () => {
        const error = new Error('plugin is read-only');
        error.statusCode = 400;
        throw error;
      },
      getSourceDetail: async () => ({ source: null, raw: null, normalized: null, aboutSource: null }),
    },
  });

  const app = express();
  app.use(express.json());
  app.use('/api/hooks', router);
  app.use((error, req, res, next) => {
    res.status(error?.statusCode || 500).json({ error: error?.message || 'Unknown error' });
  });
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/hooks/plugin/plugin:git:Stop:0`, {
      method: 'DELETE',
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'plugin is read-only' });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('default hooks services expose capabilities as writable and readonly kinds', async () => {
  const seenSettingsPaths = [];
  const seenSessionIds = [];
  const services = createDefaultClaudeHooksServices({
    homeDir: '/tmp/home',
    projectPath: '/tmp/default-project',
    discoveryOptions: {
      settingsReader: async (targetPath) => {
        seenSettingsPaths.push(targetPath);
        return {
          hooks: {
            Stop: [{ matcher: '', hooks: [{ type: 'command', command: `echo ${targetPath}` }] }],
            UserPromptSubmit: [{ matcher: '', hooks: [{ type: 'command', command: `echo ${targetPath}` }] }],
          },
        };
      },
      pluginSources: [
        { id: 'plugin:base', name: 'base', hooks: { Stop: [{ matcher: '', hooks: [] }] } },
      ],
      skillSources: [],
      subagentSources: [],
      sessionMemorySources: [],
    },
    resolveSessionMemorySources: async (sessionId) => {
      seenSessionIds.push(sessionId);
      return sessionId
        ? [{ sessionId, hooks: { UserPromptSubmit: [{ matcher: '', hooks: [{ type: 'command', command: 'echo session' }] }] } }]
        : [];
    },
  });

  const overview = await services.getOverview({
    projectPath: '/tmp/override-project',
    settingSources: ['project'],
    plugins: [
      {
        id: 'plugin:override',
        name: 'override',
        hooks: {
          PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo override' }] }],
        },
      },
    ],
    sessionId: 'sess-1',
  });

  const effective = await services.getEffective({
    projectPath: '/tmp/override-project',
    settingSources: ['project'],
    plugins: [
      {
        id: 'plugin:override',
        name: 'override',
        hooks: {
          PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo override' }] }],
        },
      },
    ],
    sessionId: 'sess-1',
  });

  assert.deepEqual(seenSettingsPaths, [
    '/tmp/home/.claude/settings.json',
    '/tmp/override-project/.claude/settings.json',
    '/tmp/override-project/.claude/settings.local.json',
    '/tmp/home/.claude/settings.json',
    '/tmp/override-project/.claude/settings.json',
    '/tmp/override-project/.claude/settings.local.json',
  ]);
  assert.deepEqual(seenSessionIds, ['sess-1', 'sess-1']);
  assert.deepEqual(effective.sources.map((source) => source.kind), [
    'project',
    'plugin',
    'session-memory',
  ]);
  assert.deepEqual(effective.entries.map((entry) => entry.sourceId), [
    'project',
    'project',
    'plugin:override',
    'session-memory:sess-1',
  ]);
  assert.deepEqual(effective.groupedByEvent.Stop.map((entry) => entry.sourceId), ['project']);
  assert.deepEqual(effective.groupedByEvent.PreToolUse.map((entry) => entry.sourceId), ['plugin:override']);
  assert.deepEqual(effective.groupedByEvent.UserPromptSubmit.map((entry) => entry.sourceId), [
    'project',
    'session-memory:sess-1',
  ]);
  assert.equal(effective.sessionHooks[0].origin, 'session-memory');
  assert.deepEqual(overview.capabilities, {
    writableKinds: ['project', 'session-memory'],
    readonlyKinds: ['plugin'],
  });
});

test('default hooks services tolerate repeated query array inputs without 500ing', async () => {
  const services = createDefaultClaudeHooksServices({
    homeDir: '/tmp/home',
    projectPath: '/tmp/default-project',
    discoveryOptions: {
      settingsReader: async () => ({ hooks: {} }),
      pluginSources: [],
      skillSources: [],
      subagentSources: [],
      sessionMemorySources: [],
    },
  });

  const overview = await services.getOverview({
    projectPath: ['/tmp/a', '/tmp/b'],
    sessionId: ['', 'sess-2'],
    settingSources: ['user', 'project'],
    plugins: [{ id: 'plugin:first' }, { id: 'plugin:last' }],
  });

  assert.ok(Array.isArray(overview.sources));
  assert.ok(Array.isArray(overview.entries));
  assert.equal(overview.capabilities.writableKinds.includes('project'), true);
});

test('default hooks services preserve legitimate settingSources and plugin arrays', async () => {
  const seenPlugins = [];
  const services = createDefaultClaudeHooksServices({
    homeDir: '/tmp/home',
    projectPath: '/tmp/default-project',
    discoveryOptions: {
      settingsReader: async () => ({ hooks: {} }),
      pluginSources: [],
      skillSources: [],
      subagentSources: [],
      sessionMemorySources: [],
    },
  });

  const overview = await services.getOverview({
    projectPath: '/tmp/project',
    settingSources: ['user', 'project', 'local'],
    plugins: [
      { id: 'plugin:first', name: 'first', hooks: { Stop: [] } },
      { id: 'plugin:second', name: 'second', hooks: { Stop: [] } },
    ],
  });

  seenPlugins.push(...overview.sources.filter((source) => source.kind === 'plugin').map((source) => source.id));

  assert.deepEqual(overview.sources.filter((source) => source.kind !== 'plugin').map((source) => source.kind), [
    'user',
    'project',
    'local',
  ]);
  assert.deepEqual(seenPlugins, ['plugin:first', 'plugin:second']);
});

test('default hooks services pass execution filters through injected event provider', async () => {
  const calls = [];
  const services = createDefaultClaudeHooksServices({
    discoveryOptions: {
      settingsReader: async () => ({ hooks: {} }),
      pluginSources: [],
      skillSources: [],
      subagentSources: [],
      sessionMemorySources: [],
    },
    hookEventsProvider: {
      listHookEvents: async (input) => {
        calls.push(input);
        return [];
      },
    },
  });

  const list = await services.getExecutions({
    sessionId: 'sess-1',
    runId: 'run-1',
    hookEvent: 'Stop',
    hookName: 'beforeStop',
  });
  const detail = await services.getExecutionDetail({
    hookId: 'hook-1',
    sessionId: 'sess-1',
    runId: 'run-1',
    hookEvent: 'Stop',
    hookName: 'beforeStop',
  });

  assert.deepEqual(list, []);
  assert.equal(detail, null);
  assert.deepEqual(calls, [
    {
      sessionId: 'sess-1',
      runId: 'run-1',
      hookEvent: 'Stop',
      hookName: 'beforeStop',
    },
    {
      hookId: 'hook-1',
      sessionId: 'sess-1',
      runId: 'run-1',
      hookEvent: 'Stop',
      hookName: 'beforeStop',
    },
  ]);
});

test('default hooks services use detail filters to select the matching execution', async () => {
  const services = createDefaultClaudeHooksServices({
    discoveryOptions: {
      settingsReader: async () => ({ hooks: {} }),
      pluginSources: [],
      skillSources: [],
      subagentSources: [],
      sessionMemorySources: [],
    },
    hookEventsProvider: {
      listHookEvents: async () => [
        createHookEvent({
          eventId: 'evt-1',
          type: 'sdk.hook.started',
          sequence: 10,
          runId: 'run-1',
          sessionId: 'sess-1',
          hookId: 'hook-1',
          hookName: 'beforeStop',
          hookEvent: 'Stop',
        }),
        createHookEvent({
          eventId: 'evt-2',
          type: 'sdk.hook.response',
          sequence: 11,
          runId: 'run-1',
          sessionId: 'sess-1',
          hookId: 'hook-1',
          hookName: 'beforeStop',
          hookEvent: 'Stop',
          output: 'first\n',
          exitCode: 0,
        }),
        createHookEvent({
          eventId: 'evt-3',
          type: 'sdk.hook.started',
          sequence: 12,
          runId: 'run-2',
          sessionId: 'sess-2',
          hookId: 'hook-1',
          hookName: 'beforeTool',
          hookEvent: 'PreToolUse',
        }),
        createHookEvent({
          eventId: 'evt-4',
          type: 'sdk.hook.response',
          sequence: 13,
          runId: 'run-2',
          sessionId: 'sess-2',
          hookId: 'hook-1',
          hookName: 'beforeTool',
          hookEvent: 'PreToolUse',
          output: 'second\n',
          exitCode: 8,
        }),
      ],
    },
  });

  const detail = await services.getExecutionDetail({
    hookId: 'hook-1',
    sessionId: 'sess-2',
    runId: 'run-2',
    hookEvent: 'PreToolUse',
    hookName: 'beforeTool',
  });

  assert.deepEqual({
    runId: detail?.runId,
    sessionId: detail?.sessionId,
    hookEvent: detail?.hookEvent,
    hookName: detail?.hookName,
    output: detail?.output,
    exitCode: detail?.exitCode,
  }, {
    runId: 'run-2',
    sessionId: 'sess-2',
    hookEvent: 'PreToolUse',
    hookName: 'beforeTool',
    output: 'second\n',
    exitCode: 8,
  });
});

test('default hooks services return null when detail filters do not match any execution', async () => {
  const services = createDefaultClaudeHooksServices({
    discoveryOptions: {
      settingsReader: async () => ({ hooks: {} }),
      pluginSources: [],
      skillSources: [],
      subagentSources: [],
      sessionMemorySources: [],
    },
    hookEventsProvider: {
      listHookEvents: async () => [
        createHookEvent({
          eventId: 'evt-1',
          type: 'sdk.hook.started',
          sequence: 10,
          runId: 'run-1',
          sessionId: 'sess-1',
          hookId: 'hook-1',
          hookName: 'beforeStop',
          hookEvent: 'Stop',
        }),
        createHookEvent({
          eventId: 'evt-2',
          type: 'sdk.hook.response',
          sequence: 11,
          runId: 'run-1',
          sessionId: 'sess-1',
          hookId: 'hook-1',
          hookName: 'beforeStop',
          hookEvent: 'Stop',
          output: 'first\n',
          exitCode: 0,
        }),
      ],
    },
  });

  const detail = await services.getExecutionDetail({
    hookId: 'hook-1',
    sessionId: 'sess-x',
    runId: 'run-x',
    hookEvent: 'PreToolUse',
    hookName: 'beforeTool',
  });

  assert.equal(detail, null);
});

function createHookEvent({
  eventId,
  type,
  sequence,
  runId,
  sessionId,
  ...payload
}) {
  return {
    eventId,
    type,
    sequence,
    runId,
    sessionId,
    timestamp: `2026-04-21T00:00:${String(sequence).padStart(2, '0')}.000Z`,
    payload,
  };
}

test('default hooks services treat repeated query fragments as last-wins input', async () => {
  const services = createDefaultClaudeHooksServices({
    homeDir: '/tmp/home',
    projectPath: '/tmp/default-project',
    discoveryOptions: {
      settingsReader: async () => ({ hooks: {} }),
      pluginSources: [],
      skillSources: [],
      subagentSources: [],
      sessionMemorySources: [],
    },
  });

  const overview = await services.getOverview({
    settingSources: ['["user"]', '["project"]'],
    plugins: ['{"id":"plugin:first"}', '{"id":"plugin:last"}'],
  });

  assert.deepEqual(overview.sources.filter((source) => source.kind === 'project').map((source) => source.kind), ['project']);
  assert.deepEqual(overview.sources.filter((source) => source.kind === 'plugin').map((source) => source.id), ['plugin:last']);
});

test('default hooks services return real readonly source detail for plugin sources', async () => {
  const services = createDefaultClaudeHooksServices({
    homeDir: '/tmp/home',
    projectPath: '/tmp/default-project',
    discoveryOptions: {
      settingsReader: async () => ({ hooks: {} }),
      pluginSources: [
        {
          id: 'plugin:git',
          name: 'git-helper',
          path: '/tmp/plugins/git/hooks.json',
          hooks: {
            PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo plugin' }] }],
          },
        },
      ],
      skillSources: [],
      subagentSources: [],
      sessionMemorySources: [],
    },
  });

  const detail = await services.getSourceDetail({
    sourceId: 'plugin:git',
    projectPath: '/tmp/project',
  });

  assert.deepEqual(detail.source, {
    id: 'plugin:git',
    kind: 'plugin',
    label: 'git-helper',
    path: '/tmp/plugins/git/hooks.json',
    writable: false,
    priority: 40,
    pluginName: 'git-helper',
    skillName: null,
    subagentName: null,
    description: 'Read-only hook source contributed by a Claude plugin.',
  });
  assert.deepEqual(detail.raw, {
    hooks: {
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo plugin' }] }],
    },
  });
  assert.deepEqual(detail.normalized.entries, [
    {
      id: 'plugin:git:PreToolUse:0',
      sourceId: 'plugin:git',
      event: 'PreToolUse',
      matcher: 'Bash',
      hooks: [{ type: 'command', command: 'echo plugin' }],
      timeout: null,
      enabled: true,
      readonly: true,
      origin: 'plugin',
      raw: { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo plugin' }] },
    },
  ]);
  assert.deepEqual(detail.aboutSource, {
    id: 'plugin:git',
    kind: 'plugin',
    label: 'git-helper',
    writable: false,
    path: '/tmp/plugins/git/hooks.json',
    description: 'Read-only hook source contributed by a Claude plugin.',
  });
});
