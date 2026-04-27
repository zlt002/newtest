# Agent V2 History Near-Realtime Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让刷新后的历史回看尽可能接近执行中的 realtime 过程，同时继续统一到单轨 `Run Card` 展示，并消除 `tool_result` 被误渲染成用户气泡的问题。

**Architecture:** 服务端继续输出 canonical history，但把输入事实源从单一 official session 扩展为 `official session + agent jsonl + debug log diagnostics`。前端继续复用现有 `fetchSessionHistory -> useHistoricalAgentConversation -> projectHistoricalRunCards / projectHistoricalChatMessages -> ChatMessagesPane` 主链，只补历史投影边界和对账展示支持。

**Tech Stack:** Node.js、Express、React、TypeScript、Node test runner、现有 agent-v2 history reader / chat-v2 projection 体系

---

### Task 1: 修正历史消息投影边界，防止 tool_result 混入用户气泡

**Files:**
- Modify: `src/components/chat-v2/projection/projectHistoricalChatMessages.ts`
- Modify: `src/components/chat-v2/projection/projectHistoricalChatMessages.test.mjs`

- [ ] **Step 1: 写失败测试，固定 `tool_result(role=user)` 不能再进入 user bubble**

在 `src/components/chat-v2/projection/projectHistoricalChatMessages.test.mjs` 增加这个用例：

```js
test('projectHistoricalChatMessages does not project tool_result records with role=user as user chat bubbles', () => {
  const projected = projectHistoricalChatMessages([
    {
      id: 'u1',
      sessionId: 'sess-1',
      role: 'user',
      text: '帮我调研一下',
      timestamp: '2026-04-23T10:00:00.000Z',
      kind: 'text',
    },
    {
      id: 'tr1',
      sessionId: 'sess-1',
      role: 'user',
      text: '由于网络工具暂时无法使用，我将基于已有知识为您整理佛山市天气与气候调研报告。',
      timestamp: '2026-04-23T10:00:05.000Z',
      kind: 'tool_result',
      type: 'tool_result',
    },
  ]);

  assert.deepEqual(
    projected.map((message) => [message.id, message.type, message.content]),
    [
      ['u1', 'user', '帮我调研一下'],
    ],
  );
});
```

- [ ] **Step 2: 运行测试，确认红灯**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/projection/projectHistoricalChatMessages.test.mjs
```

Expected:

```text
✖ projectHistoricalChatMessages does not project tool_result records with role=user as user chat bubbles
```

- [ ] **Step 3: 用最小实现修正投影边界**

在 `src/components/chat-v2/projection/projectHistoricalChatMessages.ts` 中把 user 投影改成只接受真正的 user `text/message`：

```ts
if (message.role === 'user' && (normalizedKind === 'text' || normalizedKind === 'message' || !normalizedKind)) {
  projected.push({
    id: message.id,
    messageId: message.id,
    type: 'user',
    content: text,
    timestamp: message.timestamp,
    normalizedKind: 'text',
  });
  continue;
}
```

- [ ] **Step 4: 运行测试，确认绿灯**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/projection/projectHistoricalChatMessages.test.mjs
```

Expected:

```text
# pass 3
# fail 0
```

- [ ] **Step 5: 跑这一阶段的相关回归**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test \
  src/components/chat-v2/projection/projectRunCards.test.mjs \
  src/components/chat-v2/projection/projectHistoricalChatMessages.test.mjs \
  src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs \
  src/components/chat/view/agentV2Realtime.test.mjs
