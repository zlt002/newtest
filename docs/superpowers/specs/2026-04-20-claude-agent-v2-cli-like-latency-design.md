# Claude Agent V2 接近 CLI 响应速度收口设计

## 背景

当前项目的 Claude Agent V2 主链路已经基本完成 `session-first` 收口：

- 后端主入口已经切到 `agent-run`
- runtime 主体已经是原生 `SDKSession`
- 会话主标识已经围绕真实 `sessionId`
- 前端当前执行态已经主要由 V2 event store 驱动

但从真实使用体验看，V2 仍然与本机 CLI 存在明显的响应差距，尤其体现在：

1. 首个字符出现时间仍偏慢
2. 同一会话内继续发送消息时，复用收益不够稳定
3. 流式渲染过程中偶尔仍有“停一下再刷”或“像没反应”的体感

本设计不追求牺牲正确性来换速度，也不走“纯前端错觉提速”路线，而是通过重排链路，把真正阻塞首包的路径压短，把非关键工作后移，让当前 V2 尽可能接近 CLI 的交互体感。

## 目标

1. 优先缩短 `send -> 首个可见 delta` 的路径长度。
2. 让已有 `sessionId` 的续聊明显快于新会话首发。
3. 让当前执行态的流式渲染连续、稳定，不再受历史展示链路干扰。
4. 不牺牲 runtime 正确性，不牺牲会话绑定正确性，不重新引入双轨状态真相源。

## 非目标

1. 不追求完全复制 CLI 内部实现。
2. 不移除 `conversation/run/event` 产品模型。
3. 不为提速而放弃事件持久化。
4. 不重构与 Claude 主链路无关的其它 UI 模块。
5. 不在本轮处理多 provider 性能统一问题。

## 成功标准

### 用户体感标准

1. 点击发送后，页面必须立即进入明确的运行态，不能再出现“像没反应”的空窗。
2. 首个 assistant 文本片段出现时间明显接近 CLI。
3. 在同一真实 `sessionId` 中发送第二条、第三条消息时，响应体感应优于新建会话首发。
4. 流式过程中不再因为历史 transcript、旧兼容消息或次级投影刷新而抖动。

### 工程标准

1. 当前执行态只允许由 V2 realtime event 驱动。
2. 首包前只保留最小必要的 `session/run` 硬事实写入。
3. 非关键持久化、兼容镜像、统计和派生更新必须后移，不得阻塞首个 delta。
4. `abort`、`reconnect`、`permission`、`failed` 等能力不能因为提速而失效。

## 方案选择

### 方案 A：首包直通 + 后处理补写

把链路拆成 `fast lane` 和 `slow lane`：

- `fast lane` 只负责尽快拿到并推送首个可见 delta
- `slow lane` 负责补全持久化、兼容镜像、统计和派生更新

优点：

- 直接命中首包速度问题
- 能同时改善首字符延迟和流式连续性
- 与当前 V2 的 `session-first` 结构一致

缺点：

- 需要非常严格地区分硬事实与软事实
- 需要重新定义落库时序与前端状态边界

### 方案 B：续聊热路径优先

优先把已有会话的 `resume/send` 做成最短路径，新会话首发暂时保持现状。

优点：

- 风险相对更低
- 对多轮会话体验改善明显

缺点：

- 对“首个字符出来慢”帮助有限
- 无法充分接近 CLI 首包体验

### 方案 C：前端感知提速优先

主要通过前端更早显示运行态和更快渲染 partial event 来改善感知。

优点：

- 改动相对局部
- 短期见效快

缺点：

- 只能优化感知，不能真正缩短后端首包关键路径
- 难以解决与 CLI 的本质差距

### 结论

采用方案 A，并吸收方案 B 的续聊热路径优化点。  
不采用纯方案 C，因为这会让 UI 看起来更快，但不会真正接近 CLI。

## 设计总览

### 核心原则

1. `首包关键路径` 只保留真正必要的步骤。
2. `显示` 不等待 `完整持久化`。
3. `当前执行态` 与 `历史展示态` 严格分轨。
4. `续聊` 必须比 `新会话首发` 更短、更热。

### 目标链路

系统收口后，主链路应被拆成两条：

