# Visual HTML Pure Runtime Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将可视化 HTML 设计模式升级为 Full Pure Runtime Editor，让设计态主链路从 GrapesJS 迁移到真实 runtime iframe，并覆盖交互、样式面板、图层树、历史系统和稳定保存。

**Architecture:** 以真实 iframe runtime 作为视觉真相，以 `EditorStateStore` 作为交互真相，以源码 HTML/CSS 作为持久化真相，以 `CommitPipeline` 作为唯一落盘出口。实现上按 `runtime-core`、`runtime-interaction`、`runtime-inspector`、`runtime-structure`、`runtime-history`、`runtime-commit`、`runtime-shell` 七个边界拆分，允许并行推进并在壳层汇合。

**Tech Stack:** React, TypeScript, parse5, node:test, 现有 visual-html runtime 基础设施, 现有 `api.readFile/saveFile`, 现有 `HtmlSourceEditorSurface`

---

## File Structure

### New files

- `src/components/right-pane/view/visual-html/runtime-core/RuntimeNodeRegistry.ts`
  - 维护 runtime 节点索引、稳定节点身份、布局上下文与可编辑能力
- `src/components/right-pane/view/visual-html/runtime-core/RuntimeNodeRegistry.test.mjs`
  - 覆盖节点索引、身份恢复、布局上下文识别
- `src/components/right-pane/view/visual-html/runtime-core/RuntimeDocumentEngine.ts`
  - 负责 runtime handle、断点会话、索引刷新、隐藏层扫描
- `src/components/right-pane/view/visual-html/runtime-core/RuntimeDocumentEngine.test.mjs`
  - 覆盖 runtime 刷新、可编辑节点过滤、隐藏层结果
- `src/components/right-pane/view/visual-html/runtime-core/types.ts`
  - 纯 runtime editor 公共类型
- `src/components/right-pane/view/visual-html/runtime-interaction/EditorStateStore.ts`
  - 单一交互状态存储
- `src/components/right-pane/view/visual-html/runtime-interaction/EditorStateStore.test.mjs`
  - 覆盖选区、hover、断点、交互模式、未持久化状态
- `src/components/right-pane/view/visual-html/runtime-interaction/InteractionIntents.ts`
  - 定义 Move/Resize/Reorder/Insert/UpdateStyle/UpdateAttribute/UpdateText intent
- `src/components/right-pane/view/visual-html/runtime-interaction/HitTestEngine.ts`
  - 负责命中、祖先选择、穿透选择、框选基础
- `src/components/right-pane/view/visual-html/runtime-interaction/HitTestEngine.test.mjs`
  - 覆盖命中与选择路径
- `src/components/right-pane/view/visual-html/runtime-interaction/InteractionEngine.ts`
  - 负责 hover、选中、拖拽、缩放、插入预览协调
- `src/components/right-pane/view/visual-html/runtime-interaction/InteractionEngine.test.mjs`
  - 覆盖 intent 产出与降级判定
- `src/components/right-pane/view/visual-html/runtime-interaction/InteractionOverlay.tsx`
  - 运行时 overlay 组装层，取代单一 DesignOverlayEngine
- `src/components/right-pane/view/visual-html/runtime-interaction/InteractionOverlay.test.mjs`
  - 覆盖 overlay 关键挂载与句柄渲染
- `src/components/right-pane/view/visual-html/runtime-inspector/InspectorModelBuilder.ts`
  - 从 runtime node 构建 computed / editable / layout / saveability 面板模型
- `src/components/right-pane/view/visual-html/runtime-inspector/InspectorModelBuilder.test.mjs`
  - 覆盖字段模型与上下文差异
- `src/components/right-pane/view/visual-html/runtime-inspector/PureRuntimeInspectorPane.tsx`
  - 纯 runtime 右侧面板容器
- `src/components/right-pane/view/visual-html/runtime-inspector/PureRuntimeInspectorPane.test.mjs`
  - 覆盖显示结构与字段状态
- `src/components/right-pane/view/visual-html/runtime-structure/LayerTreeBuilder.ts`
  - 从真实 DOM 构建图层树
- `src/components/right-pane/view/visual-html/runtime-structure/LayerTreeBuilder.test.mjs`
  - 覆盖层级、显隐、锁定状态
- `src/components/right-pane/view/visual-html/runtime-structure/PureRuntimeLayerTree.tsx`
  - 图层树组件
- `src/components/right-pane/view/visual-html/runtime-structure/PureRuntimeLayerTree.test.mjs`
  - 覆盖选中、hover、锁定标识
- `src/components/right-pane/view/visual-html/runtime-history/HistoryStore.ts`
  - 管理 previewing / committed-local / persisted 历史
- `src/components/right-pane/view/visual-html/runtime-history/HistoryStore.test.mjs`
  - 覆盖 undo/redo/rollback
- `src/components/right-pane/view/visual-html/runtime-commit/SaveabilityAnalyzer.ts`
  - 统一规则引擎
- `src/components/right-pane/view/visual-html/runtime-commit/SaveabilityAnalyzer.test.mjs`
  - 覆盖 safe / preview-only / blocked
- `src/components/right-pane/view/visual-html/runtime-commit/IntentNormalizer.ts`
  - 归一化交互 intent
- `src/components/right-pane/view/visual-html/runtime-commit/IntentNormalizer.test.mjs`
  - 覆盖交互结束态归一化
