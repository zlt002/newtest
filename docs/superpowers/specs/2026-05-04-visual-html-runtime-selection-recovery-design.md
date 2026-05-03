# 可视化 HTML 设计态基础链路恢复设计

## 背景

当前 `visual-html` 的 Pure Runtime 路线已经把真实 iframe runtime 放进了设计模式主界面，但设计态基础链路并没有真正接通。

现象非常明确：

- 页面内容能显示
- 左侧运行时结构为 `0` 节点
- 右侧检查器长期停留在“未选择节点”
- 点击页面无法选中元素
- 撤销、重做、保存等设计态动作看起来还在，但大多没有可靠编辑目标

这说明当前问题不是“局部交互异常”，而是“设计态的节点索引与选中链路没有建立起来”。在这个状态下继续推进 drag/resize/history，只会把不可用状态包装得更复杂。

因此这一轮必须先收敛成一个更小、更刚性的子目标：

- 先恢复 Pure Runtime 设计态的基础可编辑链路
- 先让页面可以被索引、选中、联动
- 先把“看得到但完全不能编”变成“能选、能看结构、能看属性”

## 目标

本轮目标只覆盖 Pure Runtime 设计态的基础链路恢复：

- 让 runtime iframe 稳定加载并暴露可用 `designRuntimeHandle`
- 让 runtime DOM 能被稳定索引成非空节点树
- 让点击页面元素能够选中对应 runtime node
- 让左侧运行时结构树显示真实节点
- 让右侧检查器显示当前选中节点的属性
- 让画布选中、高亮、结构树、检查器四者联动

## 非目标

本轮不解决以下问题：

- 不在本轮完成拖拽定位
- 不在本轮完成 resize 手柄交互
- 不在本轮完成完整 history/undo redo 重构
- 不在本轮完成完整 CommitPipeline 接管
- 不在本轮恢复 GrapesJS 设计态作为主交互内核

这些能力后续仍然要做，但必须建立在“基础选中链路已恢复”的前提上。

## 问题判断

当前设计态失效的核心不是单一 bug，而是三段链路同时失真：

### 1. 旧 GrapesJS 画布已退化为空壳

`VisualCanvasPane` 现在只保留兼容壳职责，不再提供真正的编辑器实例和选区能力。

这本身是符合 Pure Runtime 路线的，但它也意味着：

- 旧设计态能力已经不能继续兜底
- 任何仍依赖 `canvasEditor` 的交互都只是残留路径

### 2. Pure Runtime 画布显示与设计态节点模型没有稳定闭环

中间 iframe 已经能显示页面，但“iframe onLoad -> runtime handle -> runtime index -> registry -> layer tree -> selection overlay” 这条链没有稳定收敛成单一真相。

结果是：

- 页面显示成功不等于设计态就绪
- 只要 registry 没建立成功，左侧结构和右侧检查器就是空的
- 点击 overlay 也没有稳定目标可选

### 3. 编辑器主文件仍残留旧设计态假依赖

`VisualHtmlEditor.tsx` 仍然保留了不少 GrapesJS 时代的状态流、同步逻辑和工具按钮语义。

这会带来三个问题：

- 用户界面仍显示“可撤销、可重做、可保存”的设计态错觉
- 排障时很难判断某个动作到底走的是 Pure Runtime 还是旧残留链路
- 后续新能力很容易接错到旧状态流里

## 方案对比

### 方案 A：继续排查局部点击问题

做法：

- 把问题当成 overlay 事件或 hit test 小故障
- 继续在点击回调、选中状态、右侧面板显示上打补丁

优点：

- 可能短期改动最少

缺点：

- 容易只修到症状
- 如果底层 registry 仍为空，点击层修好也没有意义
- 后续还会在结构树和检查器处再次暴露同一根因

### 方案 B：先恢复基础可编辑链路

做法：

- 明确以 `runtime iframe -> runtime index -> registry -> selection -> layer tree -> inspector` 为唯一基础链路
- 优先让结构树、选中、高亮、检查器恢复
- 其他复杂交互后置

优点：

- 最符合当前真实故障层级
- 最快把“完全不能用”恢复成“基础可用”
- 后续 drag/resize/history 都有稳定依托

缺点：

- 本轮结束后仍不是完整商用设计器
- 还需要下一轮再把复杂交互补齐

### 方案 C：直接一口气接完整交互事务链

做法：

- 同时接 selection、hover、resize、history、save pipeline、style panel

优点：

- 理论上一步更完整

缺点：

- 当前“0 节点”根因还没收住，风险太高
- 任何一段链路不稳都会拖垮整轮
- 不符合“稳定优先”

## 结论

选择方案 B：先恢复基础可编辑链路。

这是当前最稳、最快、也最符合最终目标的路径。

原因：

