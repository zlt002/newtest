# Grapes-like Inspector Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不替换当前宿主版 `VisualInspectorPane` 的前提下，落地一套基于统一 `InspectorSnapshot` 的 Grapes-like Inspector Phase 1，并让 `Selector / Style / Layer` 三个 manager 共享同一条读写链路。

**Architecture:** 以 `src/components/right-pane/view/visual-html/grapes-like/` 为隔离子系统。读路径统一通过 `InspectorAdapter -> InspectorSnapshot`，写路径统一通过 mapper；React 组件只消费规范化 view-model，并保留最小交互态。实现顺序按 `types -> adapter -> selector -> style -> layers -> shell -> integration` 推进，始终保持现有宿主版并行可用。

**Tech Stack:** React 18, TypeScript, GrapesJS, node:test, Tailwind CSS

---

## File Structure

### Create

- `src/components/right-pane/view/visual-html/grapes-like/GrapesLikeInspectorPane.tsx`
  - 新 Inspector 总壳，负责 tab 切换、adapter 订阅、snapshot 分发。
- `src/components/right-pane/view/visual-html/grapes-like/useGrapesLikeInspectorSnapshot.ts`
  - 用 `useSyncExternalStore` 或等价模式订阅 adapter。
- `src/components/right-pane/view/visual-html/grapes-like/inspectorAdapter.ts`
  - 聚合 selection / selector / style / layers 的统一 adapter。
- `src/components/right-pane/view/visual-html/grapes-like/inspectorAdapter.test.mjs`
  - 覆盖 `getSnapshot()` 和 `subscribe()` 的统一行为。
- `src/components/right-pane/view/visual-html/grapes-like/layers/GrapesLikeLayerManager.tsx`
  - React 版 LayerManager 容器。
- `src/components/right-pane/view/visual-html/grapes-like/layers/GrapesLikeLayerTree.tsx`
  - 图层树递归渲染。
- `src/components/right-pane/view/visual-html/grapes-like/layers/GrapesLikeLayerItem.tsx`
  - 单个图层项。
- `src/components/right-pane/view/visual-html/grapes-like/layers/GrapesLikeLayerManager.test.mjs`
  - 覆盖 LayerManager 展开、选中、显隐交互。
- `src/components/right-pane/view/visual-html/grapes-like/GrapesLikeInspectorPane.test.mjs`
  - 覆盖总壳 tab 切换和 snapshot 注入。

### Modify

- `src/components/right-pane/view/visual-html/grapes-like/types.ts`
  - 升级为统一 snapshot、style schema、view-model 类型。
- `src/components/right-pane/view/visual-html/grapes-like/selectorAdapter.ts`
  - 改为输出 snapshot 需要的 selector view-model。
- `src/components/right-pane/view/visual-html/grapes-like/styleAdapter.ts`
  - 改为输出 sector/property view-model，并明确 `targetKind`、`mixed`、`disabled`。
- `src/components/right-pane/view/visual-html/grapes-like/layerAdapter.ts`
  - 改为输出统一 layer tree view-model。
- `src/components/right-pane/view/visual-html/grapes-like/selectorMapper.ts`
  - 接口向意图收敛：`addClass/removeClass/setState`。
- `src/components/right-pane/view/visual-html/grapes-like/styleMapper.ts`
  - 接口向意图收敛：`updateStyle({ property, value, targetKind })`。
- `src/components/right-pane/view/visual-html/grapes-like/layerMapper.ts`
  - 接口向意图收敛：`selectLayer/toggleLayerExpanded/toggleLayerVisible`。
- `src/components/right-pane/view/visual-html/grapes-like/selector/GrapesLikeSelectorManager.tsx`
  - 改为只消费 snapshot，不直连 GrapesJS。
- `src/components/right-pane/view/visual-html/grapes-like/selector/useSelectorManagerState.ts`
  - 仅保留输入框和按钮交互态。
- `src/components/right-pane/view/visual-html/grapes-like/style/GrapesLikeStyleManager.tsx`
  - 改为按 schema + view-model 渲染。
- `src/components/right-pane/view/visual-html/grapes-like/style/GrapesLikeProperty.tsx`
  - 统一字段分发。
- `src/components/right-pane/view/visual-html/grapes-like/style/GrapesLikeSector.tsx`
  - 只负责折叠 UI。
- `src/components/right-pane/view/visual-html/grapes-like/style/fields/NumberField.tsx`
  - 支持 `committed/draft` 双层值和 unit。
