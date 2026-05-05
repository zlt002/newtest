import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendSdkEventTimeline,
  createLatencyTrace,
  markLatencyTrace,
  buildClaudeInvocationSnapshot,
  summarizeMcpServersForTrace,
  summarizeSdkEventForTrace,
} from './claude-latency-trace.js';

test('createLatencyTrace and markLatencyTrace keep the first timestamp for each milestone', () => {
  const trace = createLatencyTrace({
    traceId: 'trace-1',
    sessionId: null,
    source: 'chat-ws',
    commandPreview: 'hi',
  });

  markLatencyTrace(trace, 'send_clicked', 1000);
  markLatencyTrace(trace, 'send_clicked', 2000);
  markLatencyTrace(trace, 'first_sdk_event', 3500);

  assert.deepEqual(trace.marks, {
    send_clicked: 1000,
    first_sdk_event: 3500,
  });
});

test('buildClaudeInvocationSnapshot excludes mcpEnabled while preserving key invocation fields', () => {
  const snapshot = buildClaudeInvocationSnapshot({
    projectPath: '/repo/demo',
    cwd: '/repo/demo',
    sessionId: '550e8400-e29b-41d4-a716-446655440000',
    toolsSettings: {
      allowedTools: ['Read'],
      disallowedTools: ['Bash'],
      skipPermissions: true,
    },
    permissionMode: 'default',
    model: 'sonnet',
    mcpEnabled: false,
  });

  assert.equal(snapshot.mcpEnabled, undefined);
  assert.equal(snapshot.projectPath, '/repo/demo');
  assert.equal(snapshot.cwd, '/repo/demo');
  assert.equal(snapshot.sessionId, '550e8400-e29b-41d4-a716-446655440000');
  assert.equal(snapshot.resume, true);
  assert.equal(snapshot.permissionMode, 'default');
  assert.equal(snapshot.model, 'sonnet');
  assert.deepEqual(snapshot.allowedTools, ['Read']);
  assert.deepEqual(snapshot.disallowedTools, ['Bash']);
  assert.equal(snapshot.skipPermissions, true);
});

test('summarizeSdkEventForTrace preserves mcp_servers observation in init events', () => {
  const summary = summarizeSdkEventForTrace({
    type: 'system',
    subtype: 'init',
    session_id: 'sess-obs',
    mcp_servers: {
      context7: {
        type: 'stdio',
        command: 'npx',
        status: 'connected',
        tools: [{ name: 'resolve-library-id' }],
      },
    },
  });

  assert.equal(summary.type, 'system');
  assert.equal(summary.subtype, 'init');
  assert.equal(summary.sessionId, 'sess-obs');
  assert.equal(summary.mcpServers.length, 1);
  assert.deepEqual(summary.mcpServers[0], {
    name: 'context7',
    transport: 'stdio',
    target: 'npx',
    status: 'connected',
    toolCount: 1,
  });
});

test('summarizeSdkEventForTrace keeps the first event readable without dumping the full payload', () => {
  assert.deepEqual(
    summarizeSdkEventForTrace({
      type: 'result',
      session_id: 'sess-3',
      subtype: 'message_stop',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'hello' },
          { type: 'thinking', thinking: 'reasoning' },
        ],
      },
      modelUsage: {
        sonnet: { inputTokens: 12, outputTokens: 34 },
      },
    }),
    {
      type: 'result',
      subtype: 'message_stop',
      sessionId: 'sess-3',
      role: 'assistant',
      contentTypes: ['text', 'thinking'],
      contentPreview: ['hello', 'reasoning'],
      keys: ['message', 'modelUsage', 'session_id', 'subtype', 'type'],
      hasModelUsage: true,
      mcpServers: [],
    },
  );
});

test('summarizeMcpServersForTrace extracts transport, target, status, and tool counts from SDK system payloads', () => {
  assert.deepEqual(
    summarizeMcpServersForTrace({
      context7: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@upstash/context7-mcp'],
        status: 'connected',
        tools: [{ name: 'resolve-library-id' }, { name: 'get-library-docs' }],
      },
      'web-search-prime': {
        type: 'http',
        url: 'https://example.com/mcp',
        state: 'ready',
        toolCount: 3,
      },
    }),
    [
      {
        name: 'context7',
        transport: 'stdio',
        target: 'npx',
        status: 'connected',
        toolCount: 2,
      },
      {
        name: 'web-search-prime',
        transport: 'http',
        target: 'https://example.com/mcp',
        status: 'ready',
        toolCount: 3,
      },
    ],
  );
});

test('appendSdkEventTimeline records compact event snapshots with relative timing and normalized kinds', () => {
  const trace = createLatencyTrace({
    traceId: 'trace-4',
    sessionId: 'sess-4',
    source: 'chat-ws',
    commandPreview: 'timeline',
  });
  markLatencyTrace(trace, 'sdk_query_started', 100);
  const metadata = {};

  appendSdkEventTimeline(metadata, trace, {
    type: 'system',
    subtype: 'init',
    session_id: 'sess-4',
    mcp_servers: {
      context7: { type: 'stdio', command: 'npx', status: 'connected', toolCount: 2 },
    },
  }, [], 130);

  appendSdkEventTimeline(metadata, trace, {
    type: 'assistant',
    session_id: 'sess-4',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: 'done' }],
    },
  }, [{ kind: 'text' }], 145);

  assert.deepEqual(metadata.sdkEventTimeline, [
    {
      atMs: 30,
      type: 'system',
      subtype: 'init',
      sessionId: 'sess-4',
      role: null,
      contentTypes: [],
      contentPreview: [],
      keys: ['mcp_servers', 'session_id', 'subtype', 'type'],
      hasModelUsage: false,
      mcpServers: [
        {
          name: 'context7',
          transport: 'stdio',
          target: 'npx',
          status: 'connected',
          toolCount: 2,
        },
      ],
      normalizedKinds: [],
    },
    {
      atMs: 45,
      type: 'assistant',
      subtype: null,
      sessionId: 'sess-4',
      role: 'assistant',
      contentTypes: ['text'],
      contentPreview: ['done'],
      keys: ['message', 'session_id', 'type'],
      hasModelUsage: false,
      mcpServers: [],
      normalizedKinds: ['text'],
    },
  ]);
});

