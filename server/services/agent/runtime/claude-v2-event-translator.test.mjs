// 翻译层回归测试。
// 这里验证 Claude SDK 消息能稳定映射成项目内部事件。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createClaudeV2EventTranslator, translateClaudeV2Event } from './claude-v2-event-translator.js';
import { executeClaudeRun } from './claude-run-executor.js';

test('executeClaudeRun wraps bare role/content user payloads into the SDK user envelope', async () => {
  const sent = [];
  const session = {
    async send(message) {
      sent.push(message);
    },
    async *stream() {},
  };

  const officialMessage = {
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

  await executeClaudeRun({
    session,
    prompt: 'legacy prompt fallback',
    images: [{ data: 'data:image/png;base64,ignored' }],
    message: officialMessage,
  });

  assert.deepEqual(sent, [{
    type: 'user',
    parent_tool_use_id: null,
    message: officialMessage,
  }]);
});

test('executeClaudeRun keeps already wrapped SDK user payloads unchanged', async () => {
  const sent = [];
  const session = {
    async send(message) {
      sent.push(message);
    },
    async *stream() {},
  };

  const wrappedOfficialMessage = {
    type: 'user',
    parent_tool_use_id: null,
    message: {
      role: 'user',
      content: [
        { type: 'text', text: 'Describe this image' },
      ],
    },
  };

  await executeClaudeRun({
    session,
    prompt: 'legacy prompt fallback',
    message: wrappedOfficialMessage,
  });

  assert.deepEqual(sent, [wrappedOfficialMessage]);
});

test('translator maps assistant deltas and tool lifecycle into agent events', () => {
  const translate = createClaudeV2EventTranslator({
    conversationId: 'conv-1',
    runId: 'run-1',
    sessionId: 'sess-1',
    traceId: 'trace-1',
  });

  const delta = translate(
    {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Hi' }] },
    },
    1,
  );
  const tool = translate(
    {
      type: 'tool_use',
      name: 'Read',
      input: { file_path: '/tmp/a' },
      id: 'tool-1',
    },
    2,
  );

  assert.equal(delta.type, 'run.body.segment_appended');
  assert.equal(delta.payload.segment.text, 'Hi');
  assert.equal(delta.payload.traceId, 'trace-1');
  assert.equal(tool.type, 'tool.call.started');
  assert.equal(tool.payload.toolName, 'Read');
  assert.equal(tool.payload.traceId, 'trace-1');
});

test('translator maps stable completion and failure events for assistant and tools', () => {
  const translate = createClaudeV2EventTranslator({
    conversationId: 'conv-2',
    runId: 'run-2',
    sessionId: 'sess-2',
  });

  const assistantCompleted = translate(
    {
      type: 'assistant_completed',
      message: { content: [{ type: 'text', text: 'Done' }] },
    },
    3,
  );

  const toolFailed = translate(
    {
      type: 'tool_result',
      status: 'error',
      tool_use_id: 'tool-2',
      tool_name: 'Edit',
      error: 'permission denied',
    },
    4,
  );

  assert.equal(assistantCompleted.type, 'assistant.message.completed');
  assert.equal(assistantCompleted.payload.text, 'Done');
  assert.equal(toolFailed.type, 'tool.call.failed');
  assert.equal(toolFailed.payload.toolId, 'tool-2');
  assert.equal(toolFailed.payload.error, 'permission denied');
});

test('translateClaudeV2Event maps assistant message content tool_use blocks into tool lifecycle events', () => {
  const events = translateClaudeV2Event({
    runId: 'run-nested-1',
    sessionId: 'sess-nested-1',
    sequence: 7,
    sdkEvent: {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_123',
            name: 'Write',
            input: {
              file_path: '/workspace/docs/PRD.md',
              content: '# PRD',
            },
          },
        ],
      },
    },
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'tool.call.started');
  assert.equal(events[0].payload.toolId, 'toolu_123');
  assert.equal(events[0].payload.toolName, 'Write');
});

test('translateClaudeV2Event maps user message content tool_result blocks into tool completion events', () => {
  const events = translateClaudeV2Event({
    runId: 'run-nested-2',
    sessionId: 'sess-nested-2',
    sequence: 8,
    sdkEvent: {
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_123',
            is_error: false,
            content: '/workspace/docs/PRD.md',
          },
        ],
      },
    },
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'tool.call.completed');
  assert.equal(events[0].payload.toolId, 'toolu_123');
});

