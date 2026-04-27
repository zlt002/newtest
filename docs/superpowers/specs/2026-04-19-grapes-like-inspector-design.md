# Grapes-like Inspector Design

## 背景

当前 `VisualHtmlEditor` 的右侧区域已经验证过两条路线：

1. 手写 React + Tailwind 仿制 GrapesJS 右栏
2. 直接挂载 GrapesJS 原生 `SelectorManager`、`StyleManager`、`LayerManager`

宿主方案能快速得到接近原版的结构和交互，但长期问题也很明确：

- 右栏 UI 和数据流仍然被 GrapesJS 内部 View/Model 约束
- AI 很难稳定绕过 DOM，直接操作一套项目可控的数据层
- 与当前 React/Tailwind 体系融合有限，后续维护成本高

本设计的目标是在不影响现有 `VisualHtmlEditor` 主流程稳定性的前提下，新开一套完整的 “Grapes-like Inspector” 子系统，按 GrapesJS 原版的模块边界重建 `类名 / 样式 / 图层` 面板，并在成熟后一次性切换为默认实现。

## 目标

### 业务目标

- 右侧 `SelectorManager / StyleManager / LayerManager` 的结构、字段组织和主要交互尽量对齐 GrapesJS 原版
- 保持当前 `VisualHtmlEditor` 画布、保存、预览、模式切换、撤销重做等主流程稳定
- 建立一套项目可控的数据层，后续同时服务人工编辑和 AI 编辑

### 技术目标

- 最终方案不再依赖 `SelectorManager.render()`、`StyleManager.render()`、`LayerManager.render()`
- UI 全部使用项目自己的 React 组件组织
- 样式统一使用项目当前 Tailwind 体系表达
- GrapesJS 交互统一收敛到 adapter / mapper，避免 UI 直接操作 GrapesJS View/Model

### 非目标

- 第一阶段不追求 Typography、Flex、gradient 等全部长尾能力
- 第一阶段不做图层拖拽排序
- 第一阶段不做 AssetManager 的完整深度联动
- 第一阶段不复刻所有 computed/highlight 细节

## 参考实现

本次重写直接对照 GrapesJS 源码，而不是基于截图猜测：

- `packages/core/src/selector_manager`
- `packages/core/src/style_manager`
- `packages/core/src/navigator`
- `packages/core/src/commands/view/OpenStyleManager.ts`
- `packages/core/src/commands/view/OpenLayers.ts`
- `packages/core/src/styles/scss/_gjs_style_manager.scss`

本地参考仓库：

- `/Users/zhanglt21/Downloads/grapesjs-dev`

本次重点参考的原版实现包括：

- `selector_manager/view/ClassTagsView.ts`
- `style_manager/view/SectorsView.ts`
- `navigator/view/ItemsView.ts`

## 约束与原则

### 优先级

1. 稳定性第一
2. 长期可控第二
3. 1:1 完整度第三

### 替换策略

采用“新开一套完整实现，成熟后一次性切换”的策略：

- 现有 `VisualInspectorPane` 宿主方案继续可用
- 新 Inspector 在独立目录中开发和联调
- 不在现有宿主版右栏上持续小修小补
- 达到验收标准后一次性切换正式入口

### 架构原则

- UI 不直接依赖 GrapesJS 原始 View/Model
- UI 不直接读写零散 DOM
- 所有 GrapesJS 读写统一经过 adapter / mapper
- 模块边界按 GrapesJS 的业务能力划分，而不是按文件体积分割
- React 只消费规范化 view-model，不暴露 GrapesJS 内部语义到组件树

## 方案比较

### 方案 A：单一 `InspectorSnapshot` + 分 manager 局部运行态

做法：

- adapter 每次同步时生成一份统一 `InspectorSnapshot`
- 三个 manager 共享快照，但各自只维护薄的一层本地交互状态
- 所有写回统一走 mapper

优点：

- 读模型唯一，边界清晰
- 多选退化规则能统一表达
- 后续 AI 最容易接入

缺点：

- 前期需要先把 snapshot 和 mapper 接口设计清楚

### 方案 B：`Selector / Style / Layer` 各自维护独立快照

优点：

- 实现拆分简单，便于并行开发

缺点：

- 选区、多选、state、rule/inline 语义容易在多个模块内重复实现
- 后续 AI 接入和回归验证更碎

### 方案 C：React 侧做重控制器和完整 store

优点：

- 最利于未来做更强的批量编辑和 AI patch

缺点：

- Phase 1 过重，容易提前造出一个新的编辑器内核

### 结论