```

Expected:

```text
# fail 0
```

- [ ] **Step 6: Commit**

```bash
git add src/components/chat-v2/projection/projectHistoricalChatMessages.ts src/components/chat-v2/projection/projectHistoricalChatMessages.test.mjs
git commit -m "fix: keep historical tool results out of user bubbles"
```

### Task 2: 扩展 official history reader，按时间线合并 agent jsonl 过程

**Files:**
- Modify: `server/agent-v2/history/official-history-reader.js`
- Modify: `server/agent-v2/history/official-history-reader.test.mjs`

- [ ] **Step 1: 写失败测试，固定 agent jsonl 中的 reasoning 和 function call output 会并入 canonical history**

在 `server/agent-v2/history/official-history-reader.test.mjs` 增加一个新用例，覆盖：

```js
test('official history reader merges agent reasoning and tool outputs into canonical time order', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ccui-history-'));
  const projectDir = path.join(tempRoot, '-Users-demo-project');
  await fs.mkdir(projectDir, { recursive: true });

  await fs.writeFile(
    path.join(projectDir, 'sess-near-live.jsonl'),
    [
      JSON.stringify({
        sessionId: 'sess-near-live',
        type: 'user',
        uuid: 'u1',
        timestamp: '2026-04-22T10:00:00.000Z',
        message: { content: [{ type: 'text', text: 'research foshan' }] },
      }),
      JSON.stringify({
        sessionId: 'sess-near-live',
        type: 'assistant',
        uuid: 'task-msg',
        timestamp: '2026-04-22T10:00:01.000Z',
        toolUseResult: { agentId: 'sub-2' },
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'task-call', name: 'Task', input: { description: 'run sub-agent' } }],
        },
      }),
      JSON.stringify({
        sessionId: 'sess-near-live',
        type: 'assistant',
        uuid: 'final-msg',
        timestamp: '2026-04-22T10:00:05.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'final summary' }] },
      }),
    ].join('\n'),
  );

  await fs.writeFile(
    path.join(projectDir, 'agent-sub-2.jsonl'),
    [
      JSON.stringify({
        type: 'response_item',
        timestamp: '2026-04-22T10:00:02.000Z',
        payload: {
          type: 'reasoning',
          summary: [{ text: '先分析佛山经济结构' }],
        },
      }),
      JSON.stringify({
        type: 'response_item',
        timestamp: '2026-04-22T10:00:03.000Z',
        payload: {
          type: 'function_call',
          name: 'shell_command',
          arguments: JSON.stringify({ command: 'pwd' }),
          call_id: 'call-2',
        },
      }),
      JSON.stringify({
        type: 'response_item',
        timestamp: '2026-04-22T10:00:04.000Z',
        payload: {
          type: 'function_call_output',
          call_id: 'call-2',
          output: '/tmp/project',
        },
      }),
    ].join('\n'),
  );

  const reader = createOfficialHistoryReader({ claudeProjectsRoot: tempRoot });
  const history = await reader.readSession({ sessionId: 'sess-near-live' });

  assert.deepEqual(
    history.messages.map((message) => `${message.timestamp}:${message.kind}`),
    [
      '2026-04-22T10:00:00.000Z:text',
      '2026-04-22T10:00:01.000Z:tool_use',
      '2026-04-22T10:00:02.000Z:thinking',
      '2026-04-22T10:00:03.000Z:tool_use',
      '2026-04-22T10:00:04.000Z:tool_result',
      '2026-04-22T10:00:05.000Z:text',
    ],
  );
  assert.equal(history.messages[2].source, 'agent');
  assert.equal(history.messages[3].toolName, 'Bash');
  assert.equal(history.messages[4].toolId, 'call-2');
});
```

- [ ] **Step 2: 运行测试，确认红灯**

Run:

```bash
node --test server/agent-v2/history/official-history-reader.test.mjs
```

Expected:

```text
FAIL ... expected canonical order to include agent reasoning/tool_result
```

- [ ] **Step 3: 用最小实现补齐 agent jsonl 合并与排序**

在 `server/agent-v2/history/official-history-reader.js` 中保持现有结构，只补最小必要逻辑：

1. 继续通过 `toolUseResult.agentId` 找到 `agent-<id>.jsonl`
2. 使用现有 `normalizeAgentFileEntry(...)` 继续把：
   - `reasoning` -> `thinking`
   - `function_call/custom_tool_call` -> `tool_use`
   - `function_call_output/custom_tool_call_output` -> `tool_result`
3. 合并到 `normalizeOfficialSessionHistory(...)` 的统一 `messages` 排序结果里
4. 不破坏现有 `compareCanonicalMessages(...)` 排序规则

这一步如果现有实现已经覆盖一部分，不要重写结构，只修缺口到测试通过。

- [ ] **Step 4: 运行测试，确认绿灯**

Run:

```bash
node --test server/agent-v2/history/official-history-reader.test.mjs
```

Expected:

```text
# fail 0
```

- [ ] **Step 5: 补一个去重测试，防止 session/agent 重复 tool_result**

在 `server/agent-v2/history/official-history-reader.test.mjs` 增加一个最小用例，断言当 session 与 agent file 产生同签名同时间的 `tool_result` 时，只保留一条 canonical message。

测试骨架：

```js
test('official history reader dedupes duplicated tool_result across session and agent files', async () => {
  // 构造 session 和 agent 文件都包含同一个 tool_result
  // 断言 history.messages.filter((m) => m.kind === 'tool_result').length === 1
});
```

- [ ] **Step 6: 运行测试，确认仍然全绿**

Run:

```bash
node --test server/agent-v2/history/official-history-reader.test.mjs
```

Expected:

```text
# fail 0
```

- [ ] **Step 7: Commit**

```bash
git add server/agent-v2/history/official-history-reader.js server/agent-v2/history/official-history-reader.test.mjs
git commit -m "feat: merge agent jsonl into canonical session history"
```

### Task 3: 扩展 session history service diagnostics，支持历史对账

**Files:**
- Modify: `server/agent-v2/history/session-history-service.js`
- Modify: `server/agent-v2/history/session-history-service.test.mjs`
- Modify: `src/components/chat-v2/api/fetchSessionHistory.ts`
- Modify: `src/components/chat-v2/api/fetchSessionHistory.test.mjs`
- Modify: `src/components/chat-v2/types/sessionHistory.ts`

- [ ] **Step 1: 写失败测试，固定 diagnosticsSummary 会带增强对账字段**

在 `server/agent-v2/history/session-history-service.test.mjs` 增加用例：

```js
test('session history service exposes reconciliation diagnostics for enhanced canonical history', async () => {
  const service = createSessionHistoryService({
    officialHistoryReader: {
      async readSession({ sessionId }) {
        return {
          sessionId,
          cwd: '/tmp/project',
          messages: [
            { id: 'msg-1', role: 'user', text: 'hello', kind: 'text', source: 'session' },
            { id: 'msg-2', role: 'assistant', text: 'thinking', kind: 'thinking', source: 'agent' },
          ],
          diagnostics: {
            officialMessageCount: 3,
            ignoredLineCount: 1,
            agentMessageCount: 1,
            debugAugmentedCount: 0,
          },
        };
      },
    },
    hasSessionLogs() {
      return true;
    },
  });

  const history = await service.getSessionHistory({ sessionId: 'sess-diagnostics' });

  assert.deepEqual(history.diagnosticsSummary, {
    officialMessageCount: 2,
    debugLogAvailable: true,
    agentMessageCount: 1,
    debugAugmentedCount: 0,
    historySourceCoverage: 'official+agent',
  });
});
```

- [ ] **Step 2: 运行测试，确认红灯**

Run:

```bash
node --test server/agent-v2/history/session-history-service.test.mjs
```

Expected:

```text
FAIL ... diagnosticsSummary missing agentMessageCount/debugAugmentedCount/historySourceCoverage
```

- [ ] **Step 3: 用最小实现补上 diagnosticsSummary**

在 `server/agent-v2/history/session-history-service.js` 中：

1. 读取 `officialHistory.diagnostics`
2. 补充输出：
   - `agentMessageCount`
   - `debugAugmentedCount`
   - `historySourceCoverage`
3. `historySourceCoverage` 的最小规则：
   - 只有 official -> `official-only`
   - official + agent -> `official+agent`
   - official + agent + debug -> `official+agent+debug`

实现骨架：

```js
const diagnostics = officialHistory?.diagnostics && typeof officialHistory.diagnostics === 'object'
  ? officialHistory.diagnostics
  : {};

