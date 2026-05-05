# 可视化 HTML 设计模式运行时化改造设计

## 背景

当前 `cc-ui` 的 HTML 可视化设计模式与预览模式存在显著差异。根因不是某一处样式或脚本缺失，而是两者建立在不同的渲染真相之上：

- 预览模式直接加载 `/api/projects/:projectName/preview/...` 对应的真实页面。
- 设计模式先解析 HTML，再裁剪、重组、注入到 GrapesJS 画布中。

这导致以下系统性问题：

- 设计模式与浏览器真实效果不一致。
- 页面越依赖真实 `head`、资源路径、CSS 层叠、少量原生 JS 初始化，失真越明显。
- 为个别页面追加修复后，容易引入新的兼容性回归。
- 用户无法稳定信任“设计模式里看到的就是最终结果”。

本设计面向的目标页面范围是：

- 静态 HTML 页面
- 普通 DOM/CSS 页面
- 少量原生 JS 初始化页面

本设计不追求首轮覆盖复杂运行时页面、微前端、shadow DOM 或重脚本驱动应用。

## 目标

- 让设计模式尽可能接近真实浏览器渲染结果。
- 让设计模式与预览模式共享同一真实页面渲染底座。
- 建立稳定、可缓存、可恢复的“运行时 DOM 到源码 HTML”的映射层。
- 在首轮范围内支持高置信度、可精确保存的轻编辑能力。
- 在保证准确性的前提下控制交互性能，避免高频操作卡顿。

## 非目标

- 不在首轮实现复杂结构自由拖拽。
- 不在首轮支持复杂运行时页面的通用可视化编辑。
- 不在首轮实现完整的 CSS Rule 级样式重构。
- 不继续把 GrapesJS 当作设计模式的页面渲染真相。

## 方案对比

### 方案 A：继续增强现有 GrapesJS 导入链

做法：

- 保留 `HTML -> 预处理 -> GrapesJS components -> canvas iframe` 主链路。
- 继续增加 head、style、script、资源路径、事件属性等兼容补丁。

优点：

- 改动最小
- 短期见效快
- 现有可视化 UI 复用最多

缺点：

- 浏览器一致性上限低
- 长期陷入按页面补丁修复
- 根因不变，系统复杂度继续增加

### 方案 B：真实 iframe 运行时为底座，设计模式用 overlay 覆盖编辑

做法：

- 设计模式和预览模式都使用同一个真实 preview iframe。
- 设计模式只增加 overlay、DOM 索引、源码索引、桥接层和 patch 写回能力。

优点：

- 浏览器一致性最高
- 预览模式和设计模式视觉真相统一
- 大量资源、样式、脚本初始化问题交给浏览器自身处理
- 更适合静态 HTML / 轻交互页面

缺点：

- 架构调整大
- 需要重建稳定定位和保存能力
- 结构编辑能力要分阶段重做

### 方案 C：真实 iframe 与 GrapesJS 双轨混合

做法：

- 视觉上更多依赖真实 iframe
- 结构编辑时继续同步 GrapesJS 模型

优点：

- 过渡看似平滑
- 可复用更多现有 GrapesJS 交互

缺点：

- 维护双真相
- 调试复杂度最高
- 长期架构风险最大

## 结论

选择方案 B。

原因：

- 用户优先级是浏览器一致性优先。
- 目标页面范围明确，适合运行时 iframe 方案。
- 方案 B 是唯一从渲染真相层面解决问题的方案。
- 相比继续修补 GrapesJS 导入链，方案 B 的长期收益更高。

## 核心原则

新设计模式必须同时维护三层真相，并明确边界：

### 1. 浏览器运行时真相

真实 preview iframe 中已经加载完成的 DOM、CSS 和少量原生 JS 执行结果。

职责：

- 决定用户看到什么
- 作为设计模式和预览模式的共同渲染底座

### 2. 源码持久化真相

磁盘上的原始 HTML 文件文本。

职责：

- 决定最终保存成什么
- 不允许以 GrapesJS 内部模型或运行时 DOM 直接替代

### 3. 设计时映射真相

连接运行时 DOM 与源码 HTML 的中间层。

职责：

- 稳定定位选中节点
- 支撑 reload 后重连
- 支撑局部 patch 保存

## 总体架构

设计模式改造后采用如下架构：

