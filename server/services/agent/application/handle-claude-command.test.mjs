// WebSocket / transport 入口的 session-first 行为测试。
import test from 'node:test';
import assert from 'node:assert/strict';

import { handleClaudeCommandWithAgentV2 } from './handle-claude-command.js';

test('handleClaudeCommandWithAgentV2 starts a new session run when sessionId is not bound', async () => {
  const sent = [];
  const calls = [];
  const services = {
    async startSessionRun(input) {
      calls.push(input);
      return {
        sessionId: 'sess-new',
        run: { id: 'run-1', sessionId: 'sess-new' },
        events: [
          { eventId: 'evt-1', runId: 'run-1', sessionId: 'sess-new', sequence: 1, type: 'run.started', timestamp: '2026-04-19T12:00:00.000Z', payload: {} },
          { eventId: 'evt-2', runId: 'run-1', sessionId: 'sess-new', sequence: 2, type: 'run.completed', timestamp: '2026-04-19T12:00:01.000Z', payload: { result: 'done' } },
        ],
        input,
      };
    },
  };
  const writer = { send(event) { sent.push(event); } };

  const result = await handleClaudeCommandWithAgentV2({
    command: 'hello',
    options: { projectPath: '/tmp/demo', traceId: 'trace-new-1' },
    services,
    writer,
  });

  assert.equal(result.sessionId, 'sess-new');
  assert.deepEqual(sent.map((event) => event.type), ['run.started', 'run.completed']);
  assert.equal(calls[0].traceId, 'trace-new-1');
  assert.equal('mcpEnabled' in calls[0], false);
});

test('handleClaudeCommandWithAgentV2 forwards uploaded images into session-first services', async () => {
  const calls = [];
  const services = {
    async startSessionRun(input) {
      calls.push(input);
      return {
        sessionId: 'sess-images',
        run: { id: 'run-images', sessionId: 'sess-images' },
        events: [],
      };
    },
  };
  const writer = { send() {} };
  const images = [
    {
      name: 'diagram.png',
      mimeType: 'image/png',
      data: 'data:image/png;base64,QUJD',
    },
  ];

  await handleClaudeCommandWithAgentV2({
    command: 'describe this image',
    options: {
      projectPath: '/tmp/demo',
      images,
    },
    services,
    writer,
  });

  assert.deepEqual(calls[0].images, images);
  assert.equal('mcpEnabled' in calls[0], false);
});

test('handleClaudeCommandWithAgentV2 forwards official user messages into session-first services', async () => {
  const calls = [];
  const services = {
    async startSessionRun(input) {
      calls.push(input);
      return {
        sessionId: 'sess-message',
        run: { id: 'run-message', sessionId: 'sess-message' },
        events: [],
      };
    },
  };
  const writer = { send() {} };
  const message = {
    role: 'user',
    content: [
      { type: 'text', text: 'Describe this image' },
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: 'QUJD',
        },
      },
    ],
  };

  await handleClaudeCommandWithAgentV2({
    command: '',
    options: {
      projectPath: '/tmp/demo',
      message,
    },
    services,
    writer,
  });

  assert.deepEqual(calls[0].message, message);
  assert.equal(calls[0].prompt, '');
});

test('handleClaudeCommandWithAgentV2 injects hidden output-file protocol for markdown writing intents', async () => {
  const calls = [];
  const services = {
    async startSessionRun(input) {
      calls.push(input);
      return {
        sessionId: 'sess-prd',
        run: { id: 'run-prd', sessionId: 'sess-prd' },
        events: [],
      };
    },
  };
  const writer = { send() {} };

  await handleClaudeCommandWithAgentV2({
    command: '帮我写一份prd 内容你定 不要问我',
    options: {
      projectPath: '/tmp/demo',
      message: {
        role: 'user',
        content: '帮我写一份prd 内容你定 不要问我',
      },
      contextFilePaths: ['/tmp/demo/PRD.md'],
    },
    services,
    writer,
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].message.content, /<context-file>\/tmp\/demo\/PRD\.md<\/context-file>/);
  assert.match(calls[0].message.content, /<output-file>\/tmp\/demo\/PRD\.md<\/output-file>/);
  assert.match(calls[0].message.content, /<system-reminder>[\s\S]*directly update the output file[\s\S]*<\/system-reminder>/i);
});

test('handleClaudeCommandWithAgentV2 does not inject output-file protocol for markdown explanation requests', async () => {
  const calls = [];
  const services = {
    async startSessionRun(input) {
      calls.push(input);
      return {
        sessionId: 'sess-explain',
        run: { id: 'run-explain', sessionId: 'sess-explain' },
        events: [],
      };
    },
  };
  const writer = { send() {} };

  await handleClaudeCommandWithAgentV2({
    command: '请解释一下这个 PRD 的结构',
    options: {
      projectPath: '/tmp/demo',
      message: {
        role: 'user',
        content: '请解释一下这个 PRD 的结构',
      },
      contextFilePaths: ['/tmp/demo/PRD.md'],
    },
    services,
    writer,
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].message.content, /<context-file>\/tmp\/demo\/PRD\.md<\/context-file>/);
  assert.doesNotMatch(calls[0].message.content, /<output-file>\/tmp\/demo\/PRD\.md<\/output-file>/);
  assert.doesNotMatch(calls[0].message.content, /<system-reminder>/);
});

