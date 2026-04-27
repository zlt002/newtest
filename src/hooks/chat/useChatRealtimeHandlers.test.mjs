import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { collectUnseenFileChangeEvents } from './chatRealtimeFileChangeEvents.ts';
import {
  collectDraftPreviewEventsFromAgentV2Event,
  collectRealtimeEventsFromAgentV2Event,
  collectRealtimeEventsFromNormalizedMessage,
  collectRealtimeEventsFromPendingDecisionRequest,
  getAgentV2LatencyMarks,
  shouldAdoptSessionCreatedId,
  shouldConsumeAgentV2Event,
} from './useChatRealtimeHandlers.helpers.ts';

function createToolUseMessage(overrides = {}) {
  return {
    id: 'tool-use-1',
    sessionId: 'session-1',
    timestamp: '2026-04-16T12:00:00.000Z',
    provider: 'claude',
    kind: 'tool_use',
    toolName: 'Edit',
    toolId: 'tool-1',
    toolInput: {
      file_path: '/workspace/demo/login.html',
      lineRange: {
        startLine: 139,
        endLine: 139,
      },
    },
    ...overrides,
  };
}

function createToolResultMessage(overrides = {}) {
  return {
    id: 'tool-result-1',
    sessionId: 'session-1',
    timestamp: '2026-04-16T12:00:01.000Z',
    provider: 'claude',
    kind: 'tool_result',
    toolId: 'tool-1',
    content: 'Updated successfully.',
    isError: false,
    ...overrides,
  };
}

test('collectUnseenFileChangeEvents 先发 started，再在 tool_result 到来后只补发 applied/focus', () => {
  const emittedKeys = new Set();
  const baseMessages = [createToolUseMessage()];

  const startedEvents = collectUnseenFileChangeEvents(baseMessages, emittedKeys);
  assert.deepEqual(
    startedEvents.map((event) => event.type),
    ['file_change_started'],
  );

  const completedEvents = collectUnseenFileChangeEvents(
    [...baseMessages, createToolResultMessage()],
    emittedKeys,
  );
  assert.deepEqual(
    completedEvents.map((event) => event.type),
    ['file_change_applied', 'focus_file_changed'],
  );
});

test('collectUnseenFileChangeEvents 对同一批消息重复调用时不会重复派发', () => {
  const emittedKeys = new Set();
  const messages = [createToolUseMessage(), createToolResultMessage()];

  const firstPass = collectUnseenFileChangeEvents(messages, emittedKeys);
  const secondPass = collectUnseenFileChangeEvents(messages, emittedKeys);

  assert.equal(firstPass.length, 3);
  assert.equal(secondPass.length, 0);
});

test('collectUnseenFileChangeEvents 会保留 file_change_failed 的错误信息', () => {
  const emittedKeys = new Set();
  const messages = [
    createToolUseMessage(),
    createToolResultMessage({
      id: 'tool-result-error-1',
      isError: true,
      content: 'String to replace not found',
    }),
  ];

  const events = collectUnseenFileChangeEvents(messages, emittedKeys);
  const failedEvent = events.find((event) => event.type === 'file_change_failed');

  assert.ok(failedEvent);
  assert.equal(failedEvent.error, 'String to replace not found');
});

test('shouldConsumeAgentV2Event accepts only stable event envelopes', () => {
  assert.equal(
    shouldConsumeAgentV2Event({
      eventId: 'evt-1',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 1,
      type: 'run.started',
      timestamp: '2026-04-19T12:00:00.000Z',
      payload: {},
    }),
    true,
  );

  assert.equal(shouldConsumeAgentV2Event({ type: 'session-status', sessionId: 'sess-1' }), false);
});

