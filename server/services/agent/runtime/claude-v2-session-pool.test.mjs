// session pool 行为测试。
// 重点验证创建、恢复、权限请求和关闭都直接围绕原生 SDKSession 工作。
import test from 'node:test';
import assert from 'node:assert/strict';

import { __testables, createClaudeV2SessionPool } from './claude-v2-session-pool.js';

test('session pool uses native v2 sessions for new and resumed sessions', async () => {
  const calls = [];
  const fakeSdk = {
    unstable_v2_createSession(options) {
      calls.push({ type: 'create', options });
      return {
        async send(prompt) {
          calls.push({ type: 'send', prompt });
        },
        async *stream() {
          yield { type: 'system', subtype: 'init', session_id: 'sess-new' };
          yield { type: 'assistant', message: { content: [{ type: 'text', text: 'ack:new' }] }, session_id: 'sess-new' };
          yield { type: 'result', subtype: 'success', result: 'done', session_id: 'sess-new' };
        },
        get sessionId() {
          return 'sess-new';
        },
        close() {},
      };
    },
    unstable_v2_resumeSession(sessionId, options) {
      calls.push({ type: 'resume', sessionId, options });
      return {
        async send(prompt) {
          calls.push({ type: 'send', prompt });
        },
        async *stream() {
          yield { type: 'assistant', message: { content: [{ type: 'text', text: 'ack:resume' }] }, session_id: sessionId };
          yield { type: 'result', subtype: 'success', result: 'done', session_id: sessionId };
        },
        get sessionId() {
          return sessionId;
        },
        close() {},
      };
    },
  };

  const pool = createClaudeV2SessionPool(fakeSdk);
  const created = pool.create({ model: 'sonnet', cwd: '/Users/demo/html', mcpEnabled: true });
  await created.send('hello-new');
  const createdEvents = [];
  for await (const message of created.stream()) {
    createdEvents.push(message);
  }

  const resumed = pool.resume('sess-resume', { model: 'sonnet', cwd: '/Users/demo/html' });
  await resumed.send('hello-resume');
  const resumedEvents = [];
  for await (const message of resumed.stream()) {
    resumedEvents.push(message);
  }

  assert.equal(created.sessionId, 'sess-new');
  assert.equal(pool.get('sess-new'), created);
  assert.equal(pool.isActive('sess-new'), false);
  assert.equal(resumed.sessionId, 'sess-resume');
  assert.equal(pool.get('sess-resume'), resumed);
  assert.deepEqual(createdEvents.map((event) => event.type), ['system', 'assistant', 'result']);
  assert.deepEqual(resumedEvents.map((event) => event.type), ['assistant', 'result']);
  assert.equal(calls[0].type, 'create');
  assert.equal(calls[0].options.cwd, '/Users/demo/html');
  assert.equal(typeof calls[0].options.env, 'object');
  assert.deepEqual(calls[0].options.settingSources, ['user', 'project', 'local']);
  assert.equal('mcpEnabled' in calls[0].options, false);
  assert.equal(calls[1].type, 'send');
  assert.equal(calls[2].type, 'resume');
});

test('session pool marks a resumed session as dead after send failure and resumes again later', async () => {
  const calls = [];
  const fakeSdk = {
    unstable_v2_createSession() {
      throw new Error('should not create');
    },
    unstable_v2_resumeSession(sessionId) {
      const session = {
        async send() {
          calls.push({ type: 'send', sessionId });
          throw new Error('boom');
        },
        async *stream() {
          yield { type: 'system', subtype: 'init', session_id: sessionId };
        },
        get sessionId() {
          return sessionId;
        },
        close() {},
      };
      calls.push({ type: 'resume', sessionId, session });
      return session;
    },
  };

  const pool = createClaudeV2SessionPool(fakeSdk);
  const first = pool.resume('sess-failed', { model: 'sonnet', cwd: '/Users/demo/html' });
  await assert.rejects(first.send('hello'));
  assert.equal(pool.hasLiveSession('sess-failed'), false);

  const second = pool.resume('sess-failed', { model: 'sonnet', cwd: '/Users/demo/html' });
  assert.notEqual(second, first);
  assert.equal(calls.filter((call) => call.type === 'resume').length, 2);
});

