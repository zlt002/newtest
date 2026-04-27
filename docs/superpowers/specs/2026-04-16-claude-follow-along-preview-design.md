# Claude Follow-Along 预览同步设计

**日期**: 2026-04-16  
**作者**: Codex  
**状态**: 已确认

## 概述

用户希望把当前项目里的 Claude 对话式改代码体验，升级成更接近 Zed + Claude Code via ACP 的“follow-along”模式：Claude 一边修改文件，右侧代码/预览区域一边同步变化，尤其是在编辑 `html`、`css`、`js` 等页面相关文件时，用户可以实时看到右侧预览刷新，在多文件修改时还能跟随当前活跃文件跳转。

当前项目已经具备三块关键基础：

1. Claude SDK 事件已经进入统一消息流，`tool_use`、`tool_progress`、`files_persisted` 等事件可被前后端捕获。
2. 右侧已经有统一的 `browser` / `code` / `markdown` 面板，以及 `refreshKey` 驱动的浏览器刷新机制。
3. 本地 `html` 预览走 `/api/projects/:projectName/preview/...`，每次请求都会读取磁盘最新文件，所以只要浏览器 iframe 重载，就能拿到修改后的页面。

缺少的是中间这层“文件变更领域事件”：当前系统知道 Claude 在用哪个工具，却没有把这些工具调用稳定地转成“正在改哪个文件、是否已经落盘、当前是否应该刷新右侧”的一等 UI 事件。

本方案采用“两阶段能力升级”：

1. 第一阶段先实现“文件改动后右侧自动刷新/跟随”。
2. 第二阶段再实现“接近 ACP 的 follow-along 文件事件流”，支持多文件跳转与更细粒度的展示。

## 目标

1. 当 Claude 成功修改当前预览关联文件时，右侧预览自动刷新。
2. 当 Claude 修改当前活跃代码文件时，右侧代码视图可以自动滚动到对应范围。
3. 为 Claude 文件修改建立统一的前端领域事件层，不再只依赖聊天消息气泡。
4. 在不重写整套聊天架构的前提下，让现有项目逐步靠近 Zed 的 follow-along 体验。

## 非目标

1. 第一阶段不完整实现 ACP 协议。
2. 第一阶段不做逐 token 级别的 AST/DOM 增量预览。
3. 第一阶段不重做编辑器组件或改成完整 diff 审核工作流。
4. 第一阶段不处理所有语言生态的构建型预览刷新，仅优先覆盖本地 `html` 预览和直接依赖的 `css/js`。

## 参考结论

### Zed / ACP 的核心机制

从 Zed 官方文章和 ACP 协议资料看，Zed 能做到“边写边看”的核心不是简单监听 Claude 文本输出，而是：

1. 把底层 agent 的工具调用转成稳定的客户端协议事件。
2. 在工具事件里显式带出文件位置、活跃目标和更新进度。
3. 客户端把这些事件直接映射到编辑器和预览区域，而不是只映射成聊天文本。

ACP 的 `tool_call` / `tool_call_update` 支持 `locations`，天然适合实现：

1. 当前正在改哪个文件。
2. 当前修改影响哪个行号范围。
3. 客户端应该切到哪个文件或刷新哪个预览。

### 当前项目与 Zed 的差距

当前项目已经有：

1. Claude SDK 消息接入。
2. 右侧统一内容面板。
3. HTML 预览地址和浏览器刷新机制。

但还缺：

1. `tool_use -> 文件变更领域事件` 的显式转换层。
2. “当前右侧目标与文件变更是否相关”的判定逻辑。
3. 代码视图跟随跳转与浏览器视图自动刷新之间的统一编排。

## 方案对比

### 方案 A：自动刷新预览

只在 Claude 成功写入页面关联文件后，自动刷新右侧 iframe。

优点：

1. 落地最快。
2. 对现有架构侵入最小。
3. 立刻能得到“边改边看”的核心体感。

缺点：

1. 还不是完整 follow-along。
2. 多文件编辑时缺乏明确的活跃文件跟随。
3. 聊天和右侧仍然是松耦合的。

### 方案 B：双层事件模型，推荐

保留现有 Claude SDK 消息流，再从中派生一层文件变更领域事件：

1. `file_change_started`
2. `file_change_progress`
3. `file_change_applied`
4. `file_change_failed`
5. `focus_file_changed`

