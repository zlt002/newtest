# CC UI Claude 首包延迟排查 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 CC UI 的 Claude 聊天链路补齐前后端首包延迟诊断埋点，并产出可复现的 UI vs Claude Code CLI 对照数据，确认延迟主要耗在哪一段。

**Architecture:** 先把诊断逻辑抽成前后端两个独立的小工具模块，分别负责记录“发送、首条事件、首条正文 delta、渲染完成”等时间点和参数快照，再把这些工具接入现有 WebSocket 发送与 Claude SDK 查询链路。实现保持只读诊断，不改变现有消息协议和聊天行为；最终通过手工对照实验验证首包延迟发生在 SDK thinking 阶段、前端渲染阶段，还是 UI 独有的参数模式上。

**Tech Stack:** Node.js ESM, node:test, TypeScript React hooks, WebSocket, Claude Agent SDK

---

## File Structure

- Create: `release/windows-lite/server/utils/claude-latency-trace.js` - 后端诊断工具，负责记录时间点、参数快照和可读日志格式
- Create: `release/windows-lite/server/utils/claude-latency-trace.test.mjs` - 后端诊断工具的单元测试
- Modify: `release/windows-lite/server/claude-sdk.js` - 接入 SDK 查询、首条事件、首条 thinking、首条 stream delta 的埋点
- Modify: `release/windows-lite/server/index.js` - 在收到 `claude-command` 时补齐请求起点埋点，并把 writer/session 关联信息传入
- Create: `src/components/chat/utils/latencyTrace.ts` - 前端诊断工具，负责按 session 记录发送、首条 WS 消息、首条 thinking、首条 stream delta 和首渲染完成
- Create: `src/components/chat/utils/latencyTrace.test.mjs` - 前端诊断工具的单元测试
- Modify: `src/contexts/WebSocketContext.tsx` - 为每条 WebSocket 入站消息打第一个接收时间点
- Modify: `src/components/chat/hooks/useChatComposerState.ts` - 为发送 `claude-command` 记录 send 起点和参数快照
- Modify: `src/components/chat/hooks/useChatRealtimeHandlers.ts` - 在收到 `thinking`、`stream_delta`、`session_created`、`complete` 时更新前端诊断状态
- Modify: `package.json` - 把新的前后端诊断测试文件加入现有 `npm test`

### Task 1: 建立后端诊断工具与测试

**Files:**
- Create: `release/windows-lite/server/utils/claude-latency-trace.js`
- Create: `release/windows-lite/server/utils/claude-latency-trace.test.mjs`

- [ ] **Step 1: 写出失败测试，锁定后端诊断工具的最小行为**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createLatencyTrace,
  markLatencyTrace,
  summarizeLatencyTrace,
  buildClaudeInvocationSnapshot,
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

test('summarizeLatencyTrace computes milestone durations from recorded marks', () => {
  const trace = createLatencyTrace({
    traceId: 'trace-2',
    sessionId: 'sess-1',
    source: 'chat-ws',
    commandPreview: '1+1',
  });

  markLatencyTrace(trace, 'send_clicked', 10);
  markLatencyTrace(trace, 'sdk_query_started', 25);
  markLatencyTrace(trace, 'first_sdk_event', 60);
  markLatencyTrace(trace, 'first_stream_delta_sent', 95);

  assert.deepEqual(summarizeLatencyTrace(trace), {
    traceId: 'trace-2',
    sessionId: 'sess-1',
    source: 'chat-ws',
    durations: {
      sendToSdkStart: 15,
      sdkStartToFirstEvent: 35,
      firstEventToFirstStreamDelta: 35,
    },
    missing: [],
  });
});