test('session pool reuses a live session instead of resuming it again', async () => {
  let resumeCalls = 0;
  const fakeSdk = {
    unstable_v2_createSession() {
      return {
        async send() {},
        async *stream() {
          yield { type: 'system', subtype: 'init', session_id: 'sess-live' };
        },
        get sessionId() {
          return 'sess-live';
        },
        close() {},
      };
    },
    unstable_v2_resumeSession() {
      resumeCalls += 1;
      throw new Error('resume should not be called for a live session');
    },
  };

  const pool = createClaudeV2SessionPool(fakeSdk);
  const created = pool.create({ model: 'sonnet', cwd: '/Users/demo/html' });
  for await (const _message of created.stream()) {
    // bind live session id
  }

  assert.equal(pool.hasLiveSession('sess-live'), true);
  assert.equal(pool.getLiveSession('sess-live'), created);
  assert.equal(pool.reconnectSessionWriter('sess-live', { send() {} }), true);

  const resumed = pool.resume('sess-live', {
    model: 'sonnet',
    cwd: '/Users/demo/html',
    writer: { send() {} },
  });

  assert.equal(resumed, created);
  assert.equal(resumeCalls, 0);
});

test('session pool passes hooks into unstable_v2_createSession', () => {
  let capturedOptions = null;
  const hooks = {
    Stop: [{ matcher: '', hooks: [{ type: 'prompt', prompt: 'wrap up' }] }],
  };
  const fakeSdk = {
    unstable_v2_createSession(options) {
      capturedOptions = options;
      return {
        async send() {},
        async *stream() {},
        get sessionId() {
          return 'sess-hooks-create';
        },
        close() {},
      };
    },
    unstable_v2_resumeSession() {
      throw new Error('not used');
    },
  };

  const pool = createClaudeV2SessionPool(fakeSdk);
  pool.create({
    cwd: '/tmp/project',
    hooks,
  });

  assert.deepEqual(capturedOptions?.hooks, hooks);
});

test('session pool isolates create hooks from SDK-side mutation', () => {
  const hooks = {
    Stop: [{ matcher: '', hooks: [{ type: 'prompt', prompt: 'wrap up' }] }],
  };
  const fakeSdk = {
    unstable_v2_createSession(options) {
      options.hooks.Stop[0].hooks[0].prompt = 'sdk changed';
      return {
        async send() {},
        async *stream() {},
        get sessionId() {
          return 'sess-hooks-create-isolated';
        },
        close() {},
      };
    },
    unstable_v2_resumeSession() {
      throw new Error('not used');
    },
  };

  const pool = createClaudeV2SessionPool(fakeSdk);
  pool.create({
    cwd: '/tmp/project',
    hooks,
  });

  assert.deepEqual(hooks, {
    Stop: [{ matcher: '', hooks: [{ type: 'prompt', prompt: 'wrap up' }] }],
  });
});

test('session pool passes hooks into unstable_v2_resumeSession', () => {
  let capturedOptions = null;
  const hooks = {
    PreToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'echo resume' }] }],
  };
  const fakeSdk = {
    unstable_v2_createSession() {
      throw new Error('not used');
    },
    unstable_v2_resumeSession(_sessionId, options) {
      capturedOptions = options;
      return {
        async send() {},
        async *stream() {},
        get sessionId() {
          return 'sess-hooks-resume';
        },
        close() {},
      };
    },
  };

  const pool = createClaudeV2SessionPool(fakeSdk);
  pool.resume('sess-hooks-resume', {
    cwd: '/tmp/project',
    hooks,
  });

  assert.deepEqual(capturedOptions?.hooks, hooks);
});

test('session pool isolates resume hooks from SDK-side mutation', () => {
  const hooks = {
    PreToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'echo resume' }] }],
  };
  const fakeSdk = {
    unstable_v2_createSession() {
      throw new Error('not used');
    },
    unstable_v2_resumeSession(_sessionId, options) {
      options.hooks.PreToolUse[0].hooks[0].command = 'sdk changed';
      return {
        async send() {},
        async *stream() {},
        get sessionId() {
          return 'sess-hooks-resume-isolated';
        },
        close() {},
      };
    },
  };

  const pool = createClaudeV2SessionPool(fakeSdk);
  pool.resume('sess-hooks-resume-isolated', {
    cwd: '/tmp/project',
    hooks,
  });

  assert.deepEqual(hooks, {
    PreToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'echo resume' }] }],
  });
});

test('session pool stores a runtime command catalog returned by the native SDK session', async () => {
  let commandCatalogCalls = 0;
  const fakeSdk = {
    unstable_v2_createSession() {
      return {
        commandCatalog: async () => {
          commandCatalogCalls += 1;
          return {
            localUi: null,
            runtime: [{ name: '/brainstorming', description: 'Brainstorm', argumentHint: '' }],
          };
        },
        async send() {},
        async *stream() {
          yield { type: 'system', subtype: 'init', session_id: 'sess-catalog' };
        },
        get sessionId() {
          return 'sess-catalog';
        },
        close() {},
      };
    },
    unstable_v2_resumeSession() {
      throw new Error('not used');
    },
  };

  const pool = createClaudeV2SessionPool(fakeSdk);
  const session = pool.create({ cwd: '/tmp/project' });
  for await (const _message of session.stream()) {
    // wait until session init completes
  }

  const firstCatalog = await pool.getCommandCatalog('sess-catalog');
  const secondCatalog = await pool.getCommandCatalog('sess-catalog');

  assert.deepEqual(firstCatalog, {
    localUi: [],
    runtime: [{ name: '/brainstorming', description: 'Brainstorm', argumentHint: '' }],
    skills: [],
  });
  assert.equal(secondCatalog, firstCatalog);
  assert.equal(commandCatalogCalls, 1);
});

