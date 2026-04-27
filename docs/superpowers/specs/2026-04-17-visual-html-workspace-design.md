# Visual HTML Workspace 设计

## 背景

当前 `cc-ui` 已经接入了 GrapesJS，并为 HTML 文件新增了 `visual-html` 视图。但从实际使用上看，HTML 文件目前仍然分散在三条相近但职责重叠的路径中：

- `code`：源码编辑
- `visual-html`：可视化编辑
- `browser(file-html)`：浏览器预览

这种拆分在实现初期有利于快速接入，但在真实交互中带来了明显的问题：

- 同一个 `.html` 文件会出现多个几乎重复的入口
- 用户需要在“源码 / 预览 / 可视化”之间来回切 pane
- HTML 文件的编辑心智仍然停留在“普通文本文件”，而不是“专用工作台文档”
- 保存、冲突、重载、同步逻辑分散在多个组件中，长期维护成本偏高

同时，GrapesJS 本身已经自带基础代码查看/编辑能力，说明“设计态 + 源码态”天然适合放在同一个 HTML 工作台里，而不是继续拆成多个右侧 pane。

本次设计的目标，是把 HTML 文件升级为单一入口的 `visual-html workspace`：一个文件，一个工作台，在内部切换“设计 / 源码”，不再让 HTML 文件继续暴露重复的浏览器预览与独立源码 pane 入口。

## 目标

- 将 `.html/.htm` 文件统一收口为单一 `visual-html` 工作台入口
- 在 `visual-html` 内整合可视化编辑与源码编辑
- 让 HTML 文件共享一套保存、重载、冲突、广播逻辑
- 消除 HTML 文件的重复预览路径和重复 pane 心智
- 保持现有非 HTML 文件的右侧 pane 架构不受影响

## 非目标

- 不重构 `CodeEditor` 的通用文本编辑职责
- 不让 GrapesJS 接管非 HTML 文件
- 不实现 HTML 的实时双向无损同步
- 不在第一版支持分栏、并排协同编辑、差异对比、历史版本等高级能力
- 不改变 `BrowserPane` 的外链 / URL 浏览职责

## 推荐方案

采用“HTML 文件统一进入 `visual-html workspace`”的方案。

具体规则：

- `.html/.htm` 文件默认只进入 `visual-html`
- `visual-html` 内部提供两种模式：
  - `design`：GrapesJS 可视化编辑
  - `source`：源码编辑
- 第一版不提供 HTML 的独立 `browser(file-html)` 预览入口
- 第一版不再让 HTML 默认进入独立 `code` pane
- `BrowserPane` 继续保留，但仅用于：
  - 外部链接
  - 地址栏输入 URL
  - 非 HTML 场景的浏览能力

从用户视角看，HTML 文件以后不再是“普通文件 + 多个视图入口”，而是“一个专用工作台文档”。

## 备选方案与取舍

### 方案 A：维持 `code + visual-html + browser` 三视图并存

优点：

- 改动最少
- 可以保留现有 `BrowserPane(file-html)` 的元素选择和地址栏能力

缺点：

- HTML 文件入口重复
- 用户心智分裂
- 保存、冲突和同步逻辑会持续分散

结论：不推荐继续沿用。

### 方案 B：HTML 全部统一进 `visual-html workspace`

优点：

- 用户心智最清晰
- HTML 文件天然收口成一个专用工作台
- 可以把设计态和源码态统一到同一份文档状态机中
- 便于长期扩展 HTML 专用能力

缺点：

- 需要把部分源码编辑能力从 `CodeEditor` 中下沉出来复用
- HTML 不再默认享有 `BrowserPane(file-html)` 的那套能力

结论：推荐采用。

### 方案 C：保留 `visual-html`，但在内部只使用 GrapesJS 自带 Code Modal

优点：

- 实现最轻
- 几乎不需要和现有 `CodeEditor` 体系整合

缺点：

- 源码体验明显弱于现有 `CodeMirror`
- 无法承载未来更复杂的源码模式需求
- 只适合作为临时补充，不适合作为工作台主源码入口

结论：可作为过渡，但不应是最终方案。

## 架构设计

### 单一 Target

HTML 文件在右侧面板的唯一目标类型为：

- `visual-html`

对应规则调整：

- `resolveRightPaneTargetForFile()` 对 `.html/.htm` 默认返回 `visual-html`
- HTML 文件不再默认生成 `browser(file-html)` target
- HTML 文件不再默认生成独立 `code` target

