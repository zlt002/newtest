# Claude Agent V2 与 Claude Agent SDK 原生模型对齐去债设计

## 实施进度

截至 2026-04-20，本轮收口已完成以下阶段：

- Phase 0：V2 run events 已成为执行终态的唯一真相源。
- Phase 1：V2 WebSocket 主链路已移除 legacy `complete` 依赖。
- Phase 2：V2 新会话/续跑主链路已移除 `session_created` 业务依赖。
- Phase 3：前端执行态所有权已收紧为 `agentEventStore + projection` 单轨。
- Phase 4：后端 continue 语义已明确为 session-first runtime truth。

当前剩余工作主要是继续薄化 translator 注释/分类与后续数据库层进一步瘦身；其中数据库 schema 真正裁剪应放到兼容协议完全移除之后再单独规划。

## 背景

当前项目中的 Claude Agent V2 已经完成了关键收口：

- 新会话不再串到错误项目
- 继续会话的绑定条件已收紧
- 失败进入显式 run 生命周期
- 新会话前端路径已经收成单轨

但如果目标从“稳定可用”提升为“与 Claude Agent SDK 的原生能力模型高度一致，几乎没有额外兼容债务”，那么当前实现仍然存在明显偏差。

根据当前代码与 Claude Agent SDK 文档的对照，可以确认 SDK 的原生主模型仍然是：

- `session`
- `resume(sessionId)`
- `send() / receive()`
- `system/init` 与 `session_id`
- `assistant / result / stream_event`

而当前项目在 SDK 之上额外叠加了产品内的：

- `conversation`
- `run`
- `agent event envelope`
- `session_created / complete` 等兼容桥接消息

这意味着系统虽然已经“可控”，但距离“原生一致”仍有一段清晰的去债路径。

本设计不再讨论“是否继续收口”，而是只讨论一个问题：

如何按优先级逐步消除当前 V2 与 Claude Agent SDK 原生模型之间的额外包装层和兼容债务。

## 目标

1. 让前后端执行事实尽量贴近 Claude Agent SDK 的原生 session/message 模型。
2. 移除不再必要的旧 chat transport 桥接协议。
3. 减少 `conversation/run/event` 对 SDK `session` 的反向主导。
4. 让维护者能明确区分“SDK 原生能力”和“产品增强层”。
5. 最终把兼容层从“主链路依赖”降为“历史兼容补丁”，直至可删除。

## 非目标

- 不在本轮推翻现有 V2 架构后重写。
- 不要求立即删除全部旧历史展示能力。
- 不改造与 Claude 主链路无关的文件树、右侧面板和其它模块。
- 不在本轮追求数据库完全重建，只做面向模型对齐的收缩。

## 现状判断

### 已经做对的部分

- V2 已经重新拿回新会话和继续会话的控制权。
- `conversationId -> sessionId` 的绑定与反查链路已闭环。
- 前端新会话路径已收成单轨。
- run 失败/中断/完成已经可以被显式投影。

### 当前主要债务

1. SDK 原生一等实体是 `session`，当前系统的一等实体却是 `conversation + run`。
2. 当前同时存在三套语义：
   - SDK 原生消息
   - V2 自定义事件协议
   - 旧 chat transport 协议
3. 前端仍存在双体系桥接：
   - `sessionStore`
   - `agentEventStore`
4. 后端仍需要补发 `session_created` 与 `complete` 之类的兼容消息。
5. V2 event translator 仍承担较厚的协议翻译职责，而不是薄映射。

## 方案选择

本轮采用方案 A：分阶段去桥接，先统一真相源，再收缩兼容协议，最后薄化模型包装层。

### 方案 A：分阶段去桥接

按风险从低到高，逐层去掉当前兼容债。

优点：

- 风险可控
- 每一阶段都有可验证成果
- 不需要一次性重写系统

缺点：

- 一段时间内仍需维持新旧边界共存
- 需要文档、测试和代码同步推进

### 方案 B：直接改成 session-first 架构

把产品层全面改写为以 SDK `session` 为绝对中心，`conversation/run` 全部降级成投影。

优点：

- 原生一致性最高

