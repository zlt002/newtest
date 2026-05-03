# 可视化 HTML Pure Runtime Editor 设计

## 背景

`cc-ui` 的可视化 HTML 设计模式已经开始把真实 iframe runtime 引入主链路，但当前仍保留了较强的 GrapesJS 依赖：

- 设计态主显示与真实浏览器仍未完全同源
- 选中、结构、样式、图层、历史等核心能力仍混有 GrapesJS 模型
- 复杂布局下容易出现“看到的是 runtime，保存依据是另一套模型”的双真相问题

如果继续沿着“runtime 显示 + GrapesJS 主编辑内核”的方向迭代，短期能改善体验，但长期仍会反复遇到一致性、定位、保存和复杂布局交互的结构性问题。

因此本轮设计目标从“继续优化 runtime design mode”升级为：

- 第一阶段直接建设 `Full Pure Runtime Editor`
- 让 GrapesJS 退出设计主链路核心职责
- 让 runtime DOM、编辑状态、源码提交之间形成单向清晰链路

## 目标

- 让设计模式的视觉真相完全建立在真实浏览器 runtime 上
- 第一阶段覆盖接近可商用的设计态交互能力
- 第一阶段同时覆盖样式面板、图层树、历史系统、结构编辑和提交管线
- 尽量覆盖 `absolute / fixed / flex / grid / 混合定位 / 响应式断点` 场景
- 继续坚持“浏览器一致性优先”
- 同时坚持“稳定优先”，凡是不能稳定回写源码的操作都禁止提交

## 非目标

- 不在第一阶段支持重脚本驱动应用的完整可视化编辑
- 不保证对 Shadow DOM、微前端容器、复杂 JS 虚拟树页面的通用支持
- 不为了覆盖全部复杂布局而放宽错误保存风险
- 不继续让 GrapesJS 决定设计态的选择、结构、样式或提交真相

## 方案对比

### 方案 A：继续走 Runtime-First / GrapesJS-Assist

做法：

- runtime iframe 负责主要显示
- GrapesJS 继续承担较多编辑模型、样式模型、结构模型职责

优点：

- 复用现有能力最多
- 过渡成本较低

缺点：

- 双真相依旧存在
- 复杂布局保存和交互一致性仍会反复出问题
- 后续越做越难彻底摆脱 GrapesJS 包袱

### 方案 B：Pure Runtime Core，外围能力最小化

做法：

- 先替换选区、交互、保存内核
- 图层树、样式面板、历史系统只做最小可用

优点：

- 风险可控
- 能较快建立纯 runtime 内核

缺点：

- 与“第一阶段接近可商用”的目标不完全匹配
- 需要后续再进行一轮明显扩建

### 方案 C：Full Pure Runtime

做法：

- 第一阶段就把设计主链路切到纯 runtime
- 同时建设 selection model、history、style panel、layer tree、drag/resize/insert、saveability analyzer、commit pipeline

优点：

- 长期架构最干净
- 最符合浏览器一致性优先
- 可以从根上消除设计态与预览态的核心分裂

缺点：

- 第一阶段实现成本和风险最高
- 需要非常严格的模块边界和降级策略

## 结论

选择方案 C：`Full Pure Runtime`。

原因：

- 用户目标已经明确升级为第一阶段接近可商用
- 用户接受复杂实现，但不接受错误保存
- 继续保留 GrapesJS 主链路只会把短期过渡成本变成长债
- 现在已经有 runtime host、overlay、runtime/source bridge 基础，具备继续纯 runtime 化的条件

## 核心原则

Pure Runtime Editor 必须坚持四层真相和单向职责。

### 1. Runtime DOM 是视觉真相

真实 iframe 中的 DOM、CSS、原生 JS 结果，决定用户看到的内容。

### 2. EditorStateStore 是交互真相

所有 hover、选区、多选、框选、拖拽、缩放、插入、历史、面板状态都统一收敛在编辑状态层。

### 3. 源码 HTML/CSS 是持久化真相

磁盘内容决定最终保存结果，不允许任何 runtime 临时状态直接替代源码。

### 4. CommitPipeline 是唯一落盘出口

所有交互、样式修改、结构调整都必须先转成 intent，再经过可保存性分析和验证后才允许写盘。

## 总体架构

第一阶段采用以下核心架构：

`RuntimeDocumentEngine + InteractionEngine + EditorStateStore + InspectorModel + StructureModel + CommitPipeline`

### RuntimeDocumentEngine

职责：

- 管理 iframe runtime 生命周期
- 管理断点与 viewport 会话
- 建立 runtime DOM 索引与稳定节点身份
- 识别隐藏层、复杂布局上下文和可编辑节点
- 提供 runtime node 查询与增量更新能力

### InteractionEngine

职责：

- 点击选中
- hover 高亮
- 多选与框选
- 穿透选择与祖先选择
- 拖拽定位
- 尺寸缩放
- 插入预览
- 隐藏层可视化
- 键盘微调