test('collectDraftPreviewEventsFromAgentV2Event emits delta and committed events for markdown writes', () => {
  const emittedKeys = new Set();
  const draftOperationCache = new Map();

  const startedEvents = collectDraftPreviewEventsFromAgentV2Event({
    event: {
      eventId: 'evt-1',
      runId: 'run-1',
      sessionId: 'session-1',
      sequence: 1,
      type: 'tool.call.started',
      timestamp: '2026-04-21T10:00:00.000Z',
      payload: {
        toolId: 'tool-1',
        toolName: 'Write',
        input: {
          file_path: '/workspace/docs/PRD-MoneyLens.md',
          content: '# MoneyLens',
        },
      },
    },
    emittedKeys,
    draftOperationCache,
  });

  assert.deepEqual(startedEvents.map((event) => event.type), ['file_change_preview_delta']);
  assert.equal(startedEvents[0].filePath, '/workspace/docs/PRD-MoneyLens.md');
  assert.equal(startedEvents[0].operation.newText, '# MoneyLens');

  const completedEvents = collectDraftPreviewEventsFromAgentV2Event({
    event: {
      eventId: 'evt-2',
      runId: 'run-1',
      sessionId: 'session-1',
      sequence: 2,
      type: 'tool.call.completed',
      timestamp: '2026-04-21T10:00:02.000Z',
      payload: {
        toolId: 'tool-1',
        toolName: 'Write',
      },
    },
    emittedKeys,
    draftOperationCache,
  });

  assert.deepEqual(completedEvents.map((event) => event.type), ['file_change_preview_committed']);
  assert.equal(completedEvents[0].filePath, '/workspace/docs/PRD-MoneyLens.md');
});

test('collectDraftPreviewEventsFromAgentV2Event emits repeated delta events for markdown write partials', () => {
  const emittedKeys = new Set();
  const draftOperationCache = new Map();

  const startedEvents = collectDraftPreviewEventsFromAgentV2Event({
    event: {
      eventId: 'evt-1',
      runId: 'run-1',
      sessionId: 'session-1',
      sequence: 1,
      type: 'tool.call.started',
      timestamp: '2026-04-21T10:00:00.000Z',
      payload: {
        toolId: 'tool-1',
        toolName: 'Write',
        input: {
          file_path: '/workspace/docs/PRD-MoneyLens.md',
          content: '',
        },
      },
    },
    emittedKeys,
    draftOperationCache,
  });

  const deltaEvents = collectDraftPreviewEventsFromAgentV2Event({
    event: {
      eventId: 'evt-2',
      runId: 'run-1',
      sessionId: 'session-1',
      sequence: 2,
      type: 'tool.call.delta',
      timestamp: '2026-04-21T10:00:00.500Z',
      payload: {
        toolId: 'tool-1',
        toolName: 'Write',
        input: {
          file_path: '/workspace/docs/PRD-MoneyLens.md',
          content: '# Money',
        },
      },
    },
    emittedKeys,
    draftOperationCache,
  });

  assert.equal(startedEvents.length, 0);
  assert.deepEqual(deltaEvents.map((event) => event.type), ['file_change_preview_delta']);
  assert.equal(deltaEvents[0].operation.newText, '# Money');
});

test('collectRealtimeEventsFromAgentV2Event maps raw V2 events into raw feed blocks', () => {
  const blocks = collectRealtimeEventsFromAgentV2Event({
    eventId: 'evt-1',
    sessionId: 'sess-1',
    timestamp: '2026-04-22T10:00:00.000Z',
    type: 'tool.call.started',
    payload: {
      toolId: 'tool-1',
      toolName: 'Read',
      input: {
        file_path: '/workspace/demo/app.ts',
      },
    },
  });

  assert.deepEqual(blocks.map((event) => event.type), ['sdk.message']);
  assert.equal(blocks[0].message?.kind, 'tool.call.started');
  assert.match(String(blocks[0].message?.text || ''), /\/workspace\/demo\/app\.ts/);
});

