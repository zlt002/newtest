import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import express from 'express';

import { createAgentV2Router } from './agent-v2.js';
import commandsRouter from './commands.js';
import { createSessionHistoryService } from '../services/agent/history/session-history-service.js';
import { createOfficialHistoryReader } from '../services/agent/history/official-history-reader.js';
import { defaultAgentV2Repository, defaultAgentV2Runtime } from '../services/agent/default-services.js';

const closeServer = async (server) => {
  if (!server?.listening) {
    return;
  }

  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
};

const listenServer = async (app) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to determine test server port');
  }

  return { server, port: address.port };
};

test('agent v2 router exposes session-first endpoints', () => {
  const router = createAgentV2Router({
    services: {
      createSession: async () => ({
        id: 'sess-1',
        title: '新会话',
      }),
      getSession: async () => ({
        id: 'sess-1',
        title: '新会话',
      }),
      getSessionHistory: async () => ({
        sessionId: 'sess-1',
        cwd: '/tmp/project',
        metadata: {
          title: '新会话',
          pinned: false,
          starred: false,
          lastViewedAt: null,
        },
        messages: [],
        diagnosticsSummary: {
          officialMessageCount: 0,
          debugLogAvailable: false,
        },
      }),
      startSessionRun: async () => ({
        session: { id: 'sess-1' },
        run: { id: 'run-1' },
        sessionId: 'sess-1',
      }),
      continueSessionRun: async () => ({
        run: { id: 'run-2' },
        sessionId: 'sess-1',
      }),
      abortRun: async () => ({ ok: true }),
    },
  });

  const routeEntries = router.stack
    .map((layer) => {
      if (!layer.route?.path) {
        return null;
      }

      return {
        path: layer.route.path,
        methods: Object.keys(layer.route.methods || {}),
      };
    })
    .filter(Boolean);
  const routePaths = routeEntries.map((entry) => entry.path);
  const sessionRunsRoute = routeEntries.find((entry) => entry.path === '/sessions/:id/runs');
  const runEventsRoute = routeEntries.find((entry) => entry.path === '/runs/:id/events');

  assert.ok(routePaths.includes('/sessions'));
  assert.ok(routePaths.includes('/sessions/:id'));
  assert.ok(routePaths.includes('/sessions/:id/runs'));
  assert.deepEqual(sessionRunsRoute?.methods, ['post']);
  assert.ok(routePaths.includes('/sessions/:id/history'));
  assert.equal(routePaths.includes('/conversations'), false);
  assert.equal(routePaths.includes('/conversations/:id'), false);
  assert.equal(routePaths.includes('/conversations/:id/runs'), false);
  assert.ok(routePaths.includes('/runs/:id/abort'));
  assert.equal(runEventsRoute, undefined);
});

