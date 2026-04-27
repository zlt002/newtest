# Agent V2 会话历史分页设计

## 背景

当前 V2 会话页打开一个已存在 session 时，会绕开旧聊天页基于 `/api/sessions/:id/messages` 的分页历史链路，转而直接调用 `/api/agent-v2/sessions/:id/history` 拉取整段 official history。

现状带来的问题：

- 长会话会在首开时一次性下载完整 history，300KB+ 会话打开明显卡顿。
- 前端会立刻对整段 canonical history 做 `projectHistoricalChatMessages` 和 `projectHistoricalRunCards` 投影，CPU 与渲染压力集中爆发。
- 旧聊天页已经具备“先显示最新内容、向上滚动加载更早消息、顶部提示当前显示范围”的成熟体验，但 V2 会话页没有复用这条路径。

目标是恢复“真正分页历史”：

- 首次只拉最新一页 official history。
- 用户向上滚动时按需加载更早消息。
- 保留现有 V2 run card、realtime catch-up、canonical history 对齐架构。
- 避免重新切回旧 `/api/sessions/:id/messages` 链路承载 V2 会话主展示。

## 目标

- 打开长会话时只请求最新一页 canonical history，而不是全量历史。
- 历史分页的交互体验与旧聊天页保持一致：
  - 默认展示最新内容。
  - 顶部出现“显示 x / total 条消息，向上滚动以加载更多”。
  - 接近顶部时自动加载更早消息。
  - 保留“加载全部消息”能力。
- 现有 V2 实时事件、run card 展示、reconnect catch-up 逻辑继续工作。
- 后续可在此基础上继续做投影缓存，而无需再重构历史数据源。

## 非目标

- 本次不做列表虚拟化。
- 本次不重写 V2 realtime store。
- 本次不把 V2 页面改回旧 session store 作为主数据源。
- 本次不强求底层 official history reader 必须实现文件级尾读优化；如果当前只能全量读取后分页切片，也先接受。

## 当前结构

### 旧聊天页分页链路

- `useChatSessionState` 在首次打开 session 时通过 `/api/sessions/:id/messages?limit=...&offset=0` 只拉一页消息。
- 滚动到顶部时调用 `sessionStore.fetchMore()` 加载更早消息并 prepend。
- `ChatMessagesPane` 在顶部展示“向上滚动以加载更多”提示，并提供“加载全部消息”入口。

### 当前 V2 会话页链路

- `ChatInterface` 对已选中的 session 设置 `disableSelectedSessionServerHydration: true`，绕开旧 session store 的服务端分页加载。
- `useHistoricalAgentConversation` 通过 `fetchSessionHistory()` 调用 `/api/agent-v2/sessions/:id/history`。
- `/api/agent-v2/sessions/:id/history` 当前返回整段 `messages`。
- `ChatInterface` 直接对整段 canonical history 做 `projectHistoricalChatMessages()` 和 `projectHistoricalRunCards()` 投影。

## 方案概览

保留 V2 页面架构不变，把 `official history` 从“整段对象”改为“分页窗口”。

核心思路：

1. 后端 `GET /api/agent-v2/sessions/:id/history` 增加分页参数与分页响应。
2. 前端 `fetchSessionHistory()` 支持按页请求与按页缓存。
3. `useHistoricalAgentConversation()` 维护“已加载的 canonical history 窗口”：
   - 首次载入最新一页。
   - `loadOlder()` 加载更早一页并 prepend。
   - `refresh()` 只刷新尾页或当前窗口的最新段。
4. `ChatInterface` 与 `ChatMessagesPane` 继续消费 `history.messages`，但其语义从“整段历史”变为“当前已加载窗口”。
5. 顶部提示、上滑加载更多、加载全部等交互改由 V2 history 分页驱动。

## 后端设计

### 路由

文件：

- `server/routes/agent-v2.js`

现有：

- `GET /api/agent-v2/sessions/:id/history`

调整后：

- 支持查询参数 `limit`、`offset`
- `limit` 缺省时使用默认页大小，例如 40
- `offset` 缺省时表示“最后一页”，由服务层根据总数换算为尾页起始偏移

示例：