- `src/components/right-pane/view/visual-html/grapes-like/style/fields/SelectField.tsx`
  - 支持 disabled/mixed 展示。
- `src/components/right-pane/view/visual-html/grapes-like/style/fields/RadioField.tsx`
  - 支持 snapshot 驱动的单选集合。
- `src/components/right-pane/view/visual-html/grapes-like/style/fields/CompositeField.tsx`
  - 支持 `margin/padding/border-radius`。
- `src/components/right-pane/view/visual-html/grapes-like/selector/GrapesLikeSelectorManager.test.mjs`
  - 对齐 snapshot 输入形态。
- `src/components/right-pane/view/visual-html/grapes-like/style/GrapesLikeStyleManager.test.mjs`
  - 对齐 schema + view-model。
- `src/components/right-pane/view/visual-html/grapes-like/selector/selectorAdapter.test.mjs`
  - 对齐统一 snapshot 结构。
- `src/components/right-pane/view/visual-html/grapes-like/style/styleAdapter.test.mjs`
  - 覆盖 mixed/disabled/targetKind。
- `src/components/right-pane/view/visual-html/grapes-like/style/styleMapper.test.mjs`
  - 覆盖 rule/inline 混合写回。
- `src/components/right-pane/view/visual-html/grapes-like/layers/layerAdapter.test.mjs`
  - 覆盖多选高亮、展开态和显隐。
- `src/components/right-pane/view/visual-html/VisualInspectorPane.test.mjs`
  - 验证现有宿主版仍然存在且不被替换。
- `src/components/right-pane/view/VisualHtmlEditor.tsx`
  - 预留非默认的新 Inspector 入口。

## Task 1: 统一类型和 snapshot 骨架

**Files:**
- Modify: `src/components/right-pane/view/visual-html/grapes-like/types.ts`
- Create: `src/components/right-pane/view/visual-html/grapes-like/inspectorAdapter.ts`
- Create: `src/components/right-pane/view/visual-html/grapes-like/inspectorAdapter.test.mjs`

- [ ] **Step 1: 先写统一 snapshot 的失败测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInspectorAdapter } from './inspectorAdapter.ts';