test('session pool can resume a cold session to read its command catalog', async () => {
  let resumeCalls = 0;
  let commandCatalogCalls = 0;
  const fakeSdk = {
    unstable_v2_createSession() {
      throw new Error('not used');
    },
    unstable_v2_resumeSession(sessionId, options) {
      resumeCalls += 1;
      assert.equal(sessionId, 'sess-cold-catalog');
      assert.equal(options.cwd, '/tmp/project');
      return {
        async commandCatalog() {
          commandCatalogCalls += 1;
          return {
            localUi: [],
            runtime: [{ name: '/skills', description: 'List skills', argumentHint: '' }],
            skills: [{ name: 'agent-browser', description: 'Browse with an agent' }],
          };
        },
        async initializationResult() {
          return { skills: ['agent-browser'] };
        },
        async send() {},
        async *stream() {},
        get sessionId() {
          return 'sess-cold-catalog';
        },
        close() {},
      };
    },
  };

  const pool = createClaudeV2SessionPool(fakeSdk);
  const catalog = await pool.getCommandCatalog('sess-cold-catalog', { projectPath: '/tmp/project' });

  assert.deepEqual(catalog, {
    localUi: [],
    runtime: [{ name: '/skills', description: 'List skills', argumentHint: '' }],
    skills: [{ name: 'agent-browser', description: 'Browse with an agent' }],
  });
  assert.equal(resumeCalls, 1);
  assert.equal(commandCatalogCalls, 1);
});

test('session pool can probe command catalog from projectPath without a session id', async () => {
  let createCalls = 0;
  const fakeSdk = {
    unstable_v2_createSession(options) {
      createCalls += 1;
      assert.equal(options.cwd, '/tmp/project');
      return {
        async commandCatalog() {
          return {
            localUi: [],
            runtime: [{ name: '/skills', description: 'List skills', argumentHint: '' }],
            skills: [{ name: 'apollo-config', description: 'Apollo config helper' }],
          };
        },
        async initializationResult() {
          return { skills: ['apollo-config'] };
        },
        async send() {},
        async *stream() {},
        close() {},
      };
    },
    unstable_v2_resumeSession() {
      throw new Error('not used');
    },
  };

  const pool = createClaudeV2SessionPool(fakeSdk);
  const catalog = await pool.getCommandCatalog(null, { projectPath: '/tmp/project' });

  assert.deepEqual(catalog, {
    localUi: [],
    runtime: [{ name: '/skills', description: 'List skills', argumentHint: '' }],
    skills: [{ name: 'apollo-config', description: 'Apollo config helper' }],
  });
  assert.equal(createCalls, 1);
});

test('session pool falls back to a probe session when resumed catalog is empty', async () => {
  let createCalls = 0;
  let resumeCalls = 0;
  const fakeSdk = {
    unstable_v2_createSession(options) {
      createCalls += 1;
      assert.equal(options.cwd, '/tmp/project');
      return {
        async commandCatalog() {
          return {
            localUi: [],
            runtime: [{ name: '/skills', description: 'List skills', argumentHint: '' }],
            skills: [{ name: 'fast-nexus-analyzer', description: 'Analyze nexus code' }],
          };
        },
        async initializationResult() {
          return { skills: ['fast-nexus-analyzer'] };
        },
        async send() {},
        async *stream() {},
        close() {},
      };
    },
    unstable_v2_resumeSession(sessionId) {
      resumeCalls += 1;
      assert.equal(sessionId, 'sess-empty-catalog');
      return {
        async commandCatalog() {
          return { localUi: [], runtime: [], skills: [] };
        },
        async initializationResult() {
          return { skills: [] };
        },
        async send() {},
        async *stream() {},
        get sessionId() {
          return 'sess-empty-catalog';
        },
        close() {},
      };
    },
  };

  const pool = createClaudeV2SessionPool(fakeSdk);
  const catalog = await pool.getCommandCatalog('sess-empty-catalog', { projectPath: '/tmp/project' });

  assert.deepEqual(catalog, {
    localUi: [],
    runtime: [{ name: '/skills', description: 'List skills', argumentHint: '' }],
    skills: [{ name: 'fast-nexus-analyzer', description: 'Analyze nexus code' }],
  });
  assert.equal(resumeCalls, 1);
  assert.equal(createCalls, 1);
});