test('collectRealtimeEventsFromAgentV2Event maps body segments to assistant.message.delta sdk messages', () => {
  const blocks = collectRealtimeEventsFromAgentV2Event({
    eventId: 'evt-body-1',
    sessionId: 'sess-1',
    timestamp: '2026-04-22T10:00:00.000Z',
    type: 'run.body.segment_appended',
    payload: {
      segment: {
        text: '你好，世界',
      },
    },
  });

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'sdk.message');
  assert.equal(blocks[0].message?.kind, 'assistant.message.delta');
  assert.equal(blocks[0].message?.text, '你好，世界');
});

test('collectRealtimeEventsFromAgentV2Event maps fallback thinking activity into sdk.message thinking blocks', () => {
  const blocks = collectRealtimeEventsFromAgentV2Event({
    eventId: 'evt-thinking-1',
    sessionId: 'sess-1',
    timestamp: '2026-04-26T10:00:00.000Z',
    type: 'run.activity.appended',
    payload: {
      activity: {
        raw: {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'thinking',
                thinking: '先判断历史消息和实时消息是谁重复了。',
              },
            ],
          },
        },
      },
    },
  });

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'sdk.message');
  assert.equal(blocks[0].message?.kind, 'thinking');
  assert.equal(blocks[0].message?.text, '先判断历史消息和实时消息是谁重复了。');
});

test('collectRealtimeEventsFromAgentV2Event maps subagent progress lifecycle into sdk.message blocks', () => {
  const taskStartedBlocks = collectRealtimeEventsFromAgentV2Event({
    eventId: 'evt-task-started-1',
    runId: 'run-1',
    sessionId: 'sess-1',
    timestamp: '2026-04-26T09:27:41.000Z',
    type: 'sdk.task.started',
    payload: {
      taskId: 'task-1',
      taskType: 'agent',
      description: '调研佛山经济概况',
      toolId: 'parent-tool-1',
    },
  });

  const taskProgressBlocks = collectRealtimeEventsFromAgentV2Event({
    eventId: 'evt-task-progress-1',
    runId: 'run-1',
    sessionId: 'sess-1',
    timestamp: '2026-04-26T09:28:20.000Z',
    type: 'sdk.task.progress',
    payload: {
      taskId: 'task-1',
      description: '已抓取 GDP 与产业结构资料',
      toolId: 'parent-tool-1',
      lastToolName: 'WebSearch',
      usage: {
        totalTokens: 3210,
      },
    },
  });

  const toolProgressBlocks = collectRealtimeEventsFromAgentV2Event({
    eventId: 'evt-tool-progress-1',
    runId: 'run-1',
    sessionId: 'sess-1',
    timestamp: '2026-04-26T09:29:10.000Z',
    type: 'sdk.tool.progress',
    payload: {
      toolId: 'child-tool-1',
      toolName: 'WebSearch',
      parentToolUseId: 'parent-tool-1',
      elapsedTimeSeconds: 89,
      taskId: 'task-1',
    },
  });

  assert.deepEqual(taskStartedBlocks.map((event) => event.type), ['sdk.message']);
  assert.equal(taskStartedBlocks[0].message?.kind, 'task_started');
  assert.equal(taskStartedBlocks[0].message?.payload?.taskId, 'task-1');
  assert.equal(taskStartedBlocks[0].message?.payload?.toolId, 'parent-tool-1');

  assert.deepEqual(taskProgressBlocks.map((event) => event.type), ['sdk.message']);
  assert.equal(taskProgressBlocks[0].message?.kind, 'task_progress');
  assert.equal(taskProgressBlocks[0].message?.payload?.lastToolName, 'WebSearch');

  assert.deepEqual(toolProgressBlocks.map((event) => event.type), ['sdk.message']);
  assert.equal(toolProgressBlocks[0].message?.kind, 'tool_progress');
  assert.equal(toolProgressBlocks[0].message?.payload?.parentToolUseId, 'parent-tool-1');
  assert.equal(toolProgressBlocks[0].message?.payload?.elapsedTimeSeconds, 89);
});