- 首屏：`GET /api/agent-v2/sessions/sess-1/history?limit=40`
- 加载更早：`GET /api/agent-v2/sessions/sess-1/history?limit=40&offset=240`
- 加载全部：`GET /api/agent-v2/sessions/sess-1/history`
  说明：若前端显式传 `limit=null` 的模式不适合 query string，可改为 `full=1`；实现阶段统一敲定一个明确协议。

### 服务层

文件：

- `server/agent-v2/history/session-history-service.js`

新增职责：

- 计算 `total`
- 根据 `limit` 与 `offset` 对 canonical messages 切片
- 当未提供 `offset` 且提供分页 `limit` 时，返回尾页
- 返回分页元信息

建议响应结构：

```json
{
  "sessionId": "sess-1",
  "cwd": "/repo",
  "metadata": {
    "title": null,
    "pinned": false,
    "starred": false,
    "lastViewedAt": null
  },
  "messages": [],
  "page": {
    "offset": 280,
    "limit": 40,
    "returned": 40,
    "total": 320,
    "hasMore": true
  },
  "diagnosticsSummary": {
    "officialMessageCount": 320,
    "debugLogAvailable": true
  }
}
```

分页语义：

- `messages` 保持时间正序，避免前端投影逻辑重写。
- `offset` 表示该页第一个 message 在完整正序历史中的下标。
- `hasMore` 表示在该页之前仍有更早消息可加载。
- `total` 与 `diagnosticsSummary.officialMessageCount` 应保持一致。

### official history reader

本次最低要求：

- 服务层能基于 reader 返回的 `officialHistory.messages` 做尾部分页切片。

后续优化空间：

- 若 reader 可支持仅读取尾部消息，可再进一步降低服务端解析成本。
- 该优化不是本次分页首版的前置条件。

## 前端设计

### API 层

文件：

- `src/components/chat-v2/api/fetchSessionHistory.ts`

调整：

- 参数支持 `limit`、`offset`、`signal`、`force`
- 缓存键从 `sessionId` 升级为 `sessionId + offset + limit`
- 请求去重粒度与缓存粒度保持一致
- 返回类型补充 `page`

建议类型：

```ts
type SessionHistoryPage = {
  sessionId: string;
  cwd: string | null;
  metadata: { ... };
  messages: CanonicalSessionMessage[];
  page: {
    offset: number;
    limit: number | null;
    returned: number;
    total: number;
    hasMore: boolean;
  };
  diagnosticsSummary: {
    officialMessageCount: number;
    debugLogAvailable: boolean;
  };
};
```

### 历史 hook

文件：

- `src/components/chat-v2/hooks/useHistoricalAgentConversation.ts`

从“单次整段加载”改成“分页窗口状态”。

建议状态：

- `history`: 当前已加载窗口拼接后的 canonical history
- `isLoading`: 首屏载入中
- `isLoadingOlder`: 顶部补页中
- `hasMore`: 是否还有更早消息
- `totalMessages`: 完整 canonical history 总数
- `loadOlder()`: 加载更早一页
- `loadAll()`: 加载全部
- `refresh()`: 刷新当前窗口的最新部分

建议内部策略：

- 首屏只请求尾页，例如 40 条。
- `loadOlder()` 依据当前窗口最早消息的 `offset` 决定下一页起点。
- 新页返回后 prepend 到已加载窗口。
- `refresh()` 默认只刷新尾页，再与当前窗口合并，避免一次性失去早前已加载内容。
- 切 session 时 abort 上一个分页请求，保留现有 abort 行为。

### ChatInterface

文件：

- `src/components/chat/view/ChatInterface.tsx`

调整：

- 继续使用 `useHistoricalAgentConversation()`
- `projectHistoricalChatMessages()` 与 `projectHistoricalRunCards()` 改为消费“当前已加载窗口”
- 把 `hasMoreMessages`、`totalMessages`、`isLoadingMoreMessages`、`loadEarlierMessages`、`loadAllMessages` 的来源从旧 `useChatSessionState` 切换到新的 V2 history hook
- 旧 `useChatSessionState` 中仅保留本地回显、滚动、实时临时消息相关能力；不再让它承担 selected session 的分页历史真源