test('session pool falls back to a probe session when the requested session id is stale', async () => {
  let createCalls = 0;
  let resumeCalls = 0;
  const fakeSdk = {
    unstable_v2_createSession(options) {
      createCalls += 1;
      assert.equal(options.cwd, '/tmp/project');
      return {
        async commandCatalog() {
          return {
            localUi: [],
            runtime: [{ name: '/compact', description: 'Compact conversation', argumentHint: '' }],
            skills: [{ name: 'brainstorming', description: 'Brainstorm ideas' }],
          };
        },
        async initializationResult() {
          return { skills: ['brainstorming'] };
        },
        async send() {},
        async *stream() {},
        close() {},
      };
    },
    unstable_v2_resumeSession(sessionId) {
      resumeCalls += 1;
      assert.equal(sessionId, 'sess-stale');
      throw new Error(`Claude Code returned an error result: No conversation found with session ID: ${sessionId}`);
    },
  };

  const pool = createClaudeV2SessionPool(fakeSdk);
  const catalog = await pool.getCommandCatalog('sess-stale', { projectPath: '/tmp/project' });

  assert.deepEqual(catalog, {
    localUi: [],
    runtime: [{ name: '/compact', description: 'Compact conversation', argumentHint: '' }],
    skills: [{ name: 'brainstorming', description: 'Brainstorm ideas' }],
  });
  assert.equal(resumeCalls, 1);
  assert.equal(createCalls, 1);
});

test('session pool includes initializationResult skills without mixing them into runtime slash commands', async () => {
  let initializationResultCalls = 0;
  const fakeSdk = {
    unstable_v2_createSession() {
      return {
        commandCatalog: async () => ({
          localUi: [],
          runtime: [{ name: '/brainstorming', description: 'Brainstorm', argumentHint: '' }],
        }),
        async initializationResult() {
          initializationResultCalls += 1;
          return {
            skills: ['analysis', { name: 'planning', description: 'Plan work' }],
          };
        },
        async send() {},
        async *stream() {
          yield { type: 'system', subtype: 'init', session_id: 'sess-skills-catalog' };
        },
        get sessionId() {
          return 'sess-skills-catalog';
        },
        close() {},
      };
    },
    unstable_v2_resumeSession() {
      throw new Error('not used');
    },
  };

  const pool = createClaudeV2SessionPool(fakeSdk);
  const session = pool.create({ cwd: '/tmp/project' });
  for await (const _message of session.stream()) {
    // wait until session init completes
  }

  const catalog = await pool.getCommandCatalog('sess-skills-catalog');

  assert.deepEqual(catalog, {
    localUi: [],
    runtime: [{ name: '/brainstorming', description: 'Brainstorm', argumentHint: '' }],
    skills: [{ name: 'analysis' }, { name: 'planning', description: 'Plan work' }],
  });
  assert.equal(initializationResultCalls, 1);
});

test('readInitializationSkills does not throw ReferenceError when query.initialization exists', async () => {
  const session = {
    query: {
      initialization: Promise.resolve({
        commands: [{ name: 'compact', description: 'Compact conversation', argumentHint: '' }],
      }),
    },
  };

  const skills = await __testables.readInitializationSkills(session);

  assert.deepEqual(skills, []);
});

test('session pool splits query.initialization.commands into runtime commands and skills using init metadata', async () => {
  const fakeSdk = {
    unstable_v2_createSession() {
      return {
        query: {
          initialization: Promise.resolve({
            commands: [
              { name: 'compact', description: 'Compact conversation', argumentHint: '' },
              { name: 'context', description: 'Show current context usage', argumentHint: '' },
              { name: 'cost', description: 'Show cost', argumentHint: '' },
              { name: 'agent-browser', description: 'Browser automation', argumentHint: '' },
              { name: 'apollo-config', description: 'Apollo config helper', argumentHint: '' },
            ],
          }),
        },
        async send() {},
        async *stream() {
          yield {
            type: 'system',
            subtype: 'init',
            session_id: 'sess-query-init',
            slash_commands: ['compact', 'context', 'cost', 'agent-browser', 'apollo-config'],
            skills: ['agent-browser', 'apollo-config'],
          };
        },
        get sessionId() {
          return 'sess-query-init';
        },
        close() {},
      };
    },
    unstable_v2_resumeSession() {
      throw new Error('not used');
    },
  };

  const pool = createClaudeV2SessionPool(fakeSdk);
  const session = pool.create({ cwd: '/tmp/project' });
  for await (const _message of session.stream()) {
    // wait until session init completes
  }

  const catalog = await pool.getCommandCatalog('sess-query-init');

  assert.deepEqual(catalog, {
    localUi: [],
    runtime: [
      { name: '/compact', description: 'Compact conversation', argumentHint: '' },
      { name: '/context', description: 'Show current context usage', argumentHint: '' },
      { name: '/cost', description: 'Show cost', argumentHint: '' },
    ],
    skills: [
      { name: 'agent-browser', description: 'Browser automation', argumentHint: '' },
      { name: 'apollo-config', description: 'Apollo config helper', argumentHint: '' },
    ],
  });
});