1. `fast lane`
   作用：尽快把第一个可见 assistant delta 推到前端

2. `slow lane`
   作用：补全持久化、镜像、统计、摘要、兼容层派生

这两条链路共享相同的基础事实，但只有 `fast lane` 可以决定首屏输出速度。

## Fast Lane 设计

### 首包关键路径

从用户点击发送到页面出现首个 assistant delta，允许经过的步骤仅包括：

1. 前端锁定提交目标 `sessionId`
2. 后端按 `sessionId` 决定 `create` 或 `resume`
3. 获取真实 `SDKSession`
4. 创建最小 `run` 事实
5. 调用 `session.send(...)`
6. 立即消费 `session.stream()`
7. 将首个可显示事件直接推送给前端
8. 前端直接写入当前 execution store 并渲染

### 首包前禁止阻塞的工作

以下工作必须从首包前移出：

1. 非关键数据库补写
2. 历史 transcript 聚合
3. 旧兼容层镜像同步
4. 非关键统计指标生成
5. 非关键投影重算
6. 仅用于分析的扩展日志处理
7. 与当前首屏无关的会话列表刷新

### 续聊热路径

对已有真实 `sessionId` 的续聊路径，必须进一步缩短为：

1. 前端直接提交当前选中的真实 `sessionId`
2. 后端直接命中 session registry
3. 最小创建新 `run`
4. 直接 `send()`
5. 直接 `stream()`

续聊时不得再执行以下慢路径动作：

1. 重新扫描旧消息决定提交目标
2. 重新计算 conversation alias
3. 重新创建产品会话壳
4. 重新做不必要的 runtime 绑定探测

## Slow Lane 设计

### 可以后移的软事实

以下内容保留，但必须移动到 `slow lane`：

1. `run` 扩展元数据补写
2. 历史 transcript 聚合
3. 事件镜像写入兼容结构
4. 会话列表摘要与标题派生
5. 调试、统计、次级分析数据
6. 与首屏无关的派生索引更新

### 后移原则

后移不代表弱一致性，而是代表：

- 首屏显示先依赖 realtime truth
- 持久化随后补齐 persistent truth
- 如果补写失败，系统必须显式暴露 degraded / failed，而不是静默丢失

## 状态模型设计

### 硬事实

以下是首包前必须建立的硬事实：

1. `sessionId`
2. `runId`
3. `run` 已开始
4. 当前 `run` 隶属哪个 `session`
5. 当前执行 panel 应跟随哪个 active run

这些事实不能后移，因为它们直接影响：

1. abort
2. reconnect
3. permission 交互
4. 当前 execution panel 绑定
5. run 生命周期收尾

### 软事实

以下属于可后移软事实：

1. run 扩展字段
2. 历史 summary
3. transcript 补整理结果
4. 兼容字段镜像
5. 分析指标
6. 次级 UI 派生数据

### 真相源定义

收口后只保留以下真相源：

1. `session`
   含义：会话真相源

2. `run`
   含义：单次执行真相源

3. `agentEventStore + projection`
   含义：当前执行显示真相源

4. `run_events`
   含义：持久恢复真相源

明确禁止以下模式：

1. 让历史 transcript 决定当前运行生命周期
2. 让 legacy normalized messages 抢占当前 execution panel
3. 让数据库确认先于 UI 首次渲染

## 事件与持久化设计

### 双层事件语义

系统中的事件分为两层：

1. `realtime truth`
   含义：事件一到就立刻进入当前 execution store，用于即时显示

2. `persistent truth`
   含义：事件异步写入 `run_events`，用于刷新恢复、历史回放和调试

### 事件时序规则

正确的时序应为：

1. SDK event 到达
2. 立即翻译为 V2 realtime event
3. 立即推送前端 execution store
4. 前端立即渲染
5. 后端异步补写持久层

错误的时序是：

1. SDK event 到达
2. 先等数据库写入成功
3. 再把事件推给前端

本设计明确禁止第二种时序。

### 持久化失败处理

若持久化补写失败：

1. 当前已显示内容不得回滚
2. 当前 run 必须进入显式 degraded 或 failed 可见状态
3. reconnect / 历史恢复能力应明确标记风险
4. 错误必须进入 run 生命周期，而不能只留在日志中

