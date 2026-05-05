# Visual HTML Full Pure Runtime Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first commercially-viable baseline of the Visual HTML Full Pure Runtime Editor so layer tree, insert, drag/resize, inspector editing, history, and commit all run on the runtime iframe chain rather than GrapesJS.

**Architecture:** Keep `VisualHtmlEditor` as the orchestration shell, make runtime registry and runtime state the single truth, and connect structure, overlay, transform, inspector, history, and commit through explicit intent-driven modules. Execute in four stable baselines: interaction foundation, structure editing, transform editing, and inspector/history/commit unification.

**Tech Stack:** React, TypeScript, Node test runner, existing visual-html runtime modules, runtime source bridge / saveability analyzer / HTML patch writer

---

## File Structure

- Modify: `src/components/right-pane/view/VisualHtmlEditor.tsx`
  - Responsibility: orchestration shell, runtime state ownership, selected/hovered node state, history wiring, toolbar gating, shell integration.
- Modify: `src/components/right-pane/view/visual-html/runtime-shell/PureRuntimeDesignShell.tsx`
  - Responsibility: compose runtime layer tree, inspector pane, overlay, and runtime host using runtime-first props only.
- Modify: `src/components/right-pane/view/visual-html/runtime/DesignOverlayEngine.tsx`
  - Responsibility: runtime click/hover selection, coordinate translation, overlay measurement and rendering.
- Modify: `src/components/right-pane/view/visual-html/runtime-structure/LayerTreeBuilder.ts`
  - Responsibility: full tree construction, ancestor expansion, selected-node path expansion, tree metadata.
- Modify: `src/components/right-pane/view/visual-html/runtime-structure/PureRuntimeLayerTree.tsx`
  - Responsibility: expand/collapse UI, select node, structure action affordances, auto-scroll markers.
- Create: `src/components/right-pane/view/visual-html/runtime-structure/LayerTreeState.ts`
  - Responsibility: derive and update expanded/collapsed node id sets with helpers for ancestor-chain expansion.
- Create: `src/components/right-pane/view/visual-html/runtime-structure/StructureActions.ts`
  - Responsibility: create insert/delete/reorder intents from layer tree or canvas actions.
- Create: `src/components/right-pane/view/visual-html/runtime-interaction/RuntimeCapability.ts`
  - Responsibility: centralize capability helpers for move/resize/reorder/insert/edit/saveability gating.
- Modify: `src/components/right-pane/view/visual-html/runtime-interaction/InteractionOverlay.tsx`
  - Responsibility: runtime overlay entry, hover outline, resize handles, capability-gated affordances.
- Modify: `src/components/right-pane/view/visual-html/runtime-interaction/InteractionEngine.ts`
  - Responsibility: runtime hover/select/move/resize sessions, intent emission, capability checks.
- Create: `src/components/right-pane/view/visual-html/runtime-interaction/TransformIntents.ts`
  - Responsibility: typed move/resize/reorder intent definitions and normalization helpers.
- Create: `src/components/right-pane/view/visual-html/runtime-interaction/LayoutConstraintEngine.ts`
  - Responsibility: layout-aware transform policies for `flow`, `flex-item`, `grid-item`, and `absolute`.
- Modify: `src/components/right-pane/view/visual-html/runtime-inspector/InspectorModelBuilder.ts`
  - Responsibility: split computed fields, editable fields, layout controls, capability/saveability annotations.
- Modify: `src/components/right-pane/view/visual-html/runtime-inspector/PureRuntimeInspectorPane.tsx`
  - Responsibility: editable inspector controls, field-level disabled reasons, preview-only messaging.
- Create: `src/components/right-pane/view/visual-html/runtime-history/RuntimeHistoryController.ts`
  - Responsibility: bridge runtime mutations, history store entries, undo/redo and rollback.
- Modify: `src/components/right-pane/view/visual-html/runtime-history/HistoryStore.ts`
  - Responsibility: richer history entries including intent type, preview/persist status, rollback metadata.
- Modify: `src/components/right-pane/view/visual-html/runtime-commit/IntentNormalizer.ts`
  - Responsibility: normalize structure/style/transform intents into runtime mutations.