其他文件类型保持不变：

- Markdown 仍走 `markdown`
- 普通文本文件仍走 `code`
- URL 和外链仍走 `browser`

### 组件拆分

推荐拆分为四层：

#### 1. `VisualHtmlWorkspace`

HTML 文件唯一工作台容器，负责：

- 模式切换
- 保存 / 重载
- 冲突提示
- 工具栏与状态提示
- 挂载设计态和源码态子视图

#### 2. `VisualCanvasPane`

GrapesJS 可视化层，负责：

- 画布初始化
- 选区与样式面板
- 设计态编辑
- 导出 HTML / CSS

#### 3. `HtmlSourceEditorSurface`

轻量源码编辑器，负责：

- 源码编辑
- HTML/CSS 语法高亮
- 基础快捷键
- 与工作台共享文档状态

这个组件只复用通用编辑能力，不复用完整 `CodeEditor` pane 壳层。

#### 4. `HtmlDocumentController`

共享文档状态控制器，可以是 hook 或状态容器，负责：

- `documentText`
- `persistedText`
- `version`
- `dirtySource`
- `dirtyDesign`
- `conflictState`
- `save / reload / applyDesignToSource / applySourceToDesign`

它是整个工作台的状态中心。

## 工作台模式设计

第一版仅支持两种模式：

- `design`
- `source`

第一版不实现：

- `split`
- 并排同步
- 差异对比视图

推荐顶部工具栏：

- `设计`
- `源码`
- `保存`
- `重新加载`

推荐状态提示：

- 未保存修改
- 磁盘文件已变化
- 当前文件不支持可视化编辑

## 文档状态模型

推荐统一使用以下状态：

- `loading`
- `ready`
- `dirty-design`
- `dirty-source`
- `saving`
- `conflict`
- `load-error`
- `unsupported`

其中核心字段为：

- `documentText`：当前工作台统一文档文本
- `persistedText`：最近一次成功落盘后的文本
- `version`：最近一次读取或保存后的版本标识
- `activeMode`：当前是 `design` 还是 `source`
- `dirtyDesign`：可视化视图是否有未应用修改
- `dirtySource`：源码视图是否有未应用修改
- `syncConflict`：是否存在外部文件变更冲突

## 数据流设计

### 打开文件

1. 用户打开 `.html/.htm`
2. 路由直接进入 `visual-html`
3. 工作台读取文件文本
4. 进行 eligibility 检查
5. 初始化：
   - `documentText`
   - `persistedText`
   - `version`
6. 默认进入 `design` 模式
7. 使用 `documentText` 初始化 GrapesJS

### 设计态编辑

在 `design` 模式下：

- GrapesJS 内部允许自由编辑
- 不立刻改写源码视图
- 只标记 `dirtyDesign = true`

### 源码态编辑

在 `source` 模式下：

- `HtmlSourceEditorSurface` 编辑 `documentText`
- 不实时重建 GrapesJS
- 只标记 `dirtySource = true`

### 模式切换

#### `design -> source`

若 `dirtyDesign = true`：

- 提示“将可视化修改应用到源码”
- 用户确认后：
  - 从 GrapesJS 导出 HTML/CSS
  - 生成新的 `documentText`
  - 清除 `dirtyDesign`
- 然后切换到 `source`

#### `source -> design`

若 `dirtySource = true`：

- 提示“将源码修改应用到设计视图”
- 用户确认后：
  - 用新的 `documentText` 重新初始化 GrapesJS
  - 清除 `dirtySource`
- 然后切换到 `design`

### 保存

保存只有一个统一入口。

保存前，先把当前活跃视图收敛成统一文档：

- 若当前在 `design`，先执行导出，更新 `documentText`
- 若当前在 `source`，直接使用当前源码文本

然后：

1. 带 `expectedVersion` 发起保存
2. 保存成功后更新：
   - `persistedText`
   - `version`
   - `dirtyDesign = false`
   - `dirtySource = false`
3. 广播文件已保存事件

### 重载

重载行为始终回到磁盘真实状态：

1. 重新读取文件
2. 覆盖 `documentText / persistedText / version`
3. 清空所有 dirty 标记
4. 重新初始化当前模式所需的视图

## 冲突处理

### 外部文件变更

如果工作台收到外部文件已保存广播：