test('buildClaudeInvocationSnapshot keeps only the diagnosis-relevant Claude options', () => {
  assert.deepEqual(
    buildClaudeInvocationSnapshot({
      projectPath: '/repo/demo',
      cwd: '/repo/demo',
      sessionId: 'sess-2',
      toolsSettings: {
        allowedTools: ['Read'],
        disallowedTools: ['Bash'],
        skipPermissions: true,
      },
      permissionMode: 'default',
      model: 'sonnet',
    }),
    {
      projectPath: '/repo/demo',
      cwd: '/repo/demo',
      sessionId: 'sess-2',
      resume: true,
      permissionMode: 'default',
      model: 'sonnet',
      allowedTools: ['Read'],
      disallowedTools: ['Bash'],
      skipPermissions: true,
    },
  );
});
```

- [ ] **Step 2: 跑测试确认当前失败**

Run: `node --test release/windows-lite/server/utils/claude-latency-trace.test.mjs`
Expected: FAIL with `Cannot find module './claude-latency-trace.js'`

- [ ] **Step 3: 用最小实现补齐后端诊断工具**

```js
const PREVIEW_MAX = 80;

function toPreview(command = '') {
  const normalized = String(command).replace(/\s+/g, ' ').trim();
  return normalized.length > PREVIEW_MAX ? `${normalized.slice(0, PREVIEW_MAX - 3)}...` : normalized;
}

export function createLatencyTrace({ traceId, sessionId = null, source, commandPreview = '' }) {
  return {
    traceId,
    sessionId,
    source,
    commandPreview: toPreview(commandPreview),
    marks: {},
    metadata: {},
  };
}

export function markLatencyTrace(trace, mark, timestamp = Date.now()) {
  if (!trace?.marks || trace.marks[mark] !== undefined) {
    return trace;
  }
  trace.marks[mark] = timestamp;
  return trace;
}

export function updateLatencyTraceSession(trace, sessionId) {
  if (trace && sessionId && !trace.sessionId) {
    trace.sessionId = sessionId;
  }
  return trace;
}

export function buildClaudeInvocationSnapshot(options = {}) {
  const settings = options.toolsSettings || {};
  return {
    projectPath: options.projectPath || '',
    cwd: options.cwd || '',
    sessionId: options.sessionId || null,
    resume: Boolean(options.sessionId),
    permissionMode: options.permissionMode || 'default',
    model: options.model || null,
    allowedTools: [...(settings.allowedTools || [])],
    disallowedTools: [...(settings.disallowedTools || [])],
    skipPermissions: Boolean(settings.skipPermissions),
  };
}