- Modify: `src/components/right-pane/view/visual-html/runtime-commit/SaveabilityAnalyzer.ts`
  - Responsibility: classify safe, preview-only, blocked outcomes for transform and structure actions.
- Modify: `src/components/right-pane/view/visual-html/runtime/HtmlPatchWriter.ts`
  - Responsibility: persist safe structure/style/text patches, skip unsafe edits with report.
- Test: `src/components/right-pane/view/VisualHtmlEditor.test.mjs`
- Test: `src/components/right-pane/view/visual-html/runtime-shell/PureRuntimeDesignShell.test.mjs`
- Test: `src/components/right-pane/view/visual-html/runtime/DesignOverlayEngine.test.mjs`
- Test: `src/components/right-pane/view/visual-html/runtime-structure/LayerTreeBuilder.test.mjs`
- Test: `src/components/right-pane/view/visual-html/runtime-structure/PureRuntimeLayerTree.test.mjs`
- Create Test: `src/components/right-pane/view/visual-html/runtime-structure/StructureActions.test.mjs`
- Test: `src/components/right-pane/view/visual-html/runtime-interaction/InteractionEngine.test.mjs`
- Create Test: `src/components/right-pane/view/visual-html/runtime-interaction/LayoutConstraintEngine.test.mjs`
- Test: `src/components/right-pane/view/visual-html/runtime-inspector/InspectorModelBuilder.test.mjs`
- Modify/Test: `src/components/right-pane/view/visual-html/runtime-history/*.test.mjs`
- Modify/Test: `src/components/right-pane/view/visual-html/runtime-commit/*.test.mjs`

## Task 1: Stabilize The Runtime Interaction Foundation

**Files:**
- Modify: `src/components/right-pane/view/VisualHtmlEditor.tsx`
- Modify: `src/components/right-pane/view/visual-html/runtime-shell/PureRuntimeDesignShell.tsx`
- Modify: `src/components/right-pane/view/visual-html/runtime/DesignOverlayEngine.tsx`
- Modify: `src/components/right-pane/view/visual-html/runtime-interaction/InteractionOverlay.tsx`
- Test: `src/components/right-pane/view/VisualHtmlEditor.test.mjs`
- Test: `src/components/right-pane/view/visual-html/runtime-shell/PureRuntimeDesignShell.test.mjs`
- Test: `src/components/right-pane/view/visual-html/runtime/DesignOverlayEngine.test.mjs`

- [ ] **Step 1: Write failing source tests for runtime-first selection, hover, and overlay composition**

```js
test('VisualHtmlEditor source keeps runtime-first selection state and passes it into the shell', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /selectedRuntimeElement/);
  assert.match(source, /selectedRuntimeNode/);
  assert.match(source, /pureRuntimeRegistry/);
  assert.match(source, /layerTree=\{pureRuntimeLayerTree\}/);
  assert.match(source, /onSelectElement=\{handleRuntimeElementSelect\}/);
});

test('PureRuntimeDesignShell source wires runtime overlay with runtime-selected element and runtime tree', async () => {
  const source = await readFile(new URL('./PureRuntimeDesignShell.tsx', import.meta.url), 'utf8');

  assert.match(source, /resolvedSelectedElement/);
  assert.match(source, /PureRuntimeLayerTree/);
  assert.match(source, /PureRuntimeInspectorPane/);
  assert.match(source, /InteractionOverlay|DesignOverlayEngine/);
});

test('DesignOverlayEngine source translates runtime rects into overlay-local coordinates', async () => {
  const source = await readFile(new URL('./DesignOverlayEngine.tsx', import.meta.url), 'utf8');

  assert.match(source, /overlayContainerRef/);
  assert.match(source, /iframeRect/);
  assert.match(source, /overlayRect/);
  assert.match(source, /left: normalized\.left \+ \(iframeRect\?\.left \?\? 0\) - \(overlayRect\?\.left \?\? 0\)/);
});
```

- [ ] **Step 2: Run tests to verify the current baseline fails before implementation**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test \
  src/components/right-pane/view/VisualHtmlEditor.test.mjs \
  src/components/right-pane/view/visual-html/runtime-shell/PureRuntimeDesignShell.test.mjs \
  src/components/right-pane/view/visual-html/runtime/DesignOverlayEngine.test.mjs