test('session pool merges init-only runtime commands with commandCatalog runtime for live sessions', async () => {
  const fakeSdk = {
    unstable_v2_createSession() {
      return {
        query: {
          initialization: Promise.resolve({
            commands: [
              { name: 'batch', description: 'Batch workflow', argumentHint: '' },
              { name: 'superpowers:brainstorming', description: 'Brainstorm skill', argumentHint: '' },
            ],
          }),
        },
        async commandCatalog() {
          return {
            localUi: [],
            runtime: [{ name: '/batch', description: 'Batch workflow', argumentHint: '' }],
            skills: [],
          };
        },
        async send() {},
        async *stream() {
          yield {
            type: 'system',
            subtype: 'init',
            session_id: 'sess-live-init-merge',
            slash_commands: ['batch', 'superpowers:brainstorming'],
            skills: [],
          };
        },
        get sessionId() {
          return 'sess-live-init-merge';
        },
        close() {},
      };
    },
    unstable_v2_resumeSession() {
      throw new Error('not used');
    },
  };

  const pool = createClaudeV2SessionPool(fakeSdk);
  const session = pool.create({ cwd: '/tmp/project' });
  for await (const _message of session.stream()) {
    // wait until init captured
  }

  const catalog = await pool.getCommandCatalog('sess-live-init-merge');

  assert.deepEqual(catalog, {
    localUi: [],
    runtime: [
      { name: '/batch', description: 'Batch workflow', argumentHint: '' },
      { name: '/superpowers:brainstorming', description: 'Brainstorm skill', argumentHint: '' },
    ],
    skills: [],
  });
});

test('session pool falls back to initialization commands as runtime when SDK lacks catalog helpers', async () => {
  const fakeSdk = {
    unstable_v2_createSession() {
      return {
        query: {
          initialization: Promise.resolve({
            commands: [
              { name: 'compact', description: 'Compact conversation', argumentHint: '' },
              { name: 'context', description: 'Show current context usage', argumentHint: '' },
              { name: 'cost', description: 'Show cost', argumentHint: '' },
            ],
          }),
        },
        async send() {},
        async *stream() {
          yield { type: 'system', subtype: 'init', session_id: 'sess-query-runtime' };
        },
        get sessionId() {
          return 'sess-query-runtime';
        },
        close() {},
      };
    },
    unstable_v2_resumeSession() {
      throw new Error('not used');
    },
  };

  const pool = createClaudeV2SessionPool(fakeSdk);
  const session = pool.create({ cwd: '/tmp/project' });
  for await (const _message of session.stream()) {
    // wait until session init completes
  }

  const catalog = await pool.getCommandCatalog('sess-query-runtime');

  assert.deepEqual(catalog, {
    localUi: [],
    runtime: [
      { name: '/compact', description: 'Compact conversation', argumentHint: '' },
      { name: '/context', description: 'Show current context usage', argumentHint: '' },
      { name: '/cost', description: 'Show cost', argumentHint: '' },
    ],
    skills: [],
  });
});

test('session pool does not use supportedCommands as a skill source', async () => {
  let supportedCommandsCalls = 0;
  let initializationResultCalls = 0;
  const fakeSdk = {
    unstable_v2_createSession() {
      return {
        commandCatalog: async () => ({
          localUi: [],
          runtime: [{ name: '/brainstorming', description: 'Brainstorm', argumentHint: '' }],
        }),
        async supportedCommands() {
          supportedCommandsCalls += 1;
          return [{ name: 'should-not-be-used', description: 'Wrong source', argumentHint: '' }];
        },
        async initializationResult() {
          initializationResultCalls += 1;
          return { skills: [] };
        },
        async send() {},
        async *stream() {
          yield { type: 'system', subtype: 'init', session_id: 'sess-no-supported-skills' };
        },
        get sessionId() {
          return 'sess-no-supported-skills';
        },
        close() {},
      };
    },
    unstable_v2_resumeSession() {
      throw new Error('not used');
    },
  };

  const pool = createClaudeV2SessionPool(fakeSdk);
  const session = pool.create({ cwd: '/tmp/project' });
  for await (const _message of session.stream()) {
    // wait until session init completes
  }

  const catalog = await pool.getCommandCatalog('sess-no-supported-skills');

  assert.deepEqual(catalog, {
    localUi: [],
    runtime: [{ name: '/brainstorming', description: 'Brainstorm', argumentHint: '' }],
    skills: [],
  });
  assert.equal(supportedCommandsCalls, 0);
  assert.equal(initializationResultCalls, 1);
});