关键点：

- `renderableChatMessages` 仍然只显示用户/错误消息
- `runCards` 仍然由 `projectHistoricalRunCards(history.messages)` 与 `projectLiveRunCards(...)` 组合
- 历史未加载到的更早 run cards 不显示，等用户上滑后再出现，这属于预期行为

### ChatMessagesPane

文件：

- `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`

调整：

- 继续复用现有顶部提示条与“加载全部”浮层
- 将“向上滚动以加载更多”的触发目标改为新的 V2 `loadOlder()`
- 在 runCards 模式下同样展示顶部加载提示
- `sessionMessagesCount` 展示当前窗口内可渲染历史消息数
- `totalMessages` 展示完整 canonical history 总数

交互保持不变：

- 默认显示最新内容
- 上滑接近顶部自动补页
- 顶部有“显示 x / total 条消息，向上滚动以加载更多”
- 用户可点击“加载全部消息”

## 状态流

### 首次打开 session

1. `ChatInterface` 绑定 `activeAgentSessionId`
2. `useHistoricalAgentConversation` 请求尾页 `limit=40`
3. hook 返回当前窗口 `messages`
4. `ChatInterface` 以当前窗口投影 `historicalChatMessages` 与 `historicalRunCards`
5. `ChatMessagesPane` 默认显示窗口底部内容

### 用户向上滚动

1. 滚动接近顶部
2. `ChatMessagesPane` 触发 `loadOlder()`
3. hook 根据当前窗口最早 offset 请求更早页
4. 新页 prepend 到窗口
5. 恢复滚动位置，避免视图跳动

### realtime / refresh

1. 活跃运行期间，realtime 仍由现有 event store 驱动
2. canonical history refresh 只刷新最新页
3. 当最新页消息数量或最后消息 id 发生变化时，继续使用现有 catch-up 逻辑清理 realtime 残留

## 搜索与“加载全部”

搜索跳转是本次需要明确覆盖的边界。

现有旧逻辑在搜索定位前会触发全量加载。V2 分页后可采用同样策略：

- 若用户通过 search target 打开 session，优先触发 `loadAll()`
- 待全部 canonical history 加载完成后再定位目标消息

这样可以避免复杂的“按目标 offset 逐页回填”逻辑，先保证正确性。

## 测试

### 后端

- `server/routes/agent-v2.test.mjs`
  - 默认只返回尾页
  - 指定 `limit/offset` 时返回正确切片
  - `hasMore/total/offset` 正确

### 前端 API

- `src/components/chat-v2/api/fetchSessionHistory.test.mjs`
  - 带分页参数的请求 URL 正确
  - 缓存键按页区分
  - abort 继续生效

### 前端 hook

- `src/components/chat-v2/hooks/useHistoricalAgentConversation.test.mjs`
  - 首屏只加载尾页
  - `loadOlder()` 会 prepend 更早页
  - session 切换时会 abort 旧请求
  - `refresh()` 不会清空已加载的更早页

### 页面与 UI

- `src/components/chat/view/agentV2Realtime.test.mjs`
  - `ChatInterface` 使用分页历史窗口驱动 `historicalRunCards`
  - reconnect refresh 仍只在需要时触发

- `src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`
  - runCards 模式仍显示顶部“向上滚动以加载更多”
  - 触顶时调用新的 `loadOlder()`
  - “加载全部消息”入口继续可用

## 风险

- 若 official history reader 本身仍需全量解析 jsonl，本次主要解决前端首屏体感和网络传输大小，服务端 CPU 下降有限。
- canonical history 分页后，某些基于“整段历史都在内存里”的推导需要改为接受“当前窗口”语义。
- `refresh()` 合并尾页时必须避免重复消息与顺序错乱。

## 实施建议

分两步落地：

1. 先打通 API 分页与前端窗口分页，恢复长会话“首屏尾页 + 上滑补页”。
2. 再基于分页窗口评估是否需要增加 run card 投影缓存与更深层 reader 尾读优化。

这样可以优先解决用户当前最痛的 300KB+ 长会话首开卡顿问题，同时把风险控制在最小范围内。