- `src/components/right-pane/view/visual-html/runtime-commit/CommitPipeline.ts`
  - 重新读取上下文、分析、写 patch、验证、回滚
- `src/components/right-pane/view/visual-html/runtime-commit/CommitPipeline.test.mjs`
  - 覆盖提交流程与失败恢复
- `src/components/right-pane/view/visual-html/runtime-shell/PureRuntimeDesignShell.tsx`
  - 汇总 runtime core、interaction、inspector、layers、history
- `src/components/right-pane/view/visual-html/runtime-shell/PureRuntimeDesignShell.test.mjs`
  - 覆盖壳层组装与状态串联

### Modified files

- `src/components/right-pane/view/VisualHtmlEditor.tsx`
  - 从“大一统编辑器”重构成 shell 装配与模式切换入口
- `src/components/right-pane/view/VisualHtmlEditor.test.mjs`
  - 更新为 Pure Runtime Editor 架构断言
- `src/components/right-pane/view/visual-html/runtime/DesignOverlayEngine.tsx`
  - 收敛为低层测量/绘制能力，被 `InteractionOverlay` 复用
- `src/components/right-pane/view/visual-html/runtime/PreviewRuntimeHost.tsx`
  - 继续承载 src/srcDoc runtime host
- `src/components/right-pane/view/visual-html/runtime/RuntimeDomIndexer.ts`
  - 与新 registry 对齐或收口为低层工具
- `src/components/right-pane/view/visual-html/runtime/RuntimeSourceBridge.ts`
  - 被 CommitPipeline 复用
- `src/components/right-pane/view/visual-html/runtime/HtmlPatchWriter.ts`
  - 扩展到结构和属性 patch
- `src/components/right-pane/view/visual-html/runtime/DomMutationRecorder.ts`
  - 从 DOM 记录器升级为 intent 辅助输入
- `src/components/right-pane/view/visual-html/VisualCanvasPane.tsx`
  - 降级为兼容壳或彻底退出设计主链路
- `src/components/right-pane/view/visual-html/VisualCanvasPane.test.mjs`
  - 更新为兼容层定位

### Existing references to inspect while implementing

- `src/components/right-pane/view/visual-html/runtime/PreviewRuntimeHost.tsx`
- `src/components/right-pane/view/visual-html/runtime/DesignOverlayEngine.tsx`
- `src/components/right-pane/view/visual-html/runtime/RuntimeDomIndexer.ts`
- `src/components/right-pane/view/visual-html/runtime/RuntimeSourceBridge.ts`
- `src/components/right-pane/view/visual-html/runtime/HtmlPatchWriter.ts`
- `src/components/right-pane/view/visual-html/grapes-like/`
- `src/components/right-pane/view/visual-html/sourceLocationMapping.ts`

---

### Task 1: 建立 Pure Runtime 类型与节点注册核心

**Files:**
- Create: `src/components/right-pane/view/visual-html/runtime-core/types.ts`
- Create: `src/components/right-pane/view/visual-html/runtime-core/RuntimeNodeRegistry.ts`
- Test: `src/components/right-pane/view/visual-html/runtime-core/RuntimeNodeRegistry.test.mjs`

- [ ] **Step 1: 写失败测试，定义节点身份、布局上下文和编辑能力输出**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRuntimeNodeRegistry } from './RuntimeNodeRegistry.ts';

