# 可视化 HTML Full Pure Runtime Editor 设计

## 背景

`cc-ui` 的可视化 HTML 设计模式已经进入 Pure Runtime 路线，但当前系统仍处在“新旧链路混合”的中间态：

- 真实页面已经在 runtime iframe 中渲染
- 基础 runtime 选中、结构索引、检查器联动开始恢复
- GrapesJS 兼容壳仍残留部分设计态语义和工具栏行为
- 图层树、插入、拖拽、resize、样式面板、history 还没有全部收拢到 runtime 主链路

这会带来两个长期问题：

- 视觉真相和编辑真相容易分裂，用户看到的页面和系统实际编辑依据不完全一致
- 随着复杂布局、响应式、源码回写能力继续增加，旧兼容链路会越来越像结构性阻碍，而不是兜底

因此本轮目标不再停留在“恢复基础选中链路”，而是回到原始目标：第一阶段直接朝 `Full Pure Runtime Editor` 推进，并把它作为设计模式后续演进的唯一主方向。

## 目标

本轮设计目标如下：

- 让设计模式的主链路完全以 runtime iframe 为中心
- 让 GrapesJS 退出设计态真相层，只保留必要兼容职责
- 第一阶段基线同时覆盖：
  - 图层树
  - 结构插入与基础重排
  - 拖拽与 resize
  - 样式面板与检查器编辑
  - history 与提交管线
- 优先保证浏览器一致性，尽量接近真实页面效果
- 优先保证稳定性，禁止任何高风险错误回写源码的行为

## 非目标

本轮明确不覆盖以下范围：

- 不追求对重脚本驱动复杂应用的一般化可视化编辑
- 不承诺对 Shadow DOM、微前端容器、复杂运行时虚拟树提供完整支持
- 不为了提升“看起来可编辑”的覆盖率而放宽源码回写安全边界
- 不继续给 GrapesJS 增加新的设计态主职责

## 方案对比

### 方案 A：继续做基础链路修补后小步补能力

做法：

- 维持当前恢复链路
- 逐个修补图层树、hover、拖拽、样式面板
- 兼容壳继续承担部分交互意义

优点：

- 短期风险最低
- 每次改动较小

缺点：

- 容易重新退回“局部修复”心智
- 旧兼容语义会持续渗透到新主链路
- 最终系统边界不干净

### 方案 B：双轨并行，新旧设计态并存

做法：

- 保留当前设计模式
- 新开一套完整 Pure Runtime Editor 入口
- 成熟后再整体切换

优点：

- 对现有体验冲击小
- 适合大团队并行

缺点：

- 两套设计态系统维护成本过高
- 当前项目节奏下不划算
- 很容易形成长期分叉

### 方案 C：主链路强切，实施上分阶段推进

做法：

- 明确 runtime iframe 为唯一设计态主链路
- 所有新增设计能力都直接接到 Pure Runtime Editor 子系统
- 旧 GrapesJS 只允许兼容，不允许再扩展
- 执行顺序上仍按阶段逐步推进，避免一次性大爆炸

优点：

- 长期架构最干净
- 最符合浏览器一致性优先
- 能从根上消除设计态与预览态的核心分裂

缺点：

- 短期集成风险最高
- 必须严格控制模块边界和降级策略

## 结论

选择方案 C：`主链路强切 + 分阶段推进`。

也就是：

- 架构上按 `Full Pure Runtime Editor` 收敛
- 实施上按稳定基线逐段推进
- 不再给 GrapesJS 续设计态主链路
- 但每一步都形成可验证、可继续叠加的稳定台阶

## 核心原则

### 1. Runtime DOM 是视觉真相

设计模式中用户看到的页面，以 iframe 内真实 DOM、真实 CSS、少量原生 JS 执行结果为准。

不再维护一套独立于浏览器结果之外的“设计态虚拟布局真相”。

### 2. Editor State 是交互真相

hover、选中、图层树状态、交互模式、当前断点、拖拽会话、resize 会话、history 光标，都统一收敛在运行时编辑状态层。

### 3. 源码文档是持久化真相

磁盘上的 HTML/CSS 才是最终保存结果。runtime 临时状态只能作为预演和编辑中间态，不能直接代替源码真相。

### 4. Commit Pipeline 是唯一落盘出口

所有编辑行为必须先表达为 intent，再经过 saveability 分析、patch 生成、验证和持久化步骤。