test('collectRealtimeEventsFromNormalizedMessage no longer backfills legacy interaction messages into raw feed blocks', () => {
  const interactionBlocks = collectRealtimeEventsFromNormalizedMessage({
    kind: 'interactive_prompt',
    requestId: 'req-1',
    toolName: 'AskUserQuestion',
    content: '要继续吗',
    input: { options: ['yes', 'no'] },
  }, 'sess-1');
  const statusBlocks = collectRealtimeEventsFromNormalizedMessage({
    kind: 'status',
    text: 'working',
    tokenBudget: { used: 2 },
  }, 'sess-1');

  assert.deepEqual(interactionBlocks, []);
  assert.deepEqual(statusBlocks.map((event) => event.type), ['session.status']);
});

test('collectRealtimeEventsFromPendingDecisionRequest projects question and approval recovery requests into raw feed blocks', () => {
  const questionBlocks = collectRealtimeEventsFromPendingDecisionRequest({
    requestId: 'req-question-1',
    kind: 'interactive_prompt',
    toolName: 'AskUserQuestion',
    questions: [
      {
        question: '要继续吗',
        options: [{ label: '继续' }, { label: '停止' }],
      },
    ],
  }, 'sess-1');

  const approvalBlocks = collectRealtimeEventsFromPendingDecisionRequest({
    requestId: 'req-approval-1',
    kind: 'permission_request',
    toolName: 'Bash',
    input: { command: 'npm test' },
  }, 'sess-1');

  assert.deepEqual(questionBlocks.map((event) => event.type), ['interaction.required']);
  assert.equal(questionBlocks[0].interaction.kind, 'interactive_prompt');
  assert.match(String(questionBlocks[0].interaction.message || ''), /要继续吗/);

  assert.deepEqual(approvalBlocks.map((event) => event.type), ['interaction.required']);
  assert.equal(approvalBlocks[0].interaction.kind, 'permission');
  assert.equal(approvalBlocks[0].interaction.toolName, 'Bash');
});

test('collectRealtimeEventsFromNormalizedMessage maps new transport interaction requests into raw feed blocks', () => {
  const questionBlocks = collectRealtimeEventsFromNormalizedMessage({
    kind: 'question_request',
    requestId: 'req-question-1',
    questions: [
      {
        question: '选择执行方式',
        options: [{ label: '继续' }, { label: '停止' }],
      },
    ],
  }, 'sess-1');

  const approvalBlocks = collectRealtimeEventsFromNormalizedMessage({
    kind: 'tool_approval_request',
    requestId: 'req-approval-1',
    toolName: 'Bash',
    input: { command: 'npm test' },
  }, 'sess-1');

  assert.deepEqual(questionBlocks.map((event) => event.type), ['interaction.required']);
  assert.equal(questionBlocks[0].interaction.kind, 'interactive_prompt');
  assert.match(String(questionBlocks[0].interaction.message || ''), /选择执行方式/);

  assert.deepEqual(approvalBlocks.map((event) => event.type), ['interaction.required']);
  assert.equal(approvalBlocks[0].interaction.kind, 'permission');
  assert.equal(approvalBlocks[0].interaction.toolName, 'Bash');
});

test('collectRealtimeEventsFromNormalizedMessage maps agent_sdk_message envelopes into raw sdk feed blocks', () => {
  const streamBlocks = collectRealtimeEventsFromNormalizedMessage({
    kind: 'agent_sdk_message',
    sdkMessage: {
      sdkType: 'stream_event',
      payload: {
        event: {
          type: 'content_block_delta',
          delta: {
            text: '实时输出',
          },
        },
      },
    },
  }, 'sess-1');

  const resultBlocks = collectRealtimeEventsFromNormalizedMessage({
    kind: 'agent_sdk_message',
    sdkMessage: {
      sdkType: 'result',
      payload: {
        subtype: 'success',
        result: '任务完成',
      },
    },
  }, 'sess-1');

  assert.deepEqual(streamBlocks.map((event) => event.type), ['sdk.message']);
  assert.equal(streamBlocks[0].message.kind, 'assistant.message.delta');
  assert.equal(streamBlocks[0].message.text, '实时输出');

  assert.deepEqual(resultBlocks.map((event) => event.type), ['session.status']);
  assert.equal(resultBlocks[0].status, 'completed');
  assert.match(String(resultBlocks[0].detail || ''), /任务完成/);
});