采用方案 A：`单一 InspectorSnapshot + 分 manager 局部运行态`。

这是当前最平衡的方案：

- 比 GrapesJS 宿主方案更可控
- 比重控制器方案更轻
- 能在 Phase 1 内把结构、同步和写回链路做稳

## 总体架构

新子系统拆成 5 层：

1. `Inspector Shell`
2. `Inspector Adapter`
3. `Inspector Snapshot`
4. `Managers`
5. `Mappers`

数据流如下：

`GrapesJS editor -> adapter -> InspectorSnapshot -> React managers -> mapper -> GrapesJS editor`

### 设计结论

- 读：统一走全量 snapshot
- 写：统一走增量 mapper
- 回流：依赖 GrapesJS 真实变更事件重建 snapshot
- React 本地状态只保存交互态，不保存最终真值

## 核心读模型：`InspectorSnapshot`

`InspectorSnapshot` 是 Inspector 的唯一读模型。React 侧不直接读取 GrapesJS model/view，而是消费 adapter 输出的完整快照。

建议结构：

```ts
type InspectorSnapshot = {
  selection: {
    selectedIds: string[];
    primarySelectedId: string | null;
    selectedLabel: string;
    isMultiSelection: boolean;
    isDetached: boolean;
  };
  selector: {
    availableStates: Array<{ id: string; label: string }>;
    activeState: string;
    commonClasses: Array<{ name: string; isPrivate?: boolean }>;
    canAddClass: boolean;
    canRemoveClass: boolean;
    canSyncStyle: boolean;
  };
  style: {
    targetKind: 'rule' | 'inline';
    sectors: StyleSectorViewModel[];
    hasMixedValues: boolean;
    editable: boolean;
  };
  layers: {
    roots: LayerNodeViewModel[];
    selectedLayerIds: string[];
    expandedLayerIds: string[];
    sortable: boolean;
  };
  capabilities: {
    canEditSelectors: boolean;
    canEditStyles: boolean;
    canEditLayers: boolean;
  };
};
```

### Snapshot 原则

- snapshot 是 Inspector 当前可见状态的完整解释结果，不是零散 getter 的拼装
- mixed、disabled、`targetKind` 这类 UI 决策信息也进入 snapshot，不让组件自己猜
- manager 组件只消费自己负责的字段，不越层读取 GrapesJS

### manager 消费边界

- `SelectorManager` 只消费 `selection + selector`
- `StyleManager` 只消费 `style`
- `LayerManager` 只消费 `layers + selection`

## 模块职责

### 1. Inspector Shell

职责：

- 承载右侧总容器
- 切换 `样式 / 图层 / 类名`
- 挂接 adapter、mapper 和共享上下文
- 控制不同 manager 的装载与展示

建议文件：

- `src/components/right-pane/view/visual-html/grapes-like/GrapesLikeInspectorPane.tsx`

### 2. Inspector Adapter

职责：

- 统一监听 GrapesJS 编辑器状态变化
- 读取当前选中节点、公共 class、当前 state、样式值、图层树
- 输出单一 `InspectorSnapshot`

建议接口：

```ts
type InspectorAdapter = {
  getSnapshot(): InspectorSnapshot;
  subscribe(onChange: () => void): () => void;
};
```

内部监听的变化源至少包括：

- 选区变化
- 当前 state 变化
- 组件 class 变化
- style 变化
- 图层树结构变化
- device / media 变化

对 React 暴露的仍然是单一“快照失效，请重读”的信号，不把 GrapesJS 事件细节泄漏到组件树。

### 3. Managers

职责：

- 对应原版 3 大面板
- 只负责渲染和交互
- 不直接操作 GrapesJS 原对象
- 不直接判断 rule/inline 或 mixed 语义

建议文件：

- `selector/GrapesLikeSelectorManager.tsx`
- `style/GrapesLikeStyleManager.tsx`
- `layers/GrapesLikeLayerManager.tsx`

### 4. Mappers

职责：

- 接收 UI 意图并写回 GrapesJS
- 保证人工和 AI 最终走同一条写回路径
- 只做“当前动作的安全写回”，不承担复杂补偿逻辑

建议接口：

```ts
type InspectorMapper = {
  addClass(name: string): void;
  removeClass(name: string): void;
  setState(stateId: string): void;
  updateStyle(input: {
    property: string;
    value: string | null;
    targetKind: 'rule' | 'inline';
  }): void;
  selectLayer(componentId: string): void;
  toggleLayerExpanded(componentId: string): void;
};
```

## 同步模型

采用“读全量、写增量、回流重建”的闭环：