test('agent v2 history endpoint defaults to the tail page when no limit is provided', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-v2-history-route-'));
  const projectDir = path.join(tempRoot, '-Users-demo-project');
  await mkdir(projectDir, { recursive: true });

  await writeFile(
    path.join(projectDir, 'sess-route-hard.jsonl'),
    [
      JSON.stringify({
        sessionId: 'sess-route-hard',
        cwd: '/Users/demo/project',
        type: 'user',
        uuid: 'u-route-1',
        timestamp: '2026-04-23T01:50:50.430Z',
        message: {
          role: 'user',
          content: [{ type: 'text', text: '继续查询更多高级功能，包括 hooks、消息类型、权限管理等。' }],
        },
      }),
      JSON.stringify({
        sessionId: 'sess-route-hard',
        type: 'assistant',
        uuid: 'a-route-1',
        timestamp: '2026-04-23T01:50:57.176Z',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Let me get more details about message types, cancellation, and other advanced features.' }],
        },
      }),
      JSON.stringify({
        sessionId: 'sess-route-hard',
        type: 'summary',
        summary: 'advanced sdk doc search',
      }),
    ].join('\n'),
  );

  const services = {
    createSession: async () => ({ id: 'unused', title: 'unused' }),
    getSession: async () => ({ id: 'sess-route-hard', title: 'History session' }),
    getSessionHistory: createSessionHistoryService({
      officialHistoryReader: createOfficialHistoryReader({ claudeProjectsRoot: tempRoot }),
      sessionNamesDb: {
        getName(sessionId, provider) {
          assert.equal(sessionId, 'sess-route-hard');
          assert.equal(provider, 'claude');
          return '对账会话';
        },
      },
      hasSessionLogs(sessionId) {
        assert.equal(sessionId, 'sess-route-hard');
        return true;
      },
    }).getSessionHistory,
    startSessionRun: async () => ({ sessionId: 'unused', run: { id: 'unused' }, session: { id: 'unused' } }),
    continueSessionRun: async () => ({ sessionId: 'unused', run: { id: 'unused' } }),
    abortRun: async () => ({ ok: true }),
  };

  const app = express();
  app.use('/api/agent-v2', createAgentV2Router({ services }));
  const { server, port } = await listenServer(app);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/agent-v2/sessions/sess-route-hard/history`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.messages.length, 2);
    assert.deepEqual(body, {
      sessionId: 'sess-route-hard',
      cwd: '/Users/demo/project',
      metadata: {
        title: '对账会话',
        pinned: false,
        starred: false,
        lastViewedAt: null,
      },
      messages: [
        {
          id: 'u-route-1_0',
          sessionId: 'sess-route-hard',
          role: 'user',
          text: '继续查询更多高级功能，包括 hooks、消息类型、权限管理等。',
          timestamp: '2026-04-23T01:50:50.430Z',
          kind: 'text',
          rawType: 'user',
          source: 'session',
          content: '继续查询更多高级功能，包括 hooks、消息类型、权限管理等。',
        },
        {
          id: 'a-route-1_0',
          sessionId: 'sess-route-hard',
          role: 'assistant',
          text: 'Let me get more details about message types, cancellation, and other advanced features.',
          timestamp: '2026-04-23T01:50:57.176Z',
          kind: 'text',
          rawType: 'assistant',
          source: 'session',
          content: 'Let me get more details about message types, cancellation, and other advanced features.',
        },
      ],
      page: {
        offset: 0,
        limit: 40,
        returned: 2,
        total: 2,
        hasMore: false,
      },
      diagnosticsSummary: {
        officialMessageCount: 2,
        debugLogAvailable: true,
        agentMessageCount: 0,
        debugAugmentedCount: 0,
        historySourceCoverage: 'official-only',
      },
    });

    const overflowResponse = await fetch(`http://127.0.0.1:${port}/api/agent-v2/sessions/sess-route-hard/history?limit=40&offset=999`);
    const overflowBody = await overflowResponse.json();

    assert.equal(overflowResponse.status, 200);
    assert.deepEqual(overflowBody.page, {
      offset: 2,
      limit: 40,
      returned: 0,
      total: 2,
      hasMore: false,
    });
    assert.deepEqual(overflowBody.messages, []);
  } finally {
    await closeServer(server);
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('agent v2 history endpoint rejects invalid pagination params with 400', async () => {
  const app = express();
  app.use('/api/agent-v2', createAgentV2Router({
    services: {
      createSession: async () => ({ id: 'unused' }),
      getSession: async () => ({ id: 'unused' }),
      getSessionHistory: async () => {
        throw new Error('should not be called');
      },
      startSessionRun: async () => ({ sessionId: 'unused', run: { id: 'unused' }, session: { id: 'unused' } }),
      continueSessionRun: async () => ({ sessionId: 'unused', run: { id: 'unused' } }),
      abortRun: async () => ({ ok: true }),
    },
  }));

  const { server, port } = await listenServer(app);

  try {
    const cases = [
      '/api/agent-v2/sessions/sess-invalid/history?limit=0',
      '/api/agent-v2/sessions/sess-invalid/history?offset=-1',
      '/api/agent-v2/sessions/sess-invalid/history?limit=1abc',
      '/api/agent-v2/sessions/sess-invalid/history?offset=3.7',
    ];

    for (const url of cases) {
      const response = await fetch(`http://127.0.0.1:${port}${url}`);
      const body = await response.json();
      assert.equal(response.status, 400);
      assert.match(body.error, /limit|offset/);
    }
  } finally {
    await closeServer(server);
  }
});

test('agent v2 history endpoint returns an empty page for empty history', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-v2-history-empty-'));
  const projectDir = path.join(tempRoot, '-Users-demo-project');
  await mkdir(projectDir, { recursive: true });

  await writeFile(path.join(projectDir, 'sess-empty-route.jsonl'), '');

  const services = {
    createSession: async () => ({ id: 'unused', title: 'unused' }),
    getSession: async () => ({ id: 'sess-empty-route', title: 'Empty history' }),
    getSessionHistory: createSessionHistoryService({
      officialHistoryReader: createOfficialHistoryReader({ claudeProjectsRoot: tempRoot }),
      sessionNamesDb: {
        getName() {
          return null;
        },
      },
    }).getSessionHistory,
    startSessionRun: async () => ({ sessionId: 'unused', run: { id: 'unused' }, session: { id: 'unused' } }),
    continueSessionRun: async () => ({ sessionId: 'unused', run: { id: 'unused' } }),
    abortRun: async () => ({ ok: true }),
  };

  const app = express();
  app.use('/api/agent-v2', createAgentV2Router({ services }));
  const { server, port } = await listenServer(app);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/agent-v2/sessions/sess-empty-route/history`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.page, {
      offset: 0,
      limit: 40,
      returned: 0,
      total: 0,
      hasMore: false,
    });
    assert.deepEqual(body.messages, []);
    assert.deepEqual(body.diagnosticsSummary, {
      officialMessageCount: 0,
      debugLogAvailable: false,
      agentMessageCount: 0,
      debugAugmentedCount: 0,
      historySourceCoverage: 'official-only',
    });
  } finally {
    await closeServer(server);
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('agent v2 history endpoint paginates from the tail by default when limit is provided without offset', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-v2-history-pagination-'));
  const projectDir = path.join(tempRoot, '-Users-demo-project');
  await mkdir(projectDir, { recursive: true });

  const messages = Array.from({ length: 280 }, (_, index) => ({
    sessionId: 'sess-pagination',
    cwd: '/Users/demo/project',
    type: 'user',
    uuid: `u-${String(index + 1).padStart(3, '0')}`,
    timestamp: new Date(Date.UTC(2026, 3, 23, 1, 0, 0) + (index * 60_000)).toISOString(),
    message: {
      role: 'user',
      content: [{ type: 'text', text: `message-${index + 1}` }],
    },
  }));

  await writeFile(
    path.join(projectDir, 'sess-pagination.jsonl'),
    messages.map((entry) => JSON.stringify(entry)).join('\n'),
  );

  const services = {
    createSession: async () => ({ id: 'unused', title: 'unused' }),
    getSession: async () => ({ id: 'sess-pagination', title: 'History session' }),
    getSessionHistory: createSessionHistoryService({
      officialHistoryReader: createOfficialHistoryReader({ claudeProjectsRoot: tempRoot }),
      sessionNamesDb: {
        getName() {
          return '分页会话';
        },
      },
    }).getSessionHistory,
    startSessionRun: async () => ({ sessionId: 'unused', run: { id: 'unused' }, session: { id: 'unused' } }),
    continueSessionRun: async () => ({ sessionId: 'unused', run: { id: 'unused' } }),
    abortRun: async () => ({ ok: true }),
  };

  const app = express();
  app.use('/api/agent-v2', createAgentV2Router({ services }));
  const { server, port } = await listenServer(app);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/agent-v2/sessions/sess-pagination/history?limit=40`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.messages.length, 40);
    assert.equal(body.messages[0].text, 'message-241');
    assert.equal(body.messages.at(-1).text, 'message-280');
    assert.deepEqual(body.page, {
      offset: 240,
      limit: 40,
      returned: 40,
      total: 280,
      hasMore: true,
    });
  } finally {
    await closeServer(server);
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('agent v2 history endpoint supports explicit offset paging and full mode', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-v2-history-full-'));
  const projectDir = path.join(tempRoot, '-Users-demo-project');
  await mkdir(projectDir, { recursive: true });

  const messages = Array.from({ length: 280 }, (_, index) => ({
    sessionId: 'sess-full',
    cwd: '/Users/demo/project',
    type: 'assistant',
    uuid: `a-${String(index + 1).padStart(3, '0')}`,
    timestamp: new Date(Date.UTC(2026, 3, 23, 2, 0, 0) + (index * 60_000)).toISOString(),
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: `assistant-${index + 1}` }],
    },
  }));

  await writeFile(
    path.join(projectDir, 'sess-full.jsonl'),
    messages.map((entry) => JSON.stringify(entry)).join('\n'),
  );

  const services = {
    createSession: async () => ({ id: 'unused', title: 'unused' }),
    getSession: async () => ({ id: 'sess-full', title: 'History session' }),
    getSessionHistory: createSessionHistoryService({
      officialHistoryReader: createOfficialHistoryReader({ claudeProjectsRoot: tempRoot }),
      sessionNamesDb: {
        getName() {
          return '全量会话';
        },
      },
    }).getSessionHistory,
    startSessionRun: async () => ({ sessionId: 'unused', run: { id: 'unused' }, session: { id: 'unused' } }),
    continueSessionRun: async () => ({ sessionId: 'unused', run: { id: 'unused' } }),
    abortRun: async () => ({ ok: true }),
  };

  const app = express();
  app.use('/api/agent-v2', createAgentV2Router({ services }));
  const { server, port } = await listenServer(app);

  try {
    const pagedResponse = await fetch(`http://127.0.0.1:${port}/api/agent-v2/sessions/sess-full/history?limit=40&offset=240`);
    const pagedBody = await pagedResponse.json();

    assert.equal(pagedResponse.status, 200);
    assert.equal(pagedBody.messages.length, 40);
    assert.equal(pagedBody.messages[0].text, 'assistant-241');
    assert.equal(pagedBody.messages.at(-1).text, 'assistant-280');
    assert.deepEqual(pagedBody.page, {
      offset: 240,
      limit: 40,
      returned: 40,
      total: 280,
      hasMore: true,
    });

    const fullResponse = await fetch(`http://127.0.0.1:${port}/api/agent-v2/sessions/sess-full/history?full=1`);
    const fullBody = await fullResponse.json();

    assert.equal(fullResponse.status, 200);
    assert.equal(fullBody.messages.length, 280);
    assert.equal(fullBody.messages[0].text, 'assistant-1');
    assert.equal(fullBody.messages.at(-1).text, 'assistant-280');
    assert.deepEqual(fullBody.page, {
      offset: 0,
      limit: null,
      returned: 280,
      total: 280,
      hasMore: false,
    });
  } finally {
    await closeServer(server);
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('default agent v2 services wire an ephemeral run state store instead of sqlite repository', async () => {
  const sourcePath = path.resolve(process.cwd(), 'server/services/agent/default-services.js');
  const source = await readFile(sourcePath, 'utf8');
  const run = await defaultAgentV2Repository.createRun({
    sessionId: null,
    userInput: 'default store smoke',
  });

  assert.equal(source.includes('createSqliteAgentV2Repository'), false);
  assert.equal(run.status, 'queued');
  assert.deepEqual(await defaultAgentV2Repository.listRunEvents(run.id), []);
});

test('commands list returns local UI commands and runtime command catalog entries', async () => {
  const originalGetCommandCatalog = defaultAgentV2Runtime.getCommandCatalog;
  defaultAgentV2Runtime.getCommandCatalog = async (sessionId, options = {}) => {
    assert.equal(sessionId, 'sess-1');
    assert.equal(options.projectPath, '/tmp/project');
    assert.deepEqual(options.toolsSettings, {
      allowedTools: ['Read', 'Skill'],
      skipPermissions: true,
    });
    assert.ok(Array.isArray(options.plugins));
    return {
      localUi: [],
      runtime: [
        { name: '/skills', description: 'List skills', argumentHint: '' },
      ],
      skills: [
        { name: 'analysis', description: 'Analyze codebase', argumentHint: '' },
      ],
    };
  };

  const app = express();
  app.use(express.json());
  app.use('/api/commands', commandsRouter);
  const { server, port } = await listenServer(app);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/commands/list`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        projectPath: '/tmp/project',
        sessionId: 'sess-1',
        toolsSettings: {
          allowedTools: ['Read', 'Skill'],
          skipPermissions: true,
        },
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.runtime, [
      { name: '/skills', description: 'List skills', argumentHint: '' },
    ]);
    assert.deepEqual(body.skills, [
      { name: 'analysis', description: 'Analyze codebase', argumentHint: '' },
    ]);
  } finally {
    defaultAgentV2Runtime.getCommandCatalog = originalGetCommandCatalog;
    await closeServer(server);
  }
});

test('commands list returns runtime catalog entries without injecting local-only model commands', async () => {
  const originalGetCommandCatalog = defaultAgentV2Runtime.getCommandCatalog;
  defaultAgentV2Runtime.getCommandCatalog = async () => ({
    localUi: [],
    runtime: [
      { name: '/compact', description: 'Compact conversation', argumentHint: '' },
    ],
    skills: [],
  });

  const app = express();
  app.use(express.json());
  app.use('/api/commands', commandsRouter);
  const { server, port } = await listenServer(app);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/commands/list`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        projectPath: '/tmp/project',
        sessionId: 'sess-model-missing',
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.runtime, [
      { name: '/compact', description: 'Compact conversation', argumentHint: '' },
    ]);
  } finally {
    defaultAgentV2Runtime.getCommandCatalog = originalGetCommandCatalog;
    await closeServer(server);
  }
});