test('session pool de-duplicates concurrent cold command catalog reads', async () => {
  let resolveCatalog;
  let commandCatalogCalls = 0;
  const fakeSdk = {
    unstable_v2_createSession() {
      return {
        commandCatalog: () => {
          commandCatalogCalls += 1;
          return new Promise((resolve) => {
            resolveCatalog = resolve;
          });
        },
        async send() {},
        async *stream() {
          yield { type: 'system', subtype: 'init', session_id: 'sess-concurrent-catalog' };
        },
        get sessionId() {
          return 'sess-concurrent-catalog';
        },
        close() {},
      };
    },
    unstable_v2_resumeSession() {
      throw new Error('not used');
    },
  };

  const pool = createClaudeV2SessionPool(fakeSdk);
  const session = pool.create({ cwd: '/tmp/project' });
  for await (const _message of session.stream()) {
    // wait until session init completes
  }

  const firstRead = pool.getCommandCatalog('sess-concurrent-catalog');
  const secondRead = pool.getCommandCatalog('sess-concurrent-catalog');

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(commandCatalogCalls, 1);

  resolveCatalog({
    localUi: [{ name: 'prompt' }],
    runtime: [{ name: '/brainstorming', description: 'Brainstorm', argumentHint: '' }],
  });

  const [firstCatalog, secondCatalog] = await Promise.all([firstRead, secondRead]);

  assert.deepEqual(firstCatalog, {
    localUi: [{ name: 'prompt' }],
    runtime: [{ name: '/brainstorming', description: 'Brainstorm', argumentHint: '' }],
    skills: [],
  });
  assert.equal(secondCatalog, firstCatalog);
});

test('session pool falls back to listSlashCommands and normalizes the catalog shape', async () => {
  let listSlashCommandsCalls = 0;
  const fakeSdk = {
    unstable_v2_createSession() {
      return {
        async listSlashCommands() {
          listSlashCommandsCalls += 1;
          return [{ name: '/plan', description: 'Plan', argumentHint: '<topic>' }];
        },
        async send() {},
        async *stream() {
          yield { type: 'system', subtype: 'init', session_id: 'sess-slash-catalog' };
        },
        get sessionId() {
          return 'sess-slash-catalog';
        },
        close() {},
      };
    },
    unstable_v2_resumeSession() {
      throw new Error('not used');
    },
  };

  const pool = createClaudeV2SessionPool(fakeSdk);
  const session = pool.create({ cwd: '/tmp/project' });
  for await (const _message of session.stream()) {
    // wait until session init completes
  }

  const catalog = await pool.getCommandCatalog('sess-slash-catalog');

  assert.deepEqual(catalog, {
    localUi: [],
    runtime: [{ name: '/plan', description: 'Plan', argumentHint: '<topic>' }],
    skills: [],
  });
  assert.equal(listSlashCommandsCalls, 1);
});

test('session refreshCommandCatalog refreshes the cached command catalog', async () => {
  let commandCatalogCalls = 0;
  const fakeSdk = {
    unstable_v2_createSession() {
      return {
        async commandCatalog() {
          commandCatalogCalls += 1;
          return {
            localUi: [],
            runtime: [{
              name: commandCatalogCalls === 1 ? '/brainstorming' : '/plan',
              description: commandCatalogCalls === 1 ? 'Brainstorm' : 'Plan',
              argumentHint: '',
            }],
          };
        },
        async send() {},
        async *stream() {
          yield { type: 'system', subtype: 'init', session_id: 'sess-refresh-catalog' };
        },
        get sessionId() {
          return 'sess-refresh-catalog';
        },
        close() {},
      };
    },
    unstable_v2_resumeSession() {
      throw new Error('not used');
    },
  };

  const pool = createClaudeV2SessionPool(fakeSdk);
  const session = pool.create({ cwd: '/tmp/project' });
  for await (const _message of session.stream()) {
    // wait until session init completes
  }

  const firstCatalog = await pool.getCommandCatalog('sess-refresh-catalog');
  const refreshedCatalog = await session.refreshCommandCatalog();
  const cachedCatalog = await pool.getCommandCatalog('sess-refresh-catalog');

  assert.deepEqual(firstCatalog, {
    localUi: [],
    runtime: [{ name: '/brainstorming', description: 'Brainstorm', argumentHint: '' }],
    skills: [],
  });
  assert.deepEqual(refreshedCatalog, {
    localUi: [],
    runtime: [{ name: '/plan', description: 'Plan', argumentHint: '' }],
    skills: [],
  });
  assert.equal(cachedCatalog, refreshedCatalog);
  assert.equal(commandCatalogCalls, 2);
});