```

Expected: FAIL on at least one missing runtime-first selection or overlay assertion.

- [ ] **Step 3: Implement runtime-first foundation in editor and shell**

```tsx
const selectedRuntimeNodeId = selectedRuntimeElement?.getAttribute('data-ccui-node-id') ?? null;
const selectedRuntimeNode = selectedRuntimeNodeId
  ? pureRuntimeRegistry?.byNodeId.get(selectedRuntimeNodeId) ?? null
  : null;

const pureRuntimeLayerTree = useMemo(
  () => buildLayerTree({
    runtimeIndex: pureRuntimeRegistry?.domIndex ?? null,
    selectedNodeId: selectedRuntimeNode?.nodeId ?? null,
    expandedNodeIds: expandedRuntimeNodeIds,
  }),
  [expandedRuntimeNodeIds, pureRuntimeRegistry, selectedRuntimeNode],
);

<PureRuntimeDesignShell
  runtime={designRuntimeHandle}
  runtimeReady={pureRuntimeReady}
  runtimeStatusMessage={runtimeStatusMessage}
  runtimeIndex={pureRuntimeRegistry?.domIndex ?? null}
  bridge={pureRuntimeRegistry?.sourceBridge ?? null}
  selectedNodeId={selectedRuntimeNode?.nodeId ?? null}
  selectedElement={selectedRuntimeElement}
  layerTree={pureRuntimeLayerTree}
  onSelectElement={handleRuntimeElementSelect}
/>
```

- [ ] **Step 4: Re-run the focused tests**

Run the same command from Step 2.

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add \
  src/components/right-pane/view/VisualHtmlEditor.tsx \
  src/components/right-pane/view/visual-html/runtime-shell/PureRuntimeDesignShell.tsx \
  src/components/right-pane/view/visual-html/runtime/DesignOverlayEngine.tsx \
  src/components/right-pane/view/visual-html/runtime-interaction/InteractionOverlay.tsx \
  src/components/right-pane/view/VisualHtmlEditor.test.mjs \
  src/components/right-pane/view/visual-html/runtime-shell/PureRuntimeDesignShell.test.mjs \
  src/components/right-pane/view/visual-html/runtime/DesignOverlayEngine.test.mjs
git commit -m "feat: stabilize runtime interaction foundation for visual html editor"
```

## Task 2: Make The Layer Tree Fully Navigable

**Files:**
- Create: `src/components/right-pane/view/visual-html/runtime-structure/LayerTreeState.ts`
- Modify: `src/components/right-pane/view/visual-html/runtime-structure/LayerTreeBuilder.ts`
- Modify: `src/components/right-pane/view/visual-html/runtime-structure/PureRuntimeLayerTree.tsx`
- Modify: `src/components/right-pane/view/VisualHtmlEditor.tsx`
- Test: `src/components/right-pane/view/visual-html/runtime-structure/LayerTreeBuilder.test.mjs`
- Test: `src/components/right-pane/view/visual-html/runtime-structure/PureRuntimeLayerTree.test.mjs`

- [ ] **Step 1: Write failing tests for ancestor expansion and tree toggles**

```js
test('buildLayerTree expands the selected node ancestor chain', () => {
  const tree = buildLayerTree({
    runtimeIndex: createNestedRuntimeIndex(),
    selectedNodeId: 'node-grandchild',
    expandedNodeIds: [],
  });

  assert.equal(tree.roots[0].expanded, true);
  assert.equal(tree.roots[0].children[0].expanded, true);
});

test('PureRuntimeLayerTree source renders expand toggle affordances for nodes with children', async () => {
  const source = await readFile(new URL('./PureRuntimeLayerTree.tsx', import.meta.url), 'utf8');

  assert.match(source, /data-layer-expand-toggle/);
  assert.match(source, /onToggleNode/);
  assert.match(source, /node\.children\.length > 0/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test \
  src/components/right-pane/view/visual-html/runtime-structure/LayerTreeBuilder.test.mjs \
  src/components/right-pane/view/visual-html/runtime-structure/PureRuntimeLayerTree.test.mjs
```

Expected: FAIL because selected-ancestor expansion and explicit toggles do not exist yet.

- [ ] **Step 3: Implement tree state helpers and expandable tree rendering**