test('translateClaudeV2Event leaves missing tool names empty instead of fabricating unknown', () => {
  const started = translateClaudeV2Event({
    runId: 'run-nested-3',
    sessionId: 'sess-nested-3',
    sequence: 9,
    sdkEvent: {
      type: 'tool_use',
      id: 'toolu_999',
      input: {},
    },
  });

  const completed = translateClaudeV2Event({
    runId: 'run-nested-3',
    sessionId: 'sess-nested-3',
    sequence: 10,
    sdkEvent: {
      type: 'tool_result',
      tool_use_id: 'toolu_999',
      content: 'ok',
    },
  });

  assert.equal(started[0].payload.toolName, null);
  assert.equal(completed[0].payload.toolName, null);
  assert.notEqual(started[0].payload.toolName, 'unknown');
  assert.notEqual(completed[0].payload.toolName, 'unknown');
});

test('translateClaudeV2Event maps tool_use_partial messages into tool.call.delta events', () => {
  const events = translateClaudeV2Event({
    runId: 'run-partial-1',
    sessionId: 'sess-partial-1',
    sequence: 9,
    sdkEvent: {
      type: 'tool_use_partial',
      toolName: 'Write',
      toolCallId: 'tool-1',
      toolInput: {
        file_path: '/workspace/docs/PRD.md',
        content: '# Tit',
      },
    },
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'tool.call.delta');
  assert.equal(events[0].payload.toolName, 'Write');
  assert.deepEqual(events[0].payload.input, {
    file_path: '/workspace/docs/PRD.md',
    content: '# Tit',
  });
});

test('createClaudeV2EventTranslator expands stream_event input_json_delta into tool.call.delta', () => {
  const translate = createClaudeV2EventTranslator({
    runId: 'run-stream-partial',
    sessionId: 'sess-stream-partial',
  });

  const startEvent = translate({
    type: 'stream_event',
    uuid: 'partial-1',
    session_id: 'sess-stream-partial',
    event: {
      type: 'content_block_start',
      index: 0,
      content_block: {
        type: 'tool_use',
        id: 'tool-1',
        name: 'Write',
        input: {},
      },
    },
  }, 10);

  const deltaEvents = translate({
    type: 'stream_event',
    uuid: 'partial-2',
    session_id: 'sess-stream-partial',
    event: {
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'input_json_delta',
        partial_json: '"file_path":"/workspace/docs/PRD.md","content":"# Tit',
      },
    },
  }, 11);

  assert.equal(Array.isArray(startEvent), false);
  assert.equal(startEvent.type, 'sdk.stream_event');
  assert.equal(Array.isArray(deltaEvents), true);
  assert.equal(deltaEvents[0].type, 'tool.call.delta');
  assert.equal(deltaEvents[0].payload.toolName, 'Write');
  assert.deepEqual(deltaEvents[0].payload.input, {
    file_path: '/workspace/docs/PRD.md',
    content: '# Tit',
  });
});

test('translator maps SDK result messages directly to run terminal events', () => {
  const translate = createClaudeV2EventTranslator({
    conversationId: 'conv-3',
    runId: 'run-3',
    sessionId: 'sess-3',
  });

  const completed = translate(
    {
      type: 'result',
      subtype: 'success',
      result: '任务完成',
    },
    5,
  );
  const failed = translate(
    {
      type: 'result',
      subtype: 'error_during_execution',
      result: '',
    },
    6,
  );

  assert.equal(completed.type, 'run.completed');
  assert.equal(completed.payload.result, '任务完成');
  assert.equal(failed.type, 'run.failed');
  assert.equal(failed.payload.subtype, 'error_during_execution');
});