test('session pool registers a synchronously readable sessionId before stream starts', async () => {
  const fakeSession = {
    async send() {},
    async *stream() {
      yield { type: 'system', subtype: 'init', session_id: 'sess-sync' };
    },
    get sessionId() {
      return 'sess-sync';
    },
    close() {},
  };
  const fakeSdk = {
    unstable_v2_createSession() {
      return fakeSession;
    },
    unstable_v2_resumeSession() {
      throw new Error('should not resume');
    },
  };

  const pool = createClaudeV2SessionPool(fakeSdk);
  const created = pool.create({ model: 'sonnet', cwd: '/Users/demo/html' });

  assert.equal(pool.hasLiveSession('sess-sync'), true);
  assert.equal(pool.getLiveSession('sess-sync'), created);
  assert.equal(pool.get('sess-sync'), created);
});

test('session pool resolves permission requests through its registry', async () => {
  const sent = [];
  let capturedCanUseTool = null;
  const fakeSdk = {
    unstable_v2_createSession(options) {
      capturedCanUseTool = options.canUseTool;
      return {
        async send() {},
        async *stream() {
          yield { type: 'system', subtype: 'init', session_id: 'sess-perm' };
        },
        get sessionId() {
          return 'sess-perm';
        },
        close() {},
      };
    },
    unstable_v2_resumeSession() {
      throw new Error('should not resume');
    },
  };

  const pool = createClaudeV2SessionPool(fakeSdk);
  const session = pool.create({
    model: 'sonnet',
    cwd: '/Users/demo/html',
    writer: { send(message) { sent.push(message); } },
  });

  for await (const _message of session.stream()) {
    // bind session id
  }

  const pendingDecision = capturedCanUseTool('Bash', { command: 'rm -rf /tmp/demo' }, {
    signal: new AbortController().signal,
    toolUseID: 'tool-1',
  });

  const pending = pool.listPendingApprovals('sess-perm');
  assert.equal(pending.length, 1);
  assert.equal(sent[0]?.kind, 'permission_request');
  pool.resolvePermissionRequest(pending[0].requestId, { allow: true });

  const result = await pendingDecision;
  assert.deepEqual(result, {
    behavior: 'allow',
    updatedInput: { command: 'rm -rf /tmp/demo' },
    toolUseID: 'tool-1',
  });
});

test('session pool maps rememberEntry responses into official updatedPermissions', async () => {
  let capturedCanUseTool = null;
  const sent = [];
  const fakeSdk = {
    unstable_v2_createSession(options) {
      capturedCanUseTool = options.canUseTool;
      return {
        async send() {},
        async *stream() {
          yield { type: 'system', subtype: 'init', session_id: 'sess-rules' };
        },
        get sessionId() {
          return 'sess-rules';
        },
        close() {},
      };
    },
    unstable_v2_resumeSession() {
      throw new Error('should not resume');
    },
  };

  const pool = createClaudeV2SessionPool(fakeSdk);
  const session = pool.create({
    model: 'sonnet',
    cwd: '/Users/demo/html',
    writer: { send(message) { sent.push(message); } },
  });

  for await (const _message of session.stream()) {
    // bind session id
  }

  const pendingDecision = capturedCanUseTool('Bash', { command: 'rm -rf /tmp/demo' }, {
    signal: new AbortController().signal,
    toolUseID: 'tool-remember',
  });

  const pending = pool.listPendingApprovals('sess-rules');
  assert.equal(pending.length, 1);
  pool.resolvePermissionRequest(pending[0].requestId, {
    allow: true,
    rememberEntry: 'Bash(rm -rf /tmp/demo:*)',
  });

  const result = await pendingDecision;
  assert.deepEqual(result, {
    behavior: 'allow',
    updatedInput: { command: 'rm -rf /tmp/demo' },
    updatedPermissions: [
      {
        type: 'addRules',
        rules: [{ toolName: 'Bash', ruleContent: 'rm -rf /tmp/demo:*' }],
        behavior: 'allow',
        destination: 'session',
      },
    ],
    toolUseID: 'tool-remember',
  });
  assert.equal(sent[0]?.kind, 'permission_request');
});