1. GrapesJS 外部状态变化
2. adapter 收到事件，标记 snapshot 失效
3. React 重读 `getSnapshot()`
4. 用户在 UI 中编辑
5. manager 调用 mapper 写回 GrapesJS
6. GrapesJS 触发对应变更事件
7. adapter 再次生成新 snapshot
8. React 用新 snapshot 覆盖旧显示

### 关键原则

- 不做“写回后手动 patch snapshot”
- 始终以 GrapesJS 真实写入结果作为最终来源
- React 本地状态只保存临时交互态

### 输入闪烁控制

field 组件采用 `committed value + draft value` 双层模型：

- `committed value` 来自 snapshot
- `draft value` 来自当前 field 本地状态

规则：

- `focus` 期间允许保留本地 draft
- `blur` 或 `Enter` 时才提交 mapper
- 字段不在编辑态时，adapter 回流的新 snapshot 才覆盖显示

这层状态只保留在 field 组件内部，不上升到整个 inspector store。

## 写回策略

Phase 1 采用混合写回策略：

- 当前有有效 class 作用域时，样式默认写到 `class + active state` 对应 rule
- 当前没有有效 class 时，样式写到主选中组件的 inline style

### 多选下的写回边界

- 只有当“公共 class 作用域明确”时，才允许 rule 写回
- 多选且没有明确公共 class 时，只开放安全的 inline 批量写回
- 如果目标作用域无法稳定解释，则字段直接禁用，不做猜测性写回

## Manager 详细设计

### SelectorManager

必须覆盖：

- `Classes`
- `- State -`
- 当前选中组件信息
- class tag 的增删
- state 切换
- 跟当前选中组件同步

职责边界：

- 负责 class tag、state 和当前选中对象信息
- 不负责决定样式写到哪里
- 对 `StyleManager` 的唯一影响是改变当前 `activeState` 和 class 作用域

建议文件：

- `selector/GrapesLikeSelectorManager.tsx`
- `selector/GrapesLikeClassTag.tsx`
- `selector/useSelectorManagerState.ts`

参考源码：

- `selector_manager/view/ClassTagsView.ts`
- `selector_manager/view/ClassTagView.ts`

### StyleManager

第一批覆盖 4 个 sector：

- `General`
- `Dimension`
- `Decorations`
- `Extra`

第一批支持的属性：

- `display`
- `float`
- `position`
- `top/right/bottom/left`
- `width/height/max-width/min-height`
- `margin`
- `padding`
- `background-color`
- `border-radius`
- `border`
- `opacity`
- `background`
- `box-shadow`
- `transition`
- `transform`
- `perspective`

职责边界：

- 负责 sector / property / field 的渲染和编辑
- 不自己判断当前写入目标是 `rule` 还是 `inline`
- 不自己推断 mixed 或 disabled 语义
- 只消费 snapshot 给出的 `targetKind`、`mixed`、`disabled`

建议文件：

- `style/GrapesLikeStyleManager.tsx`
- `style/GrapesLikeSector.tsx`
- `style/GrapesLikeProperty.tsx`
- `style/fields/NumberField.tsx`
- `style/fields/SelectField.tsx`
- `style/fields/RadioField.tsx`
- `style/fields/CompositeField.tsx`
- `style/fields/ColorField.tsx`
- `style/fields/TextField.tsx`

参考源码：

- `style_manager/view/SectorsView.ts`
- `style_manager/view/SectorView.ts`
- `style_manager/view/PropertiesView.ts`
- `style_manager/view/PropertyView.ts`
- `style_manager/view/PropertyNumberView.ts`
- `style_manager/view/PropertySelectView.ts`
- `style_manager/view/PropertyRadioView.ts`
- `style_manager/view/PropertyCompositeView.ts`
- `style_manager/config/config.ts`

### LayerManager

第一批必须具备：

- 图层树显示
- 当前选中高亮
- 点击图层选中组件
- 展开/收起
- 显隐开关

职责边界：

- 本质上是导航视图，不是结构编辑器
- Phase 1 不承担复杂拖拽和批量重排

建议文件：

- `layers/GrapesLikeLayerManager.tsx`
- `layers/GrapesLikeLayerTree.tsx`
- `layers/GrapesLikeLayerItem.tsx`
- `layers/useLayerManagerState.ts`

参考源码：

- `navigator/view/ItemsView.ts`
- `navigator/view/ItemView.ts`
- `navigator/index.ts`

## Style schema 设计

Phase 1 不做完整 CSS property meta framework，而采用“轻 schema + 少量专用 field 组件”。

### 静态 schema