### 5. 浏览器一致性优先于交互表面统一

不同布局类型的节点允许不同编辑能力：

- `absolute/fixed` 可以直接移动和 resize
- `flow` 更适合结构、间距、尺寸、文本类编辑
- `flex` 优先做受约束重排与布局属性编辑
- `grid` 优先做 grid line / area / span 编辑

宁可限制交互，也不要做“看起来统一、实际上会错写源码”的假编辑。

### 6. 能力必须显式暴露

每个 runtime 节点都应带有可解释的编辑能力与保存能力：

- 能不能选
- 能不能 hover
- 能不能插入
- 能不能重排
- 能不能移动
- 能不能 resize
- 能不能改文本
- 能不能改样式
- 能不能安全持久化

不能做的能力必须明确禁用并解释原因，而不是点了没反应。

## 目标架构

第一阶段的 Pure Runtime Editor 主链路收敛为 6 个子系统：

1. `RuntimeDocumentEngine`
2. `SelectionAndOverlayEngine`
3. `StructureAndInsertEngine`
4. `StyleAndInspectorEngine`
5. `TransformEngine`
6. `HistoryAndCommitEngine`

### RuntimeDocumentEngine

职责：

- 管理 iframe attach / ready / reset / refresh 生命周期
- 维护 runtime DOM index、runtime node registry、source bridge
- 统一 viewport、scroll、responsive breakpoint 上下文
- 提供稳定节点身份、布局上下文、保存能力基础信息

它是所有上层能力的数据根。

### SelectionAndOverlayEngine

职责：

- click 选中
- hover 高亮
- hit test
- 选框、选中框、resize 手柄
- 坐标换算与 overlay 绘制
- 选区在滚动、缩放、断点切换下的稳定跟随

它必须完全以真实 runtime DOM 测量为准。

### StructureAndInsertEngine

职责：

- 从 registry 构建图层树
- 管理展开收起、定位到节点、自动展开祖先链
- 支持插入前/后/内、删除、复制、基础 reorder
- 统一画布侧与图层树侧的结构编辑语义

### StyleAndInspectorEngine

职责：

- 构建计算信息、可编辑属性、布局属性、文本属性面板
- 支持文本、属性、class、inline style、布局字段编辑
- 在字段级别展示 capability / saveability / preview-only 状态

### TransformEngine

职责：

- 处理 move、resize、reorder 等交互意图
- 按布局类型翻译不同编辑动作
- 对 `flow / flex / grid / absolute / mixed responsive` 采用差异化约束策略

它负责“怎么变”，但不直接负责“怎么落盘”。

### HistoryAndCommitEngine

职责：

- 维护 preview 级历史栈
- 支持 undo / redo / rollback
- 将 intent 规范化为 runtime mutation
- 在提交前执行 saveability 分析与 patch 写入

所有编辑入口最终都必须流经它。

## 关键交互模型

### RuntimeNodeCapability

每个节点至少携带以下能力信息：

- `selectable`
- `hoverable`
- `insertable`
- `reorderable`
- `movable`
- `resizable`
- `textEditable`
- `attributeEditable`
- `styleEditable`
- `persistable`
- `previewOnly`

所有 UI 控件都从这组能力派生。

### Intent Model

交互不直接修改源码，而是统一生成 intent：

- `MoveNodeIntent`
- `ResizeNodeIntent`
- `ReorderNodeIntent`
- `InsertNodeIntent`
- `DeleteNodeIntent`
- `UpdateStyleIntent`
- `UpdateAttributeIntent`
- `UpdateTextIntent`

runtime 可以先预演，但是否允许持久化必须重新判断。

### 三层持久化等级

所有编辑结果必须归入以下三级之一：

- `可安全回写`
  - 有稳定节点映射
  - 编辑语义明确
  - 高概率不会误写源码
- `仅预览`
  - runtime 可编辑，但源码归因不够稳定
  - 可以展示效果，但不能直接保存
- `禁止编辑`
  - 节点身份不稳或语义歧义高
  - 直接阻断

## 阶段化推进

虽然目标是完整 Pure Runtime Editor，但第一阶段内部仍按稳定基线拆成四段推进。

### 阶段 A：交互地基稳定化

范围：

- click / hover / selected
- 选中框、hover 框、坐标系统一
- 图层树完整层级可见
- 自动展开祖先链
- 画布、图层树、检查器双向联动