test('handleClaudeCommandWithAgentV2 continues an existing selected session', async () => {
  const sessionId = '550e8400-e29b-41d4-a716-446655440009';
  const calls = [];
  const services = {
    async continueSessionRun(input) {
      calls.push(input);
      return {
        sessionId: input.sessionId,
        run: { id: 'run-2', sessionId: input.sessionId },
        events: [
          { eventId: 'evt-1', runId: 'run-2', sessionId: input.sessionId, sequence: 1, type: 'run.completed', timestamp: '2026-04-19T12:10:00.000Z', payload: { result: 'done' } },
        ],
      };
    },
    async startSessionRun() {
      throw new Error('should not start');
    },
  };
  const writer = { send() {} };

  await handleClaudeCommandWithAgentV2({
    command: 'hello again',
    options: { sessionId, resume: true },
    services,
    writer,
  });

  assert.equal(calls[0].sessionId, sessionId);
  assert.equal('mcpEnabled' in calls[0], false);
});

test('handleClaudeCommandWithAgentV2 treats explicit conversationId as a session-path alias', async () => {
  const sessionId = '550e8400-e29b-41d4-a716-446655440010';
  const calls = [];
  const services = {
    async continueSessionRun(input) {
      calls.push(input);
      return {
        sessionId: input.sessionId,
        run: { id: 'run-3', sessionId: input.sessionId },
        events: [],
      };
    },
    async startSessionRun() {
      throw new Error('should not start');
    },
  };
  const writer = { send() {} };

  await handleClaudeCommandWithAgentV2({
    command: 'hello alias',
    options: { conversationId: sessionId, resume: true },
    services,
    writer,
  });

  assert.equal(calls[0].sessionId, sessionId);
  assert.equal('mcpEnabled' in calls[0], false);
});

test('handleClaudeCommandWithAgentV2 continues a selected session even without a repo record', async () => {
  const sessionId = '550e8400-e29b-41d4-a716-446655440011';
  const calls = [];
  const services = {
    async continueSessionRun(input) {
      calls.push(input);
      return {
        sessionId: input.sessionId,
        run: { id: 'run-4', sessionId: input.sessionId },
        events: [],
      };
    },
    async startSessionRun() {
      throw new Error('should not start');
    },
  };
  const writer = { send() {} };

  await handleClaudeCommandWithAgentV2({
    command: 'resume anyway',
    options: { sessionId, resume: true },
    services,
    writer,
  });

  assert.equal(calls[0].sessionId, sessionId);
  assert.equal('mcpEnabled' in calls[0], false);
});

test('handleClaudeCommandWithAgentV2 starts a new session when only a temporary new-session id is present', async () => {
  const calls = [];
  const services = {
    async continueSessionRun() {
      throw new Error('should not continue');
    },
    async startSessionRun(input) {
      calls.push(input);
      return {
        sessionId: 'sess-created',
        run: { id: 'run-5', sessionId: 'sess-created' },
        events: [],
      };
    },
  };
  const writer = { send() {} };

  await handleClaudeCommandWithAgentV2({
    command: 'start fresh',
    options: {
      sessionId: 'new-session-123',
      projectPath: '/tmp/demo',
    },
    services,
    writer,
  });

  assert.equal(calls[0].projectPath, '/tmp/demo');
  assert.equal('mcpEnabled' in calls[0], false);
});

test('handleClaudeCommandWithAgentV2 falls back to explicit conversationId when sessionId is temporary', async () => {
  const sessionId = '550e8400-e29b-41d4-a716-446655440012';
  const calls = [];
  const services = {
    async continueSessionRun(input) {
      calls.push(input);
      return {
        sessionId: input.sessionId,
        run: { id: 'run-6', sessionId: input.sessionId },
        events: [],
      };
    },
    async startSessionRun() {
      throw new Error('should not start');
    },
  };
  const writer = { send() {} };

  await handleClaudeCommandWithAgentV2({
    command: 'resume explicit',
    options: {
      sessionId: 'new-session-123',
      conversationId: sessionId,
      resume: true,
    },
    services,
    writer,
  });

  assert.equal(calls[0].sessionId, sessionId);
  assert.equal('mcpEnabled' in calls[0], false);
});

test('handleClaudeCommandWithAgentV2 starts a new session for non-resumable stale ids instead of forcing continue', async () => {
  const calls = [];
  const services = {
    async continueSessionRun() {
      throw new Error('should not continue');
    },
    async startSessionRun(input) {
      calls.push(input);
      return {
        sessionId: 'sess-created-stale',
        run: { id: 'run-stale', sessionId: 'sess-created-stale' },
        events: [],
      };
    },
  };
  const writer = { send() {} };

  await handleClaudeCommandWithAgentV2({
    command: 'recover from stale id',
    options: {
      sessionId: 'stale-non-uuid-id',
      projectPath: '/tmp/demo',
      resume: true,
    },
    services,
    writer,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].projectPath, '/tmp/demo');
  assert.equal('mcpEnabled' in calls[0], false);
});