const agentMessageCount = Number.isInteger(diagnostics.agentMessageCount) ? diagnostics.agentMessageCount : 0;
const debugAugmentedCount = Number.isInteger(diagnostics.debugAugmentedCount) ? diagnostics.debugAugmentedCount : 0;
const historySourceCoverage = debugAugmentedCount > 0
  ? 'official+agent+debug'
  : agentMessageCount > 0
    ? 'official+agent'
    : 'official-only';
```

并把这些字段写进 `diagnosticsSummary`。

- [ ] **Step 4: 运行测试，确认绿灯**

Run:

```bash
node --test server/agent-v2/history/session-history-service.test.mjs
```

Expected:

```text
# fail 0
```

- [ ] **Step 5: 写失败测试，固定前端 `fetchSessionHistory` 会保留增强 diagnosticsSummary**

在 `src/components/chat-v2/api/fetchSessionHistory.test.mjs` 增加用例：

```js
test('fetchSessionHistory preserves enhanced diagnosticsSummary fields for history reconciliation', async () => {
  const originalFetch = global.fetch;

  global.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        sessionId: 'sess-diag',
        cwd: '/tmp/project',
        metadata: {},
        messages: [],
        diagnosticsSummary: {
          officialMessageCount: 2,
          debugLogAvailable: true,
          agentMessageCount: 4,
          debugAugmentedCount: 1,
          historySourceCoverage: 'official+agent+debug',
        },
        page: {
          offset: 0,
          limit: 40,
          returned: 0,
          total: 0,
          hasMore: false,
        },
      };
    },
  });

  try {
    const history = await fetchSessionHistory('sess-diag', { force: true });
    assert.equal(history.diagnosticsSummary.agentMessageCount, 4);
    assert.equal(history.diagnosticsSummary.debugAugmentedCount, 1);
    assert.equal(history.diagnosticsSummary.historySourceCoverage, 'official+agent+debug');
  } finally {
    global.fetch = originalFetch;
  }
});
```

- [ ] **Step 6: 运行测试，确认红灯**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/api/fetchSessionHistory.test.mjs
```