右侧面板消费这些领域事件，决定是刷新浏览器还是切换代码视图。

优点：

1. 最符合当前项目架构。
2. 能平滑覆盖第一阶段和第二阶段。
3. 后续接别的 agent 或做 ACP 化也更容易。

缺点：

1. 需要补一层事件建模与测试。
2. 行号范围推断在部分工具场景里只能做到近似。

### 方案 C：全面 ACP 化

把当前 Claude 集成层整体重构成 ACP 风格，前端直接消费类似 `tool_call/tool_call_update/locations` 的协议。

优点：

1. 长期最统一。
2. 最接近 Zed 的交互模型。

缺点：

1. 改动过大。
2. 这次超出当前范围。
3. 需要同时重构聊天、右侧面板和工具渲染策略。

## 采用方案

采用 **方案 B**，但拆成两个实施阶段：

### 第一阶段：自动刷新与轻量跟随

1. Claude 成功修改当前预览文件时，右侧浏览器自动刷新。
2. Claude 成功修改当前 HTML 依赖的本地 CSS/JS 时，右侧浏览器自动刷新。
3. Claude 成功修改当前活跃代码文件时，右侧代码视图可以选择自动滚动到目标位置。

### 第二阶段：接近 Zed 的 follow-along

1. 为多文件编辑建立活跃文件跟随逻辑。
2. 右侧支持“跟随 Claude 编辑”开关。
3. 浏览器和代码视图根据文件事件自动切换。
4. 聊天区与右侧共享同一条文件变更时间线。

## 架构设计

### 分层结构

采用三层：

1. **SDK 归一化层**
   - 输入：Claude SDK 原始消息
   - 输出：`NormalizedMessage`
   - 现有文件：`server/providers/claude/adapter.js`

2. **文件变更领域事件层**
   - 输入：`NormalizedMessage`
   - 输出：`FileChangeEvent`
   - 新增位置建议：前端 `useChatRealtimeHandlers.ts` 附近，或抽成 `chatFileChangeEvents.ts`

3. **右侧消费层**
   - 输入：`FileChangeEvent`
   - 输出：刷新浏览器、切换文件、跳行、刷新 tab 标题态
   - 现有文件：`AppContent.tsx`、`useEditorSidebar.ts`、`BrowserPane.tsx`

### 领域事件模型

建议新增：

```ts
type FileChangeEvent =
  | {
      type: 'file_change_started';
      sessionId: string;
      toolId: string;
      filePath: string;
      lineRange?: { startLine: number; endLine: number } | null;
      source: 'Edit' | 'Write' | 'ApplyPatch' | 'MultiEdit';
      timestamp: string;
    }
  | {
      type: 'file_change_applied';
      sessionId: string;
      toolId: string;
      filePath: string;
      lineRange?: { startLine: number; endLine: number } | null;
      source: 'Edit' | 'Write' | 'ApplyPatch' | 'MultiEdit';
      timestamp: string;
    }
  | {
      type: 'file_change_failed';
      sessionId: string;
      toolId: string;
      filePath: string;
      source: 'Edit' | 'Write' | 'ApplyPatch' | 'MultiEdit';
      error: string;
      timestamp: string;
    }
  | {
      type: 'focus_file_changed';
      sessionId: string;
      filePath: string;
      reason: 'latest_edit';
      timestamp: string;
    };
```

核心原则：

1. 聊天消息仍然保留，用于 transcript。
2. 右侧跟随逻辑不直接读聊天文本，而是消费 `FileChangeEvent`。
3. 一个工具调用至少可映射出“开始”和“完成/失败”两类事件。

## 第一阶段设计

### 1. 如何识别文件修改

优先覆盖以下工具：

1. `Edit`
2. `Write`
3. `ApplyPatch`
4. `MultiEdit`

识别来源：

1. `tool_use` 里的 `toolName`
2. `toolInput.file_path`
3. `toolResult.isError`
4. 如可用，再从 `old_string/new_string` 推断修改范围

### 2. 如何判定“当前预览是否应刷新”

当右侧 target 是 `browser` 且 `source === 'file-html'` 时：

1. 若修改文件就是当前预览 HTML 文件本身，刷新。
2. 若修改文件是当前 HTML 引用到的本地 CSS/JS 文件，刷新。
3. 若修改的是无关文件，不刷新。

依赖判定规则：

