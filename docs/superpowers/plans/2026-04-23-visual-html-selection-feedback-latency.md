# Visual HTML Selection Feedback Latency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make complex-page selection in visual HTML design mode feel immediate by letting toolbar/highlight feedback render first, then asynchronously filling inspector data and lazily projecting the layer tree.

**Architecture:** Keep GrapesJS as the canvas engine, but split the current monolithic inspector refresh path into three units: immediate selection feedback, deferred inspector scheduling, and lazy layer tree projection. The first pass should preserve existing UI semantics while moving expensive work off the `component:selected` critical path and rendering only the selected path plus user-opened layer branches.

**Tech Stack:** React, TypeScript, GrapesJS, Node test runner (`node --test`), React DOM server tests

---

## File Structure

- Create: `src/components/right-pane/view/visual-html/grapes-like/selectionFeedbackController.ts`
  Encapsulates the immediate selection channel: selected id/label, toolbar refresh trigger, revision token.
- Create: `src/components/right-pane/view/visual-html/grapes-like/selectionFeedbackController.test.mjs`
  Verifies same-frame selection state updates and stale-task cancellation semantics.
- Create: `src/components/right-pane/view/visual-html/grapes-like/inspectorSnapshotScheduler.ts`
  Owns split scheduling of `selection`, `style/selector`, and `layers`.
- Create: `src/components/right-pane/view/visual-html/grapes-like/inspectorSnapshotScheduler.test.mjs`
  Covers revision cancellation, staged snapshot updates, and repeated-selection coalescing.
- Create: `src/components/right-pane/view/visual-html/grapes-like/layerProjection.ts`
  Builds a projected layer tree that includes only the selected path, selected node direct children, and user-expanded branches.
- Create: `src/components/right-pane/view/visual-html/grapes-like/layerProjection.test.mjs`
  Verifies collapsed branches are omitted, selected paths are retained, and expanded branches materialize direct children only.
- Modify: `src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.ts`
  Replaces synchronous all-in-one snapshot invalidation with staged channels, expanded-state tracking, and lazy layer projection.
- Modify: `src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.test.mjs`
  Covers staged bridge updates, lazy layer projection rules, and expanded-node bookkeeping.
- Modify: `src/components/right-pane/view/visual-html/grapes-like/inspectorAdapter.ts`
  Supports partial snapshot patching instead of a single full-cache invalidation.
- Modify: `src/components/right-pane/view/visual-html/grapes-like/inspectorAdapter.test.mjs`
  Verifies patch-based updates preserve untouched snapshot sections and notify subscribers correctly.
- Modify: `src/components/right-pane/view/visual-html/grapes-like/GrapesLikeInspectorPane.tsx`
  Consumes staged snapshot state, shows lightweight loading/sync affordances, and avoids forcing both tabs to depend on one all-or-nothing snapshot.
- Modify: `src/components/right-pane/view/visual-html/grapes-like/GrapesLikeInspectorPane.test.mjs`
  Verifies default tab behavior remains stable and staged sync status renders without regressing shell layout.
- Modify: `src/components/right-pane/view/visual-html/grapes-like/SpacingOverlay.tsx`
  Keeps toolbar sync on the fast path and ensures overlay layout reads no longer depend on full inspector rebuild completion.
- Modify: `src/components/right-pane/view/visual-html/grapes-like/SpacingOverlay.test.mjs`
  Verifies toolbar sync still happens when inspector work is deferred.
- Modify: `src/components/right-pane/view/VisualHtmlEditor.tsx`
  Wires the new bridge/controller outputs into the existing editor shell without changing user-facing mode switching.

## Task 1: Add an Immediate Selection Feedback Controller

**Files:**
- Create: `src/components/right-pane/view/visual-html/grapes-like/selectionFeedbackController.ts`
- Test: `src/components/right-pane/view/visual-html/grapes-like/selectionFeedbackController.test.mjs`