- 用户当前最强痛点是“完全选不中，什么都没有”
- 这比 drag/resize/history 更靠前
- 只有基础链路恢复后，后续复杂交互才有真正可验证的落点

## 设计原则

### 1. 页面显示不等于设计态就绪

只有当 runtime iframe 完成加载，并成功建立非空 runtime 节点索引后，设计态才算 ready。

### 2. 基础真相只保留一条

本轮基础真相统一为：

`PreviewRuntimeHost -> RuntimeDomIndex -> RuntimeNodeRegistry -> PureRuntimeDesignShell`

左侧结构、右侧检查器、画布高亮都必须从同一份 runtime node 数据派生。

### 3. 不依赖 GrapesJS 选区兜底

本轮不允许再通过 GrapesJS editor selection 来“补救” Pure Runtime 选不中的问题。

如果 Pure Runtime 选中链路不通，就应该直接暴露为未就绪，而不是悄悄回退到旧机制。

### 4. 先恢复只读联动，再推进可写交互

本轮的核心是：

- 可索引
- 可选中
- 可高亮
- 可查看结构
- 可查看属性

这五件事恢复后，再继续推进 move/resize/history/saveability。

## 目标架构

本轮结束后，设计态基础主链路应收敛为：

1. `PreviewRuntimeHost` 负责真实 iframe 渲染与 runtime ready/reset 事件
2. `VisualHtmlEditor` 负责持有唯一的 `designRuntimeHandle`
3. `buildRuntimeDomIndex()` 负责从 runtime document 构建原始节点索引
4. `buildRuntimeNodeRegistry()` 负责在索引基础上构建可编辑节点模型
5. `PureRuntimeDesignShell` 负责消费 registry 派生出的：
   - layer tree
   - selected node
   - selected element
   - inspector model
   - overlay highlight
6. 点击 runtime 元素时，选中状态必须反向驱动：
   - 画布高亮
   - 左侧结构选中
   - 右侧检查器展示

## 分阶段实现要求

### 阶段 1：明确设计态 ready 条件

只有满足以下条件时，才显示“结构树可用”与“检查器可用”：

- 非预览态
- `designRuntimeHandle` 存在
- `runtime document.body` 可访问
- `buildRuntimeDomIndex()` 结果非空

如果不满足，界面应明确呈现“运行时尚未就绪”，而不是假装设计态已经可操作。

### 阶段 2：统一节点来源

`PureRuntimeDesignShell` 不再接受含糊的旧节点语义。

基础联动统一使用：

- `runtimeIndex`
- `registry`
- `selectedNodeId`
- `selectedElement`

结构树和检查器都应来自同一份 registry 派生数据，不允许一个来自 registry、另一个来自旧 canvas 状态。

### 阶段 3：恢复点击选中

点击 iframe 内元素后，系统必须完成：

1. 命中最近可编辑元素
2. 找到对应 runtime entry / runtime node
3. 写入当前选中状态
4. 刷新 overlay 高亮
5. 刷新 layer tree 当前选中项
6. 刷新 inspector model

### 阶段 4：清理误导性旧交互

在基础链路恢复前，以下旧能力如果没有真实实现支撑，就应显式降级或禁用：

- 依赖 `canvasEditorRef` 的撤销/重做
- 依赖旧设计同步的假 dirty 流
- 依赖 GrapesJS 组件选中的残留桥接

目标不是让按钮还在，而是让用户看到的行为和实际可用能力一致。

## 成功标准

满足以下条件，视为本轮完成：

- 打开设计模式后，左侧运行时结构节点数大于 0
- 点击页面中的普通 DOM 元素后，可看到蓝色选中高亮
- 左侧结构树同步选中对应节点
- 右侧检查器显示当前节点标题、路径、布局、样式摘要
- 不依赖 GrapesJS editor selection 也能完成上述流程
- 预览态与设计态切换时，不会出现结构树长期卡在 0 节点

## 测试要求

本轮至少补齐以下验证：

- `PreviewRuntimeHost` 在 `srcDoc` 设计态下能触发 runtime ready
- `VisualHtmlEditor` 在非预览态收到 runtime ready 后能建立非空 registry
- `PureRuntimeDesignShell` 在 registry 非空时渲染结构树与检查器
- 点击可编辑元素后，`selectedRuntimeElement` 与 `selectedNodeId` 正确更新
- 预览态切换回设计态后，结构树能重新恢复
- 当 runtime 未就绪时，界面呈现未就绪状态而非假可编辑状态

## 后续衔接

本轮完成后，下一轮再继续推进：

- hover / marquee / resize handles
- move / reorder / insert intents
- history 真正接管
- CommitPipeline 成为唯一正式落盘入口

也就是说，本轮不是终局，而是把 Pure Runtime 从“能显示”推进到“真正开始能编辑”的关键门槛。