输出统一的 `EditIntent`，而不是直接修改源码。

### EditorStateStore

职责：

- 维护当前选区、hover 节点、交互模式、断点上下文
- 维护历史栈、未持久化状态、提交错误状态
- 维护图层树和样式面板所需的当前上下文
- 作为 Pure Runtime Editor 的单一状态真相

### InspectorModel

职责：

- 从 runtime node 直接构建样式面板、属性面板、布局面板数据
- 区分 computed 信息与可编辑信息
- 暴露字段级 saveability 反馈

### StructureModel

职责：

- 从真实 DOM 构建 layer tree
- 维护结构重排、插入位置、节点显隐和层级关系
- 与画布交互共用同一批结构化 intent

### CommitPipeline

职责：

- 规范化 intent
- 执行可保存性分析
- 生成最小源码 patch
- 做提交前验证
- 完成写盘或回滚

## 交互模型

### RuntimeNodeRef

所有命中节点统一表示为 `RuntimeNodeRef`，至少包含：

- `nodeId`
- `domPath`
- `fingerprint`
- `layoutContext`
- `breakpointContext`
- `editCapabilities`
- `saveabilityHints`

系统必须在命中时就知道：

- 该节点处于什么布局上下文
- 是否可拖拽、可缩放、可重排、可插入
- 是否允许预演
- 是否允许提交

### Intent 模型

交互不会直接写 DOM 或源码，而是统一生成 intent：

- `MoveNodeIntent`
- `ResizeNodeIntent`
- `ReorderNodeIntent`
- `InsertNodeIntent`
- `UpdateStyleIntent`
- `UpdateAttributeIntent`
- `UpdateTextIntent`

runtime 可以先进行预演，但提交必须再次分析。

### 复杂布局处理

不同布局上下文的 intent 翻译不同：

- `absolute/fixed` 优先翻译为定位和尺寸变化
- `flex` 优先翻译为 sibling reorder 或 flex 相关属性变化
- `grid` 优先翻译为 grid line / area 变化
- 混合定位和响应式上下文下，如果无法稳定推出单一安全修改，则禁止提交

## 样式面板设计

样式面板不再依赖 GrapesJS style manager，而直接绑定 `InspectorModel`。

面板分为四类数据：

### Computed View

只读显示浏览器计算值，例如：

- `display`
- `position`
- `grid-column`
- `flex-grow`
- `font-size`
- `color`

### Editable Source Properties

只显示当前节点可稳定回写的字段，例如：

- inline style
- 稳定属性值
- 可唯一定位的局部规则来源

### Layout Controls

根据布局上下文动态切换字段集：

- `absolute/fixed`：`top/right/bottom/left/width/height`
- `flex item`：`order/align-self/flex-basis/flex-grow/flex-shrink`
- `grid item`：`grid-column/grid-row/justify-self/align-self`

### Saveability Feedback

每个字段都要显示：

- `可安全保存`
- `可预演但不可保存`
- `当前来源复杂，建议改源码`

## 图层树设计

图层树直接来自真实 DOM，而不是设计器虚拟组件树。

每个节点至少包含：

- `nodeId`
- `tagName`
- `displayName`
- `children`
- `isVisible`
- `isHiddenLayer`
- `isLockedForCommit`
- `selectionState`
- `saveabilitySummary`

图层树需要支持：

- 展开与折叠
- 点击选中
- hover 联动画布高亮
- 结构重排预览
- 复杂容器中的真实结构查看
- 不可稳定提交节点的显式标记

图层树拖拽与画布拖拽必须共享同一套 `ReorderNodeIntent`。

## 历史系统

历史栈采用 `intent + patch` 双层模型，而不是大 HTML 快照。

每条历史记录包含：

- `intent`
- `previewPatch`
- `committedPatch`
- `affectedNodeIds`
- `breakpointContext`
- `timestamp`
- `commitStatus`

状态分层：

- `previewing`
- `committed-local`
- `persisted`

要求：

- 高频拖拽和缩放阶段只保留预演态
- 松手后通过可保存性分析才进入正式历史
- 写盘失败时允许回到最近稳定状态

## Saveability Analyzer

可保存性分析器必须是统一规则引擎，而不是散落在 UI 里的局部判断。

输入：

- `RuntimeNodeRef`
- `EditIntent`
- `layoutContext`
- `breakpointContext`
- `sourceMappingState`

输出：

- `safe`
- `preview-only`
- `blocked`

并附带：

- `reasonCode`
- `message`
- `recommendedAction`
- `requiredFallback`

第一阶段规则分四类：

### Always Safe

稳定锚点明确，可映射到单一源码修改。

### Conditionally Safe

只有在额外条件满足时允许提交，例如：

- grid line 显式存在
- 无断点覆盖冲突
- source mapping 唯一

### Preview Only