test('commands list preserves runtime /model only when the SDK catalog already exposes it', async () => {
  const originalGetCommandCatalog = defaultAgentV2Runtime.getCommandCatalog;
  defaultAgentV2Runtime.getCommandCatalog = async () => ({
    localUi: [],
    runtime: [
      {
        name: '/model',
        description: 'View or switch the active Claude model',
        argumentHint: '[model]',
        metadata: {
          group: 'claude-runtime',
          executeLocally: true,
          injected: true,
        },
      },
      { name: '/compact', description: 'Compact conversation', argumentHint: '' },
    ],
    skills: [],
  });

  const app = express();
  app.use(express.json());
  app.use('/api/commands', commandsRouter);
  const { server, port } = await listenServer(app);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/commands/list`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        projectPath: '/tmp/project',
        sessionId: 'sess-model-present',
      }),
    });
    const body = await response.json();
    const modelCommands = body.runtime.filter((command) => command.name === '/model');

    assert.equal(response.status, 200);
    assert.equal(body.runtime.length, 2);
    assert.equal(modelCommands.length, 1);
    assert.deepEqual(body.runtime, [
      {
        name: '/model',
        description: 'View or switch the active Claude model',
        argumentHint: '[model]',
        metadata: {
          group: 'claude-runtime',
          executeLocally: true,
          injected: true,
        },
      },
      { name: '/compact', description: 'Compact conversation', argumentHint: '' },
    ]);
  } finally {
    defaultAgentV2Runtime.getCommandCatalog = originalGetCommandCatalog;
    await closeServer(server);
  }
});

test('commands list does not 500 when command catalog falls back from a stale session id', async () => {
  const originalGetCommandCatalog = defaultAgentV2Runtime.getCommandCatalog;
  defaultAgentV2Runtime.getCommandCatalog = async (sessionId, options = {}) => {
    assert.equal(sessionId, 'sess-stale');
    assert.equal(options.projectPath, '/tmp/project');
    assert.deepEqual(options.toolsSettings, {
      allowedTools: ['Read'],
    });
    assert.ok(Array.isArray(options.plugins));
    return {
      localUi: [],
      runtime: [
        { name: '/compact', description: 'Compact conversation', argumentHint: '' },
        { name: '/context', description: 'Show current context usage', argumentHint: '' },
      ],
      skills: [],
    };
  };

  const app = express();
  app.use(express.json());
  app.use('/api/commands', commandsRouter);
  const { server, port } = await listenServer(app);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/commands/list`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        projectPath: '/tmp/project',
        sessionId: 'sess-stale',
        toolsSettings: {
          allowedTools: ['Read'],
        },
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.runtime, [
      { name: '/compact', description: 'Compact conversation', argumentHint: '' },
      { name: '/context', description: 'Show current context usage', argumentHint: '' },
    ]);
    assert.deepEqual(body.skills, []);
  } finally {
    defaultAgentV2Runtime.getCommandCatalog = originalGetCommandCatalog;
    await closeServer(server);
  }
});