test('createInspectorAdapter returns a unified snapshot', () => {
  const adapter = createInspectorAdapter({
    selection: () => ({ selectedIds: ['cmp-1'], primarySelectedId: 'cmp-1', selectedLabel: 'button #cta', isMultiSelection: false, isDetached: false }),
    selector: () => ({ availableStates: [{ id: '', label: '- State -' }], activeState: '', commonClasses: [], canAddClass: true, canRemoveClass: true, canSyncStyle: false }),
    style: () => ({ targetKind: 'inline', sectors: [], hasMixedValues: false, editable: true }),
    layers: () => ({ roots: [], selectedLayerIds: ['cmp-1'], expandedLayerIds: [], sortable: false }),
  });

  assert.deepEqual(adapter.getSnapshot().selection.selectedIds, ['cmp-1']);
  assert.equal(typeof adapter.subscribe, 'function');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test src/components/right-pane/view/visual-html/grapes-like/inspectorAdapter.test.mjs`

Expected: FAIL，提示 `createInspectorAdapter` 不存在或 snapshot 结构不匹配。

- [ ] **Step 3: 写最小实现**

```ts
// src/components/right-pane/view/visual-html/grapes-like/types.ts
export type InspectorSnapshot = {
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

```ts
// src/components/right-pane/view/visual-html/grapes-like/inspectorAdapter.ts
export function createInspectorAdapter(parts) {
  const listeners = new Set<() => void>();
  return {
    getSnapshot() {
      return {
        selection: parts.selection(),
        selector: parts.selector(),
        style: parts.style(),
        layers: parts.layers(),
        capabilities: {
          canEditSelectors: true,
          canEditStyles: true,
          canEditLayers: true,
        },
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test src/components/right-pane/view/visual-html/grapes-like/inspectorAdapter.test.mjs`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/right-pane/view/visual-html/grapes-like/types.ts src/components/right-pane/view/visual-html/grapes-like/inspectorAdapter.ts src/components/right-pane/view/visual-html/grapes-like/inspectorAdapter.test.mjs
git commit -m "feat: add grapes-like inspector snapshot adapter"
```

## Task 2: Selector snapshot 和 mapper 收口

**Files:**
- Modify: `src/components/right-pane/view/visual-html/grapes-like/selectorAdapter.ts`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/selectorMapper.ts`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/selector/GrapesLikeSelectorManager.tsx`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/selector/useSelectorManagerState.ts`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/selector/selectorAdapter.test.mjs`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/selector/GrapesLikeSelectorManager.test.mjs`

- [ ] **Step 1: 先写 selector 多选和公共 class 的失败测试**

```js
test('readSelectorSnapshot returns common classes for multi selection', () => {
  const result = readSelectorSnapshot({
    selected: [
      { label: 'button', classes: ['btn', 'primary'] },
      { label: 'a', classes: ['btn', 'link'] },
    ],
    activeState: 'hover',
  });

  assert.deepEqual(result.commonClasses, [{ name: 'btn' }]);
  assert.equal(result.activeState, 'hover');
});
```

- [ ] **Step 2: 运行 selector 测试确认失败**

Run: `node --test src/components/right-pane/view/visual-html/grapes-like/selector/selectorAdapter.test.mjs src/components/right-pane/view/visual-html/grapes-like/selector/GrapesLikeSelectorManager.test.mjs`

Expected: FAIL，提示缺少 `readSelectorSnapshot` 或组件 props 不匹配。

- [ ] **Step 3: 实现 selector snapshot 和只读型 manager 输入**

```ts
// selectorAdapter.ts
export function readSelectorSnapshot(editor): InspectorSnapshot['selector'] {
  return {
    availableStates: getAvailableStates(editor),
    activeState: editor.getState?.() ?? '',
    commonClasses: getCommonClasses(editor.getSelectedAll?.() ?? []),
    canAddClass: true,
    canRemoveClass: true,
    canSyncStyle: false,
  };
}
```

```tsx
// GrapesLikeSelectorManager.tsx
export default function GrapesLikeSelectorManager({ selection, selector, actions }) {
  const runtime = useSelectorManagerState(selector, actions);
  return (
    <section data-gjs-like-selector="true">
      <div>{selection.isMultiSelection ? `${selection.selectedIds.length} elements selected` : selection.selectedLabel}</div>
      {/* classes/state UI driven only by selector snapshot */}
    </section>
  );
}
```

- [ ] **Step 4: 运行 selector 测试确认通过**

Run: `node --test src/components/right-pane/view/visual-html/grapes-like/selector/selectorAdapter.test.mjs src/components/right-pane/view/visual-html/grapes-like/selector/GrapesLikeSelectorManager.test.mjs`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/right-pane/view/visual-html/grapes-like/selectorAdapter.ts src/components/right-pane/view/visual-html/grapes-like/selectorMapper.ts src/components/right-pane/view/visual-html/grapes-like/selector/GrapesLikeSelectorManager.tsx src/components/right-pane/view/visual-html/grapes-like/selector/useSelectorManagerState.ts src/components/right-pane/view/visual-html/grapes-like/selector/selectorAdapter.test.mjs src/components/right-pane/view/visual-html/grapes-like/selector/GrapesLikeSelectorManager.test.mjs
git commit -m "feat: align grapes-like selector manager with snapshot"
```

## Task 3: Style schema、mixed 态和混合写回

**Files:**
- Modify: `src/components/right-pane/view/visual-html/grapes-like/styleAdapter.ts`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/styleMapper.ts`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/style/GrapesLikeStyleManager.tsx`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/style/GrapesLikeProperty.tsx`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/style/GrapesLikeSector.tsx`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/style/fields/NumberField.tsx`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/style/fields/SelectField.tsx`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/style/fields/RadioField.tsx`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/style/fields/CompositeField.tsx`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/style/styleAdapter.test.mjs`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/style/styleMapper.test.mjs`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/style/GrapesLikeStyleManager.test.mjs`

- [ ] **Step 1: 先写 mixed 和 targetKind 的失败测试**

```js
test('readStyleSnapshot marks mixed values and rule target', () => {
  const result = readStyleSnapshot({
    selection: [
      { styles: { width: '100px' }, classes: ['btn'] },
      { styles: { width: '120px' }, classes: ['btn'] },
    ],
    activeState: '',
  });

  const width = result.sectors.find((sector) => sector.id === 'dimension').properties.find((property) => property.id === 'width');
  assert.equal(width.mixed, true);
  assert.equal(result.targetKind, 'rule');
});
```

- [ ] **Step 2: 运行 style 测试确认失败**

Run: `node --test src/components/right-pane/view/visual-html/grapes-like/style/styleAdapter.test.mjs src/components/right-pane/view/visual-html/grapes-like/style/styleMapper.test.mjs src/components/right-pane/view/visual-html/grapes-like/style/GrapesLikeStyleManager.test.mjs`

Expected: FAIL，提示 snapshot 字段缺失或 mapper 接口不匹配。

- [ ] **Step 3: 实现 style schema 和统一写回接口**

```ts
// styleMapper.ts
export function updateStyle(editor, input) {
  if (input.targetKind === 'rule') {
    return updateRuleStyle(editor, input.property, input.value);
  }
  return updateInlineStyle(editor, input.property, input.value);
}
```

```tsx
// NumberField.tsx
export default function NumberField({ value, mixed, disabled, onCommit }) {
  const [draft, setDraft] = useState(value ?? '');
  return (
    <input
      value={draft}
      placeholder={mixed ? 'Mixed' : ''}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onCommit(draft)}
    />
  );
}
```

- [ ] **Step 4: 运行 style 测试确认通过**

Run: `node --test src/components/right-pane/view/visual-html/grapes-like/style/styleAdapter.test.mjs src/components/right-pane/view/visual-html/grapes-like/style/styleMapper.test.mjs src/components/right-pane/view/visual-html/grapes-like/style/GrapesLikeStyleManager.test.mjs`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/right-pane/view/visual-html/grapes-like/styleAdapter.ts src/components/right-pane/view/visual-html/grapes-like/styleMapper.ts src/components/right-pane/view/visual-html/grapes-like/style/GrapesLikeStyleManager.tsx src/components/right-pane/view/visual-html/grapes-like/style/GrapesLikeProperty.tsx src/components/right-pane/view/visual-html/grapes-like/style/GrapesLikeSector.tsx src/components/right-pane/view/visual-html/grapes-like/style/fields/NumberField.tsx src/components/right-pane/view/visual-html/grapes-like/style/fields/SelectField.tsx src/components/right-pane/view/visual-html/grapes-like/style/fields/RadioField.tsx src/components/right-pane/view/visual-html/grapes-like/style/fields/CompositeField.tsx src/components/right-pane/view/visual-html/grapes-like/style/styleAdapter.test.mjs src/components/right-pane/view/visual-html/grapes-like/style/styleMapper.test.mjs src/components/right-pane/view/visual-html/grapes-like/style/GrapesLikeStyleManager.test.mjs
git commit -m "feat: add snapshot driven grapes-like style manager"
```

## Task 4: React 版 LayerManager

**Files:**
- Create: `src/components/right-pane/view/visual-html/grapes-like/layers/GrapesLikeLayerManager.tsx`
- Create: `src/components/right-pane/view/visual-html/grapes-like/layers/GrapesLikeLayerTree.tsx`
- Create: `src/components/right-pane/view/visual-html/grapes-like/layers/GrapesLikeLayerItem.tsx`
- Create: `src/components/right-pane/view/visual-html/grapes-like/layers/GrapesLikeLayerManager.test.mjs`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/layerAdapter.ts`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/layerMapper.ts`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/layers/layerAdapter.test.mjs`

- [ ] **Step 1: 先写图层树交互失败测试**

```js
test('GrapesLikeLayerManager renders nested nodes and toggles visibility', async () => {
  const calls = [];
  render(
    React.createElement(GrapesLikeLayerManager, {
      layers: {
        roots: [{ id: 'hero', label: 'section #hero', visible: true, selected: false, expanded: true, children: [{ id: 'cta', label: 'button #cta', visible: true, selected: true, expanded: false, children: [] }] }],
        selectedLayerIds: ['cta'],
        expandedLayerIds: ['hero'],
        sortable: false,
      },
      actions: {
        selectLayer: (id) => calls.push(['select', id]),
        toggleLayerVisible: (id) => calls.push(['visible', id]),
        toggleLayerExpanded: (id) => calls.push(['expanded', id]),
      },
    }),
  );
});
```

- [ ] **Step 2: 运行 layer 测试确认失败**

Run: `node --test src/components/right-pane/view/visual-html/grapes-like/layers/layerAdapter.test.mjs src/components/right-pane/view/visual-html/grapes-like/layers/GrapesLikeLayerManager.test.mjs`

Expected: FAIL，提示组件不存在或 layer view-model 不匹配。

- [ ] **Step 3: 实现 LayerManager 最小递归树**

```tsx
// GrapesLikeLayerManager.tsx
export default function GrapesLikeLayerManager({ layers, actions }) {
  return <GrapesLikeLayerTree nodes={layers.roots} actions={actions} />;
}
```

```tsx
// GrapesLikeLayerItem.tsx
export default function GrapesLikeLayerItem({ node, actions }) {
  return (
    <div data-layer-id={node.id}>
      <button onClick={() => actions.toggleLayerExpanded(node.id)}>{node.expanded ? '-' : '+'}</button>
      <button onClick={() => actions.toggleLayerVisible(node.id)}>{node.visible ? 'eye' : 'eye-off'}</button>
      <button onClick={() => actions.selectLayer(node.id)}>{node.label}</button>
    </div>
  );
}
```

- [ ] **Step 4: 运行 layer 测试确认通过**

Run: `node --test src/components/right-pane/view/visual-html/grapes-like/layers/layerAdapter.test.mjs src/components/right-pane/view/visual-html/grapes-like/layers/GrapesLikeLayerManager.test.mjs`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/right-pane/view/visual-html/grapes-like/layers/GrapesLikeLayerManager.tsx src/components/right-pane/view/visual-html/grapes-like/layers/GrapesLikeLayerTree.tsx src/components/right-pane/view/visual-html/grapes-like/layers/GrapesLikeLayerItem.tsx src/components/right-pane/view/visual-html/grapes-like/layers/GrapesLikeLayerManager.test.mjs src/components/right-pane/view/visual-html/grapes-like/layerAdapter.ts src/components/right-pane/view/visual-html/grapes-like/layerMapper.ts src/components/right-pane/view/visual-html/grapes-like/layers/layerAdapter.test.mjs
git commit -m "feat: add grapes-like layer manager"
```

## Task 5: Inspector 总壳和非默认入口接线

**Files:**
- Create: `src/components/right-pane/view/visual-html/grapes-like/GrapesLikeInspectorPane.tsx`
- Create: `src/components/right-pane/view/visual-html/grapes-like/useGrapesLikeInspectorSnapshot.ts`
- Create: `src/components/right-pane/view/visual-html/grapes-like/GrapesLikeInspectorPane.test.mjs`
- Modify: `src/components/right-pane/view/VisualHtmlEditor.tsx`
- Modify: `src/components/right-pane/view/visual-html/VisualInspectorPane.test.mjs`

- [ ] **Step 1: 先写总壳切 tab 和不替换旧入口的失败测试**

```js
test('VisualHtmlEditor keeps VisualInspectorPane as default path', async () => {
  const source = await readFile(new URL('../VisualHtmlEditor.tsx', import.meta.url), 'utf8');
  assert.match(source, /VisualInspectorPane/);
});

test('GrapesLikeInspectorPane switches between style, layers and selector tabs', () => {
  render(React.createElement(GrapesLikeInspectorPane, { snapshot, actions }));
  assert.equal(screen.getByRole('tab', { name: 'Style' }).getAttribute('aria-selected'), 'true');
});
```

- [ ] **Step 2: 运行 integration 测试确认失败**

Run: `node --test src/components/right-pane/view/visual-html/grapes-like/GrapesLikeInspectorPane.test.mjs src/components/right-pane/view/visual-html/VisualInspectorPane.test.mjs`

Expected: FAIL，提示新组件不存在或 tab 结构未实现。

- [ ] **Step 3: 实现总壳和新入口**

```tsx
// useGrapesLikeInspectorSnapshot.ts
export function useGrapesLikeInspectorSnapshot(adapter) {
  return useSyncExternalStore(adapter.subscribe, adapter.getSnapshot, adapter.getSnapshot);
}
```

```tsx
// GrapesLikeInspectorPane.tsx
export default function GrapesLikeInspectorPane({ adapter, actions }) {
  const snapshot = useGrapesLikeInspectorSnapshot(adapter);
  const [tab, setTab] = useState<'style' | 'layers' | 'selector'>('style');
  return <div data-gjs-like-inspector="true">{/* tab UI + manager render */}</div>;
}
```

- [ ] **Step 4: 运行 integration 测试确认通过**

Run: `node --test src/components/right-pane/view/visual-html/grapes-like/GrapesLikeInspectorPane.test.mjs src/components/right-pane/view/visual-html/VisualInspectorPane.test.mjs`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/right-pane/view/visual-html/grapes-like/GrapesLikeInspectorPane.tsx src/components/right-pane/view/visual-html/grapes-like/useGrapesLikeInspectorSnapshot.ts src/components/right-pane/view/visual-html/grapes-like/GrapesLikeInspectorPane.test.mjs src/components/right-pane/view/VisualHtmlEditor.tsx src/components/right-pane/view/visual-html/VisualInspectorPane.test.mjs
git commit -m "feat: wire grapes-like inspector shell"
```

## Task 6: 回归验证和完成检查

**Files:**
- Modify: `src/components/right-pane/view/visual-html/grapes-like/selector/GrapesLikeSelectorManager.test.mjs`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/style/GrapesLikeStyleManager.test.mjs`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/layers/GrapesLikeLayerManager.test.mjs`
- Modify: `src/components/right-pane/view/visual-html/VisualInspectorPane.test.mjs`
- Modify: `docs/superpowers/specs/2026-04-19-grapes-like-inspector-design.md`

- [ ] **Step 1: 补齐覆盖 spec 的回归测试**

```js
test('mixed style fields render placeholder instead of concrete value', () => {
  // style manager receives width.mixed = true
});

test('selector manager shows multi selection label', () => {
  // selection.isMultiSelection = true
});

test('layer manager highlights all selected nodes', () => {
  // layers.selectedLayerIds contains multiple ids
});
```

- [ ] **Step 2: 运行目标测试集**

Run: `node --test src/components/right-pane/view/visual-html/grapes-like/inspectorAdapter.test.mjs src/components/right-pane/view/visual-html/grapes-like/selector/selectorAdapter.test.mjs src/components/right-pane/view/visual-html/grapes-like/selector/GrapesLikeSelectorManager.test.mjs src/components/right-pane/view/visual-html/grapes-like/style/styleAdapter.test.mjs src/components/right-pane/view/visual-html/grapes-like/style/styleMapper.test.mjs src/components/right-pane/view/visual-html/grapes-like/style/GrapesLikeStyleManager.test.mjs src/components/right-pane/view/visual-html/grapes-like/layers/layerAdapter.test.mjs src/components/right-pane/view/visual-html/grapes-like/layers/GrapesLikeLayerManager.test.mjs src/components/right-pane/view/visual-html/grapes-like/GrapesLikeInspectorPane.test.mjs src/components/right-pane/view/visual-html/VisualInspectorPane.test.mjs`

Expected: PASS

- [ ] **Step 3: 如果行为与 spec 不一致，立即回修并更新 spec**

```md
- 若实现确认某个字段在多选下必须禁用，则把 spec 中对应段落改成明确禁用，不保留模糊表述。
```

- [ ] **Step 4: 做最终人工检查**

Run: `git diff --stat`

Expected: 只包含 Grapes-like Inspector Phase 1 相关文件，没有误改无关模块。

- [ ] **Step 5: 提交**

```bash
git add docs/superpowers/specs/2026-04-19-grapes-like-inspector-design.md src/components/right-pane/view/visual-html/grapes-like src/components/right-pane/view/visual-html/VisualInspectorPane.test.mjs src/components/right-pane/view/VisualHtmlEditor.tsx
git commit -m "test: verify grapes-like inspector phase 1"
```

## Self-Review

### Spec coverage

- `InspectorSnapshot`：Task 1
- selector snapshot / common classes / state：Task 2
- style schema / mixed / targetKind / mixed write-back：Task 3
- layer tree / select / visibility / expand：Task 4
- 总壳接线 / 非默认入口：Task 5
- 回归验证 / 宿主版并行：Task 6

没有发现未覆盖的 spec 主要求。

### Placeholder scan

- 已避免 `TBD`、`TODO`、`later`
- 每个 task 都包含运行命令和预期结果
- 写代码步骤都给了最小代码骨架

### Type consistency

- 统一使用 `InspectorSnapshot`
- style 写回统一使用 `updateStyle({ property, value, targetKind })`
- layer 写回统一使用 `selectLayer / toggleLayerExpanded / toggleLayerVisible`

## Notes

- 执行时不要切掉现有 `VisualInspectorPane` 默认路径。
- 如果发现当前已有 `grapes-like` 文件与计划中的接口不一致，优先收编重构，不要新复制平行版本。
- 如果某个字段的 GrapesJS 原语义明显超出 Phase 1 范围，直接退回 text field 或 disabled，不在执行中临时扩 scope。