成功标准：

- 点谁选谁
- 左侧图层树不再只显示顶层
- 当前选中节点在结构树中可定位、可见
- overlay 在滚动、缩放、断点切换下不明显漂移

### 阶段 B：结构编辑基线

范围：

- 插入前/后/内
- 删除、复制
- 基础重排
- 图层树操作驱动画布结构变化

成功标准：

- 能在图层树和画布两侧执行基础结构编辑
- 新增或重排节点后 runtime 与源码映射不立刻失真
- 低置信节点不允许直接落盘

### 阶段 C：视觉变换基线

范围：

- absolute 元素移动与 resize
- flow/flex/grid 节点的受约束编辑
- 复杂布局下的可操作性提示

成功标准：

- absolute/fixed 节点可直接拖拽与 resize
- flex/grid 节点不会伪装成可自由拖拽
- 用户能明确知道当前节点允许哪些变化

### 阶段 D：样式与历史基线

范围：

- inspector 进入可编辑态
- 样式、文本、属性编辑
- undo / redo
- commit pipeline 与 preview-only 区分

成功标准：

- inspector 修改后 runtime 即时生效
- history 可稳定回退 runtime 变更
- 保存阶段能明确区分：可回写、仅预览、禁止落盘

## 模块接入策略

### VisualHtmlEditor 作为总编排层保留

它继续作为设计态总入口，负责：

- 当前文档内容
- runtime handle
- 当前选中节点
- 当前编辑模式
- history store
- save / preview 状态

但它应逐步收敛成“组装器”，而不是继续承载越来越多的细节交互。

### RuntimeDocumentEngine 成为唯一数据根

图层树、检查器、overlay、transform engine、saveability analyzer 都从同一份 runtime registry 与 source bridge 派生。

### 图层树拆成 Builder + Actions

- `LayerTreeBuilder` 只负责把 registry 变成树模型
- `StructureActions` 只负责产出结构编辑 intent 与 runtime patch
- `PureRuntimeLayerTree` 只负责渲染和触发 action

### Interaction / Transform 继续独立

交互引擎只负责产生稳定的“变换意图”，不直接决定源码如何回写。

### Inspector 成为真正的右侧编辑核心

右侧不再只是信息展示，而是样式、文本、属性编辑的主要入口，并在字段级给出保存能力反馈。

### History 与 Commit 形成统一闭环

所有入口统一走：

1. action / intent
2. runtime mutation
3. history entry
4. saveability analyze
5. patch / persist / rollback

不再依赖旧 GrapesJS command 模型。

## 风险与降级策略

### 风险 1：复杂布局交互看起来“不够自由”

接受这个代价。

只要能换来更高的一致性和更低的错误写回概率，就是正确取舍。

### 风险 2：节点映射不稳定导致结构编辑无法直接落盘

接受 preview-only 降级。

不能为了“能保存”去冒错误写源码的风险。

### 风险 3：过渡期 UI 仍带有旧设计态错觉

需要主动禁用或降级误导性旧交互，包括：

- 依赖兼容壳的假 undo / redo
- 没有真实支撑的旧工具栏语义
- 与 runtime 主链路冲突的残留选区桥接

## 成功标准

当以下条件同时满足时，可认为第一阶段进入“接近可商用”的 Pure Runtime Editor 基线：

- 图层树、画布、检查器共享同一份 runtime 真相
- 结构树完整可浏览、可定位、可双向驱动
- absolute 节点可直接 move / resize
- flex / grid / flow 节点具备受约束且可解释的编辑能力
- inspector 可编辑样式、文本、属性，并明确暴露保存能力
- history 与 commit pipeline 不依赖 GrapesJS command
- 所有高风险源码回写场景都被阻断或降级为 preview-only

## 测试要求

第一阶段实现必须至少覆盖以下验证：

- runtime iframe 生命周期与 ready/reset 稳定
- runtime node registry 在真实页面下稳定非空
- 图层树默认展开、选中定位、双向联动可验证
- overlay 在滚动、缩放、响应式切换场景下坐标稳定
- absolute move / resize 行为可回归验证
- flex / grid 受约束编辑能力和阻断策略可回归验证
- inspector 字段级 capability / saveability 可回归验证
- history 与 commit pipeline 的 preview / persist / rollback 路径可回归验证