```ts
export function expandAncestorChain(runtimeIndex, selectedNodeId, expandedNodeIds = []) {
  const next = new Set(expandedNodeIds);
  let current = selectedNodeId ? runtimeIndex?.byNodeId?.get(selectedNodeId) ?? null : null;

  while (current?.parentNodeId) {
    next.add(current.parentNodeId);
    current = runtimeIndex?.byNodeId?.get(current.parentNodeId) ?? null;
  }

  return next;
}
```

```tsx
{node.children.length > 0 ? (
  <button
    type="button"
    data-layer-expand-toggle={node.nodeId}
    onClick={() => onToggleNode?.(node.nodeId)}
  >
    {node.expanded ? '▾' : '▸'}
  </button>
) : null}
```

- [ ] **Step 4: Re-run the focused tests**

Run the same command from Step 2.

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add \
  src/components/right-pane/view/visual-html/runtime-structure/LayerTreeState.ts \
  src/components/right-pane/view/visual-html/runtime-structure/LayerTreeBuilder.ts \
  src/components/right-pane/view/visual-html/runtime-structure/PureRuntimeLayerTree.tsx \
  src/components/right-pane/view/VisualHtmlEditor.tsx \
  src/components/right-pane/view/visual-html/runtime-structure/LayerTreeBuilder.test.mjs \
  src/components/right-pane/view/visual-html/runtime-structure/PureRuntimeLayerTree.test.mjs