Expected:

```text
FAIL ... diagnosticsSummary fields missing after normalization
```

- [ ] **Step 7: 用最小实现补上类型与归一化**

在以下文件补齐增强 diagnostics 字段：

`src/components/chat-v2/types/sessionHistory.ts`

```ts
diagnosticsSummary: {
  officialMessageCount: number;
  debugLogAvailable: boolean;
  agentMessageCount?: number;
  debugAugmentedCount?: number;
  historySourceCoverage?: string | null;
};
```

`src/components/chat-v2/api/fetchSessionHistory.ts`

```ts
diagnosticsSummary: {
  officialMessageCount: Number.isFinite(diagnosticsSummary.officialMessageCount)
    ? Number(diagnosticsSummary.officialMessageCount)
    : 0,
  debugLogAvailable: Boolean(diagnosticsSummary.debugLogAvailable),
  agentMessageCount: Number.isFinite(diagnosticsSummary.agentMessageCount)
    ? Number(diagnosticsSummary.agentMessageCount)
    : 0,
  debugAugmentedCount: Number.isFinite(diagnosticsSummary.debugAugmentedCount)
    ? Number(diagnosticsSummary.debugAugmentedCount)
    : 0,
  historySourceCoverage: typeof diagnosticsSummary.historySourceCoverage === 'string'
    ? diagnosticsSummary.historySourceCoverage
    : null,
},
```