test('buildRuntimeNodeRegistry builds stable runtime node refs with layout context', () => {
  const document = {
    body: {
      children: [
        {
          tagName: 'DIV',
          id: 'hero',
          className: 'hero shell',
          textContent: 'Hello',
          children: [],
          getAttribute(name) {
            return name === 'id' ? 'hero' : name === 'class' ? 'hero shell' : null;
          },
          getAttributeNames() {
            return ['id', 'class'];
          },
        },
      ],
    },
  };

  const registry = buildRuntimeNodeRegistry(document);
  assert.equal(registry.nodes.length, 1);
  assert.equal(registry.nodes[0].nodeId.startsWith('runtime-node-'), true);
  assert.equal(registry.nodes[0].layoutContext.kind, 'flow');
  assert.equal(registry.nodes[0].editCapabilities.canSelect, true);
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/runtime-core/RuntimeNodeRegistry.test.mjs`
Expected: FAIL with `Cannot find module` or `buildRuntimeNodeRegistry is not a function`

- [ ] **Step 3: 写最小类型与实现**

```ts
export type RuntimeLayoutKind = 'flow' | 'absolute' | 'flex-item' | 'grid-item' | 'unknown';

export type RuntimeNodeRef = {
  nodeId: string;
  element: HTMLElement;
  tagName: string;
  domPath: string;
  fingerprint: string;
  layoutContext: { kind: RuntimeLayoutKind };
  editCapabilities: {
    canSelect: boolean;
    canMove: boolean;
    canResize: boolean;
    canReorder: boolean;
    canInsertAround: boolean;
  };
  saveabilityHints: string[];
};

export function buildRuntimeNodeRegistry(document: Document | { body?: HTMLElement }) {
  return {
    nodes: [],
    byNodeId: new Map(),
  };
}
```

- [ ] **Step 4: 补齐最小可通过实现**

```ts
import { buildSourceLocationDomPathFromElement, buildSourceLocationFingerprint } from '../sourceLocationMapping.ts';
import type { RuntimeNodeRef } from './types.ts';

let runtimeNodeCounter = 0;

function nextNodeId() {
  runtimeNodeCounter += 1;
  return `runtime-node-${runtimeNodeCounter}`;
}

function inferLayoutKind(element: HTMLElement): RuntimeNodeRef['layoutContext'] {
  const style = element.ownerDocument?.defaultView?.getComputedStyle?.(element);
  const parentStyle = element.parentElement ? element.ownerDocument?.defaultView?.getComputedStyle?.(element.parentElement) : null;
  if (style?.position === 'absolute' || style?.position === 'fixed') return { kind: 'absolute' };
  if (parentStyle?.display === 'flex') return { kind: 'flex-item' };
  if (parentStyle?.display === 'grid') return { kind: 'grid-item' };
  return { kind: 'flow' };
}

export function buildRuntimeNodeRegistry(document: Document | { body?: HTMLElement }) {
  const nodes: RuntimeNodeRef[] = [];
  const byNodeId = new Map<string, RuntimeNodeRef>();
  const body = document.body;
  if (!body) return { nodes, byNodeId };

  body.querySelectorAll?.('*').forEach((element) => {
    const tagName = String(element.tagName ?? '').toLowerCase();
    if (!tagName) return;
    const nodeId = element.getAttribute('data-ccui-node-id') || nextNodeId();
    element.setAttribute('data-ccui-node-id', nodeId);
    const attributes = Object.fromEntries(element.getAttributeNames().map((name) => [name, element.getAttribute(name) ?? '']));
    const node: RuntimeNodeRef = {
      nodeId,
      element,
      tagName,
      domPath: buildSourceLocationDomPathFromElement(element) ?? tagName,
      fingerprint: buildSourceLocationFingerprint(tagName, attributes),
      layoutContext: inferLayoutKind(element),
      editCapabilities: {
        canSelect: true,
        canMove: true,
        canResize: true,
        canReorder: true,
        canInsertAround: true,
      },
      saveabilityHints: [],
    };
    nodes.push(node);
    byNodeId.set(nodeId, node);
  });

  return { nodes, byNodeId };
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/runtime-core/RuntimeNodeRegistry.test.mjs`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/components/right-pane/view/visual-html/runtime-core/types.ts \
  src/components/right-pane/view/visual-html/runtime-core/RuntimeNodeRegistry.ts \
  src/components/right-pane/view/visual-html/runtime-core/RuntimeNodeRegistry.test.mjs
git commit -m "feat: add pure runtime node registry core"
```

### Task 2: 建立 RuntimeDocumentEngine 与断点会话

**Files:**
- Create: `src/components/right-pane/view/visual-html/runtime-core/RuntimeDocumentEngine.ts`
- Test: `src/components/right-pane/view/visual-html/runtime-core/RuntimeDocumentEngine.test.mjs`
- Modify: `src/components/right-pane/view/visual-html/runtime/PreviewRuntimeHost.tsx`

- [ ] **Step 1: 写失败测试，定义 runtime handle、viewport 与 registry 刷新行为**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeDocumentEngine } from './RuntimeDocumentEngine.ts';

test('createRuntimeDocumentEngine refreshes registry when runtime changes', () => {
  const engine = createRuntimeDocumentEngine();
  engine.attachRuntime({
    iframe: { getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; } },
    document: { body: { querySelectorAll() { return []; } } },
    window: {},
  });
  assert.equal(engine.getSnapshot().runtimeReady, true);
  assert.equal(Array.isArray(engine.getSnapshot().nodes), true);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/runtime-core/RuntimeDocumentEngine.test.mjs`
Expected: FAIL with missing module or missing export

- [ ] **Step 3: 写最小实现**

```ts
import { buildRuntimeNodeRegistry } from './RuntimeNodeRegistry.ts';

export function createRuntimeDocumentEngine() {
  let runtime: unknown = null;
  let registry = { nodes: [], byNodeId: new Map() };

  return {
    attachRuntime(nextRuntime: unknown) {
      runtime = nextRuntime;
      registry = buildRuntimeNodeRegistry((nextRuntime as { document?: Document }).document ?? { body: undefined });
    },
    resetRuntime() {
      runtime = null;
      registry = { nodes: [], byNodeId: new Map() };
    },
    getSnapshot() {
      return {
        runtimeReady: Boolean(runtime),
        nodes: registry.nodes,
      };
    },
  };
}
```

- [ ] **Step 4: 为 `PreviewRuntimeHost` 保留 `src/srcDoc` 并确保 viewport 切换可被上层读取**

```tsx
type PreviewRuntimeHandle = {
  iframe: HTMLIFrameElement;
  document: Document;
  window: Window;
};

type PreviewRuntimeHostProps = {
  title: string;
  src: string;
  srcDoc?: string | null;
  viewportWidth: string;
  active: boolean;
  onRuntimeReady?: ((runtime: PreviewRuntimeHandle) => void) | null;
  onRuntimeReset?: (() => void) | null;
};
```

- [ ] **Step 5: 运行测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/runtime-core/RuntimeDocumentEngine.test.mjs src/components/right-pane/view/visual-html/runtime/PreviewRuntimeHost.test.mjs`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/components/right-pane/view/visual-html/runtime-core/RuntimeDocumentEngine.ts \
  src/components/right-pane/view/visual-html/runtime-core/RuntimeDocumentEngine.test.mjs \
  src/components/right-pane/view/visual-html/runtime/PreviewRuntimeHost.tsx \
  src/components/right-pane/view/visual-html/runtime/PreviewRuntimeHost.test.mjs
git commit -m "feat: add runtime document engine"
```

### Task 3: 建立 EditorStateStore 与 intent 模型

**Files:**
- Create: `src/components/right-pane/view/visual-html/runtime-interaction/InteractionIntents.ts`
- Create: `src/components/right-pane/view/visual-html/runtime-interaction/EditorStateStore.ts`
- Test: `src/components/right-pane/view/visual-html/runtime-interaction/EditorStateStore.test.mjs`

- [ ] **Step 1: 写失败测试，定义选区、hover、交互模式和未持久化状态**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorStateStore } from './EditorStateStore.ts';

test('createEditorStateStore updates selection and hover independently', () => {
  const store = createEditorStateStore();
  store.setHoveredNodeId('node-a');
  store.setSelectedNodeIds(['node-b']);
  const snapshot = store.getSnapshot();
  assert.equal(snapshot.hoveredNodeId, 'node-a');
  assert.deepEqual(snapshot.selectedNodeIds, ['node-b']);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/runtime-interaction/EditorStateStore.test.mjs`
Expected: FAIL

- [ ] **Step 3: 写 intent 与 store 最小实现**

```ts
export type EditIntent =
  | { kind: 'move'; nodeId: string; dx: number; dy: number }
  | { kind: 'resize'; nodeId: string; width: number; height: number }
  | { kind: 'reorder'; nodeId: string; parentNodeId: string; beforeNodeId: string | null }
  | { kind: 'insert'; parentNodeId: string; beforeNodeId: string | null; tagName: string }
  | { kind: 'update-style'; nodeId: string; property: string; value: string }
  | { kind: 'update-attribute'; nodeId: string; name: string; value: string | null }
  | { kind: 'update-text'; nodeId: string; value: string };
```

```ts
export function createEditorStateStore() {
  let hoveredNodeId: string | null = null;
  let selectedNodeIds: string[] = [];
  let interactionMode: 'idle' | 'hovering' | 'dragging' | 'resizing' | 'inserting' = 'idle';
  let dirtySincePersist = false;

  return {
    setHoveredNodeId(nodeId: string | null) { hoveredNodeId = nodeId; },
    setSelectedNodeIds(nodeIds: string[]) { selectedNodeIds = [...nodeIds]; },
    setInteractionMode(mode: typeof interactionMode) { interactionMode = mode; },
    setDirtySincePersist(nextValue: boolean) { dirtySincePersist = nextValue; },
    getSnapshot() {
      return { hoveredNodeId, selectedNodeIds, interactionMode, dirtySincePersist };
    },
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/runtime-interaction/EditorStateStore.test.mjs`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/right-pane/view/visual-html/runtime-interaction/InteractionIntents.ts \
  src/components/right-pane/view/visual-html/runtime-interaction/EditorStateStore.ts \
  src/components/right-pane/view/visual-html/runtime-interaction/EditorStateStore.test.mjs
git commit -m "feat: add editor state store and intents"
```

### Task 4: 建立命中与交互引擎

**Files:**
- Create: `src/components/right-pane/view/visual-html/runtime-interaction/HitTestEngine.ts`
- Create: `src/components/right-pane/view/visual-html/runtime-interaction/InteractionEngine.ts`
- Test: `src/components/right-pane/view/visual-html/runtime-interaction/HitTestEngine.test.mjs`
- Test: `src/components/right-pane/view/visual-html/runtime-interaction/InteractionEngine.test.mjs`
- Modify: `src/components/right-pane/view/visual-html/runtime/DesignOverlayEngine.tsx`

- [ ] **Step 1: 写失败测试，覆盖命中、穿透选择和拖拽 intent 产出**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSelectableNode } from './HitTestEngine.ts';
import { createInteractionEngine } from './InteractionEngine.ts';

test('createInteractionEngine emits move intent for absolute node drag', () => {
  const emitted = [];
  const engine = createInteractionEngine({
    emitIntent(intent) {
      emitted.push(intent);
    },
  });
  engine.beginMove({ nodeId: 'hero', layoutContext: { kind: 'absolute' } }, { x: 10, y: 10 });
  engine.updatePointer({ x: 30, y: 50 });
  engine.complete();
  assert.deepEqual(emitted[0], { kind: 'move', nodeId: 'hero', dx: 20, dy: 40 });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/runtime-interaction/HitTestEngine.test.mjs src/components/right-pane/view/visual-html/runtime-interaction/InteractionEngine.test.mjs`
Expected: FAIL

- [ ] **Step 3: 写最小 HitTest 与 Interaction 实现**

```ts
export function resolveSelectableNode(target: EventTarget | Node | null) {
  let current = target && typeof target === 'object' && 'parentElement' in target ? (target as Node).parentElement : target as HTMLElement | null;
  while (current) {
    const tagName = current.tagName?.toLowerCase?.() ?? '';
    if (!['html', 'body', 'head', 'style', 'script', 'meta', 'link'].includes(tagName)) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}
```

```ts
export function createInteractionEngine({ emitIntent }: { emitIntent(intent: unknown): void }) {
  let active: { nodeId: string; startX: number; startY: number } | null = null;
  let pointer = { x: 0, y: 0 };

  return {
    beginMove(node: { nodeId: string }, start: { x: number; y: number }) {
      active = { nodeId: node.nodeId, startX: start.x, startY: start.y };
      pointer = start;
    },
    updatePointer(next: { x: number; y: number }) {
      pointer = next;
    },
    complete() {
      if (!active) return;
      emitIntent({
        kind: 'move',
        nodeId: active.nodeId,
        dx: pointer.x - active.startX,
        dy: pointer.y - active.startY,
      });
      active = null;
    },
  };
}
```

- [ ] **Step 4: 将 `DesignOverlayEngine` 收口为低层绘制和点击捕获工具**

```tsx
export default function DesignOverlayEngine(props: DesignOverlayEngineProps) {
  return (
    <div data-visual-html-runtime-overlay="true">
      {props.selectedRect ? <div data-visual-html-selected-outline="true" /> : null}
    </div>
  );
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/runtime/DesignOverlayEngine.test.mjs src/components/right-pane/view/visual-html/runtime-interaction/HitTestEngine.test.mjs src/components/right-pane/view/visual-html/runtime-interaction/InteractionEngine.test.mjs`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/components/right-pane/view/visual-html/runtime-interaction/HitTestEngine.ts \
  src/components/right-pane/view/visual-html/runtime-interaction/InteractionEngine.ts \
  src/components/right-pane/view/visual-html/runtime-interaction/HitTestEngine.test.mjs \
  src/components/right-pane/view/visual-html/runtime-interaction/InteractionEngine.test.mjs \
  src/components/right-pane/view/visual-html/runtime/DesignOverlayEngine.tsx \
  src/components/right-pane/view/visual-html/runtime/DesignOverlayEngine.test.mjs
git commit -m "feat: add runtime hit testing and interaction engine"
```

### Task 5: 建立 SaveabilityAnalyzer 与 intent 归一化

**Files:**
- Create: `src/components/right-pane/view/visual-html/runtime-commit/SaveabilityAnalyzer.ts`
- Create: `src/components/right-pane/view/visual-html/runtime-commit/IntentNormalizer.ts`
- Test: `src/components/right-pane/view/visual-html/runtime-commit/SaveabilityAnalyzer.test.mjs`
- Test: `src/components/right-pane/view/visual-html/runtime-commit/IntentNormalizer.test.mjs`

- [ ] **Step 1: 写失败测试，覆盖 safe / preview-only / blocked**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSaveability } from './SaveabilityAnalyzer.ts';

test('analyzeSaveability blocks ambiguous grid move', () => {
  const result = analyzeSaveability({
    node: { layoutContext: { kind: 'grid-item' }, saveabilityHints: ['grid-area-ambiguous'] },
    intent: { kind: 'move' },
    sourceMappingState: { stable: true },
  });
  assert.equal(result.status, 'blocked');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/runtime-commit/SaveabilityAnalyzer.test.mjs src/components/right-pane/view/visual-html/runtime-commit/IntentNormalizer.test.mjs`
Expected: FAIL

- [ ] **Step 3: 写最小分析器与归一化器**

```ts
export function analyzeSaveability(input: {
  node: { layoutContext: { kind: string }; saveabilityHints: string[] };
  intent: { kind: string };
  sourceMappingState: { stable: boolean };
}) {
  if (!input.sourceMappingState.stable) {
    return { status: 'blocked', reasonCode: 'missing-stable-anchor', message: '节点映射不稳定', recommendedAction: '切回源码编辑' };
  }
  if (input.node.saveabilityHints.includes('grid-area-ambiguous')) {
    return { status: 'blocked', reasonCode: 'grid-area-ambiguous', message: '当前 grid 布局无法稳定保存', recommendedAction: '切回源码编辑' };
  }
  return { status: 'safe', reasonCode: 'safe', message: '可安全保存', recommendedAction: null };
}

export function normalizeIntent<T>(intent: T): T {
  return intent;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/runtime-commit/SaveabilityAnalyzer.test.mjs src/components/right-pane/view/visual-html/runtime-commit/IntentNormalizer.test.mjs`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/right-pane/view/visual-html/runtime-commit/SaveabilityAnalyzer.ts \
  src/components/right-pane/view/visual-html/runtime-commit/IntentNormalizer.ts \
  src/components/right-pane/view/visual-html/runtime-commit/SaveabilityAnalyzer.test.mjs \
  src/components/right-pane/view/visual-html/runtime-commit/IntentNormalizer.test.mjs
git commit -m "feat: add runtime saveability analyzer"
```

### Task 6: 建立 CommitPipeline 并接上现有 runtime/source bridge

**Files:**
- Create: `src/components/right-pane/view/visual-html/runtime-commit/CommitPipeline.ts`
- Test: `src/components/right-pane/view/visual-html/runtime-commit/CommitPipeline.test.mjs`
- Modify: `src/components/right-pane/view/visual-html/runtime/RuntimeSourceBridge.ts`
- Modify: `src/components/right-pane/view/visual-html/runtime/HtmlPatchWriter.ts`
- Modify: `src/components/right-pane/view/visual-html/runtime/DomMutationRecorder.ts`

- [ ] **Step 1: 写失败测试，覆盖重新读取上下文、分析、写 patch、验证与回滚**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommitPipeline } from './CommitPipeline.ts';

test('createCommitPipeline commits safe style update to source html', async () => {
  const pipeline = createCommitPipeline({
    readRuntimeHtml() {
      return '<div id="hero"></div>';
    },
    readSourceHtml() {
      return '<div id="hero"></div>';
    },
  });

  const result = await pipeline.commit({
    kind: 'update-attribute',
    nodeId: 'runtime-node-1',
    name: 'style',
    value: 'left: 12px;',
  });

  assert.equal(result.status, 'persisted');
  assert.match(result.html, /left: 12px/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/runtime-commit/CommitPipeline.test.mjs`
Expected: FAIL

- [ ] **Step 3: 写最小 CommitPipeline**

```ts
import { analyzeSaveability } from './SaveabilityAnalyzer.ts';
import { normalizeIntent } from './IntentNormalizer.ts';

export function createCommitPipeline(deps: {
  readRuntimeHtml(): string;
  readSourceHtml(): string;
}) {
  return {
    async commit(intent: unknown) {
      const normalizedIntent = normalizeIntent(intent);
      const analysis = analyzeSaveability({
        node: { layoutContext: { kind: 'flow' }, saveabilityHints: [] },
        intent: normalizedIntent as { kind: string },
        sourceMappingState: { stable: true },
      });
      if (analysis.status !== 'safe') {
        return { status: analysis.status, html: deps.readSourceHtml() };
      }
      const html = deps.readSourceHtml().replace('</div>', ' style="left: 12px;"></div>');
      return { status: 'persisted', html };
    },
  };
}
```

- [ ] **Step 4: 用现有 bridge 和 patch writer 替换测试桩**

```ts
const runtimeIndex = buildRuntimeDomIndex(runtimeDocument);
const sourceIndex = buildSourceMapIndex(sourceHtml);
const bridge = createRuntimeSourceBridge(runtimeIndex, sourceIndex);
const nextHtml = applyRuntimeMutationsToHtml({
  sourceHtml,
  matches: bridge.matches,
  mutations,
});
```

- [ ] **Step 5: 运行测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/runtime/RuntimeSourceBridge.test.mjs src/components/right-pane/view/visual-html/runtime/HtmlPatchWriter.test.mjs src/components/right-pane/view/visual-html/runtime-commit/CommitPipeline.test.mjs`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/components/right-pane/view/visual-html/runtime-commit/CommitPipeline.ts \
  src/components/right-pane/view/visual-html/runtime-commit/CommitPipeline.test.mjs \
  src/components/right-pane/view/visual-html/runtime/RuntimeSourceBridge.ts \
  src/components/right-pane/view/visual-html/runtime/HtmlPatchWriter.ts \
  src/components/right-pane/view/visual-html/runtime/DomMutationRecorder.ts
git commit -m "feat: add pure runtime commit pipeline"
```

### Task 7: 建立 HistoryStore 与失败恢复

**Files:**
- Create: `src/components/right-pane/view/visual-html/runtime-history/HistoryStore.ts`
- Test: `src/components/right-pane/view/visual-html/runtime-history/HistoryStore.test.mjs`

- [ ] **Step 1: 写失败测试，覆盖 previewing / committed-local / persisted / undo / redo**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistoryStore } from './HistoryStore.ts';

test('createHistoryStore supports commit and undo', () => {
  const store = createHistoryStore();
  store.pushCommitted({ intent: { kind: 'move' }, committedPatch: ['patch-a'] });
  assert.equal(store.canUndo(), true);
  store.undo();
  assert.equal(store.canRedo(), true);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/runtime-history/HistoryStore.test.mjs`
Expected: FAIL

- [ ] **Step 3: 写最小实现**

```ts
export function createHistoryStore() {
  const committed: unknown[] = [];
  const redoStack: unknown[] = [];

  return {
    pushCommitted(entry: unknown) {
      committed.push(entry);
      redoStack.length = 0;
    },
    canUndo() {
      return committed.length > 0;
    },
    canRedo() {
      return redoStack.length > 0;
    },
    undo() {
      if (committed.length === 0) return null;
      const entry = committed.pop();
      redoStack.push(entry);
      return entry;
    },
    redo() {
      if (redoStack.length === 0) return null;
      const entry = redoStack.pop();
      committed.push(entry);
      return entry;
    },
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/runtime-history/HistoryStore.test.mjs`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/right-pane/view/visual-html/runtime-history/HistoryStore.ts \
  src/components/right-pane/view/visual-html/runtime-history/HistoryStore.test.mjs
git commit -m "feat: add pure runtime history store"
```

### Task 8: 建立 InspectorModel 与纯 runtime 右侧面板

**Files:**
- Create: `src/components/right-pane/view/visual-html/runtime-inspector/InspectorModelBuilder.ts`
- Create: `src/components/right-pane/view/visual-html/runtime-inspector/PureRuntimeInspectorPane.tsx`
- Test: `src/components/right-pane/view/visual-html/runtime-inspector/InspectorModelBuilder.test.mjs`
- Test: `src/components/right-pane/view/visual-html/runtime-inspector/PureRuntimeInspectorPane.test.mjs`

- [ ] **Step 1: 写失败测试，覆盖 computed / editable / layout / saveability 分组**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInspectorModel } from './InspectorModelBuilder.ts';

test('buildInspectorModel groups computed and editable properties', () => {
  const model = buildInspectorModel({
    node: {
      tagName: 'div',
      layoutContext: { kind: 'absolute' },
      editCapabilities: { canResize: true },
      saveabilityHints: [],
    },
  });
  assert.equal(model.sections.some((section) => section.id === 'computed'), true);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/runtime-inspector/InspectorModelBuilder.test.mjs src/components/right-pane/view/visual-html/runtime-inspector/PureRuntimeInspectorPane.test.mjs`
Expected: FAIL

- [ ] **Step 3: 写最小模型与面板组件**

```ts
export function buildInspectorModel({ node }: { node: { tagName: string; layoutContext: { kind: string } } }) {
  return {
    title: node.tagName,
    sections: [
      { id: 'computed', label: '计算样式', fields: [] },
      { id: 'editable', label: '可编辑字段', fields: [] },
      { id: 'layout', label: '布局控制', fields: [{ property: node.layoutContext.kind }] },
      { id: 'saveability', label: '可保存性', fields: [] },
    ],
  };
}
```

```tsx
export default function PureRuntimeInspectorPane({ model }: { model: ReturnType<typeof buildInspectorModel> | null }) {
  if (!model) return null;
  return (
    <aside data-pure-runtime-inspector="true">
      <h2>{model.title}</h2>
      {model.sections.map((section) => (
        <section key={section.id} data-inspector-section={section.id}>
          <h3>{section.label}</h3>
        </section>
      ))}
    </aside>
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/runtime-inspector/InspectorModelBuilder.test.mjs src/components/right-pane/view/visual-html/runtime-inspector/PureRuntimeInspectorPane.test.mjs`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/right-pane/view/visual-html/runtime-inspector/InspectorModelBuilder.ts \
  src/components/right-pane/view/visual-html/runtime-inspector/PureRuntimeInspectorPane.tsx \
  src/components/right-pane/view/visual-html/runtime-inspector/InspectorModelBuilder.test.mjs \
  src/components/right-pane/view/visual-html/runtime-inspector/PureRuntimeInspectorPane.test.mjs
git commit -m "feat: add pure runtime inspector pane"
```

### Task 9: 建立 LayerTreeBuilder 与纯 runtime 图层树

**Files:**
- Create: `src/components/right-pane/view/visual-html/runtime-structure/LayerTreeBuilder.ts`
- Create: `src/components/right-pane/view/visual-html/runtime-structure/PureRuntimeLayerTree.tsx`
- Test: `src/components/right-pane/view/visual-html/runtime-structure/LayerTreeBuilder.test.mjs`
- Test: `src/components/right-pane/view/visual-html/runtime-structure/PureRuntimeLayerTree.test.mjs`

- [ ] **Step 1: 写失败测试，覆盖真实 DOM 结构映射和锁定状态**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLayerTree } from './LayerTreeBuilder.ts';

test('buildLayerTree builds nodes from runtime refs', () => {
  const tree = buildLayerTree([
    { nodeId: 'node-1', tagName: 'div', parentNodeId: null, saveabilityHints: [] },
    { nodeId: 'node-2', tagName: 'span', parentNodeId: 'node-1', saveabilityHints: ['blocked'] },
  ]);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].children[0].isLockedForCommit, true);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/runtime-structure/LayerTreeBuilder.test.mjs src/components/right-pane/view/visual-html/runtime-structure/PureRuntimeLayerTree.test.mjs`
Expected: FAIL

- [ ] **Step 3: 写最小构建器与组件**

```ts
export function buildLayerTree(nodes: Array<{ nodeId: string; tagName: string; parentNodeId: string | null; saveabilityHints: string[] }>) {
  const map = new Map(nodes.map((node) => [node.nodeId, { ...node, children: [], isLockedForCommit: node.saveabilityHints.length > 0 }]));
  const roots = [];
  map.forEach((node) => {
    if (node.parentNodeId && map.has(node.parentNodeId)) {
      map.get(node.parentNodeId).children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}
```

```tsx
export default function PureRuntimeLayerTree({ nodes }: { nodes: ReturnType<typeof buildLayerTree> }) {
  return (
    <aside data-pure-runtime-layer-tree="true">
      {nodes.map((node) => (
        <div key={node.nodeId} data-layer-node-id={node.nodeId}>
          {node.tagName}
        </div>
      ))}
    </aside>
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/runtime-structure/LayerTreeBuilder.test.mjs src/components/right-pane/view/visual-html/runtime-structure/PureRuntimeLayerTree.test.mjs`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/right-pane/view/visual-html/runtime-structure/LayerTreeBuilder.ts \
  src/components/right-pane/view/visual-html/runtime-structure/PureRuntimeLayerTree.tsx \
  src/components/right-pane/view/visual-html/runtime-structure/LayerTreeBuilder.test.mjs \
  src/components/right-pane/view/visual-html/runtime-structure/PureRuntimeLayerTree.test.mjs
git commit -m "feat: add pure runtime layer tree"
```

### Task 10: 组装 PureRuntimeDesignShell 并重构 VisualHtmlEditor

**Files:**
- Create: `src/components/right-pane/view/visual-html/runtime-shell/PureRuntimeDesignShell.tsx`
- Test: `src/components/right-pane/view/visual-html/runtime-shell/PureRuntimeDesignShell.test.mjs`
- Modify: `src/components/right-pane/view/VisualHtmlEditor.tsx`
- Modify: `src/components/right-pane/view/VisualHtmlEditor.test.mjs`
- Modify: `src/components/right-pane/view/visual-html/VisualCanvasPane.tsx`
- Modify: `src/components/right-pane/view/visual-html/VisualCanvasPane.test.mjs`

- [ ] **Step 1: 写失败测试，定义 Pure Runtime Design Shell 装配关系**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('PureRuntimeDesignShell source composes runtime core interaction inspector and layer tree', async () => {
  const source = await readFile(new URL('./PureRuntimeDesignShell.tsx', import.meta.url), 'utf8');
  assert.match(source, /InteractionOverlay/);
  assert.match(source, /PureRuntimeInspectorPane/);
  assert.match(source, /PureRuntimeLayerTree/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/runtime-shell/PureRuntimeDesignShell.test.mjs src/components/right-pane/view/VisualHtmlEditor.test.mjs`
Expected: FAIL

- [ ] **Step 3: 写最小壳层与 VisualHtmlEditor 重构**

```tsx
export default function PureRuntimeDesignShell() {
  return (
    <div data-pure-runtime-design-shell="true">
      <InteractionOverlay />
      <PureRuntimeLayerTree nodes={[]} />
      <PureRuntimeInspectorPane model={null} />
    </div>
  );
}
```

```tsx
{activeMode === 'design' ? (
  <PureRuntimeDesignShell />
) : (
  <HtmlSourceEditorSurface ... />
)}
```

- [ ] **Step 4: 将 `VisualCanvasPane` 降为兼容层并从设计主显示移除**

```tsx
export default function VisualCanvasPane() {
  return <div data-visual-html-canvas-compat="true" />;
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/runtime-shell/PureRuntimeDesignShell.test.mjs src/components/right-pane/view/VisualHtmlEditor.test.mjs src/components/right-pane/view/visual-html/VisualCanvasPane.test.mjs`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/components/right-pane/view/visual-html/runtime-shell/PureRuntimeDesignShell.tsx \
  src/components/right-pane/view/visual-html/runtime-shell/PureRuntimeDesignShell.test.mjs \
  src/components/right-pane/view/VisualHtmlEditor.tsx \
  src/components/right-pane/view/VisualHtmlEditor.test.mjs \
  src/components/right-pane/view/visual-html/VisualCanvasPane.tsx \
  src/components/right-pane/view/visual-html/VisualCanvasPane.test.mjs
git commit -m "feat: wire pure runtime design shell"
```

### Task 11: 端到端验证与文档收口

**Files:**
- Modify: `docs/superpowers/specs/2026-05-04-visual-html-pure-runtime-editor-design.md`
- Modify: `docs/superpowers/plans/2026-05-04-visual-html-pure-runtime-editor-implementation-plan.md`

- [ ] **Step 1: 运行完整定向测试**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test \
  src/components/right-pane/view/visual-html/runtime/**/*.test.mjs \
  src/components/right-pane/view/visual-html/runtime-core/*.test.mjs \
  src/components/right-pane/view/visual-html/runtime-interaction/*.test.mjs \
  src/components/right-pane/view/visual-html/runtime-inspector/*.test.mjs \
  src/components/right-pane/view/visual-html/runtime-structure/*.test.mjs \
  src/components/right-pane/view/visual-html/runtime-history/*.test.mjs \
  src/components/right-pane/view/visual-html/runtime-commit/*.test.mjs \
  src/components/right-pane/view/visual-html/runtime-shell/*.test.mjs \
  src/components/right-pane/view/VisualHtmlEditor.test.mjs
```

Expected: PASS with all targeted suites green

- [ ] **Step 2: 运行类型检查并记录存量问题**

Run: `npm run typecheck`
Expected: 允许存在与本计划无关的存量报错，但本次新增 Pure Runtime 文件不应引入新的命名或路径错误

- [ ] **Step 3: 更新文档状态**

```md
- [x] Pure Runtime core
- [x] Interaction overlay
- [x] Inspector model
- [x] Layer tree
- [x] History store
- [x] Commit pipeline
```

- [ ] **Step 4: 提交**

```bash
git add docs/superpowers/specs/2026-05-04-visual-html-pure-runtime-editor-design.md \
  docs/superpowers/plans/2026-05-04-visual-html-pure-runtime-editor-implementation-plan.md
git commit -m "docs: finalize pure runtime editor implementation status"
```

## Self-Review

- Spec coverage:
  - Pure runtime core: Task 1, 2, 3
  - Interaction model: Task 4
  - Saveability analyzer: Task 5
  - Commit pipeline: Task 6
  - History: Task 7
  - Inspector: Task 8
  - Layer tree: Task 9
  - Shell integration and GrapesJS 退场: Task 10
  - Verification and hardening baseline: Task 11
- Placeholder scan:
  - 已移除 `TODO/TBD/后续补` 类占位表述
  - 每个任务都给出代码骨架、命令和预期结果
- Type consistency:
  - `RuntimeNodeRef`、`EditIntent`、`SaveabilityAnalyzer`、`CommitPipeline`、`EditorStateStore` 命名在任务间保持一致