test('translator maps SDK system and stream events into explicit sdk.* envelopes', () => {
  const translate = createClaudeV2EventTranslator({
    conversationId: 'conv-4',
    runId: 'run-4',
    sessionId: 'sess-4',
  });

  const init = translate(
    {
      type: 'system',
      subtype: 'init',
      session_id: 'sess-4',
      cwd: '/workspace/demo',
      model: 'claude-sonnet',
      permissionMode: 'default',
      tools: ['Read'],
    },
    1,
  );
  const partial = translate(
    {
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'Hello' },
      },
      session_id: 'sess-4',
    },
    2,
  );
  const compact = translate(
    {
      type: 'system',
      subtype: 'compact_boundary',
      compact_metadata: { trigger: 'auto', pre_tokens: 1024 },
      session_id: 'sess-4',
    },
    3,
  );

  assert.equal(init.type, 'sdk.system.init');
  assert.equal(init.payload.cwd, '/workspace/demo');
  assert.deepEqual(init.payload.slashCommands, []);
  assert.deepEqual(init.payload.skills, []);
  assert.deepEqual(init.payload.plugins, []);
  assert.equal(partial.type, 'sdk.stream_event');
  assert.equal(partial.payload.text, 'Hello');
  assert.equal(compact.type, 'sdk.compact_boundary');
  assert.equal(compact.payload.tokens, 1024);
});

test('translator preserves the original sdk payload for system/task/hook/result events', () => {
  const translate = createClaudeV2EventTranslator({
    conversationId: 'conv-7',
    runId: 'run-7',
    sessionId: 'sess-7',
  });

  const init = translate(
    {
      type: 'system',
      subtype: 'init',
      uuid: 'uuid-init',
      session_id: 'sess-7',
      apiKeySource: 'env',
      claude_code_version: '1.0.0',
      cwd: '/workspace/demo',
      tools: ['Read', 'Edit'],
      mcp_servers: [{ name: 'fs', status: 'connected' }],
      model: 'claude-sonnet',
      permissionMode: 'default',
      slash_commands: ['help'],
      output_style: 'default',
      skills: ['analysis'],
      plugins: [{ name: 'local', path: '/plugins/local' }],
    },
    1,
  );
  const taskStarted = translate(
    {
      type: 'system',
      subtype: 'task_started',
      task_id: 'task-9',
      tool_use_id: 'tool-9',
      description: 'Analyze codebase',
      task_type: 'analysis',
      uuid: 'uuid-task',
      session_id: 'sess-7',
    },
    2,
  );
  const hookResponse = translate(
    {
      type: 'system',
      subtype: 'hook_response',
      hook_id: 'hook-9',
      hook_name: 'PostToolUse',
      hook_event: 'PostToolUse',
      output: 'ok',
      stdout: 'hook stdout',
      stderr: '',
      exit_code: 0,
      outcome: 'success',
      uuid: 'uuid-hook',
      session_id: 'sess-7',
    },
    3,
  );
  const result = translate(
    {
      type: 'result',
      subtype: 'success',
      result: 'Done',
      duration_ms: 1234,
      duration_api_ms: 1200,
      is_error: false,
      num_turns: 2,
      stop_reason: 'end_turn',
      total_cost_usd: 0.42,
      usage: { input_tokens: 10, output_tokens: 20 },
      modelUsage: { 'claude-sonnet': { inputTokens: 10, outputTokens: 20 } },
      permission_denials: [],
      errors: [],
      structured_output: { done: true },
      uuid: 'uuid-result',
      session_id: 'sess-7',
    },
    4,
  );

  assert.equal(init.type, 'sdk.system.init');
  assert.equal(init.payload.sdk.claude_code_version, '1.0.0');
  assert.equal(init.payload.sdk.mcp_servers[0].name, 'fs');
  assert.deepEqual(init.payload.slashCommands, ['help']);
  assert.deepEqual(init.payload.skills, ['analysis']);
  assert.deepEqual(init.payload.plugins, [{ name: 'local', path: '/plugins/local' }]);
  assert.equal(taskStarted.type, 'sdk.task.started');
  assert.equal(taskStarted.payload.sdk.task_id, 'task-9');
  assert.equal(hookResponse.type, 'sdk.hook.response');
  assert.equal(hookResponse.payload.sdk.exit_code, 0);
  assert.equal(result.type, 'run.completed');
  assert.equal(result.payload.sdk.total_cost_usd, 0.42);
  assert.equal(result.payload.sdk.structured_output.done, true);
});