test('getAgentV2LatencyMarks maps fallback thinking activity into the first thinking mark', () => {
  assert.deepEqual(
    getAgentV2LatencyMarks({
      type: 'run.activity.appended',
      payload: {
        activity: {
          raw: {
            type: 'assistant',
            message: {
              content: [
                {
                  type: 'thinking',
                  thinking: 'Let me reason through the best answer.',
                },
              ],
            },
          },
        },
      },
    }),
    {
      received: 'first_thinking_received',
      rendered: null,
    },
  );
});

test('getAgentV2LatencyMarks still supports direct fallback activity content arrays', () => {
  assert.deepEqual(
    getAgentV2LatencyMarks({
      type: 'run.activity.appended',
      payload: {
        activity: {
          content: [
            {
              type: 'thinking',
              thinking: 'Direct fallback thinking block.',
            },
          ],
        },
      },
    }),
    {
      received: 'first_thinking_received',
      rendered: null,
    },
  );
});

test('getAgentV2LatencyMarks maps V2 assistant body segments into stream received and rendered marks', () => {
  assert.deepEqual(
    getAgentV2LatencyMarks({
      type: 'run.body.segment_appended',
      payload: {
        segment: {
          kind: 'phase',
          text: 'hello',
        },
      },
    }),
    {
      received: 'first_stream_delta_received',
      rendered: 'first_stream_delta_rendered',
    },
  );
});

test('getAgentV2LatencyMarks maps assistant delta events into stream received and rendered marks', () => {
  assert.deepEqual(
    getAgentV2LatencyMarks({
      type: 'assistant.message.delta',
      payload: {
        text: 'world',
      },
    }),
    {
      received: 'first_stream_delta_received',
      rendered: 'first_stream_delta_rendered',
    },
  );
});

test('shouldAdoptSessionCreatedId switches from selected session id to the new runtime session id', () => {
  assert.equal(
    shouldAdoptSessionCreatedId({
      currentSessionId: 'legacy-session-id',
      activeViewSessionId: 'legacy-session-id',
      newSessionId: 'runtime-session-id',
    }),
    true,
  );

  assert.equal(
    shouldAdoptSessionCreatedId({
      currentSessionId: 'runtime-session-id',
      activeViewSessionId: 'legacy-session-id',
      newSessionId: 'runtime-session-id',
    }),
    false,
  );
});

test('shouldAdoptSessionCreatedId rejects runtime session handoff when the trace does not belong to the pending new session', () => {
  assert.equal(
    shouldAdoptSessionCreatedId({
      currentSessionId: 'new-session-123',
      activeViewSessionId: 'new-session-123',
      pendingSessionId: 'session-existing-25-messages',
      newSessionId: 'session-existing-25-messages',
      eventType: 'run.started',
      eventTraceId: 'trace-from-other-session',
      handoffTraceId: 'new-session-123',
      hasPendingSessionHandoff: true,
    }),
    false,
  );
});

test('useChatRealtimeHandlers clears loading directly from terminal V2 run events', async () => {
  const sourcePath = path.join(process.cwd(), 'src/hooks/chat/useChatRealtimeHandlers.ts');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /if \(shouldConsumeAgentV2Event\(msg\)\) \{/);
  assert.match(source, /msg\.type === 'run\.completed'/);
  assert.match(source, /msg\.type === 'run\.failed'/);
  assert.match(source, /msg\.type === 'run\.aborted'/);
  assert.match(source, /setIsLoading\(false\);/);
  assert.match(source, /setCanAbortSession\(false\);/);
  assert.match(source, /setClaudeStatus\(null\);/);
});