```ts
type StyleSectorSchema = {
  id: 'general' | 'dimension' | 'decorations' | 'extra';
  title: string;
  openByDefault: boolean;
  properties: StylePropertySchema[];
};

type StylePropertySchema = {
  id: string;
  label: string;
  kind: 'select' | 'number' | 'radio' | 'composite' | 'color' | 'text';
  cssProperty?: string;
  cssProperties?: string[];
  options?: Array<{ label: string; value: string }>;
  units?: string[];
  clearable?: boolean;
};
```

schema 只解决：

- 属性属于哪个 sector
- 用什么 field 渲染
- 对应哪个 CSS property
- 是否是复合字段

### 运行态 view-model

```ts
type StylePropertyViewModel = {
  id: string;
  label: string;
  kind: StylePropertySchema['kind'];
  value: string | null;
  mixed: boolean;
  disabled: boolean;
  targetKind: 'rule' | 'inline';
};
```

adapter 负责把 GrapesJS 状态解释成运行态 view-model，manager 按 schema 组织结构，再把 view-model 灌入字段。

### Field 范围

Phase 1 只保留 6 类字段：

- `SelectField`
- `NumberField`
- `RadioField`
- `CompositeField`
- `ColorField`
- `TextField`

### 复杂度控制

属性按三档实现：

- 简单字段：`display / float / position / opacity`
- 中等字段：`top/right/bottom/left / width/height / margin / padding / background-color / border-radius`
- 文本托管字段：`border / background / box-shadow / transition / transform / perspective`

设计重点是先把结构、同步和写回做稳，不在 Phase 1 内追求复杂 CSS 编辑器。

## 多选退化规则

Phase 1 采用“可见但有限编辑”的多选策略。

统一原则：

- 能稳定表达公共值的就显示并允许编辑
- 不能稳定表达的就显示 mixed 或 disabled
- 不做看起来能改、实际语义不清的交互

### SelectorManager

- 显示公共 class 列表
- 允许给全部选中项新增 class
- 删除 class 只对公共 class 开放
- `state` 仅在语义可安全应用时开放
- 当前选中信息显示为 `N elements selected` + 主选中标签

### StyleManager

- 属性值一致时显示具体值
- 不一致时显示 mixed
- mixed 值可被用户输入统一值覆盖
- 无法安全批量写入的字段直接禁用

### LayerManager

- 树上高亮多个选中节点
- 点击单个节点时切换主选中
- 不做批量拖拽和批量层级编辑

## 错误处理和失效场景

### 错误处理策略

mapper 写回失败时不静默吞掉，分三层处理：

- 字段级失败：当前 field 显示错误态或短提示，保留用户 draft
- inspector 级失败：若目标丢失、组件已删除或选区失效，整体回到只读态并提示
- 自动恢复：下一次 adapter 成功生成 snapshot 后清理旧错误

### 失效场景

需要在设计中明确支持以下场景：

- 选中组件在编辑期间被删除
- 外部操作切换了选区
- 当前 class 在写回前被移除
- 当前 state 改变导致 rule 目标变化
- 多选集合变化导致 mixed 重新计算

统一处理方式：

- adapter 重新生成 snapshot
- 如果当前 draft 已失效，field 退出编辑态
- mapper 不承担复杂补偿逻辑

## 目录规划

建议目录如下：

- `src/components/right-pane/view/visual-html/grapes-like/`
- `src/components/right-pane/view/visual-html/grapes-like/selector/`
- `src/components/right-pane/view/visual-html/grapes-like/style/`
- `src/components/right-pane/view/visual-html/grapes-like/style/fields/`
- `src/components/right-pane/view/visual-html/grapes-like/layers/`
- `src/components/right-pane/view/visual-html/grapes-like/shared/`

## 基于当前代码现状的演进路径

当前仓库中已经存在一部分 Grapes-like 代码雏形：

- `selectorAdapter.ts` / `selectorMapper.ts`
- `styleAdapter.ts` / `styleMapper.ts`
- `layerAdapter.ts` / `layerMapper.ts`
- `GrapesLikeSelectorManager.tsx`
- `GrapesLikeStyleManager.tsx`
- 若干基础测试

同时，正式入口仍然是宿主版：

- `src/components/right-pane/view/visual-html/inspector/VisualInspectorPane.tsx`
- `src/components/right-pane/view/visual-html/inspector/renderVisualInspectorPanels.ts`

### 演进原则

- 不推倒重来已有 `grapes-like` 代码
- 以“收编并重构”为主，而不是重新平行复制第二套壳子
- 先补共享 snapshot 和统一 adapter 接口，再逐步把现有 manager 接进去