## 前端渲染链路设计

### 当前执行态与历史展示态分轨

前端必须拆成两条通道：

1. 当前执行态
   只服务当前正在运行的这轮执行

2. 历史展示态
   只服务已完成或已落库的历史内容

### 当前执行态只认这些输入

1. 当前 `sessionId`
2. 当前 `runId`
3. 来自 V2 的 realtime events
4. `agentEventStore + projection`

### 历史展示态允许保留这些输入

1. transcript
2. 历史 normalized messages
3. session list 摘要
4. 已有缓存回放

### 分轨约束

历史展示态不得再影响以下内容：

1. 当前 execution panel 的 running / failed / completed 状态
2. 当前 run 的首个 assistant delta 展示
3. 当前会话是否处于 active run
4. composer 当前发送目标

### 发送交互设计

用户点击发送后，前端必须立即执行：

1. 锁定当前提交目标 `sessionId`
2. composer 进入 sending / running 态
3. execution panel 切到当前 run
4. 等待首个 delta 接上显示

这一步的设计目的是消除“请求已经发出但页面像没反应”的空窗期。

### 流式顺滑度约束

为减少流式抖动，前端必须避免：

1. 同一 delta 同时走 legacy message 与 V2 event 双路径
2. execution panel 被历史 transcript 短暂覆盖
3. assistant 首段先写缓存再回灌主视图
4. run 收尾依赖旧桥接事件才能完成

## 错误处理

### 新会话失败

1. 运行态需立即可见为 failed
2. 已输出内容保留
3. 提供明确重试路径

### 续聊失败

1. 若问题发生在 runtime resume 或 send 前，必须显式告知用户
2. 不得回退到旧链路偷偷新建另一套会话
3. 不得把失败伪装成“没有响应”

### 持久化补写失败

1. 不影响已显示的 realtime 内容
2. 影响恢复能力时必须显式提示
3. run 状态必须可见地标记风险

## 测试与验证

### Runtime 验证

1. 新会话首发时，`send -> first delta` 不再被非关键持久化阻塞
2. 已有 `sessionId` 的续聊明确走 `resume/send` 热路径
3. permission、abort、reconnect 在新时序下仍然可用

### Repository / Persistence 验证

1. 首包前只写入最小 `session/run` 硬事实
2. `run_events` 支持异步补写
3. 补写失败时 run 能进入可见降级状态

### Frontend 验证

1. 点击发送后立即进入 running 态
2. execution panel 首个 delta 不再等待 transcript 同步
3. 历史消息链路不会覆盖当前执行态
4. 同会话第二条消息的体感快于新会话首发

### E2E Smoke

至少验证以下两个项目：

1. 当前 `cc-ui` 项目
2. `/Users/zhanglt21/Desktop/html`

每个项目至少覆盖：

1. 新建会话首发
2. 同会话连续第二条消息
3. 页面刷新后重连
4. 流式中断 / 失败展示

## 风险与边界

### 主要风险

1. 若硬事实与软事实划分不清，可能出现显示快了但恢复错乱
2. 若 realtime 与 persistence 事件顺序失配，可能造成刷新后历史不一致
3. 若前端仍残留旧状态反向控制，可能继续出现 execution panel 抖动

### 风险控制

1. 明确最小首包前写入集合
2. 明确当前执行态唯一真相源
3. 对后移补写失败建立显式 run 降级标识
4. 补充围绕首包时序的针对性测试，而不是只看最终结果

## 实施建议

建议按以下顺序实施：

1. 先切分 `fast lane / slow lane`
2. 再收紧 `session/run` 最小写入
3. 再让前端 execution panel 完全只看 V2 realtime
4. 最后补全持久化失败降级与性能回归测试

这样做可以先解决最核心的首包问题，再逐步修正续聊与流式顺滑度。

## 结论

当前 V2 若要接近 CLI，关键不在于继续叠加兼容，而在于把系统重新收口成一句话：

**首包走最短关键路径，显示先于补写，续聊比首发更热，当前执行态只看 V2 realtime。**

在不牺牲正确性的前提下，这是一条最平衡、也最符合当前仓库现状的提速方案。