test('translator maps SDK task and hook events without disguising them as run state', () => {
  const translate = createClaudeV2EventTranslator({
    conversationId: 'conv-5',
    runId: 'run-5',
    sessionId: 'sess-5',
  });

  const taskStarted = translate(
    {
      type: 'system',
      subtype: 'task_started',
      task_id: 'task-1',
      description: 'Analyze codebase',
      task_type: 'analysis',
      session_id: 'sess-5',
    },
    1,
  );
  const hookResponse = translate(
    {
      type: 'system',
      subtype: 'hook_response',
      hook_id: 'hook-1',
      hook_name: 'PostToolUse',
      hook_event: 'PostToolUse',
      output: 'ok',
      outcome: 'success',
      session_id: 'sess-5',
    },
    2,
  );

  assert.equal(taskStarted.type, 'sdk.task.started');
  assert.equal(taskStarted.payload.taskId, 'task-1');
  assert.equal(hookResponse.type, 'sdk.hook.response');
  assert.equal(hookResponse.payload.hookName, 'PostToolUse');
});

test('translator uses a controlled fallback for unknown sdk message types', () => {
  const translate = createClaudeV2EventTranslator({
    conversationId: 'conv-6',
    runId: 'run-6',
    sessionId: 'sess-6',
  });

  const fallback = translate(
    {
      type: 'totally_unknown_event',
      session_id: 'sess-6',
      foo: 'bar',
    },
    1,
  );

  assert.equal(fallback.type, 'run.activity.appended');
  assert.equal(fallback.payload.activity.kind, 'sdk_fallback');
  assert.equal(fallback.payload.activity.sourceType, 'totally_unknown_event');
});

test('translateClaudeV2Event maps unknown sdk events into controlled fallback activity events', () => {
  const events = translateClaudeV2Event({
    sdkEvent: {
      type: 'sdk.weird_new_event',
      foo: 'bar',
    },
    runId: 'run-8',
    sessionId: 'sess-8',
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'run.activity.appended');
  assert.equal(events[0].runId, 'run-8');
  assert.equal(events[0].sessionId, 'sess-8');
  assert.equal(events[0].payload.activity.kind, 'sdk_fallback');
  assert.equal(events[0].payload.activity.sourceType, 'sdk.weird_new_event');
});

test('translateClaudeV2Event maps assistant text into run.body.segment_appended', () => {
  const events = translateClaudeV2Event({
    sdkEvent: {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'hello' }] },
    },
    runId: 'run-9',
    sessionId: 'sess-9',
  });

  assert.ok(events.some((event) => event.type === 'run.body.segment_appended'));
  assert.equal(events.find((event) => event.type === 'run.body.segment_appended').payload.segment.text, 'hello');
});

test('executeClaudeRun emits every translated event in order', async () => {
  const emitted = [];
  const session = {
    async send(prompt) {
      emitted.push(['send', prompt]);
    },
    async *stream() {
      yield {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'hello' }] },
      };
    },
  };

  await executeClaudeRun({
    session,
    prompt: 'ping',
    translateMessage(sdkEvent) {
      return [
        { type: 'run.activity.appended', payload: { activity: { kind: 'sdk_fallback', sourceType: sdkEvent.type } } },
        { type: 'run.body.segment_appended', payload: { segment: { kind: 'phase', text: 'hello' } } },
      ];
    },
    onMessage(event) {
      emitted.push(event.type);
    },
  });

  assert.deepEqual(emitted, [
    ['send', 'ping'],
    'run.activity.appended',
    'run.body.segment_appended',
  ]);
});

test('agent event types clearly separate sdk-mapped and product-only events', async () => {
  const translatorSourcePath = path.join(process.cwd(), 'server/services/agent/runtime/claude-v2-event-translator.js');
  const translatorSource = await fs.readFile(translatorSourcePath, 'utf8');
  const typesSourcePath = path.join(process.cwd(), 'src/components/chat/types/agentEvents.ts');
  const typesSource = await fs.readFile(typesSourcePath, 'utf8');

  assert.match(translatorSource, /SDK-mapped events/i);
  assert.match(translatorSource, /product-only/i);
  assert.match(typesSource, /SDK-mapped/i);
  assert.match(typesSource, /product-only/i);
});
