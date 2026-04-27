# Grapes-like 样式分组调整设计

## 背景

当前 `Grapes-like` Inspector 已经具备一套独立的样式面板，但现有分组还没有完全贴合用户对“外观”和“高级效果”的心智模型。用户在实际编辑时，通常会把背景、边框、阴影、透明度视为一类设置，而把过渡和变换视为另一类设置。

本设计的目标是只调整 `Grapes-like` 的样式分组方式与字段归属，不改变其整体架构，也不替换 `Classic` 宿主检查器。

## 目标

### 业务目标

- 让样式面板更符合用户直觉
- 将 `background / border / shadow / opacity` 归入同一组 `外观`
- 将 `transition / transform` 归入 `高级`
- 保持现有样式编辑能力稳定，不引入不必要的交互变化

### 技术目标

- 保持 `Grapes-like` 现有的 `adapter -> snapshot -> React -> mapper` 架构不变
- 只调整分组 schema、字段归属和渲染顺序
- 新增 `box-shadow` 的读写支持
- 确保 `opacity` 从 `高级` 移入 `外观`
- 确保 `transition` 和 `transform` 在 `高级` 中可编辑

## 最终分组

### 1. 布局

- `display`
- `float`
- `position`
- `inset`
- `z-index`
- `width`
- `height`
- `max-width`
- `min-height`

### 2. 弹性布局

- `flex-direction`
- `flex-wrap`
- `justify-content`
- `align-items`
- `align-content`
- `order`
- `flex-basis`
- `flex-grow`
- `flex-shrink`
- `align-self`

### 3. 间距

- `margin`
- `padding`

### 4. 文本

- `color`
- `font-family`
- `font-size`
- `font-weight`
- `letter-spacing`
- `line-height`
- `text-align`

### 5. 外观

- `background-color`
- `border`
- `border-radius`
- `box-shadow`
- `opacity`

### 6. 高级

- `transition`
- `transform`

## 设计说明

### 外观组

`外观` 是用户最容易形成直觉的一组属性，负责描述元素“看起来是什么样”。

纳入这一组的字段如下：

- `background-color`
- `border`
- `border-radius`
- `box-shadow`
- `opacity`

其中：

- `background-color` 对应背景色
- `border` 对应边框宽度、样式、颜色的组合编辑
- `border-radius` 对应圆角
- `box-shadow` 对应投影
- `opacity` 对应透明度

### 高级组

`高级` 用于承载更偏效果和变换语义的属性。

纳入这一组的字段如下：

- `transition`
- `transform`

这样可以避免把“视觉外观”和“动画 / 变换”混在同一层，减少认知负担。

## 非目标

- 不重构 `Classic` 宿主检查器
- 不调整 `Selector` 和 `Layer` 的整体架构
- 不增加新的动画编辑能力
- 不在本次范围内补齐全部 GrapesJS 原生长尾字段

## 需要修改的模块

### `types.ts`

- 将样式分组 schema 更新为新的 `外观 / 高级` 结构
- 将 `box-shadow` 视为可编辑字段
- 调整 `StyleState` / `StyleStatePatch` 的字段归属

### `styleAdapter.ts`

- 从编辑器状态读取 `box-shadow`
- 读取 `opacity`
- 读取 `transition`
- 读取 `transform`
- 按新分组生成 `StyleSnapshot`

### `styleMapper.ts`

- 支持将 `box-shadow` 写回编辑器
- 支持 `opacity` 写回 `外观`
- 支持 `transition` 和 `transform` 写回 `高级`
- 保持现有复合字段的写回逻辑不变

### `GrapesLikeStyleManager.tsx`

- 以新分组顺序渲染 sector
- 将 `外观` 作为一组显示
- 将 `高级` 作为一组显示
- 保持折叠/展开与局部交互态不变

## 预期结果

修改完成后，`Grapes-like` 样式面板应该呈现为：

- `布局`
- `弹性布局`
- `间距`
- `文本`
- `外观`
  - `background`
  - `border`
  - `shadow`
  - `opacity`
- `高级`
  - `transition`
  - `transform`

用户在右侧面板中会更容易理解每个分组的职责，后续继续扩展 `Grapes-like` 时也更容易保持一致。

## 验证建议

- 检查 `Grapes-like` 样式面板是否出现新的 `外观` 分组
- 检查 `opacity` 是否从 `高级` 移入 `外观`
- 检查 `box-shadow` 是否可以读写
- 检查 `transition` 与 `transform` 是否仍可编辑
- 检查现有 `Classic` 检查器不受影响