`真实 preview iframe + RuntimeDomIndexer + SourceMapIndex + RuntimeSourceBridge + DesignOverlayEngine + DomMutationRecorder + HtmlPatchWriter`

### 模块职责

#### PreviewRuntimeHost

职责：

- 统一承载 preview iframe
- 提供 iframe、window、document、ready/load/error 状态
- 为预览模式和设计模式提供共同运行时入口

#### RuntimeDomIndexer

职责：

- 扫描真实 iframe DOM
- 为可编辑节点分配会话内 `nodeId`
- 建立 DOM 引用缓存
- 生成结构指纹

#### SourceMapIndex

职责：

- 解析 HTML 源码 AST
- 建立节点、属性、文本的源码 range 索引
- 维护源码版本和局部失效能力

#### RuntimeSourceBridge

职责：

- 将运行时节点映射到源码节点
- 提供匹配结果、置信度和可保存性判断
- 在 iframe reload 后基于结构指纹恢复映射

#### DesignOverlayEngine

职责：

- hover 高亮
- 选中高亮
- 浮动工具栏
- spacing / box model 可视反馈
- 设备宽度下的测量和同步

#### DomMutationRecorder

职责：

- 记录设计模式中的编辑意图
- 维护待保存 mutation 队列
- 将连续交互合并为稳定 patch 输入

#### HtmlPatchWriter

职责：

- 根据 bridge 结果和 mutation 写回源码
- 优先做局部 patch
- 在首轮范围内保证文本、属性、inline style 编辑的精确保存

## 稳定定位设计

### 会话内定位

交互期间的定位不依赖全文匹配，而依赖运行时索引。

流程：

1. 用户点击真实 DOM 节点
2. 向上找到最近可编辑祖先
3. 读取或分配 `nodeId`
4. 直接命中 `RuntimeDomIndexer` 缓存

这条链路必须做到接近 O(1) 访问，以保证点击和 hover 反应速度。

### reload 后重连

页面 reload 后，DOM 引用失效，但 `nodeId` 与结构指纹仍可用于桥接恢复。

结构指纹至少包含：

- `tagName`
- `id`
- `classList` 摘要
- 关键属性摘要
- 父链路径摘要
- 同级位置
- 文本摘要

Bridge 恢复采用多特征打分，不采用单一字段。

### 保存定位

保存不能依赖 `outerHTML` 模糊匹配，必须依赖源码 AST range。

保存流程：

1. 运行时节点命中 `nodeId`
2. Bridge 输出对应源码节点
3. PatchWriter 使用该节点的属性区间、文本区间或节点区间执行局部 patch

### 低置信度策略

当桥接结果不可靠时：

- 不允许静默保存
- 标记该节点为只读或需重新同步
- 提示用户切换源码模式处理

系统必须优先避免“错写源码”，而不是勉强保存。

## 编辑能力分层

### 首轮支持

- 文本内容编辑
- `class` 编辑
- inline `style` 编辑
- 常见属性编辑
- 显示隐藏切换
- 基础 spacing / size 调整

### 首轮延后

- 跨层级复杂结构拖拽
- 自动重构外部样式表
- 复杂 CSS Rule 级编辑
- 大范围结构重排

## 性能设计

### 性能目标

- 选中反馈应接近即时
- hover 高亮不能引发明显卡顿
- 常见设计模式页面应在合理时间内完成索引建立
- 连续轻编辑不应频繁阻塞主线程

### 性能控制策略

#### 1. 双索引缓存常驻

- `RuntimeDomIndexer` 常驻内存
- `SourceMapIndex` 常驻内存
- 仅在源码版本变化或结构编辑后重建必要部分

#### 2. 增量失效

- 文本编辑仅使目标文本节点失效
- 属性编辑仅使目标节点失效
- 结构编辑使对应子树失效

#### 3. Overlay 与保存解耦

- hover / select 只依赖运行时索引
- 保存 patch 不阻塞即时高亮反馈

#### 4. 高频测量节流

- 使用 `requestAnimationFrame`
- 对 `mousemove`、`scroll`、`resize` 做节流
- 只测选中节点、hover 节点和必要祖先链

#### 5. 批量提交 mutation

- 连续拖动或连续输入期间只记录 mutation
- 操作结束后再统一生成 patch

## 与现有代码的迁移关系

### 保留

