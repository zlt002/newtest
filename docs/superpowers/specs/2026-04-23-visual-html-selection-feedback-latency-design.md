# 设计模式预览选中反馈延迟优化设计

## 背景

当前可视化编辑器在复杂页面中选中节点时，蓝色工具栏、选中高亮和右侧检查器会一起变慢，尤其在大表格、深层嵌套容器和节点数较多的页面中更明显。用户体感上表现为“已经点击了元素，但蓝色工具栏过一会儿才出现”，这会直接打断设计模式中的连续操作流。

结合现有实现，选中事件后存在多段同步工作叠在主线程上：

- `createGrapesLikeInspectorBridge` 在 `component:selected` 后失效整份 inspector snapshot，并重新读取 `selection / selector / style / layers`
- `layers()` 当前会从根节点递归构建整棵 layer tree
- `SpacingOverlay` 会在选中后同步读取布局信息，并在必要时刷新 GrapesJS toolbar

当前这些工作共享同一个交互时机，导致“选中反馈”被“检查器补齐”阻塞。

## 目标

### 业务目标

- 复杂页面中点击元素后，蓝色工具栏和选中反馈应尽快出现
- 保持设计模式的连续操作流，不因右侧检查器刷新拖慢点击反馈
- 右侧图层仍然可用，但不再要求每次选中都先全量构建完整树

### 体验目标

- 蓝色工具栏应在同帧或下一帧出现
- 样式区允许轻微延迟补齐，但应控制在用户可接受范围内
- 图层区应聚焦当前节点上下文，而不是因整棵树构建导致整体卡顿

### 性能目标

- 将选中交互拆分为快路径和慢路径
- 移除 `component:selected` 上的整棵图层树同步重建
- 使复杂页面中的选中主链路不再依赖 inspector 全量刷新完成

## 非目标

- 不替换 GrapesJS
- 不重写整个 inspector UI
- 不修改现有样式字段 schema 和属性编辑语义
- 不在本次引入完整虚拟滚动树
- 不顺带做与选中反馈无关的可视化编辑器重构

## 问题分析

### 当前瓶颈

当前实现中，选中一个节点后会触发以下同步链路：

1. GrapesJS 更新内部选中状态
2. inspector bridge 触发 `notify()`，使缓存 snapshot 失效
3. React 读取新 snapshot 时，同步重建：
   - 当前选中信息
   - selector 信息
   - style snapshot
   - layer snapshot
4. layer snapshot 从根节点递归读取整棵组件树
5. `SpacingOverlay` 读取 `getBoundingClientRect()` 和 `getComputedStyle()`
6. toolbar 在上述工作之后完成更新

在节点复杂时，真正拖慢体验的并不是蓝色工具栏本身，而是选中事件上挂载的同步计算过多，工具栏只能排队等待。

### 核心结论

本问题应视为“选中反馈与检查器补齐耦合过深”，不是单一 toolbar 组件渲染慢。优化重点应是：

- 让选中反馈走独立快路径
- 让检查器按优先级异步补齐
- 让图层树从“全量镜像”变成“按需投影”

## 总体方案

本次采用三层结构：

1. `Immediate Selection Channel`
2. `Deferred Inspector Channel`
3. `Lazy Layer Tree Channel`

总体原则是：`选中反馈先出现，检查器稍后补齐，图层只计算当前需要展示的部分。`

## 方案细节

### 1. Immediate Selection Channel

职责：处理必须立即反馈给用户的交互结果。

包含内容：

- 当前选中节点 id
- 当前选中节点 label
- 蓝色工具栏显示与更新
- 选中高亮和基础选区 chrome

约束：

- 不读取整棵 layer tree
- 不等待 style snapshot 完成
- 不依赖 React inspector 全量重渲染完成后才显示

目标行为：

- `component:selected` 到工具栏出现应为同帧或下一帧
- 如果用户连续点选多个元素，只保留最后一个目标的即时反馈

### 2. Deferred Inspector Channel

职责：在不阻塞选中反馈的前提下，补齐右侧检查器数据。

建议拆分为三个更新单元：

- `selection`：轻量，优先级最高
- `style / selector`：中等优先级，下一帧补齐
- `layers`：低优先级，按需计算

调度规则：

- `component:selected` 先触发即时反馈
- inspector 更新通过调度器进入下一帧
- 连续选中时，旧任务应被 revision 或 token 取消
- 同一个节点重复选中时可复用最近一次可用结果

一致性策略：

- 工具栏和右侧面板允许短暂异步
- 目标是将这种异步控制在 `16ms - 50ms`
- 可接受上限为 `100ms - 150ms`
- 超过上限视为仍存在明显体验问题