### 推荐演进步骤

1. 把现有分散 adapter 能力收敛到统一 `InspectorAdapter`
2. 把 `types.ts` 升级为完整 snapshot / view-model 类型定义
3. 让现有 `GrapesLikeSelectorManager.tsx` 和 `GrapesLikeStyleManager.tsx` 改为只消费 snapshot
4. 补齐 `LayerManager` 的 React 版树视图
5. 在独立的新入口中完成联调
6. 保持宿主版和新实现并行存在，直到验收通过

### 不建议的路线

- 继续在宿主版 `VisualInspectorPane` 上堆更多交互
- 让每个 manager 各自直接订阅 GrapesJS 事件
- 在 field 组件里直接操作 GrapesJS rule/model

## 第一批范围

第一批目标是“核心可替换”，但不切主入口。

### 功能范围

- `SelectorManager`：`Classes`、`- State -`、选中信息、class 增删、state 切换
- `StyleManager`：`General / Dimension / Decorations / Extra` 四个 sector 与基础字段
- `LayerManager`：基础树浏览、选中联动、展开收起、显隐开关

### 不进入第一批的内容

- 图层拖拽排序
- Typography / Flex
- 完整背景图片和 gradient 编辑
- 完整 AssetManager 联动
- 所有 GrapesJS 长尾交互细节

## 第二批范围

第二批目标是补齐“原版体验差距”，为一次性切换做准备。

包含：

- `LayerManager`
  - 拖拽排序
  - wrapper/root 处理细节
  - 更完整的节点状态展示

- `StyleManager`
  - `Typography`
  - `Flex`
  - `Color / File` 更完整交互
  - `Background` image/gradient 增强
  - stack/layer 细节继续贴近原版

- `SelectorManager`
  - 更完整的公共 selector 与 state 边界行为

## 第一批实施顺序

1. 完整定义 `types.ts` 中的 snapshot / schema / view-model 类型
2. 实现统一 `InspectorAdapter`
3. 对齐 `selectorMapper.ts`、`styleMapper.ts`、`layerMapper.ts` 的接口
4. 收编现有 `SelectorManager` 到 snapshot 模式
5. 收编现有 `StyleManager` 到 schema + view-model 模式
6. 补齐 `LayerManager` React 树视图
7. 新入口联调，不替换当前正式入口

## 风险评估

### 中高风险

- `StyleManager` 基础 property 的映射一致性
- `SelectorManager` 的 state/class 同步细节
- mixed 值和禁用态的判定一致性

### 高风险

- `background / box-shadow / transition / transform` 的双向转换
- 复杂页面下的选中同步一致性
- 多选下 rule/inline 写回目标的稳定解释

### 风险控制策略

- 保持隔离开发，不影响宿主版正式入口
- 第一批不做图层拖拽排序
- 第一批不做完整 AssetManager 深联动
- 用真实页面回归验证，而不是只看单元测试

## 验收标准

只有全部满足时，才允许切到新实现。

### 功能对齐

- 第一批范围内的 `SelectorManager / StyleManager / LayerManager` 功能全部可用
- 常见操作能完整走通：
  - 选中元素
  - 改类名
  - 切状态
  - 改基础样式
  - 在图层树里选中元素

### 行为一致

- 对同一组件做相同操作，新实现和原生 GrapesJS 的写回结果一致或可接受等价
- 重点校验：
  - `margin / padding / border / radius`
  - `background`
  - `box-shadow`
  - `transition`
  - `transform`

### 稳定性

- 不影响现有画布编辑
- 不影响保存、切模式、预览、撤销重做
- 组件选中与右栏同步不出现明显空白、错乱或卡顿

### 回归验证

至少包含两类验证：

- 逻辑测试：adapter、mapper、manager 关键路径
- 真实页面验证：登录页、表单页、表格页等典型页面

## 切换条件

采用“一次性切换”策略，但必须同时满足：

- 第一批功能全部验收通过
- 宿主版与新实现对照验证通过
- 典型页面真实回归通过
- 尚未覆盖的长尾能力不影响默认使用

## 结论

本设计选择：

- 采用 `单一 InspectorSnapshot + 分 manager 局部运行态`
- 采用“有 class 写 rule、无 class 写 inline”的混合写回策略
- 多选采用“可见但有限编辑”的退化方案
- 基于当前已经落地的 `grapes-like` 代码继续收编和重构，而不是重新从零做第二套

这使得 Phase 1 可以先把数据边界、同步模型和写回链路做稳，为后续一次性切换和 AI 接入打基础。