- `VisualHtmlEditor.tsx` 作为工作台壳层
- 源码模式与其工具栏交互
- 现有部分 overlay 交互思路

### 降级或重写

- `VisualCanvasPane.tsx`
  - 不再作为页面渲染真相
  - 迁移为 runtime-based 设计宿主

- `canvasHeadMarkup.ts`
  - 不再承担主渲染链路职责
  - 可保留为辅助兼容逻辑

### 退役主链路

- `normalizeDesignCanvasHtml`
- `createCanvasStructureHtml`
- 基于重组 HTML 的 GrapesJS 页面重建
- 以 GrapesJS 组件树为设计模式页面真相

### 建议新增目录

`src/components/right-pane/view/visual-html/runtime/`

建议新增文件：

- `PreviewRuntimeHost.tsx`
- `RuntimeDomIndexer.ts`
- `SourceMapIndex.ts`
- `RuntimeSourceBridge.ts`
- `DesignOverlayEngine.tsx`
- `DomMutationRecorder.ts`
- `HtmlPatchWriter.ts`

## 分阶段实施

### Phase 1：统一渲染底座

目标：

- 设计模式与预览模式共享真实 iframe
- 接入最小版 overlay
- 建立 DOM 索引、源码索引与 bridge 基础设施

范围：

- 选中
- hover
- 基础高亮
- 发送选区到聊天
- 节点定位验证

不做：

- 复杂编辑
- 结构拖拽
- GrapesJS 组件树导入

### Phase 2：轻编辑与精确保存

目标：

- 支持高置信度、局部 patch 型编辑能力

范围：

- 文本编辑
- 属性编辑
- `class` 编辑
- inline `style` 编辑
- 显示隐藏
- spacing / size 微调

不做：

- 跨层级结构改动
- 大规模样式体系重写

### Phase 3：受限结构编辑

目标：

- 在受控范围内支持结构编辑

范围：

- 删除节点
- 插入简单节点
- 同父节点内排序
- 受限容器内拖拽

### Phase 4：高级体验增强

范围：

- 多选
- 框选
- 更完整的 layer / spacing 体验
- 更细的只读区域与冲突提示
- 更完善的局部撤销和错误恢复

## 风险评估

### 1. 映射精度风险

风险：

- 相似兄弟节点过多
- 运行时 DOM 与源码树出现明显分叉

控制：

- 多特征结构指纹
- bridge 置信度机制
- 低置信度只读降级

### 2. 运行时状态污染源码风险

风险：

- 某些 JS 初始化添加的临时 class/style 被误保存

控制：

- mutation 只记录用户直接编辑意图
- 默认不把所有运行时 DOM 差异都视为设计变更

### 3. 性能风险

风险：

- 高频测量导致卡顿
- reload 后全量重建导致等待感

控制：

- 增量索引
- 缓存
- RAF 节流
- 局部 patch

### 4. 范围膨胀风险

风险：

- 首轮被迫同时承载复杂结构编辑与高级 UI

控制：

- 首轮严格限制在 `Phase 1 + Phase 2`

## 验收标准

### Phase 1 验收

- 设计模式与预览模式使用同一真实 iframe 页面
- 设计模式下选中节点的视觉位置与真实页面一致
- hover 和选中高亮在常见页面中稳定可用
- DOM 索引与源码索引可建立并输出 bridge 结果

### Phase 2 验收

- 文本、属性、inline style 编辑可精确保存
- 保存后 reload 页面，视觉结果与编辑前预期一致
- 低置信度节点不会静默错误保存
- 常见目标页面中交互性能稳定

## 测试策略

### 单元测试

- 结构指纹生成
- bridge 匹配打分
- 局部 patch 写回
- mutation 合并逻辑

### 集成测试

- iframe reload 后 bridge 恢复
- 文本编辑保存
- 属性编辑保存
- spacing / size 微调保存
- 低置信度节点降级

### 手工验证

重点覆盖：

- 普通静态 landing 页面
- 带基础表单页面
- 带少量脚本初始化页面
- 相对路径资源页面

## 最终建议

建议正式推进该方案，但首轮必须严格限定为 `Phase 1 + Phase 2`。

这是一个实现成本较高但方向正确的架构改造。对当前目标页面范围而言，它能够从根因上显著提升设计模式与真实浏览器的一致性，并为后续可视化编辑能力建立稳定基础。