test('commands list loads enabled Claude plugins and forwards them to the runtime catalog probe', async () => {
  const originalGetCommandCatalog = defaultAgentV2Runtime.getCommandCatalog;
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;
  const tempHome = await mkdtemp(path.join(os.tmpdir(), 'ccui-home-'));
  const tempProject = await mkdtemp(path.join(os.tmpdir(), 'ccui-project-'));
  const claudeDir = path.join(tempHome, '.claude');
  const pluginsDir = path.join(claudeDir, 'plugins');

  await mkdir(pluginsDir, { recursive: true });
  await writeFile(
    path.join(claudeDir, 'settings.json'),
    JSON.stringify({
      enabledPlugins: {
        'superpowers@claude-plugins-official': true,
      },
    }),
  );
  await writeFile(
    path.join(pluginsDir, 'installed_plugins.json'),
    JSON.stringify({
      version: 2,
      plugins: {
        'superpowers@claude-plugins-official': [
          { scope: 'user', installPath: '/tmp/plugins/superpowers/5.0.7' },
        ],
      },
    }),
  );

  defaultAgentV2Runtime.getCommandCatalog = async (sessionId, options = {}) => {
    assert.equal(sessionId, 'sess-plugins');
    assert.deepEqual(options.plugins, [{ type: 'local', path: '/tmp/plugins/superpowers/5.0.7' }]);
    return { localUi: [], runtime: [], skills: [] };
  };
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;

  const app = express();
  app.use(express.json());
  app.use('/api/commands', commandsRouter);
  const { server, port } = await listenServer(app);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/commands/list`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        projectPath: tempProject,
        sessionId: 'sess-plugins',
      }),
    });

    assert.equal(response.status, 200);
  } finally {
    defaultAgentV2Runtime.getCommandCatalog = originalGetCommandCatalog;
    process.env.HOME = originalHome;
    process.env.USERPROFILE = originalUserProfile;
    await closeServer(server);
    await rm(tempHome, { recursive: true, force: true });
    await rm(tempProject, { recursive: true, force: true });
  }
});

test('commands list refreshes the live session catalog before returning runtime slash commands', async () => {
  const originalGetLiveSession = defaultAgentV2Runtime.getLiveSession;
  const originalGetCommandCatalog = defaultAgentV2Runtime.getCommandCatalog;
  let refreshCalls = 0;
  let probeCalls = 0;

  defaultAgentV2Runtime.getLiveSession = (sessionId) => {
    assert.equal(sessionId, 'sess-live-refresh');
    return {
      async refreshCommandCatalog() {
        refreshCalls += 1;
        return {
          localUi: [],
          runtime: [
            { name: '/superpowers:brainstorming', description: 'Brainstorm with superpowers', argumentHint: '' },
          ],
          skills: [],
        };
      },
    };
  };
  defaultAgentV2Runtime.getCommandCatalog = async (sessionId) => {
    assert.equal(sessionId, null);
    probeCalls += 1;
    return {
      localUi: [],
      runtime: [
        { name: '/compact', description: 'Compact conversation', argumentHint: '' },
      ],
      skills: [
        { name: 'analysis', description: 'Analyze codebase', argumentHint: '' },
      ],
    };
  };

  const app = express();
  app.use(express.json());
  app.use('/api/commands', commandsRouter);
  const { server, port } = await listenServer(app);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/commands/list`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        projectPath: '/tmp/project',
        sessionId: 'sess-live-refresh',
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.runtime, [
      { name: '/compact', description: 'Compact conversation', argumentHint: '' },
      { name: '/superpowers:brainstorming', description: 'Brainstorm with superpowers', argumentHint: '' },
    ]);
    assert.deepEqual(body.skills, [
      { name: 'analysis', description: 'Analyze codebase', argumentHint: '' },
    ]);
    assert.equal(refreshCalls, 1);
    assert.equal(probeCalls, 1);
  } finally {
    defaultAgentV2Runtime.getLiveSession = originalGetLiveSession;
    defaultAgentV2Runtime.getCommandCatalog = originalGetCommandCatalog;
    await closeServer(server);
  }
});