缺点：

- 改动过大
- 当前项目仍有旧展示链路，直接切换风险高

### 方案 C：继续维持现状，仅增量修补

保留当前桥接层，只继续修局部 bug。

优点：

- 短期成本低

缺点：

- 长期会持续积累认知债与维护债
- 无法达到“高度原生一致”的目标

结论：采用方案 A。

## 设计原则

### 1. 先统一真相源，再删桥接

任何桥接协议都必须在“业务不再依赖它”之后再删除。

禁止顺序颠倒：

- 不能先删 `complete`，再回头找谁还在依赖它
- 不能先删 `session_created`，再回头补 session 绑定逻辑

### 2. session 是 runtime 真相源

如果目标是贴近 Claude Agent SDK 原生模型，则必须明确：

- `session` 是 Claude runtime 真相源
- `conversation` 是产品聚合壳
- `run` 是产品对“单次提交执行轮次”的视图抽象

这三者不能继续在概念上平级混用。

### 3. 产品增强层必须薄且可解释

允许保留产品增强层，但必须满足：

- 可以明确说清为什么 SDK 原生不够
- 可以明确指出增强层的边界
- 不得反向改写 runtime 真相源

### 4. 旧链路只能逐步降权，不能继续扩权

在去债过程中，旧链路可以暂时存在，但不能新增新的控制权。

尤其禁止：

- 新逻辑继续依赖 legacy `complete`
- 新逻辑继续引入新的桥接消息
- 新逻辑继续把 `sessionStore` 作为执行状态真相源

## 分阶段去债路线图

## Phase 0：统一执行真相源

### 目标

让前后端都承认：执行事实只来自 V2 run event 流。

### 要做的事

1. 明确 run 生命周期状态图的唯一来源。
2. 前端的执行中、完成、失败、中断只认：
   - `run.started`
   - `run.completed`
   - `run.failed`
   - `run.aborted`
   - 与同一 run 相关的 assistant/tool 事件
3. 在代码与文档中明确：
   - `session` 是 runtime 真相源
   - `conversation` 是产品会话壳
   - `run` 是单次执行轮次

### 验收标准

- 不再存在“旧 transport 事件决定执行状态”的分支。
- 任何执行态 UI 都能追溯到同一条 run event 链。

### 风险

- 当前前端仍有旧 `complete` 结束判定残留，需要逐步替换。

## Phase 1：去掉 legacy `complete` 业务依赖

### 目标

让结束态完全由 V2 事件决定，不再依赖旧 chat `complete`。

### 要做的事

1. 排查前端所有依赖 `kind === 'complete'` 的逻辑。
2. 逐个改为依赖 V2 run 终态投影。
3. 保留 `complete` 一段过渡期，只用于观测或兼容兜底，不再参与业务判断。
4. 最终删除后端补发 `complete` 的主链路依赖。

### 验收标准

- 前端没有任何关键状态转换依赖 `complete`。
- 去掉 `complete` 后，新会话、继续会话、失败态、中断态都不受影响。

### 优先级说明

这是最值得优先消除的一层债，因为它让系统多维护了一套结束语义。

## Phase 2：收掉 `session_created` 桥接消息

### 目标

让前端不再靠额外桥接消息感知真实 session 绑定。

### 要做的事

1. 列出所有 `session_created` 消费点。
2. 改为从标准初始化消息、标准事件或标准绑定结果中获取 `sessionId`。
3. 把 `session_created` 从主依赖降级为兼容字段。
4. 最终删除主链路中的 `session_created` 依赖。

### 验收标准

- 前端 session 绑定不依赖 `session_created` 才能成立。
- `conversationId -> sessionId` 的绑定结果可通过标准路径恢复与展示。

### 风险

- 当前新会话首发与 session 真实化之间仍有短窗口，处理不当会重新引入路由抖动。

## Phase 3：前端状态源单轨化

### 目标

把前端从“双体系桥接”收成“V2 主状态 + 历史只读状态”。

### 要做的事

1. 让以下职责只由 V2 负责：
   - 新消息发送路径
   - 当前执行状态
   - 失败引导
   - 当前会话执行投影