1. 页面加载完成后，读取 iframe DOM 中的：
   - `<link rel="stylesheet" href="...">`
   - `<script src="...">`
2. 将这些相对地址解析成项目内绝对路径。
3. 缓存为当前预览的依赖集合。
4. 文件变更命中依赖集合时，触发 `refreshBrowserPaneState`。

这样可以避免所有工具执行都无脑刷新。

### 3. 刷新节流策略

为避免多次连续编辑导致浏览器狂刷：

1. 同一个预览页的刷新做 `150-300ms` debounce。
2. 若连续收到多次 `file_change_applied`，只触发一次刷新。
3. 若 Claude 正在连改多个页面相关文件，优先等最后一次成功写入后再刷新。

### 4. 代码视图轻量跟随

当右侧 target 是 `code` 且文件路径与 `file_change_applied.filePath` 相同：

1. 如果能推断行号，就滚到对应行。
2. 推断不到时，仅闪烁或高亮文件标签。

第一阶段不强制切换右侧 tab，只在当前已打开同文件时做增强。

## 第二阶段设计

### 1. 多文件跟随切换

新增一个用户可控开关：

1. `跟随 Claude 编辑`

开启后：

1. 最新活跃文件若已在右侧 tab 中打开，切到该 tab。
2. 若未打开：
   - 代码文件打开 code tab
   - 当前页面相关文件优先留在 browser tab 并刷新

### 2. 活跃文件时间线

前端维护一条 per-session 的最近文件变更队列：

1. 当前文件
2. 最近 N 次编辑文件
3. 每个文件的最近状态：进行中 / 成功 / 失败

这条队列既可以驱动右侧跟随，也可以给后续 UI 做“当前 Claude 正在编辑哪些文件”的浮层或侧边面板。

### 3. 行号范围推断

行号来源按优先级：

1. 未来若工具结果能直接提供位置元数据，优先直接使用。
2. 否则用 `old_string/new_string` 在磁盘文件里做近似匹配。
3. 匹配失败时回退成只有文件级定位。

目标不是 100% 精确，而是足够支持“跳到附近位置”。

### 4. 编辑块草稿预览

为实现“按 Claude 实际编辑块流动显示，哪里改哪里先更新”，第二阶段首版在现有 `FileChangeEvent` 之上再补一层草稿预览事件：

1. `file_change_preview_delta`
2. `file_change_preview_committed`
3. `file_change_preview_discarded`

这层事件不替代真实落盘，而是只用于右侧临时展示：

1. 当 Claude 发出 `Edit` / `Write` 的 `tool_use` 时，前端先从工具输入里提取 `old_string/new_string` 或全文内容。
2. 若当前右侧正打开同一文件，则把该编辑块叠加到右侧的“草稿内容”中。
3. 当 `tool_result` 成功到来时，把这次草稿变更标记为 committed，并在短延时后清理，等待真实磁盘内容接管。
4. 当 `tool_result` 失败时，直接丢弃该草稿块。

第一版只覆盖：

1. `Edit`
2. `Write`

暂不覆盖：

1. `ApplyPatch`
2. `MultiEdit`
3. 真正按 token 的字符级打字机动画

也就是说，第二阶段首版的目标是“编辑块先变化”，不是“整页闪烁刷新”，更不是“伪打字机回放”。

## 组件与文件改动建议

### 现有文件

1. `src/components/chat/hooks/useChatRealtimeHandlers.ts`
   - 增加文件变更事件派发
2. `src/components/app/AppContent.tsx`
   - 接收文件变更事件并编排给右侧
3. `src/components/right-pane/view/BrowserPane.tsx`
   - 暴露/接入外部刷新触发与依赖采集
4. `src/components/right-pane/utils/browserPaneState.ts`
   - 保持现有 `refreshKey`，无需重做
5. `src/components/code-editor/hooks/useEditorSidebar.ts`
   - 增加打开文件/切换 tab/跳行的公共入口

### 建议新增文件

1. `src/components/chat/hooks/chatFileChangeEvents.ts`
   - 从 `NormalizedMessage` 生成 `FileChangeEvent`
2. `src/components/right-pane/utils/browserPreviewDependencies.ts`
   - 从 iframe 文档提取 HTML 本地依赖
3. `src/components/right-pane/hooks/useFollowAlongController.ts`
   - 统一编排浏览器刷新、代码跳行、tab 切换