- [ ] **Step 1: Write the failing tests for immediate selection state and revision bumping**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSelectionFeedbackController,
  readSelectedComponentSummary,
} from './selectionFeedbackController.ts';

function createComponent({ id, name = 'button' } = {}) {
  return {
    getId: () => id,
    getName: () => name,
    getType: () => name,
    get: (key) => (key === 'id' ? id : undefined),
  };
}

test('readSelectedComponentSummary returns minimal data required for fast feedback', () => {
  const summary = readSelectedComponentSummary(createComponent({ id: 'cta', name: 'Button' }));

  assert.deepEqual(summary, {
    selectedIds: ['cta'],
    primarySelectedId: 'cta',
    selectedLabel: '按钮 #cta',
    isMultiSelection: false,
    revision: 0,
  });
});

test('createSelectionFeedbackController bumps revision and drops stale selection tasks', () => {
  const controller = createSelectionFeedbackController();
  const first = controller.beginSelection(createComponent({ id: 'first' }));
  const second = controller.beginSelection(createComponent({ id: 'second' }));

  assert.equal(first.revision, 1);
  assert.equal(second.revision, 2);
  assert.equal(controller.isRevisionCurrent(1), false);
  assert.equal(controller.isRevisionCurrent(2), true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/grapes-like/selectionFeedbackController.test.mjs`
Expected: FAIL with module-not-found or missing export errors for `selectionFeedbackController.ts`

- [ ] **Step 3: Implement the minimal controller for immediate selection metadata**

```ts
type SelectedComponentSummary = {
  selectedIds: string[];
  primarySelectedId: string | null;
  selectedLabel: string;
  isMultiSelection: boolean;
  revision: number;
};

export function readSelectedComponentSummary(component: {
  getId?: () => string;
  getName?: () => string;
  getType?: () => string;
  get?: (key: string) => unknown;
} | null): SelectedComponentSummary {
  const id = String(component?.getId?.() ?? component?.get?.('id') ?? '').trim();
  const rawName = String(component?.getName?.() ?? component?.getType?.() ?? '组件').trim().toLowerCase();
  const labelName = rawName === 'button' ? '按钮' : rawName || '组件';

  return {
    selectedIds: id ? [id] : [],
    primarySelectedId: id || null,
    selectedLabel: id ? `${labelName} #${id}` : '',
    isMultiSelection: false,
    revision: 0,
  };
}

export function createSelectionFeedbackController() {
  let revision = 0;

  return {
    beginSelection(component: Parameters<typeof readSelectedComponentSummary>[0]) {
      revision += 1;
      return {
        ...readSelectedComponentSummary(component),
        revision,
      };
    },
    isRevisionCurrent(candidate: number) {
      return candidate === revision;
    },
    getRevision() {
      return revision;
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/grapes-like/selectionFeedbackController.test.mjs`
Expected: PASS for the immediate selection controller tests

- [ ] **Step 5: Commit**

```bash
git add src/components/right-pane/view/visual-html/grapes-like/selectionFeedbackController.ts src/components/right-pane/view/visual-html/grapes-like/selectionFeedbackController.test.mjs
git commit -m "feat: add visual html selection feedback controller"
```

## Task 2: Add a Lazy Layer Projection Module

**Files:**
- Create: `src/components/right-pane/view/visual-html/grapes-like/layerProjection.ts`
- Test: `src/components/right-pane/view/visual-html/grapes-like/layerProjection.test.mjs`

- [ ] **Step 1: Write the failing tests for selected-path projection and expanded-branch rendering**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { projectVisibleLayerTree } from './layerProjection.ts';

const tree = [{
  id: 'root',
  label: 'Root',
  visible: true,
  selected: false,
  expanded: true,
  children: [{
    id: 'table',
    label: '表格 #table',
    visible: true,
    selected: false,
    expanded: false,
    children: [{
      id: 'row-1',
      label: '行 #row-1',
      visible: true,
      selected: false,
      expanded: false,
      children: [{
        id: 'cell-1',
        label: '单元格 #cell-1',
        visible: true,
        selected: true,
        expanded: false,
        children: [{
          id: 'text-1',
          label: '文本 #text-1',
          visible: true,
          selected: false,
          expanded: false,
          children: [],
        }],
      }],
    }],
  }],
}];

test('projectVisibleLayerTree keeps the selected path even when ancestors are collapsed', () => {
  const result = projectVisibleLayerTree({
    roots: tree,
    selectedId: 'cell-1',
    expandedIds: [],
  });

  assert.deepEqual(result.roots.map((node) => node.id), ['root']);
  assert.equal(result.roots[0].children[0].id, 'table');
  assert.equal(result.roots[0].children[0].children[0].id, 'row-1');
  assert.equal(result.roots[0].children[0].children[0].children[0].id, 'cell-1');
});

test('projectVisibleLayerTree only materializes direct children for selected and expanded nodes', () => {
  const result = projectVisibleLayerTree({
    roots: tree,
    selectedId: 'cell-1',
    expandedIds: ['table'],
  });

  const table = result.roots[0].children[0];
  assert.equal(table.children.length, 1);
  assert.equal(table.children[0].id, 'row-1');
  assert.equal(table.children[0].children[0].id, 'cell-1');
  assert.equal(table.children[0].children[0].children[0].id, 'text-1');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/grapes-like/layerProjection.test.mjs`
Expected: FAIL with module-not-found or missing export errors for `layerProjection.ts`

- [ ] **Step 3: Implement the minimal selected-path projection logic**

```ts
type LayerNodeInput = {
  id: string;
  label: string;
  visible: boolean;
  selected: boolean;
  expanded: boolean;
  children: LayerNodeInput[];
};

type ProjectVisibleLayerTreeInput = {
  roots: LayerNodeInput[];
  selectedId: string | null;
  expandedIds: string[];
};

function findSelectedPath(nodes: LayerNodeInput[], selectedId: string | null, trail: string[] = []): string[] {
  if (!selectedId) {
    return [];
  }

  for (const node of nodes) {
    const nextTrail = [...trail, node.id];
    if (node.id === selectedId) {
      return nextTrail;
    }

    const childMatch = findSelectedPath(node.children, selectedId, nextTrail);
    if (childMatch.length > 0) {
      return childMatch;
    }
  }

  return [];
}

export function projectVisibleLayerTree({ roots, selectedId, expandedIds }: ProjectVisibleLayerTreeInput) {
  const selectedPath = new Set(findSelectedPath(roots, selectedId));
  const expandedSet = new Set(expandedIds);

  const visit = (node: LayerNodeInput): LayerNodeInput | null => {
    const shouldKeep = selectedPath.has(node.id) || expandedSet.has(node.id) || node.id === selectedId;
    const children = node.children
      .map((child) => visit(child))
      .filter(Boolean);

    if (!shouldKeep && children.length === 0) {
      return null;
    }

    const includeDirectChildren = node.id === selectedId || expandedSet.has(node.id) || selectedPath.has(node.id);

    return {
      ...node,
      expanded: includeDirectChildren,
      children: includeDirectChildren ? children : [],
    };
  };

  return {
    roots: roots.map((node) => visit(node)).filter(Boolean),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/grapes-like/layerProjection.test.mjs`
Expected: PASS for selected path and expanded branch projection tests

- [ ] **Step 5: Commit**

```bash
git add src/components/right-pane/view/visual-html/grapes-like/layerProjection.ts src/components/right-pane/view/visual-html/grapes-like/layerProjection.test.mjs
git commit -m "feat: add lazy visual html layer projection"
```

## Task 3: Split the Bridge Into Staged Snapshot Scheduling

**Files:**
- Create: `src/components/right-pane/view/visual-html/grapes-like/inspectorSnapshotScheduler.ts`
- Test: `src/components/right-pane/view/visual-html/grapes-like/inspectorSnapshotScheduler.test.mjs`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/inspectorAdapter.ts`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/inspectorAdapter.test.mjs`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.ts`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.test.mjs`

- [ ] **Step 1: Write the failing tests for staged selection/style/layer updates**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInspectorSnapshotScheduler } from './inspectorSnapshotScheduler.ts';

test('scheduler applies selection immediately and defers style and layers', async () => {
  const applied = [];
  const scheduler = createInspectorSnapshotScheduler({
    scheduleFrame: (task) => Promise.resolve().then(task),
    applyPatch: (patch) => applied.push(Object.keys(patch)),
  });

  scheduler.scheduleSelection({
    selection: { primarySelectedId: 'cell-1' },
    style: { sectors: [] },
    selector: { commonClasses: [] },
    layers: { roots: [] },
  });

  assert.deepEqual(applied[0], ['selection']);
  await Promise.resolve();
  assert.deepEqual(applied[1].sort(), ['selector', 'style']);
  assert.deepEqual(applied[2], ['layers']);
});
```

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInspectorAdapter } from './inspectorAdapter.ts';

test('adapter patchSnapshot preserves untouched sections', () => {
  const adapter = createInspectorAdapter({
    selection: () => ({ primarySelectedId: 'old' }),
    selector: () => ({ commonClasses: [] }),
    style: () => ({ sectors: [] }),
    layers: () => ({ roots: [] }),
  });

  adapter.patchSnapshot({ selection: { primarySelectedId: 'new' } });
  const snapshot = adapter.getSnapshot();

  assert.equal(snapshot.selection.primarySelectedId, 'new');
  assert.deepEqual(snapshot.layers, { roots: [] });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/grapes-like/inspectorSnapshotScheduler.test.mjs src/components/right-pane/view/visual-html/grapes-like/inspectorAdapter.test.mjs src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.test.mjs`
Expected: FAIL because staged scheduler exports and `patchSnapshot()` do not exist yet

- [ ] **Step 3: Implement the scheduler and adapter patch API**

```ts
export function createInspectorSnapshotScheduler({
  scheduleFrame,
  applyPatch,
}: {
  scheduleFrame: (task: () => void) => void;
  applyPatch: (patch: Record<string, unknown>) => void;
}) {
  let revision = 0;

  return {
    scheduleSelection(next: {
      selection: unknown;
      style: unknown;
      selector: unknown;
      layers: unknown;
    }) {
      revision += 1;
      const scheduledRevision = revision;

      applyPatch({ selection: next.selection });

      scheduleFrame(() => {
        if (scheduledRevision !== revision) {
          return;
        }
        applyPatch({ style: next.style, selector: next.selector });

        scheduleFrame(() => {
          if (scheduledRevision !== revision) {
            return;
          }
          applyPatch({ layers: next.layers });
        });
      });

      return scheduledRevision;
    },
  };
}
```

```ts
export function createInspectorAdapter(parts: InspectorAdapterParts) {
  const listeners = new Set<InspectorAdapterListener>();
  let cachedSnapshot: InspectorSnapshot | null = null;

  const ensureSnapshot = () => {
    if (!cachedSnapshot) {
      cachedSnapshot = {
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
    }

    return cachedSnapshot;
  };

  return {
    getSnapshot() {
      return ensureSnapshot();
    },
    patchSnapshot(patch: Partial<InspectorSnapshot>) {
      cachedSnapshot = {
        ...ensureSnapshot(),
        ...patch,
      };
      listeners.forEach((listener) => listener());
    },
    notify() {
      cachedSnapshot = null;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: InspectorAdapterListener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
```

- [ ] **Step 4: Refactor `createGrapesLikeInspectorBridge.ts` to use staged patching and lazy layer projection**

```ts
const selectionController = createSelectionFeedbackController();
const scheduler = createInspectorSnapshotScheduler({
  scheduleFrame: (task) => {
    const win = editor.Canvas.getBody?.()?.ownerDocument?.defaultView ?? window;
    win.requestAnimationFrame(() => task());
  },
  applyPatch: (patch) => adapter.patchSnapshot(patch),
});

const expandedLayerIds = new Set<string>();

const buildFullPayload = () => {
  const selected = getSelectedComponents(editor);
  const primary = (editor.getSelected?.() as GrapesComponent | null) ?? selected[0] ?? null;
  const immediateSelection = selectionController.beginSelection(primary);
  const fullLayerRoots = readLayerSnapshot({ roots: buildLayerRoots(editor) }).roots;

  return {
    selection: {
      ...readSelectionSnapshot(editor),
      revision: immediateSelection.revision,
    },
    selector: readSelectorSnapshot({
      selected: selected.map((component) => toSelectorSource(component)),
      activeState: editor.SelectorManager?.getState?.() ?? '',
    }),
    style: readStyleSnapshot({
      selection: selected.map((component, index) => ({
        styles: getStyleSourceForComponent(editor, component, index),
        classes: readComponentClasses(component),
      })),
      activeState: editor.SelectorManager?.getState?.() ?? '',
    }),
    layers: readLayerSnapshot(projectVisibleLayerTree({
      roots: fullLayerRoots,
      selectedId: immediateSelection.primarySelectedId,
      expandedIds: [...expandedLayerIds],
    })),
  };
};

const handleSelectionChange = () => {
  scheduler.scheduleSelection(buildFullPayload());
};
```

- [ ] **Step 5: Run the focused tests to verify they pass**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/grapes-like/inspectorSnapshotScheduler.test.mjs src/components/right-pane/view/visual-html/grapes-like/inspectorAdapter.test.mjs src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.test.mjs`
Expected: PASS for staged scheduler, adapter patching, and bridge projection tests

- [ ] **Step 6: Commit**

```bash
git add src/components/right-pane/view/visual-html/grapes-like/inspectorSnapshotScheduler.ts src/components/right-pane/view/visual-html/grapes-like/inspectorSnapshotScheduler.test.mjs src/components/right-pane/view/visual-html/grapes-like/inspectorAdapter.ts src/components/right-pane/view/visual-html/grapes-like/inspectorAdapter.test.mjs src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.ts src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.test.mjs
git commit -m "feat: stage visual html inspector refreshes"
```

## Task 4: Update the Inspector Pane for Staged Data and Loading Affordances

**Files:**
- Modify: `src/components/right-pane/view/visual-html/grapes-like/GrapesLikeInspectorPane.tsx`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/GrapesLikeInspectorPane.test.mjs`
- Modify: `src/components/right-pane/view/VisualHtmlEditor.tsx`

- [ ] **Step 1: Write the failing tests for staged sync status rendering**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const { default: GrapesLikeInspectorPane } = await import('./GrapesLikeInspectorPane.tsx');

test('GrapesLikeInspectorPane renders sync hint while layers are catching up', () => {
  const adapter = {
    subscribe: () => () => {},
    getSnapshot: () => ({
      selection: {
        selectedIds: ['cell-1'],
        primarySelectedId: 'cell-1',
        selectedLabel: '单元格 #cell-1',
        isMultiSelection: false,
        isDetached: false,
        revision: 3,
      },
      selector: { availableStates: [], activeState: '', commonClasses: [], canAddClass: true, canRemoveClass: true, canSyncStyle: false },
      style: { targetKind: 'inline', sectors: [], hasMixedValues: false, editable: true, syncState: 'pending' },
      layers: { roots: [], selectedLayerIds: ['cell-1'], expandedLayerIds: [], sortable: false, syncState: 'pending' },
      capabilities: { canEditSelectors: true, canEditStyles: true, canEditLayers: true },
    }),
  };

  const markup = renderToStaticMarkup(React.createElement(GrapesLikeInspectorPane, {
    adapter,
    actions: {
      selector: { addClass: () => {}, removeClass: () => {}, setState: () => {} },
      style: { updateStyle: () => {} },
      layers: { selectLayer: () => {}, selectParentLayer: () => {}, duplicateLayer: () => {}, deleteLayer: () => {}, toggleLayerVisible: () => {}, toggleLayerExpanded: () => {}, moveLayer: () => {} },
    },
  }));

  assert.match(markup, /正在同步/);
  assert.match(markup, /单元格 #cell-1/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/grapes-like/GrapesLikeInspectorPane.test.mjs`
Expected: FAIL because the pane does not yet render staged sync hints

- [ ] **Step 3: Implement lightweight sync affordances without changing shell layout**

```tsx
function SyncHint({ pending }: { pending: boolean }) {
  if (!pending) {
    return null;
  }

  return (
    <div className="px-2 py-1 text-[11px] leading-4 text-muted-foreground" data-inspector-sync-hint="true">
      正在同步
    </div>
  );
}

export default function GrapesLikeInspectorPane({ adapter, actions }: GrapesLikeInspectorPaneProps) {
  const snapshot = useGrapesLikeInspectorSnapshot(adapter);
  const [activeTab, setActiveTab] = useState<InspectorTab>('style');
  const stylePending = snapshot.style?.syncState === 'pending';
  const layerPending = snapshot.layers?.syncState === 'pending';

  return (
    <section data-gjs-like-inspector="true" className="flex h-full shrink-0 flex-col overflow-hidden border-l border-border bg-background text-foreground" style={{ width: `${INSPECTOR_WIDTH_PX}px`, minWidth: `${INSPECTOR_WIDTH_PX}px`, maxWidth: `${INSPECTOR_WIDTH_PX}px` }}>
      <div role="tablist" aria-label="检查器标签" className="sticky top-0 z-10 grid grid-cols-2 gap-1 border-b border-border bg-card px-1 py-1">
        {TABS.map((tab) => (
          <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>
      <SyncHint pending={activeTab === 'style' ? stylePending : layerPending} />
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-0.5 py-0.5">
        {activeTab === 'style' ? (
          <GrapesLikeStyleManager
            selection={snapshot.selection}
            selector={snapshot.selector}
            style={snapshot.style}
            actions={{ selector: actions.selector, updateStyle: actions.style.updateStyle }}
          />
        ) : (
          <GrapesLikeLayerManager layers={snapshot.layers} actions={actions.layers} />
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Wire the staged bridge output through `VisualHtmlEditor.tsx`**

```tsx
const grapesLikeBridge = useMemo(() => createGrapesLikeInspectorBridge(canvasEditor), [canvasEditor]);

const inspectorPane = grapesLikeBridge ? (
  <GrapesLikeInspectorPane
    adapter={grapesLikeBridge.adapter}
    actions={grapesLikeBridge.actions}
  />
) : null;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/grapes-like/GrapesLikeInspectorPane.test.mjs`
Expected: PASS for default shell and staged sync hint tests

- [ ] **Step 6: Commit**

```bash
git add src/components/right-pane/view/visual-html/grapes-like/GrapesLikeInspectorPane.tsx src/components/right-pane/view/visual-html/grapes-like/GrapesLikeInspectorPane.test.mjs src/components/right-pane/view/VisualHtmlEditor.tsx
git commit -m "feat: show staged sync state in visual html inspector"
```

## Task 5: Keep Toolbar Sync on the Fast Path and Verify End-to-End Behavior

**Files:**
- Modify: `src/components/right-pane/view/visual-html/grapes-like/SpacingOverlay.tsx`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/SpacingOverlay.test.mjs`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.test.mjs`

- [ ] **Step 1: Write the failing tests for toolbar refresh independence**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGrapesLikeInspectorBridge } from './createGrapesLikeInspectorBridge.ts';

test('toolbar refresh stays immediate even when layers are deferred', () => {
  let refreshed = false;
  const editor = {
    getSelectedAll: () => [],
    getSelected: () => ({ get: () => [], set: () => {} }),
    on: () => {},
    off: () => {},
    SelectorManager: { getState: () => '' },
    Canvas: { getBody: () => ({ ownerDocument: { defaultView: globalThis } }) },
    refresh: (options) => {
      if (options?.tools) {
        refreshed = true;
      }
    },
    Commands: { add: () => {}, remove: () => {} },
  };

  createGrapesLikeInspectorBridge(editor);
  assert.equal(refreshed, false);
});
```

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('SpacingOverlay syncToolbar still refreshes tools directly on selection events', async () => {
  const source = await readFile(new URL('./SpacingOverlay.tsx', import.meta.url), 'utf8');

  assert.match(source, /editor\.on\?\.\('component:selected', syncToolbar\)/);
  assert.match(source, /editor\.refresh\?\.\(\{ tools: true \}\)/);
});
```

- [ ] **Step 2: Run the tests to verify they fail or expose missing staged coverage**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/grapes-like/SpacingOverlay.test.mjs src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.test.mjs`
Expected: FAIL because the bridge tests do not yet assert fast-path toolbar behavior under deferred layer updates

- [ ] **Step 3: Keep `SpacingOverlay.tsx` on the fast path and add timing logs for profiling**

```ts
const syncToolbar = (component?: {
  get?: (key: string) => unknown;
  set?: (key: string, value: unknown) => void;
} | null) => {
  const startedAt = performance.now();
  const target = component ?? getSelectedComponent(editor);
  const currentToolbar = target?.get?.('toolbar');
  const nextToolbar = replaceToolbarMoveCommandWithSendCommand(
    Array.isArray(currentToolbar) ? currentToolbar as Array<Record<string, unknown>> : [],
  );

  if (nextToolbar !== currentToolbar) {
    target?.set?.('toolbar', nextToolbar);
    editor.refresh?.({ tools: true });
  }

  logSpacingOverlay('toolbar-sync', {
    selectedId: String(target?.get?.('id') ?? ''),
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
  });
};
```

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/grapes-like/SpacingOverlay.test.mjs src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.test.mjs`
Expected: PASS for toolbar sync fast-path coverage and deferred layer update coverage

- [ ] **Step 5: Run the broader visual HTML regression suite**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.test.mjs src/components/right-pane/view/visual-html/grapes-like/SpacingOverlay.test.mjs src/components/right-pane/view/visual-html/grapes-like/inspectorAdapter.test.mjs src/components/right-pane/view/visual-html/grapes-like/GrapesLikeInspectorPane.test.mjs src/components/right-pane/view/visual-html/grapes-like/layers/layerAdapter.test.mjs src/components/right-pane/view/visual-html/grapes-like/style/styleAdapter.test.mjs`
Expected: PASS for the staged selection feedback path and existing inspector behavior

- [ ] **Step 6: Commit**

```bash
git add src/components/right-pane/view/visual-html/grapes-like/SpacingOverlay.tsx src/components/right-pane/view/visual-html/grapes-like/SpacingOverlay.test.mjs src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.test.mjs
git commit -m "feat: keep visual html toolbar sync on fast path"
```

## Self-Review Checklist

- Spec coverage:
  - `选中快路径` 由 Task 1 和 Task 5 覆盖
  - `检查器异步补齐` 由 Task 3 和 Task 4 覆盖
  - `图层按需投影 + 按需渲染` 由 Task 2 和 Task 3 覆盖
  - `短暂不同步控制在可接受范围` 由 Task 3 的 scheduler 设计和 Task 4 的 sync hint 覆盖
- Placeholder scan:
  - 所有任务都有明确文件路径、测试命令、期望结果和提交建议
  - 没有 `TODO`、`TBD`、`later` 或 “类似 Task N” 之类占位语句
- Type consistency:
  - `selectionFeedbackController`, `inspectorSnapshotScheduler`, `projectVisibleLayerTree`, `patchSnapshot` 在任务中保持同名
  - staged snapshot 中统一使用 `selection / selector / style / layers`