test('commands list keeps project and user custom commands discoverable with executable paths', async () => {
  const originalGetCommandCatalog = defaultAgentV2Runtime.getCommandCatalog;
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;
  const tempHome = await mkdtemp(path.join(os.tmpdir(), 'ccui-home-'));
  const tempProject = await mkdtemp(path.join(os.tmpdir(), 'ccui-project-'));
  const projectCommandsDir = path.join(tempProject, '.claude', 'commands');
  const userCommandsDir = path.join(tempHome, '.claude', 'commands');
  const projectCommandPath = path.join(projectCommandsDir, 'deploy.md');
  const userCommandPath = path.join(userCommandsDir, 'review.md');

  defaultAgentV2Runtime.getCommandCatalog = async () => ({ localUi: [], runtime: [], skills: [] });
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;

  await mkdir(projectCommandsDir, { recursive: true });
  await mkdir(userCommandsDir, { recursive: true });
  await writeFile(projectCommandPath, '---\ndescription: Deploy app\n---\necho deploy\n');
  await writeFile(userCommandPath, '---\ndescription: Review changes\n---\necho review\n');

  const app = express();
  app.use(express.json());
  app.use('/api/commands', commandsRouter);
  const { server, port } = await listenServer(app);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/commands/list`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ projectPath: tempProject, sessionId: 'sess-1' }),
    });
    const body = await response.json();
    const projectCommand = body.localUi.find((command) => command.name === '/deploy');
    const userCommand = body.localUi.find((command) => command.name === '/review');

    assert.equal(response.status, 200);
    assert.equal(projectCommand?.path, projectCommandPath);
    assert.equal(projectCommand?.namespace, 'project');
    assert.equal(userCommand?.path, userCommandPath);
    assert.equal(userCommand?.namespace, 'user');
  } finally {
    defaultAgentV2Runtime.getCommandCatalog = originalGetCommandCatalog;
    process.env.HOME = originalHome;
    process.env.USERPROFILE = originalUserProfile;
    await closeServer(server);
    await rm(tempHome, { recursive: true, force: true });
    await rm(tempProject, { recursive: true, force: true });
  }
});

test('commands execute does not load or inject a native skill file', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/commands', commandsRouter);
  const { server, port } = await listenServer(app);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/commands/execute`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        commandName: '/brainstorming',
        context: { projectPath: '/tmp/project' },
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.message, /runtime command/i);
  } finally {
    await closeServer(server);
  }
});