test('useChatRealtimeHandlers can adopt the real session id from V2 run events without session_created', async () => {
  const sourcePath = path.join(process.cwd(), 'src/hooks/chat/useChatRealtimeHandlers.ts');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /if \(shouldConsumeAgentV2Event\(msg\)\) \{/);
  assert.match(source, /msg\.sessionId/);
  assert.match(source, /setCurrentSessionId\(runtimeSessionId\);/);
  assert.match(source, /onReplaceTemporarySession\?\.\(runtimeSessionId\);/);
  assert.match(source, /onNavigateToSession\?\.\(runtimeSessionId\);/);
});

test('useChatRealtimeHandlers no longer relies on legacy session_created or complete for V2 lifecycle', async () => {
  const sourcePath = path.join(process.cwd(), 'src/hooks/chat/useChatRealtimeHandlers.ts');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.doesNotMatch(source, /case 'session_created'/);
  assert.doesNotMatch(source, /case 'complete'/);
});

test('useChatRealtimeHandlers emits draft preview callbacks from V2 tool events', async () => {
  const sourcePath = path.join(process.cwd(), 'src/hooks/chat/useChatRealtimeHandlers.ts');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /collectDraftPreviewEventsFromAgentV2Event/);
  assert.match(source, /draftPreviewOperationCacheRef/);
  assert.match(source, /onDraftPreviewEvent && runtimeSessionId/);
  assert.match(source, /onDraftPreviewEvent\(draftPreviewEvent\);/);
});

test('useChatRealtimeHandlers records latency marks from Agent V2 thinking and stream events', async () => {
  const sourcePath = path.join(process.cwd(), 'src/hooks/chat/useChatRealtimeHandlers.ts');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /getAgentV2LatencyMarks/);
  assert.match(source, /const agentV2LatencyMarks = getAgentV2LatencyMarks\(msg\);/);
  assert.match(source, /markClientLatencyEvent\(clientLatencyTraceStore, runtimeSessionId, agentV2LatencyMarks\.received\);/);
  assert.match(source, /markClientLatencyEvent\(clientLatencyTraceStore, runtimeSessionId, agentV2LatencyMarks\.rendered\);/);
});

test('useChatRealtimeHandlers writes V2 and pending decision recovery realtime events into the session realtime store', async () => {
  const sourcePath = path.join(process.cwd(), 'src/hooks/chat/useChatRealtimeHandlers.ts');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /collectRealtimeEventsFromAgentV2Event/);
  assert.match(source, /collectRealtimeEventsFromPendingDecisionRequest/);
  assert.match(source, /agentRealtimeStore\?\.append\(realtimeEvent\);/);
  assert.match(source, /agentRealtimeStore\?\.rebindSession/);
});

test('useChatRealtimeHandlers skips duplicate ChatLatency logging after the trace has already been deleted', async () => {
  const sourcePath = path.join(process.cwd(), 'src/hooks/chat/useChatRealtimeHandlers.ts');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /if \(sessionId && clientLatencyTraceStore\.has\(sessionId\)\) \{/);
  assert.match(source, /clientLatencyTraceStore\.delete\(sessionId\);/);
});

test('useChatRealtimeHandlers splits question requests without relying on AskUserQuestion tool names', async () => {
  const sourcePath = path.join(process.cwd(), 'src/hooks/chat/useChatRealtimeHandlers.ts');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /case 'interactive_prompt'/);
  assert.match(source, /getPendingRequestQuestions/);
  assert.match(source, /isPendingQuestionRequest\(normalizedRequest\)/);
  assert.match(source, /等待你的回答/);
  assert.doesNotMatch(source, /toolName === 'AskUserQuestion'/);
});