## 错误处理

1. 若文件变更事件解析失败，不影响原有聊天消息展示。
2. 若浏览器依赖提取失败，只保留“当前 HTML 文件本身变化时刷新”。
3. 若某些站点/页面无法内嵌，继续沿用当前 browser fallback 行为。
4. 若连续编辑导致预览刷新过快，优先保留 debounce，不追求每次写盘都立即刷新。

## 测试策略

### 单元测试

1. `tool_use + tool_result` 正确转换为 `file_change_applied`
2. 编辑错误正确转换为 `file_change_failed`
3. HTML 依赖采集正确解析本地 CSS/JS
4. 当前预览命中依赖集合时返回“应刷新”
5. debounce 逻辑在连续修改时只触发一次刷新
6. `Edit` / `Write` 的草稿编辑块能在当前打开文件上先叠加显示
7. 草稿编辑块在成功时提交，在失败时回滚

### 集成测试

1. 当前右侧打开 `login.html` 预览
2. Claude 修改 `login.html`
3. 浏览器 `refreshKey` 增加

再补一条：

1. 当前右侧打开 `login.html`
2. Claude 修改 `login.css`
3. 若 `login.html` 引用了该 CSS，则浏览器刷新

## 风险与边界

1. Claude 工具事件本身不保证一定提供精确行号，所以第一阶段不要把跳行能力设计成强依赖。
2. HTML 依赖提取只覆盖页面静态声明的本地资源，动态 import、运行时注入脚本不在第一阶段范围内。
3. 浏览器内嵌预览本质仍是 iframe 方案，和 Zed 的原生编辑器/ACP 集成相比，交互上仍会更轻。
4. 当前草稿预览仍基于 `tool_use/tool_result`，并非真正的 token 级工具进度流；它能做到“编辑块先更新”，但还不是完整 ACP 粒度。

## 完成标准

### 第一阶段完成标准

1. Claude 修改当前预览 HTML 文件后，右侧自动刷新。
2. Claude 修改当前预览引用的本地 CSS/JS 后，右侧自动刷新。
3. Claude 修改当前已打开代码文件后，右侧至少能高亮或跳到目标文件。
4. 上述逻辑均有自动化测试覆盖。

### 第二阶段完成标准

1. 增加 `FileChangeEvent` 统一领域模型。
2. 当前打开的 Markdown / 代码文件支持草稿编辑块预览。
3. 草稿编辑块在成功后能与真实磁盘内容平滑对齐，在失败时回滚。
4. 右侧支持“跟随 Claude 编辑”开关。
5. 多文件编辑时右侧能跟随活跃文件切换或刷新。
6. 聊天 transcript 与右侧跟随逻辑共享同一条文件事件基础设施。

## 推荐实施顺序

1. 先做 `FileChangeEvent` 抽象和单元测试。
2. 再实现 browser 自动刷新，只覆盖当前 HTML 文件本身。
3. 再补 HTML 本地依赖采集，支持 CSS/JS 命中刷新。
4. 再做代码视图跳行/高亮。
5. 最后做“跟随 Claude 编辑”开关与多文件切换。

## 实施记录

1. 第一阶段自动刷新已完成：
   - Claude 成功修改当前预览 HTML 文件时，右侧 browser pane 会自动刷新。
   - Claude 成功修改当前预览静态引用的本地 CSS / JS 文件时，右侧 browser pane 会自动刷新。
2. 代码视图轻量跟随已完成：
   - 当前右侧若正打开被 Claude 修改的代码文件，会触发轻量高亮脉冲。
   - 这一阶段暂未做强制切 tab，也未做真实滚动跳行。
3. 文件事件基础设施已完成：
   - `tool_use/tool_result -> FileChangeEvent` 已进入聊天实时层。
   - 事件去重与后发 `tool_result` 补发已补齐。
4. 第二阶段首版草稿预览已完成：
   - 当前右侧若正打开被 Claude 修改的 Markdown / 代码文件，`Edit` / `Write` 会先以编辑块形式叠加到右侧内容。
   - 工具成功后，草稿块会短暂保留并等待真实磁盘内容接管；工具失败时会自动回滚。
   - 现阶段仍以编辑块为粒度，不做逐 token 动画。
5. 第二阶段多文件自动切换、跟随开关、ACP 风格位置事件仍待后续实现。