2. 让 `sessionStore` 只负责：
   - 历史消息回放
   - 旧会话缓存
   - 兼容读取
3. 明确 `agentEventStore` 与 `sessionStore` 的写权限边界。

### 验收标准

- 新会话与继续会话路径不再依赖旧 store 决策。
- 旧 store 不再影响当前执行路由和 run 生命周期。

### 风险

- 如果边界没写清楚，后续开发仍会不小心把新逻辑接回旧 store。

## Phase 4：让后端更贴近 session-first 模型

### 目标

减少产品层 `conversation/run` 对 SDK `session` 的反向主导。

### 要做的事

1. 明确 runtime 恢复的根依据是 `sessionId`。
2. 把 `conversationId` 重新定义为产品聚合键，而不是 runtime 主键。
3. 审视 `continueConversationRun` 的语义：
   - 应该是“继续某个已绑定 session 的产品会话”
   - 而不是“产品会话反过来决定 runtime 一切”
4. 将 session 相关注释、命名、仓储接口表达得更接近 SDK 原生能力。

### 验收标准

- 维护者可以清楚说出哪个字段是 runtime 主键、哪个字段是产品聚合键。
- 后端 resume 逻辑的概念表达贴近 SDK 原生语义。

### 风险

- 这是架构概念重整，不一定需要大规模代码重写，但必须谨慎处理命名与接口。

## Phase 5：薄化事件翻译层

### 目标

让 V2 event translator 变成薄映射，而不是重新发明一套协议。

### 要做的事

1. 给每类事件标记来源：
   - SDK 原生直接映射
   - 产品增强事件
   - 历史兼容事件
2. SDK 已有表达能力的，不再做不必要的二次命名。
3. 产品增强事件只保留 UI 真需要的最小集合。

### 验收标准

- 事件定义文件可以清晰区分三类事件来源。
- 翻译层职责可被压缩到最小必要范围。

## Phase 6：最后做库表与模型瘦身

### 目标

在协议与状态源稳定后，再清理历史遗留结构。

### 要做的事

1. 审视哪些表、字段、索引只是桥接遗留。
2. 删除不再需要的冗余状态。
3. 对保留的数据结构重新命名，使其贴近最终模型。

### 验收标准

- 数据结构能准确反映最终架构，不再服务于已删除协议。
- 不再保留“只是为了兼容历史分支”的冗余字段。

## 推荐执行顺序

建议按以下顺序推进：

1. Phase 0：统一执行真相源
2. Phase 1：去掉 legacy `complete` 业务依赖
3. Phase 2：收掉 `session_created` 桥接消息
4. Phase 3：前端状态源单轨化
5. Phase 4：让后端更贴近 session-first 模型
6. Phase 5：薄化事件翻译层
7. Phase 6：最后做库表与模型瘦身

原因很简单：

- 先统一“谁说了算”
- 再删桥接协议
- 再削薄包装层
- 最后才动持久化结构

## 测试与验收

### 每阶段通用测试要求

- 新会话不串项目
- 继续会话不误续旧 session
- run completed / failed / aborted 都能稳定投影
- 新会话 URL 从草稿态切到真实 session 时不回跳

### SDK 一致性专项验收

在阶段性收口后，需要额外回答这三个问题：

1. 当前执行真相源是否已经更贴近 `session` 与标准消息，而不是自定义桥接协议？
2. 当前是否还依赖 legacy `complete` 或 `session_created` 才能跑通主链路？
3. 当前产品增强层是否还能被清晰解释为“对 SDK 原生能力的薄包装”？

只有这三个问题都能回答得足够清楚，才能认为系统真正接近“原生一致”。

## 结论

当前项目的 V2 已经走出“不可控”的阶段，但还没有达到“高度原生一致、几乎没有兼容债务”的状态。

真正的去债方向不是继续补局部 bug，而是：

- 先统一执行真相源
- 再去掉兼容桥接协议
- 再把 `conversation/run/event` 包装层削薄
- 最后才收缩数据库与模型结构

这条路线不会最激进，但它是当前项目里风险最低、收益最高、最容易持续验证的一条路。