- 当本地无未保存修改时：允许自动重载
- 当本地有未保存修改时：
  - 进入 `conflict`
  - 禁止继续保存
  - 提示用户先重新加载

### 保存时 409

如果保存请求返回版本冲突：

- 进入 `conflict`
- 不允许继续二次保存覆盖
- 只允许用户：
  - 重新加载
  - 或放弃本地修改

### 不支持可视化编辑

如果文件不满足 eligibility：

- 进入 `unsupported`
- 不初始化 GrapesJS
- 显示“当前文件暂不支持可视化编辑”
- 允许切换到源码模式继续编辑

这里与旧方案的差异是：第一版不再自动回退到独立 `CodeEditor` pane，而是在同一工作台中回退到 `source` 模式。

## 与现有组件的关系

### `CodeEditor`

保留为通用文本文件编辑器，不再作为 HTML 文件主入口。

需要从中提取可复用能力：

- CodeMirror 初始化
- HTML/CSS 语言支持
- 基础快捷键
- 文本编辑表面

不再复用的部分：

- HTML 专用 header 入口
- pane 级弹出 / 预览路由
- HTML 文件的独立工作流

### `BrowserPane`

保留，但职责收缩：

- 外链
- 地址栏 URL
- 普通浏览器 pane

不再承担 HTML 文件主预览职责。

### `VisualHtmlEditor`

升级为 `VisualHtmlWorkspace`，成为 HTML 文件唯一工作台容器。

## 迁移步骤

推荐分四步迁移：

### 第一步：收口 HTML 入口

- HTML 默认只进入 `visual-html`
- 移除 HTML 的浏览器预览按钮
- 不再让 HTML 默认进入独立 `code` pane

### 第二步：抽源码编辑内核

- 从 `CodeEditor` 中拆出轻量源码编辑表面
- 保留现有编辑体验的核心能力

### 第三步：引入统一文档控制器

- 将当前 `VisualHtmlEditor` 和 `useCodeEditorDocument` 中与 HTML 保存相关的逻辑集中
- 统一版本、广播、冲突状态

### 第四步：加入模式切换

- 实现 `design / source` 切换
- 切换前做“应用修改”提示
- 去除旧的 HTML 重复路径

## 测试策略

### 单元测试

需要覆盖：

- HTML 默认路由到 `visual-html`
- HTML 不再显示独立浏览器预览入口
- 模式切换时的 dirty 提示
- `design -> source` 应用逻辑
- `source -> design` 应用逻辑
- 保存前文档收敛逻辑
- 冲突状态禁止继续保存
- unsupported 文件能回退到源码模式

### 组件测试

需要覆盖：

- 工作台首次加载
- 设计态和源码态切换
- 重载按钮行为
- 保存成功后状态清空

### 手动验证

需要至少覆盖：

- 打开普通 HTML，默认进入工作台
- 在设计态修改并保存
- 切到源码态能看到更新后的文本
- 在源码态修改并应用到设计态
- 外部修改后出现冲突提示
- 含模板语法文件进入 unsupported / source 路径

## 风险与回退

### 风险 1：源码与 GrapesJS 并非无损双向映射

说明：

- GrapesJS 导出会重排 HTML/CSS
- 手写源码中的一些结构、格式和细节可能在回到设计态时被规范化

应对：

- 第一版明确这是“可视化维护工作台”，不是无损 AST 编辑器
- 对复杂文件保守进入 `source` 模式

### 风险 2：状态机复杂度上升

说明：

- 设计态和源码态共享一份文档状态，会增加容器复杂度

应对：

- 尽早引入 `HtmlDocumentController`
- 不做实时双向同步
- 第一版只保留两模式和统一保存入口

### 回退策略

如果工作台模式验证效果不理想，可回退到：

- HTML 仍进入 `visual-html`
- 但 `source` 模式先暂时使用 GrapesJS 自带 Code Modal
- 或临时恢复“HTML 可打开到独立 code pane”的兜底入口

## 结论

HTML 文件更适合作为一个专用工作台文档，而不是继续挂在“普通文本文件 + 多个 pane 入口”的旧模型上。

本设计建议：

- 让 `.html/.htm` 统一进入 `visual-html workspace`
- 在工作台内部整合 `design / source`
- 使用单一文档状态机统一保存、冲突和重载
- 去掉 HTML 的重复浏览器预览路径

这是当前产品体验最一致、长期代码边界也最清晰的方案。