- [ ] **Step 8: 运行测试，确认绿灯**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/api/fetchSessionHistory.test.mjs
```

Expected:

```text
# fail 0
```

- [ ] **Step 9: 跑这一阶段的回归**

Run:

```bash
node --test server/agent-v2/history/session-history-service.test.mjs
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/api/fetchSessionHistory.test.mjs
```

Expected:

```text
# fail 0
```

- [ ] **Step 10: Commit**

```bash
git add server/agent-v2/history/session-history-service.js server/agent-v2/history/session-history-service.test.mjs src/components/chat-v2/api/fetchSessionHistory.ts src/components/chat-v2/api/fetchSessionHistory.test.mjs src/components/chat-v2/types/sessionHistory.ts
git commit -m "feat: add history reconciliation diagnostics"
```

### Task 4: 让历史 Run Card 恢复更多过程，并验证接近 realtime

**Files:**
- Modify: `src/components/chat-v2/projection/projectRunCards.test.mjs`
- Modify: `src/components/chat/view/agentV2Realtime.test.mjs`
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`
- Modify: `src/components/chat/view/ChatInterface.tsx`（仅当测试证明需要）

- [ ] **Step 1: 写失败测试，固定“增强历史”会恢复多条过程项而不是只剩 final summary**

在 `src/components/chat-v2/projection/projectRunCards.test.mjs` 增加用例：

```js
test('projectHistoricalRunCards restores near-realtime process layers from enhanced canonical history', () => {
  const cards = projectHistoricalRunCards([
    {
      id: 'user-1',
      sessionId: 'sess-near-live',
      role: 'user',
      text: '请调研佛山',
      timestamp: '2026-04-23T05:00:00.000Z',
      kind: 'text',
      type: 'message',
    },
    {
      id: 'think-1',
      sessionId: 'sess-near-live',
      role: 'assistant',
      text: '先拆成两个子任务',
      timestamp: '2026-04-23T05:00:01.000Z',
      kind: 'thinking',
      type: 'thinking',
    },
    {
      id: 'tool-1',
      sessionId: 'sess-near-live',
      role: 'assistant',
      text: null,
      content: [{ type: 'tool_use', name: 'Task', input: { description: '经济调研' } }],
      timestamp: '2026-04-23T05:00:02.000Z',
      kind: 'tool_use',
      type: 'tool_use',
      toolName: 'Task',
    },
    {
      id: 'result-1',
      sessionId: 'sess-near-live',
      role: 'tool',
      text: '子代理已完成',
      timestamp: '2026-04-23T05:00:03.000Z',
      kind: 'tool_result',
      type: 'tool_result',
    },
    {
      id: 'assistant-1',
      sessionId: 'sess-near-live',
      role: 'assistant',
      text: '最终汇总',
      timestamp: '2026-04-23T05:00:04.000Z',
      kind: 'message',
      type: 'message',
    },
  ]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0].finalResponse, '最终汇总');
  assert.deepEqual(cards[0].processItems.map((item) => item.kind), ['thinking', 'tool_use', 'tool_result']);
});
```