export function summarizeLatencyTrace(trace) {
  const marks = trace?.marks || {};
  const durations = {};
  const missing = [];

  if (marks.send_clicked !== undefined && marks.sdk_query_started !== undefined) {
    durations.sendToSdkStart = marks.sdk_query_started - marks.send_clicked;
  } else {
    missing.push('sendToSdkStart');
  }

  if (marks.sdk_query_started !== undefined && marks.first_sdk_event !== undefined) {
    durations.sdkStartToFirstEvent = marks.first_sdk_event - marks.sdk_query_started;
  } else {
    missing.push('sdkStartToFirstEvent');
  }

  if (marks.first_sdk_event !== undefined && marks.first_stream_delta_sent !== undefined) {
    durations.firstEventToFirstStreamDelta = marks.first_stream_delta_sent - marks.first_sdk_event;
  } else {
    missing.push('firstEventToFirstStreamDelta');
  }

  return {
    traceId: trace?.traceId || null,
    sessionId: trace?.sessionId || null,
    source: trace?.source || 'unknown',
    durations,
    missing,
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test release/windows-lite/server/utils/claude-latency-trace.test.mjs`
Expected: PASS

- [ ] **Step 5: 提交这一步**

```bash
git add release/windows-lite/server/utils/claude-latency-trace.js release/windows-lite/server/utils/claude-latency-trace.test.mjs
git commit -m "test: add claude latency trace helper"
```

### Task 2: 把后端诊断接入 Claude SDK 和聊天 WebSocket

**Files:**
- Modify: `release/windows-lite/server/index.js`
- Modify: `release/windows-lite/server/claude-sdk.js`

- [ ] **Step 1: 先写失败测试，锁定参数快照和首包埋点输出格式**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildClaudeInvocationSnapshot,
  createLatencyTrace,
  markLatencyTrace,
  summarizeLatencyTrace,
} from './utils/claude-latency-trace.js';

test('claude snapshot captures plan-relevant permission and resume state', () => {
  const snapshot = buildClaudeInvocationSnapshot({
    projectPath: '/repo/demo',
    cwd: '/repo/demo',
    sessionId: null,
    toolsSettings: { allowedTools: [], disallowedTools: [], skipPermissions: false },
    permissionMode: 'plan',
    model: 'sonnet',
  });

  assert.equal(snapshot.resume, false);
  assert.equal(snapshot.permissionMode, 'plan');
  assert.equal(snapshot.model, 'sonnet');
});

test('trace summary exposes missing first stream delta when only thinking happened', () => {
  const trace = createLatencyTrace({
    traceId: 'trace-3',
    sessionId: 'sess-thinking-only',
    source: 'chat-ws',
    commandPreview: 'hi',
  });

  markLatencyTrace(trace, 'send_clicked', 1);
  markLatencyTrace(trace, 'sdk_query_started', 2);
  markLatencyTrace(trace, 'first_sdk_event', 9);
  markLatencyTrace(trace, 'first_thinking_event', 10);

  const summary = summarizeLatencyTrace(trace);
  assert.equal(summary.durations.sdkStartToFirstEvent, 7);
  assert.ok(summary.missing.includes('firstEventToFirstStreamDelta'));
});
```

- [ ] **Step 2: 跑测试确认当前仍然失败在接线缺失**

Run: `node --test release/windows-lite/server/utils/claude-latency-trace.test.mjs`
Expected: FAIL because the helper does not yet include session updates and the server files do not call it

- [ ] **Step 3: 以最小改动接入 `server/index.js` 的发送起点埋点**

```js
import {
  buildClaudeInvocationSnapshot,
  createLatencyTrace,
  markLatencyTrace,
} from './utils/claude-latency-trace.js';

if (data.type === 'claude-command') {
  const trace = createLatencyTrace({
    traceId: `claude-${Date.now()}`,
    sessionId: data.options?.sessionId || null,
    source: 'chat-ws',
    commandPreview: data.command || '',
  });

  trace.metadata.invocation = buildClaudeInvocationSnapshot(data.options || {});
  markLatencyTrace(trace, 'send_clicked');
  writer.setLatencyTrace?.(trace);

  await queryClaudeSDK(data.command, data.options, writer);
}
```

- [ ] **Step 4: 以最小改动接入 `server/claude-sdk.js` 的 SDK 链路埋点**

```js
import {
  markLatencyTrace,
  summarizeLatencyTrace,
  updateLatencyTraceSession,
} from './utils/claude-latency-trace.js';

const latencyTrace = typeof ws.getLatencyTrace === 'function' ? ws.getLatencyTrace() : null;
markLatencyTrace(latencyTrace, 'sdk_query_started');

queryInstance = query({
  prompt: finalCommand,
  options: sdkOptions
});

markLatencyTrace(latencyTrace, 'sdk_query_instance_created');

for await (const message of queryInstance) {
  if (message.session_id && !capturedSessionId) {
    capturedSessionId = message.session_id;
    updateLatencyTraceSession(latencyTrace, capturedSessionId);
  }

  markLatencyTrace(latencyTrace, 'first_sdk_event');

  const transformedMessage = transformMessage(message);
  const normalized = claudeAdapter.normalizeMessage(transformedMessage, capturedSessionId || sessionId || null);

  for (const msg of normalized) {
    if (msg.kind === 'thinking') {
      markLatencyTrace(latencyTrace, 'first_thinking_event');
    }
    if (msg.kind === 'stream_delta') {
      markLatencyTrace(latencyTrace, 'first_stream_delta_sent');
    }
    ws.send(msg);
  }
}

console.log('[ClaudeLatency]', summarizeLatencyTrace(latencyTrace), latencyTrace?.metadata?.invocation || {});
```

- [ ] **Step 5: 给 `WebSocketWriter` 补最小 trace 存取接口**

```js
class WebSocketWriter {
  constructor(ws, userId = null) {
    this.ws = ws;
    this.userId = userId;
    this.sessionId = null;
    this.latencyTrace = null;
  }

  setLatencyTrace(trace) {
    this.latencyTrace = trace;
  }

  getLatencyTrace() {
    return this.latencyTrace;
  }
}
```

- [ ] **Step 6: 运行后端测试确认通过**

Run: `node --test release/windows-lite/server/utils/claude-latency-trace.test.mjs`
Expected: PASS

- [ ] **Step 7: 提交这一步**

```bash
git add release/windows-lite/server/index.js release/windows-lite/server/claude-sdk.js release/windows-lite/server/utils/claude-latency-trace.js release/windows-lite/server/utils/claude-latency-trace.test.mjs
git commit -m "feat: trace claude sdk first token latency"
```

### Task 3: 建立前端诊断工具与测试

**Files:**
- Create: `src/components/chat/utils/latencyTrace.ts`
- Create: `src/components/chat/utils/latencyTrace.test.mjs`

- [ ] **Step 1: 写失败测试，锁定前端 trace 的 session 迁移和首包标记行为**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createClientLatencyTraceStore,
  markClientLatencyEvent,
  rebindClientLatencyTrace,
  summarizeClientLatencyTrace,
} from './latencyTrace.ts';

test('client trace keeps marks when temporary session is rebound to the real session id', () => {
  const store = createClientLatencyTraceStore();

  markClientLatencyEvent(store, 'new-session-1', 'send_clicked', 10, { provider: 'claude' });
  markClientLatencyEvent(store, 'new-session-1', 'first_thinking_received', 40);
  rebindClientLatencyTrace(store, 'new-session-1', 'session-real-1');
  markClientLatencyEvent(store, 'session-real-1', 'first_stream_delta_received', 90);

  const summary = summarizeClientLatencyTrace(store, 'session-real-1');
  assert.equal(summary.durations.sendToThinking, 30);
  assert.equal(summary.durations.thinkingToFirstStreamDelta, 50);
});

test('client summary reports missing render mark until the first stream delta is flushed', () => {
  const store = createClientLatencyTraceStore();

  markClientLatencyEvent(store, 'sess-2', 'send_clicked', 1);
  markClientLatencyEvent(store, 'sess-2', 'first_stream_delta_received', 25);

  const summary = summarizeClientLatencyTrace(store, 'sess-2');
  assert.ok(summary.missing.includes('streamDeltaToRendered'));
});
```

- [ ] **Step 2: 跑测试确认当前失败**

Run: `node --test src/components/chat/utils/latencyTrace.test.mjs`
Expected: FAIL with `Cannot find module './latencyTrace.ts'`

- [ ] **Step 3: 用最小实现补齐前端诊断工具**

```ts
export type ClientLatencyMark =
  | 'send_clicked'
  | 'ws_message_first_received'
  | 'first_thinking_received'
  | 'first_stream_delta_received'
  | 'first_stream_delta_rendered'
  | 'complete_received';

type ClientTraceRecord = {
  sessionId: string;
  marks: Partial<Record<ClientLatencyMark, number>>;
  metadata: Record<string, unknown>;
};

export function createClientLatencyTraceStore() {
  return new Map<string, ClientTraceRecord>();
}

export function markClientLatencyEvent(
  store: Map<string, ClientTraceRecord>,
  sessionId: string,
  mark: ClientLatencyMark,
  timestamp = Date.now(),
  metadata: Record<string, unknown> = {},
) {
  const current = store.get(sessionId) || { sessionId, marks: {}, metadata: {} };
  if (current.marks[mark] === undefined) {
    current.marks[mark] = timestamp;
  }
  current.metadata = { ...current.metadata, ...metadata };
  store.set(sessionId, current);
  return current;
}

export function rebindClientLatencyTrace(
  store: Map<string, ClientTraceRecord>,
  previousSessionId: string,
  nextSessionId: string,
) {
  const current = store.get(previousSessionId);
  if (!current || previousSessionId === nextSessionId) {
    return;
  }
  store.delete(previousSessionId);
  current.sessionId = nextSessionId;
  store.set(nextSessionId, current);
}

export function summarizeClientLatencyTrace(
  store: Map<string, ClientTraceRecord>,
  sessionId: string,
) {
  const trace = store.get(sessionId);
  const marks = trace?.marks || {};
  const durations: Record<string, number> = {};
  const missing: string[] = [];

  if (marks.send_clicked !== undefined && marks.first_thinking_received !== undefined) {
    durations.sendToThinking = marks.first_thinking_received - marks.send_clicked;
  } else {
    missing.push('sendToThinking');
  }

  if (marks.first_thinking_received !== undefined && marks.first_stream_delta_received !== undefined) {
    durations.thinkingToFirstStreamDelta =
      marks.first_stream_delta_received - marks.first_thinking_received;
  } else {
    missing.push('thinkingToFirstStreamDelta');
  }

  if (marks.first_stream_delta_received !== undefined && marks.first_stream_delta_rendered !== undefined) {
    durations.streamDeltaToRendered =
      marks.first_stream_delta_rendered - marks.first_stream_delta_received;
  } else {
    missing.push('streamDeltaToRendered');
  }

  return { sessionId, durations, missing, metadata: trace?.metadata || {} };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test src/components/chat/utils/latencyTrace.test.mjs`
Expected: PASS

- [ ] **Step 5: 提交这一步**

```bash
git add src/components/chat/utils/latencyTrace.ts src/components/chat/utils/latencyTrace.test.mjs
git commit -m "test: add chat latency trace store"
```

### Task 4: 把前端诊断接入发送、WebSocket 接收和渲染链路

**Files:**
- Modify: `src/contexts/WebSocketContext.tsx`
- Modify: `src/components/chat/hooks/useChatComposerState.ts`
- Modify: `src/components/chat/hooks/useChatRealtimeHandlers.ts`
- Modify: `package.json`

- [ ] **Step 1: 写失败测试，锁定发送参数中带 traceId 和思考模式前缀行为**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { insertSlashCommandIntoInput } from './slashCommandSelection.ts';
import { thinkingModes } from '../constants/thinkingModes.ts';

test('thinking mode none keeps the original prompt unchanged', () => {
  const selectedThinkingMode = thinkingModes.find((mode) => mode.id === 'none');
  const messageContent = selectedThinkingMode?.prefix ? `${selectedThinkingMode.prefix}: hi` : 'hi';
  assert.equal(messageContent, 'hi');
});

test('slash command helper still preserves argument text after diagnosis changes', () => {
  assert.equal(insertSlashCommandIntoInput('/buil 已有参数', 0, '/build-mcpb'), '/build-mcpb  已有参数');
});
```

- [ ] **Step 2: 跑前端相关测试确认基线通过**

Run: `node --test src/components/chat/hooks/slashCommandSelection.test.mjs src/components/chat/utils/latencyTrace.test.mjs`
Expected: PASS for existing slash-command test and the new latencyTrace helper test

- [ ] **Step 3: 在 `useChatComposerState.ts` 里为每次发送生成 trace 并记录参数快照**

```ts
import {
  createClientLatencyTraceStore,
  markClientLatencyEvent,
} from '../utils/latencyTrace';

const latencyTraceStoreRef = useRef(createClientLatencyTraceStore());

const traceSessionId = effectiveSessionId || sessionToActivate;
const traceId = `claude-${Date.now()}`;

markClientLatencyEvent(
  latencyTraceStoreRef.current,
  traceSessionId,
  'send_clicked',
  Date.now(),
  {
    traceId,
    provider,
    projectPath: resolvedProjectPath,
    model: claudeModel,
    permissionMode,
    thinkingMode,
    hasPendingCompactionSeed: Boolean(pendingCompactionSeed),
  },
);

sendMessage({
  type: 'claude-command',
  command: messageContent,
  options: {
    projectPath: resolvedProjectPath,
    cwd: resolvedProjectPath,
    sessionId: effectiveSessionId,
    resume: Boolean(effectiveSessionId),
    toolsSettings,
    permissionMode,
    model: claudeModel,
    sessionSummary,
    images: uploadedImages,
    traceId,
  },
});
```

- [ ] **Step 4: 在 `WebSocketContext.tsx` 里记录每个 session 的第一条入站消息时间**

```ts
websocket.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    if (data?.sessionId && typeof window !== 'undefined' && window.__ccuiLatencyTraceStore) {
      markClientLatencyEvent(
        window.__ccuiLatencyTraceStore,
        data.sessionId,
        'ws_message_first_received',
      );
    }
    setLatestMessage(data);
  } catch (error) {
    console.error('Error parsing WebSocket message:', error);
  }
};
```

- [ ] **Step 5: 在 `useChatRealtimeHandlers.ts` 里记录 thinking、正文首 delta、session 重绑定和完成事件**

```ts
if (msg.kind === 'stream_delta') {
  markClientLatencyEvent(latencyTraceStoreRef.current, sid, 'first_stream_delta_received');
  const text = msg.content || '';
  if (!text) return;
  streamBufferRef.current += text;
  accumulatedStreamRef.current += text;
  if (!streamTimerRef.current) {
    streamTimerRef.current = window.setTimeout(() => {
      streamTimerRef.current = null;
      if (sid) {
        sessionStore.updateStreaming(sid, accumulatedStreamRef.current, provider);
        markClientLatencyEvent(latencyTraceStoreRef.current, sid, 'first_stream_delta_rendered');
      }
    }, 100);
  }
  return;
}

if (msg.kind === 'thinking' && sid) {
  markClientLatencyEvent(latencyTraceStoreRef.current, sid, 'first_thinking_received');
}

case 'session_created': {
  if (currentSessionId?.startsWith('new-session-')) {
    rebindClientLatencyTrace(latencyTraceStoreRef.current, currentSessionId, newSessionId);
  }
  break;
}

case 'complete': {
  if (sid) {
    markClientLatencyEvent(latencyTraceStoreRef.current, sid, 'complete_received');
    console.log('[ChatLatency]', summarizeClientLatencyTrace(latencyTraceStoreRef.current, sid));
  }
  break;
}
```

- [ ] **Step 6: 把新增测试文件加入 `npm test`**

```json
"test": "node --test \"shared/claudeCommandRegistry.test.mjs\" \"server/utils/ask-user-question.test.mjs\" \"server/utils/claude-sdk-error.test.mjs\" \"server/utils/skill-loader.test.mjs\" \"server/utils/projects-watcher.test.mjs\" \"server/utils/todo-write.test.mjs\" \"src/i18n/tasks.locale.test.mjs\" \"src/components/chat/hooks/builtInCommandBehavior.test.mjs\" \"src/components/chat/hooks/sessionTranscript.test.mjs\" \"src/components/chat/hooks/slashCommandData.test.mjs\" \"src/components/chat/hooks/slashCommandSelection.test.mjs\" \"src/components/chat/utils/latencyTrace.test.mjs\" \"src/components/chat/view/subcomponents/commandMenuGroups.test.mjs\" \"src/components/chat/view/subcomponents/messageCollapse.test.mjs\" \"src/index.css.test.mjs\""
```

- [ ] **Step 7: 跑测试和类型检查确认通过**

Run: `node --test src/components/chat/utils/latencyTrace.test.mjs src/components/chat/hooks/slashCommandSelection.test.mjs && npm run typecheck`
Expected: PASS and `Found 0 errors`

- [ ] **Step 8: 提交这一步**

```bash
git add src/contexts/WebSocketContext.tsx src/components/chat/hooks/useChatComposerState.ts src/components/chat/hooks/useChatRealtimeHandlers.ts src/components/chat/utils/latencyTrace.ts src/components/chat/utils/latencyTrace.test.mjs package.json
git commit -m "feat: trace chat first token latency on client"
```

### Task 5: 运行 UI vs CLI 对照实验并记录结论

**Files:**
- Modify: `docs/superpowers/specs/2026-04-13-cc-ui-claude-latency-diagnosis-design.md`
- Create: `docs/superpowers/plans/2026-04-13-cc-ui-claude-latency-diagnosis-results.md`

- [ ] **Step 1: 启动 release windows-lite 服务**

```bash
cd /Users/zhanglt21/Desktop/cc-ui/cc-ui/release/windows-lite
npm run server
```

Expected: server starts without syntax errors and begins listening on the configured port

- [ ] **Step 2: 在 CC UI 中用同一项目做 3 次 `hi` 对照**

```text
实验条件：
- provider: claude
- model: sonnet
- permissionMode: default
- thinkingMode: none
- 输入: hi
- 会话: 新会话 3 次；必要时再补 3 次 resume 会话
```

Expected: 浏览器控制台出现 `[ChatLatency] ...`，服务端日志出现 `[ClaudeLatency] ...`

- [ ] **Step 3: 在 Claude Code CLI 中做 3 次同样输入并人工记录首个正文时间**

```bash
cd /Users/zhanglt21/Desktop/cc-ui/cc-ui
claude -p "hi"
claude -p "hi"
claude -p "hi"
```

Expected: CLI 在相同目录下开始返回正文；记录首个正文可见时间作为对照

- [ ] **Step 4: 把实验结果写入结果文档**

```md
# CC UI Claude 首包延迟排查结果

## 实验条件

- Project: `/Users/zhanglt21/Desktop/cc-ui/cc-ui`
- Model: `sonnet`
- Prompt: `hi`
- UI runs: 3
- CLI runs: 3

## 观测

- UI `sendToSdkStart`: ...
- UI `sdkStartToFirstEvent`: ...
- UI `firstEventToFirstStreamDelta`: ...
- UI `streamDeltaToRendered`: ...
- CLI first visible token: ...

## 结论

- 首要瓶颈位于：`sdkStartToFirstEvent` / `firstEventToFirstStreamDelta` / `streamDeltaToRendered`
- 参数差异中最可疑项：`resume` / `permissionMode` / `thinkingMode` / `settingSources`
- 下一步建议：...
```

- [ ] **Step 5: 用现有 spec 核对是否覆盖诊断结论**

Run: `rg -n "首包|thinking|resume|permissionMode|stream_delta|对照实验" docs/superpowers/specs/2026-04-13-cc-ui-claude-latency-diagnosis-design.md docs/superpowers/plans/2026-04-13-cc-ui-claude-latency-diagnosis-results.md`
Expected: spec 和结果文档都包含首包链路、参数差异和对照实验结论

- [ ] **Step 6: 提交实验结果**

```bash
git add docs/superpowers/specs/2026-04-13-cc-ui-claude-latency-diagnosis-design.md docs/superpowers/plans/2026-04-13-cc-ui-claude-latency-diagnosis-results.md
git commit -m "docs: capture claude latency diagnosis results"
```

## Self-Review

### Spec coverage

- “首包链路埋点”由 Task 1-4 覆盖
- “参数对比”由 Task 1-2 的 snapshot 与 Task 5 的结果记录覆盖
- “UI 与 CLI 对照实验”由 Task 5 覆盖
- “只做诊断，不先改行为”通过所有任务只增加 trace/log，不改消息协议与默认功能路径来保证

### Placeholder scan

- 计划中没有使用 `TBD`、`TODO` 或“后续补充”
- 每个代码步骤都给了实际代码块
- 每个验证步骤都给了实际命令和预期输出

### Type consistency

- 后端统一使用 `createLatencyTrace / markLatencyTrace / summarizeLatencyTrace`
- 前端统一使用 `markClientLatencyEvent / rebindClientLatencyTrace / summarizeClientLatencyTrace`
- `first_stream_delta_sent` 和 `first_stream_delta_rendered` 在前后端分别代表“已发送”和“已渲染”，语义不混用