### 3. Lazy Layer Tree Channel

职责：让图层区从全量递归改为按需投影和按需渲染。

默认只构建并渲染以下内容：

- 从根到当前选中节点的整条祖先路径
- 当前选中节点本身
- 当前选中节点的直接 children
- 用户手动展开节点的直接 children

默认不做：

- 折叠分支的 children 构建
- 与当前上下文无关的深层 descendants 全量递归
- 首次打开图层面板就构建整棵树

这意味着图层区的数据和渲染规则统一为：

- 折叠的图层不渲染
- 当前选中路径渲染
- 用户手工展开的节点才渲染其子节点

这样可以同时满足两个目标：

- 保留图层的上下文感知，不会像“节点丢失”
- 避免大表格和深层树在每次选中时触发全量重建

## 组件边界

### `SelectionFeedbackController`

职责：

- 监听 GrapesJS 选中事件
- 保存最小选中状态
- 同步工具栏和选中 chrome

输入：

- `component:selected`
- `component:deselected`

输出：

- 当前选中最小状态
- 工具栏刷新请求

要求：

- 不依赖图层构建
- 不依赖 style snapshot
- 出现异常时也要尽量保住基础选中反馈

### `InspectorSnapshotScheduler`

职责：

- 管理 inspector 各部分的刷新时机
- 切分优先级
- 取消过期刷新任务

输入：

- 选中变更
- style 变更
- selector 变更
- layer 结构变更

输出：

- 分阶段更新后的 inspector 数据

要求：

- 支持最后一次选中覆盖前一次未完成任务
- 支持 future profiling 和调试日志

### `LayerTreeProjection`

职责：

- 从 GrapesJS component tree 生成当前需要展示的 layer subtree

输入：

- 当前选中节点
- 当前展开节点集合
- component root

输出：

- 仅包含当前可见分支的 layer snapshot

要求：

- 可独立测试
- 不与 style / selector 读取耦合
- 规则明确，可解释“为什么这里看到了这些节点”

## 数据流

新的选中数据流应为：

1. GrapesJS 发出 `component:selected`
2. `SelectionFeedbackController` 立即更新选中反馈
3. `InspectorSnapshotScheduler` 接收调度信号
4. 下一帧优先补齐 `selection`
5. 随后补齐 `style / selector`
6. `LayerTreeProjection` 仅构建当前路径和已展开分支
7. 若此期间发生新选中，旧任务直接丢弃

从模型上看，这次设计把“单次选中触发一次同步全量刷新”，改成了“单次选中触发多阶段、分优先级更新”。

## 降级与容错

### 连续快速选中

- 仅保留最后一次选中对应的 inspector 更新
- 中间未完成任务全部取消

### 图层过大

- 优先只显示当前路径和手工展开分支
- 不因追求整棵树完整而阻塞点击反馈

### 样式读取失败或延迟过高

- 保持工具栏和选中状态正常出现
- 样式区可显示“正在同步”或暂时保留上一帧稳定内容
- 不允许把整个选中交互回退为同步阻塞

### Overlay 布局读取成本偏高

- 允许 overlay 继续存在
- 但其布局读取不应再与整棵图层树重建绑定为同一条阻塞链路

## 验收标准

- 在复杂表格页面中，单击元素后蓝色工具栏应先于右侧图层树完整刷新出现
- 连续点选多个单元格时，蓝色工具栏不应明显排队
- 右侧样式区允许轻微延迟，但最终对象必须与当前选中一致
- 图层区默认聚焦当前选中路径，并支持按用户展开逐步渲染
- 折叠节点不渲染，当前选中节点及其路径渲染，用户手工点开的节点才渲染其子节点
- 普通页面的现有编辑交互不得出现明显退化

## 验证建议

- 在大表格页面录制一次选中单元格的性能日志，确认工具栏反馈时间明显早于图层补齐时间
- 连续点击多个不同单元格，验证最终只保留最后一次选中对应的右侧数据
- 展开和折叠图层树，确认未展开分支不会触发深递归渲染
- 对比优化前后 `component:selected` 主链路耗时，确认其不再包含整棵 tree rebuild

## 实施建议

建议按以下顺序实现：

1. 先拆出 `Immediate Selection Channel`，止住蓝色工具栏延迟
2. 再加入 `InspectorSnapshotScheduler`，把同步刷新改为分阶段调度
3. 最后引入 `Lazy Layer Tree Channel`，把图层从全量递归改成按需投影

这样可以优先恢复“选中马上有反馈”的流程体验，再逐步收回右侧性能成本。