test('useChatRealtimeHandlers accepts split pending approvals and questions payloads from reconnect recovery', async () => {
  const sourcePath = path.join(process.cwd(), 'src/hooks/chat/useChatRealtimeHandlers.ts');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /case 'pending-decisions-response'/);
  assert.match(source, /function isPendingDecisionRecoveryResponseType\(type: string\)/);
  assert.match(source, /function resolvePendingDecisionRecoveryRequests\(/);
  assert.match(source, /Array\.isArray\(msg\.approvals\)/);
  assert.match(source, /Array\.isArray\(msg\.questions\)/);
  assert.match(source, /const nextRequests = \[\.\.\.approvalRequests, \.\.\.questionRequests\]/);
  assert.match(source, /case 'pending-decisions-response':/);
  assert.match(source, /if \(isPendingDecisionRecoveryResponseType\(messageType\)\)/);
  assert.doesNotMatch(source, /case 'pending-permissions-response'/);
});

test('server websocket pending recovery returns approvals and questions as separate arrays', async () => {
  const sourcePath = path.join(process.cwd(), 'server/websocket/handlers/chatHandler.js');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /SERVER_EVENT_TYPES\.PENDING_DECISIONS_RESPONSE|type: 'pending-decisions-response'/);
  assert.match(source, /approvals: pendingApprovals/);
  assert.match(source, /questions: pendingInteractivePrompts/);
  assert.doesNotMatch(source, /const pending = \[\.\.\.pendingApprovals, \.\.\.pendingInteractivePrompts\]/);
});

test('server websocket abort path no longer emits legacy complete messages', async () => {
  const sourcePath = path.join(process.cwd(), 'server/websocket/handlers/chatHandler.js');
  const source = await fs.readFile(sourcePath, 'utf8');
  const abortStart = source.indexOf("data.type === 'abort-session'") >= 0
    ? source.indexOf("data.type === 'abort-session'")
    : source.indexOf('CLIENT_EVENT_TYPES.CHAT_INTERRUPT');
  const abortEnd = source.indexOf('CLIENT_EVENT_TYPES.TOOL_APPROVAL_RESPONSE', abortStart);
  const abortSection = source.slice(abortStart, abortEnd);

  assert.match(abortSection, /defaultAgentV2Services\.abortSession/);
  assert.doesNotMatch(abortSection, /kind:\s*['"]complete['"]/);
});

test('server websocket chat handler uses shared transport constants for the primary event names', async () => {
  const sourcePath = path.join(process.cwd(), 'server/websocket/handlers/chatHandler.js');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /CLIENT_EVENT_TYPES\.CHAT_RUN_START/);
  assert.match(source, /CLIENT_EVENT_TYPES\.CHAT_USER_MESSAGE/);
  assert.match(source, /CLIENT_EVENT_TYPES\.TOOL_APPROVAL_RESPONSE/);
  assert.match(source, /CLIENT_EVENT_TYPES\.QUESTION_RESPONSE/);
  assert.match(source, /CLIENT_EVENT_TYPES\.CHAT_INTERRUPT/);
  assert.match(source, /CLIENT_EVENT_TYPES\.CHAT_RECONNECT/);
});

test('server websocket chat handler isolates legacy transport compatibility behind helper predicates', async () => {
  const sourcePath = path.join(process.cwd(), 'server/websocket/handlers/chatHandler.js');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /function isChatRunEventType\(type\)/);
  assert.match(source, /function isToolApprovalResponseEventType\(type\)/);
  assert.match(source, /function isReconnectEventType\(type\)/);
  assert.match(source, /function isPendingDecisionRecoveryEventType\(type\)/);
  assert.match(source, /if \(isChatRunEventType\(data\.type\)\)/);
  assert.match(source, /else if \(isToolApprovalResponseEventType\(data\.type\)\)/);
  assert.match(source, /else if \(isReconnectEventType\(data\.type\)\)/);
  assert.match(source, /else if \(isPendingDecisionRecoveryEventType\(data\.type\)\)/);
  assert.doesNotMatch(source, /'agent-run'/);
  assert.doesNotMatch(source, /'claude-permission-response'/);
  assert.doesNotMatch(source, /'check-session-status'/);
  assert.doesNotMatch(source, /'get-pending-permissions'/);
  assert.doesNotMatch(source, /'abort-session'/);
});