test('session pool routes AskUserQuestion through interactive_prompt', async () => {
  let capturedCanUseTool = null;
  const sent = [];
  const fakeSdk = {
    unstable_v2_createSession(options) {
      capturedCanUseTool = options.canUseTool;
      return {
        async send() {},
        async *stream() {
          yield { type: 'system', subtype: 'init', session_id: 'sess-ask' };
        },
        get sessionId() {
          return 'sess-ask';
        },
        close() {},
      };
    },
    unstable_v2_resumeSession() {
      throw new Error('should not resume');
    },
  };

  const pool = createClaudeV2SessionPool(fakeSdk);
  const session = pool.create({
    model: 'sonnet',
    cwd: '/Users/demo/html',
    writer: { send(message) { sent.push(message); } },
  });

  for await (const _message of session.stream()) {
    // bind session id
  }

  const pendingDecision = capturedCanUseTool('AskUserQuestion', {
    question: 'Which option should we use?',
    header: 'Choice',
    options: [
      { label: 'A', description: 'Option A' },
      { label: 'B', description: 'Option B' },
    ],
  }, {
    signal: new AbortController().signal,
    toolUseID: 'tool-question',
  });

  const pending = pool.listPendingInteractivePrompts('sess-ask');
  assert.equal(pending.length, 1);
  assert.equal(sent[0]?.kind, 'interactive_prompt');
  assert.match(String(sent[0]?.content || ''), /Which option should we use\?/);

  pool.resolveInteractivePrompt(pending[0].requestId, {
    allow: true,
    answers: {
      'Which option should we use?': 'A',
    },
  });

  const result = await pendingDecision;
  assert.deepEqual(result, {
    behavior: 'allow',
    updatedInput: {
      questions: [
        {
          question: 'Which option should we use?',
          header: 'Choice',
          options: [
            { label: 'A', description: 'Option A' },
            { label: 'B', description: 'Option B' },
          ],
        },
      ],
      answers: {
        'Which option should we use?': 'A',
      },
    },
    toolUseID: 'tool-question',
  });
});

test('session pool only enables allowDangerouslySkipPermissions for bypassPermissions', async () => {
  const captured = [];
  const fakeSdk = {
    unstable_v2_createSession(options) {
      captured.push(options);
      return {
        async send() {},
        async *stream() {
          yield { type: 'system', subtype: 'init', session_id: 'sess-skip' };
        },
        get sessionId() {
          return 'sess-skip';
        },
        close() {},
      };
    },
    unstable_v2_resumeSession() {
      throw new Error('should not resume');
    },
  };

  const pool = createClaudeV2SessionPool(fakeSdk);
  const skipped = pool.create({
    model: 'sonnet',
    cwd: '/Users/demo/html',
    toolsSettings: {
      skipPermissions: true,
    },
  });
  for await (const _message of skipped.stream()) {
    // bind session id
  }

  const bypassed = pool.create({
    model: 'sonnet',
    cwd: '/Users/demo/html',
    permissionMode: 'bypassPermissions',
  });
  for await (const _message of bypassed.stream()) {
    // bind session id
  }

  assert.equal(captured[0].allowDangerouslySkipPermissions, false);
  assert.equal(captured[1].allowDangerouslySkipPermissions, true);
});

test('session pool forwards official effort into native session options', async () => {
  const captured = [];
  const fakeSdk = {
    unstable_v2_createSession(options) {
      captured.push(options);
      return {
        async send() {},
        async *stream() {
          yield { type: 'system', subtype: 'init', session_id: 'sess-effort' };
        },
        get sessionId() {
          return 'sess-effort';
        },
        close() {},
      };
    },
    unstable_v2_resumeSession() {
      throw new Error('should not resume');
    },
  };

  const pool = createClaudeV2SessionPool(fakeSdk);
  const session = pool.create({
    model: 'sonnet',
    cwd: '/Users/demo/html',
    effort: 'xhigh',
  });
  for await (const _message of session.stream()) {
    // bind session id
  }

  assert.equal(captured[0].effort, 'xhigh');
});

test('session pool closes active native sessions', async () => {
  let closeCount = 0;
  const fakeSdk = {
    unstable_v2_createSession() {
      return {
        async send() {},
        async *stream() {
          yield { type: 'system', subtype: 'init', session_id: 'sess-close' };
        },
        get sessionId() {
          return 'sess-close';
        },
        close() {
          closeCount += 1;
        },
      };
    },
    unstable_v2_resumeSession() {
      throw new Error('should not resume');
    },
  };

  const pool = createClaudeV2SessionPool(fakeSdk);
  const session = pool.create({ model: 'sonnet', cwd: '/Users/demo/html' });
  for await (const _message of session.stream()) {
    // consume init to bind
  }

  assert.equal(pool.close('sess-close'), true);
  assert.equal(closeCount, 1);
  assert.equal(pool.get('sess-close'), null);
});