git commit -m "feat: make visual html runtime layer tree navigable"
```

## Task 3: Add Structure Insert/Delete/Reorder Intents

**Files:**
- Create: `src/components/right-pane/view/visual-html/runtime-structure/StructureActions.ts`
- Modify: `src/components/right-pane/view/visual-html/runtime-commit/IntentNormalizer.ts`
- Modify: `src/components/right-pane/view/visual-html/runtime-commit/SaveabilityAnalyzer.ts`
- Modify: `src/components/right-pane/view/visual-html/runtime/HtmlPatchWriter.ts`
- Modify: `src/components/right-pane/view/visual-html/runtime-structure/PureRuntimeLayerTree.tsx`
- Create Test: `src/components/right-pane/view/visual-html/runtime-structure/StructureActions.test.mjs`
- Test: `src/components/right-pane/view/visual-html/runtime-commit/*.test.mjs`

- [ ] **Step 1: Write failing tests for structure intents and safe/unsafe persistence classification**

```js
test('createInsertBeforeIntent targets the selected runtime node and position', () => {
  const intent = createInsertBeforeIntent({ targetNodeId: 'node-2', tagName: 'div' });

  assert.equal(intent.type, 'insert-node');
  assert.equal(intent.position, 'before');
  assert.equal(intent.targetNodeId, 'node-2');
});

test('analyzeSaveability blocks ambiguous reorder in grid layouts', () => {
  const result = analyzeSaveability({
    type: 'reorder-node',
    layoutKind: 'grid-item',
    sourceMatchCount: 2,
  });

  assert.equal(result.mode, 'blocked');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test \
  src/components/right-pane/view/visual-html/runtime-structure/StructureActions.test.mjs \
  src/components/right-pane/view/visual-html/runtime-commit/*.test.mjs
```

Expected: FAIL because structure actions and saveability branches are incomplete.

- [ ] **Step 3: Implement structure action creators and normalize them into runtime mutations**

```ts
export function createInsertBeforeIntent(input) {
  return {
    type: 'insert-node',
    targetNodeId: input.targetNodeId,
    position: 'before',
    tagName: input.tagName,
    attributes: input.attributes ?? {},
    textContent: input.textContent ?? '',
  };
}

export function createDeleteIntent(input) {
  return {
    type: 'delete-node',
    targetNodeId: input.targetNodeId,
  };
}
```

```ts
if (intent.type === 'insert-node') {
  return {
    mutationType: 'structure-insert',
    targetNodeId: intent.targetNodeId,
    position: intent.position,
    payload: intent,
  };
}
```

- [ ] **Step 4: Re-run the focused tests**

Run the same command from Step 2.

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add \
  src/components/right-pane/view/visual-html/runtime-structure/StructureActions.ts \
  src/components/right-pane/view/visual-html/runtime-commit/IntentNormalizer.ts \
  src/components/right-pane/view/visual-html/runtime-commit/SaveabilityAnalyzer.ts \
  src/components/right-pane/view/visual-html/runtime/HtmlPatchWriter.ts \
  src/components/right-pane/view/visual-html/runtime-structure/PureRuntimeLayerTree.tsx \
  src/components/right-pane/view/visual-html/runtime-structure/StructureActions.test.mjs \
  src/components/right-pane/view/visual-html/runtime-commit/*.test.mjs
git commit -m "feat: add runtime structure editing intents"
```

## Task 4: Introduce Layout-Aware Transform Policies

**Files:**
- Create: `src/components/right-pane/view/visual-html/runtime-interaction/TransformIntents.ts`
- Create: `src/components/right-pane/view/visual-html/runtime-interaction/LayoutConstraintEngine.ts`
- Modify: `src/components/right-pane/view/visual-html/runtime-interaction/InteractionEngine.ts`
- Modify: `src/components/right-pane/view/visual-html/runtime-interaction/InteractionOverlay.tsx`
- Modify: `src/components/right-pane/view/visual-html/runtime-commit/IntentNormalizer.ts`
- Create Test: `src/components/right-pane/view/visual-html/runtime-interaction/LayoutConstraintEngine.test.mjs`
- Test: `src/components/right-pane/view/visual-html/runtime-interaction/InteractionEngine.test.mjs`

- [ ] **Step 1: Write failing tests for layout-aware move/resize gating**

```js
test('resolveTransformPolicy allows free move for absolute nodes', () => {
  const policy = resolveTransformPolicy({ layoutKind: 'absolute' });
  assert.equal(policy.allowMove, true);
  assert.equal(policy.allowResize, true);
});

test('resolveTransformPolicy blocks free move for grid items', () => {
  const policy = resolveTransformPolicy({ layoutKind: 'grid-item' });
  assert.equal(policy.allowMove, false);
  assert.equal(policy.preferredMode, 'grid-lines');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test \
  src/components/right-pane/view/visual-html/runtime-interaction/LayoutConstraintEngine.test.mjs \
  src/components/right-pane/view/visual-html/runtime-interaction/InteractionEngine.test.mjs
```

Expected: FAIL because transform policy resolution does not exist yet.

- [ ] **Step 3: Implement transform policy resolution and wire it into interaction sessions**

```ts
export function resolveTransformPolicy(input) {
  if (input.layoutKind === 'absolute') {
    return { allowMove: true, allowResize: true, preferredMode: 'freeform' };
  }
  if (input.layoutKind === 'flex-item') {
    return { allowMove: false, allowResize: false, preferredMode: 'reorder' };
  }
  if (input.layoutKind === 'grid-item') {
    return { allowMove: false, allowResize: false, preferredMode: 'grid-lines' };
  }
  return { allowMove: false, allowResize: false, preferredMode: 'flow-edit' };
}
```

```ts
const policy = resolveTransformPolicy({ layoutKind: node.layoutContext.kind });
if (!policy.allowMove) {
  return { type: 'blocked', reason: policy.preferredMode };
}
```

- [ ] **Step 4: Re-run the focused tests**

Run the same command from Step 2.

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add \
  src/components/right-pane/view/visual-html/runtime-interaction/TransformIntents.ts \
  src/components/right-pane/view/visual-html/runtime-interaction/LayoutConstraintEngine.ts \
  src/components/right-pane/view/visual-html/runtime-interaction/InteractionEngine.ts \
  src/components/right-pane/view/visual-html/runtime-interaction/InteractionOverlay.tsx \
  src/components/right-pane/view/visual-html/runtime-commit/IntentNormalizer.ts \
  src/components/right-pane/view/visual-html/runtime-interaction/LayoutConstraintEngine.test.mjs \
  src/components/right-pane/view/visual-html/runtime-interaction/InteractionEngine.test.mjs
git commit -m "feat: add layout-aware runtime transform policies"
```

## Task 5: Make The Inspector Runtime-Editable

**Files:**
- Modify: `src/components/right-pane/view/visual-html/runtime-inspector/InspectorModelBuilder.ts`
- Modify: `src/components/right-pane/view/visual-html/runtime-inspector/PureRuntimeInspectorPane.tsx`
- Modify: `src/components/right-pane/view/VisualHtmlEditor.tsx`
- Modify: `src/components/right-pane/view/visual-html/runtime-commit/IntentNormalizer.ts`
- Modify: `src/components/right-pane/view/visual-html/runtime-commit/SaveabilityAnalyzer.ts`
- Test: `src/components/right-pane/view/visual-html/runtime-inspector/InspectorModelBuilder.test.mjs`
- Test: `src/components/right-pane/view/visual-html/runtime-shell/PureRuntimeDesignShell.test.mjs`

- [ ] **Step 1: Write failing tests for editable inspector sections and field-level saveability**

```js
test('buildInspectorModel exposes computed and editable sections with saveability metadata', () => {
  const model = buildInspectorModel(createInspectorInput());

  assert.equal(Array.isArray(model.computedSections), true);
  assert.equal(Array.isArray(model.editableSections), true);
  assert.equal(model.editableSections[0].fields[0].saveability.mode.length > 0, true);
});

test('PureRuntimeInspectorPane source renders disabled reasons and editable inputs', async () => {
  const source = await readFile(new URL('./PureRuntimeInspectorPane.tsx', import.meta.url), 'utf8');

  assert.match(source, /data-runtime-inspector-editable/);
  assert.match(source, /disabledReason/);
  assert.match(source, /preview-only|仅预览/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test \
  src/components/right-pane/view/visual-html/runtime-inspector/InspectorModelBuilder.test.mjs \
  src/components/right-pane/view/visual-html/runtime-shell/PureRuntimeDesignShell.test.mjs
```

Expected: FAIL because editable field metadata and UI affordances are incomplete.

- [ ] **Step 3: Implement runtime-editable inspector model and pane**

```ts
editableSections.push({
  id: 'layout',
  title: '布局',
  fields: [
    {
      id: 'width',
      label: '宽度',
      value: sourceMatch?.inlineStyle?.width ?? '',
      editable: entry.editCapabilities.styleEditable,
      disabledReason: entry.editCapabilities.styleEditable ? null : '当前节点不可编辑样式',
      saveability: classifyFieldSaveability(entry, 'width'),
    },
  ],
});
```

```tsx
<div data-runtime-inspector-editable="true">
  {field.editable ? <input value={field.value} /> : <input value={field.value} disabled />}
  {field.disabledReason ? <p>{field.disabledReason}</p> : null}
  {field.saveability.mode === 'preview-only' ? <p>仅预览，不直接保存</p> : null}
</div>
```

- [ ] **Step 4: Re-run the focused tests**

Run the same command from Step 2.

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add \
  src/components/right-pane/view/visual-html/runtime-inspector/InspectorModelBuilder.ts \
  src/components/right-pane/view/visual-html/runtime-inspector/PureRuntimeInspectorPane.tsx \
  src/components/right-pane/view/VisualHtmlEditor.tsx \
  src/components/right-pane/view/visual-html/runtime-commit/IntentNormalizer.ts \
  src/components/right-pane/view/visual-html/runtime-commit/SaveabilityAnalyzer.ts \
  src/components/right-pane/view/visual-html/runtime-inspector/InspectorModelBuilder.test.mjs \
  src/components/right-pane/view/visual-html/runtime-shell/PureRuntimeDesignShell.test.mjs
git commit -m "feat: make runtime inspector editable"
```

## Task 6: Unify History, Preview, Persist, And Rollback

**Files:**
- Create: `src/components/right-pane/view/visual-html/runtime-history/RuntimeHistoryController.ts`
- Modify: `src/components/right-pane/view/visual-html/runtime-history/HistoryStore.ts`
- Modify: `src/components/right-pane/view/VisualHtmlEditor.tsx`
- Modify: `src/components/right-pane/view/visual-html/runtime-commit/IntentNormalizer.ts`
- Modify: `src/components/right-pane/view/visual-html/runtime/HtmlPatchWriter.ts`
- Test: `src/components/right-pane/view/visual-html/runtime-history/*.test.mjs`
- Test: `src/components/right-pane/view/visual-html/runtime-commit/*.test.mjs`

- [ ] **Step 1: Write failing tests for richer runtime history entries and rollback**

```js
test('createHistoryStore records intent type and persist mode', () => {
  const store = createHistoryStore();
  store.push({
    intentType: 'update-style',
    persistMode: 'preview-only',
    mutationCount: 1,
  });

  assert.equal(store.getSnapshot().entries[0].intentType, 'update-style');
  assert.equal(store.getSnapshot().entries[0].persistMode, 'preview-only');
});

test('RuntimeHistoryController rolls back the latest preview mutation when persistence fails', () => {
  const controller = createRuntimeHistoryController(createMockDeps());
  const result = controller.applyIntent(createFailingPersistIntent());

  assert.equal(result.status, 'rolled-back');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test \
  src/components/right-pane/view/visual-html/runtime-history/*.test.mjs \
  src/components/right-pane/view/visual-html/runtime-commit/*.test.mjs
```

Expected: FAIL because history entries and rollback coordination are not rich enough yet.

- [ ] **Step 3: Implement history controller and richer store entries**

```ts
store.push({
  id: nextId(),
  intentType: intent.type,
  persistMode: saveability.mode,
  mutationCount: mutations.length,
  status: persistResult.ok ? 'persisted' : saveability.mode === 'preview-only' ? 'previewed' : 'rolled-back',
});
```

```ts
if (!persistResult.ok) {
  runtimeMutationRecorder.restore(snapshotBeforeIntent);
  historyStore.rollbackLatest();
  return { status: 'rolled-back' };
}
```

- [ ] **Step 4: Re-run the focused tests**

Run the same command from Step 2.

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add \
  src/components/right-pane/view/visual-html/runtime-history/RuntimeHistoryController.ts \
  src/components/right-pane/view/visual-html/runtime-history/HistoryStore.ts \
  src/components/right-pane/view/VisualHtmlEditor.tsx \
  src/components/right-pane/view/visual-html/runtime-commit/IntentNormalizer.ts \
  src/components/right-pane/view/visual-html/runtime/HtmlPatchWriter.ts \
  src/components/right-pane/view/visual-html/runtime-history/*.test.mjs \
  src/components/right-pane/view/visual-html/runtime-commit/*.test.mjs
git commit -m "feat: unify runtime history and commit flow"
```

## Task 7: Remove Misleading Legacy GrapesJS Semantics From The Main Design Path

**Files:**
- Modify: `src/components/right-pane/view/VisualHtmlEditor.tsx`
- Modify: `src/components/right-pane/view/visual-html/VisualCanvasPane.tsx`
- Test: `src/components/right-pane/view/VisualHtmlEditor.test.mjs`
- Test: `src/components/right-pane/view/visual-html/VisualCanvasPane.test.mjs`

- [ ] **Step 1: Write failing tests for legacy action downgrades**

```js
test('VisualHtmlEditor source disables legacy actions when runtime history is not available', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /legacyCanvasActionsEnabled/);
  assert.match(source, /runtimeHistoryAvailable/);
  assert.match(source, /disabled: !runtimeHistoryAvailable/);
});

test('VisualCanvasPane source remains a hidden compatibility shell only', async () => {
  const source = await readFile(new URL('./VisualCanvasPane.tsx', import.meta.url), 'utf8');

  assert.match(source, /hidden compatibility shell/i);
  assert.match(source, /aria-hidden/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test \
  src/components/right-pane/view/VisualHtmlEditor.test.mjs \
  src/components/right-pane/view/visual-html/VisualCanvasPane.test.mjs
```

Expected: FAIL if legacy semantics are still mixed into the visible design path.

- [ ] **Step 3: Implement explicit runtime-first toolbar/state gating**

```tsx
const runtimeHistoryAvailable = Boolean(runtimeHistoryController && pureRuntimeReady);

const designActions = [
  {
    id: 'undo',
    disabled: !runtimeHistoryAvailable,
    onClick: () => runtimeHistoryController?.undo(),
  },
];
```

- [ ] **Step 4: Re-run the focused tests**

Run the same command from Step 2.

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add \
  src/components/right-pane/view/VisualHtmlEditor.tsx \
  src/components/right-pane/view/visual-html/VisualCanvasPane.tsx \
  src/components/right-pane/view/VisualHtmlEditor.test.mjs \
  src/components/right-pane/view/visual-html/VisualCanvasPane.test.mjs
git commit -m "refactor: remove legacy grapesjs semantics from runtime design path"
```

## Task 8: Run The Full Visual HTML Runtime Regression Suite

**Files:**
- Test only: `src/components/right-pane/view/visual-html/runtime-core/*.test.mjs`
- Test only: `src/components/right-pane/view/visual-html/runtime-interaction/*.test.mjs`
- Test only: `src/components/right-pane/view/visual-html/runtime-history/*.test.mjs`
- Test only: `src/components/right-pane/view/visual-html/runtime-commit/*.test.mjs`
- Test only: `src/components/right-pane/view/visual-html/runtime-inspector/*.test.mjs`
- Test only: `src/components/right-pane/view/visual-html/runtime-structure/*.test.mjs`
- Test only: `src/components/right-pane/view/visual-html/runtime-shell/*.test.mjs`
- Test only: `src/components/right-pane/view/visual-html/runtime/*.test.mjs`
- Test only: `src/components/right-pane/view/VisualHtmlEditor.test.mjs`
- Test only: `src/components/right-pane/view/visual-html/VisualCanvasPane.test.mjs`

- [ ] **Step 1: Run the full targeted suite**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test \
  src/components/right-pane/view/visual-html/runtime-core/*.test.mjs \
  src/components/right-pane/view/visual-html/runtime-interaction/*.test.mjs \
  src/components/right-pane/view/visual-html/runtime-history/*.test.mjs \
  src/components/right-pane/view/visual-html/runtime-commit/*.test.mjs \
  src/components/right-pane/view/visual-html/runtime-inspector/*.test.mjs \
  src/components/right-pane/view/visual-html/runtime-structure/*.test.mjs \
  src/components/right-pane/view/visual-html/runtime-shell/*.test.mjs \
  src/components/right-pane/view/visual-html/runtime/*.test.mjs \
  src/components/right-pane/view/VisualHtmlEditor.test.mjs \
  src/components/right-pane/view/visual-html/VisualCanvasPane.test.mjs
```

Expected: PASS with `0 fail`.

- [ ] **Step 2: Run typecheck and record unrelated failures separately if present**

Run:

```bash
npm run typecheck
```

Expected: PASS, or clearly identified unrelated pre-existing errors outside the visual-html runtime scope.

- [ ] **Step 3: Manual verification checklist**

Verify in the running app:

```text
1. 打开设计模式，左侧图层树能显示完整层级
2. 点击画布元素，左树自动展开并定位，右侧检查器联动
3. absolute 节点可移动和 resize
4. flex/grid 节点展示受约束编辑或禁用提示
5. inspector 编辑字段后，runtime 即时预演
6. 可保存节点能落盘，不安全节点显示仅预览或阻断
7. undo/redo 走 runtime history，而不是 GrapesJS
```

- [ ] **Step 4: Commit final verification-only adjustments if any**

```bash
git add <only-files-changed-during-verification>
git commit -m "test: finalize visual html full pure runtime editor baseline"
```

## Self-Review

- Spec coverage check:
  - `runtime iframe 为主链路` -> Tasks 1, 7
  - `图层树完整可用` -> Task 2
  - `结构插入/基础重排` -> Task 3
  - `布局敏感 drag/resize` -> Task 4
  - `样式面板/检查器编辑` -> Task 5
  - `history / commit / rollback` -> Task 6
  - `完整回归与手工验收` -> Task 8
- Placeholder scan:
  - No `TODO` / `TBD`
  - All code steps include concrete snippets
  - All verification steps include exact commands or checklists
- Type consistency:
  - Intent naming consistently uses `insert-node`, `delete-node`, `reorder-node`, `update-style`
  - Saveability naming consistently uses `safe`, `preview-only`, `blocked`
  - Runtime state naming consistently uses `selectedRuntimeElement`, `selectedRuntimeNode`, `pureRuntimeRegistry`

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-04-visual-html-full-pure-runtime-editor-implementation-plan.md`.

You already chose the recommended execution mode earlier, so the next step is to execute this plan with `superpowers:subagent-driven-development`: fresh subagent per task, review between tasks, and keep pushing without midstream pauses unless we hit a real blocker.