允许 runtime 预演，但不允许写历史或落盘，例如：

- 复杂 `grid-auto-flow`
- 多媒体查询共同控制
- 来源规则不唯一

### Blocked

禁止预演与提交，例如：

- 缺少稳定节点身份
- source mapping 歧义过高
- 动态脚本生成节点不可逆

## CommitPipeline

提交采用五步严格管线：

### 1. Normalize Intent

把交互结果归一化为最终结构化变更。

### 2. Re-read Runtime Context

提交前重新读取 runtime 状态，避免交互过程中页面已变。

### 3. Analyze Saveability

只有 `safe` 才能继续。

### 4. Generate Source Patch

生成最小 patch，优先：

- 改 inline style
- 改属性
- 改文本
- 改 sibling 顺序
- 插入或删除节点

### 5. Verify Before Commit

提交前必须验证：

- 节点锚点仍唯一
- patch 后 HTML 可重新索引
- 结构未错位
- runtime 重载后仍能稳定命中目标节点

验证失败则回滚，不写盘。

## 失败处理

### Preview Rollback

预演失败时恢复到操作前 runtime 状态。

### Local Rollback

本地提交失败时撤销本次 intent，不污染正式历史。

### Persist Failure

写盘失败时保留用户上下文，但标记当前状态未持久化，并引导重新加载或切源码处理。

## 阶段划分

虽然目标是 `Full Pure Runtime`，但第一阶段内部仍拆成四个交付阶段：

### 阶段 1：Core Runtime Kernel

完成：

- `RuntimeDocumentEngine`
- `EditorStateStore`
- `InteractionOverlay`
- `SaveabilityAnalyzer`
- `CommitPipeline`

### 阶段 2：Runtime Interaction Suite

完成：

- 选中
- hover
- 框选
- 穿透选择
- 拖拽
- 缩放
- 插入预览
- 隐藏层可视化
- 键盘微调

### 阶段 3：Runtime Inspector + Layers

完成：

- 样式面板
- 属性面板
- 布局上下文面板
- 图层树
- 结构重排
- 字段级 saveability 提示

### 阶段 4：Commercial Hardening

完成：

- 撤销重做完整性
- 复杂布局降级拦截
- 断点切换一致性
- 保存前验证
- 错误恢复
- 性能压测

## 模块拆分建议

建议新增或重组为以下目录边界：

- `runtime-core/`
- `runtime-interaction/`
- `runtime-inspector/`
- `runtime-structure/`
- `runtime-history/`
- `runtime-commit/`
- `runtime-shell/`

要求：

- `VisualHtmlEditor.tsx` 仅负责装配，不再持续堆积核心逻辑
- 新增能力必须优先落到独立模块

## 性能预算

第一阶段性能目标：

- hover / 选中反馈尽量控制在 `16ms` 内
- 拖拽 / 缩放预演使用 `requestAnimationFrame` 合帧
- 高频交互阶段不做全量 source 解析
- 图层树与面板按选区增量更新
- source mapping 和 commit verification 只在提交阶段做完整重算

原则：

- 高频交互只读 runtime
- 低频提交才碰 source 和全规则分析

## 风险与防线

### 1. 映射漂移

风险：

- runtime 节点与源码节点关系在复杂 DOM 下漂移

防线：

- 稳定 nodeId
- 多维 fingerprint
- 提交前再次验证唯一性
- 歧义即禁止提交

### 2. 复杂布局误写

风险：

- `grid + media query + cascade` 下误生成 patch

防线：

- 分级规则引擎
- 最小 patch 优先
- 不能稳定解释就不提交

### 3. 交互看起来成功但不能保存

风险：

- 用户误以为最终可落盘

防线：

- 全程显式展示 `safe / preview-only / blocked`
- 操作结束时明确给出结果与建议

### 4. 装配层继续膨胀

风险：

- `VisualHtmlEditor.tsx` 再次演化成超大文件

防线：

- 严格模块化
- 明确 runtime-shell 与核心引擎边界

## 测试策略

第一阶段测试覆盖至少包括：

- runtime node identity 稳定性
- hit testing 与穿透选择
- 拖拽 / 缩放 intent 生成
- layout context 识别
- saveability 规则判定
- patch 生成与提交前验证
- 图层树与画布联动
- 样式面板字段级可编辑性判断
- undo / redo 与 persist failure 回滚

## 结论

本设计确定将可视化 HTML 设计模式从“runtime 辅助的设计器”升级为“Pure Runtime Editor”。

第一阶段不是过渡版，而是直接建设接近可商用的纯 runtime 内核与上层交互体系：

- runtime DOM 是视觉真相
- EditorStateStore 是交互真相
- 源码是持久化真相
- CommitPipeline 是唯一落盘出口

在此基础上，GrapesJS 不再承担设计主链路核心职责，只允许保留短期兼容用途，并以最终移出主链路为方向。