test('commands execute does not locally intercept Claude runtime slash commands like /compact', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/commands', commandsRouter);
  const { server, port } = await listenServer(app);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/commands/execute`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        commandName: '/compact',
        args: ['focus', 'api'],
        context: { projectPath: '/tmp/project' },
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.message, /runtime command/i);
  } finally {
    await closeServer(server);
  }
});

test('commands execute returns current and available models for /model without arguments', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/commands', commandsRouter);
  const { server, port } = await listenServer(app);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/commands/execute`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        commandName: '/model',
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      type: 'builtin',
      action: 'model',
      command: '/model',
      data: {
        current: {
          provider: 'claude',
          model: 'sonnet',
        },
        available: {
          claude: ['sonnet', 'opus', 'haiku', 'opusplan', 'sonnet[1m]'],
        },
        message: 'Current model: sonnet',
      },
    });
  } finally {
    await closeServer(server);
  }
});

test('commands execute rejects invalid /model names with an error', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/commands', commandsRouter);
  const { server, port } = await listenServer(app);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/commands/execute`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        commandName: '/model',
        args: ['not-a-real-model'],
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.deepEqual(body, {
      error: 'Invalid model name',
      message: 'Unknown Claude model: not-a-real-model',
    });
  } finally {
    await closeServer(server);
  }
});

test('agent v2 router forwards transport fields without trimming unrelated payload data', async () => {
  const calls = [];
  const router = createAgentV2Router({
    services: {
      async startSessionRun(input) {
        calls.push(input);
        return {
          sessionId: 'sess-transport',
          run: { id: 'run-transport', sessionId: 'sess-transport' },
          events: [],
        };
      },
      async createSession() {
        return { id: 'sess-transport', title: '新会话' };
      },
    },
  });

  const app = express();
  app.use(express.json());
  app.use('/api/agent-v2', router);
  const { server, port } = await listenServer(app);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/agent-v2/sessions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        prompt: 'hello',
        projectPath: '/tmp/project',
        traceId: 'trace-transport',
        images: [{ name: 'shot.png' }],
        toolsSettings: { allowedTools: ['Read'] },
        permissionMode: 'default',
        effort: 'medium',
        model: 'claude-opus-4-7',
      }),
    });

    assert.equal(response.status, 201);
    assert.equal(calls[0].traceId, 'trace-transport');
    assert.deepEqual(calls[0].images, [{ name: 'shot.png' }]);
    assert.deepEqual(calls[0].toolsSettings, { allowedTools: ['Read'] });
    assert.equal(calls[0].permissionMode, 'default');
    assert.equal(calls[0].effort, 'medium');
    assert.equal(calls[0].model, 'claude-opus-4-7');
    assert.equal(calls[0].projectPath, '/tmp/project');
  } finally {
    await closeServer(server);
  }
});