- [ ] **Step 2: 运行测试，确认红灯或证明现状已经覆盖**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/projection/projectRunCards.test.mjs
```

Expected:

```text
如果失败：按失败信息补最小实现
如果已通过：记录现有投影能力满足该用例，不做额外代码改动
```

- [ ] **Step 3: 写一个 UI 级回归测试，固定刷新后不会再出现 assistant 内容的右侧蓝色气泡**

在 `src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs` 中增加用例，模拟：

1. `chatMessages` 只有一条真正用户消息
2. `runCards` 有历史恢复出的 Claude 卡片
3. 不应再出现历史 `tool_result` 文本被作为 `data-message-component` 的 user bubble

测试骨架：

```js
test('ChatMessagesPane does not render historical tool_result copy as right-side user bubbles after refresh', () => {
  const markup = renderPane({
    chatMessages: [
      {
        type: 'user',
        content: '帮我调研佛山',
        timestamp: '2026-04-23T10:00:00.000Z',
      },
    ],
    visibleMessages: [
      {
        type: 'user',
        content: '帮我调研佛山',
        timestamp: '2026-04-23T10:00:00.000Z',
      },
    ],
    runCards: [
      {
        sessionId: 'sess-1',
        anchorMessageId: '',
        cardStatus: 'completed',
        headline: '已完成',
        finalResponse: '最终汇总',
        processItems: [
          {
            id: 'tr1',
            timestamp: '2026-04-23T10:00:05.000Z',
            kind: 'tool_result',
            title: 'tool_result',
            body: '由于网络工具暂时无法使用...',
          },
        ],
        activeInteraction: null,
        startedAt: '2026-04-23T10:00:00.000Z',
        updatedAt: '2026-04-23T10:00:06.000Z',
        completedAt: '2026-04-23T10:00:06.000Z',
        defaultExpanded: false,
        source: 'official-history',
      },
    ],
  });

  assert.equal((markup.match(/className=\"chat-message user/g) || []).length, 1);
  assert.doesNotMatch(markup, /由于网络工具暂时无法使用/);
});
```

- [ ] **Step 4: 运行测试，确认红灯或证明现状已经覆盖**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs
```

Expected:

```text
如果失败：补最小实现直到通过
如果已通过：保留测试，证明该边界已锁住
```

- [ ] **Step 5: 跑完整相关回归**

Run:

```bash
node --test \
  server/agent-v2/history/official-history-reader.test.mjs \
  server/agent-v2/history/session-history-service.test.mjs

node --experimental-strip-types --experimental-specifier-resolution=node --test \
  src/components/chat-v2/api/fetchSessionHistory.test.mjs \
  src/components/chat-v2/projection/projectHistoricalChatMessages.test.mjs \
  src/components/chat-v2/projection/projectRunCards.test.mjs \
  src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs \
  src/components/chat/view/agentV2Realtime.test.mjs
```

Expected:

```text
# fail 0
```

- [ ] **Step 6: Commit**

```bash
git add src/components/chat-v2/projection/projectRunCards.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs src/components/chat/view/agentV2Realtime.test.mjs src/components/chat/view/ChatInterface.tsx
git commit -m "test: lock near-realtime history recovery behavior"
```

## 自检记录

### 1. Spec coverage

已覆盖的 spec 要点：

1. 历史恢复继续输出单轨 `Run Card`：Task 4
2. 历史事实源扩展为 official session + agent jsonl：Task 2
3. diagnostics 支持对账：Task 3
4. `tool_result(role=user)` 不再误入用户气泡：Task 1
5. 分页/缓存语义保持不变：Task 3

尚未在本计划中直接实现的内容：

1. 把 debug log 真正映射为 canonical `session_status/debug_ref` 增量消息

处理方式：

1. 先通过 Task 3 把 diagnostics 对账能力建好
2. 如果 Task 2 的 official session + agent jsonl 覆盖率已足够接近 realtime，则 debug log 映射可作为下一轮独立小计划
3. 如果实施中确认必须补 debug log 才能满足“明显接近 realtime”，需要在执行时追加一个小任务，不应静默扩 scope

### 2. Placeholder scan

已检查：

1. 每个任务都给出具体文件路径
2. 每个代码步骤都给出明确测试或实现骨架
3. 没有使用 TBD / TODO / “后续补充”

### 3. Type consistency

已检查：

1. `diagnosticsSummary` 的新增字段在 service、fetch、types 三层保持一致
2. 历史消息种类统一使用 `text/thinking/tool_use/tool_result/session_status/debug_ref`
3. 前端继续沿用现有 `RunCard` / `CanonicalSessionMessage` 体系，不引入第二套历史协议
