# Visual HTML Style Source Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Visual HTML inspector's single merged style value with a unified source-aware model for every style property.

**Architecture:** Add source-aware style value types and resolver helpers while preserving the existing `committed` UI contract through `legacyCommitted`. Update the bridge to pass computed, inline, model, and optional rule style records into the resolver. Then make writeback safer by preventing accidental blank deletes and preserving longhand spacing/radius intent.

**Tech Stack:** React 18, TypeScript, GrapesJS, Node test runner with `--experimental-strip-types`.

---

## File Structure

- Modify: `src/components/right-pane/view/visual-html/grapes-like/types.ts`
  - Responsibility: shared inspector view-model types. Add source-aware value metadata while preserving existing `StyleValueState.committed`.
- Modify: `src/components/right-pane/view/visual-html/grapes-like/styleAdapter.ts`
  - Responsibility: parse CSS records into `StyleState`, resolve multi-source values, and build style snapshots.
- Modify: `src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.ts`
  - Responsibility: gather computed, inline, model, and rule style records from GrapesJS components and pass them to `readStyleSnapshot`.
- Modify: `src/components/right-pane/view/visual-html/grapes-like/styleMapper.ts`
  - Responsibility: normalize inspector writes into safe inline or explicit rule updates.
- Modify: `src/components/right-pane/view/visual-html/grapes-like/style/fields/NumberField.tsx`
  - Responsibility: numeric field commit behavior. Prevent blank drafts from deleting authored values by default.
- Test: `src/components/right-pane/view/visual-html/grapes-like/style/styleAdapter.test.mjs`
  - Responsibility: source model resolver and snapshot tests.
- Test: `src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.test.mjs`
  - Responsibility: bridge read-source and writeback integration tests.
- Test: `src/components/right-pane/view/visual-html/grapes-like/style/styleMapper.test.mjs`
  - Responsibility: safe writeback, longhand preservation, blank behavior.
- Create: `src/components/right-pane/view/visual-html/grapes-like/style/fields/NumberField.test.mjs`
  - Responsibility: numeric field blank draft behavior.
- Test: `src/components/right-pane/view/visual-html/htmlDocumentTransforms.test.mjs`
  - Responsibility: save/reopen source-model round-trip assertions.

## Task 1: Add Source-Aware Style Types

**Files:**
- Modify: `src/components/right-pane/view/visual-html/grapes-like/types.ts`
- Test: existing TypeScript-stripping tests compile these types transitively.

- [ ] **Step 1: Add source metadata types next to `StyleValueState`**

In `src/components/right-pane/view/visual-html/grapes-like/types.ts`, add these exports before `StyleValueState`:

```ts
export type StyleValueSource = 'inline' | 'model' | 'rule' | 'computed' | 'default' | 'mixed';

export type StyleValueOrigin<TValue> = {
  value: TValue;
  present: boolean;
};

export type ResolvedStylePropertyValue<TValue> = {
  display: TValue;
  authored: TValue;
  computed: TValue;
  source: StyleValueSource;
  writable: boolean;
  legacyCommitted: TValue;
  mixed?: boolean;
};
```

- [ ] **Step 2: Extend `StyleValueState` with resolved metadata**

Change `StyleValueState` to:

```ts
export type StyleValueState<TValue> = {
  committed: TValue;
  draft?: TValue;
  mixed?: boolean;
  disabled?: boolean;
  resolved?: ResolvedStylePropertyValue<TValue>;
};
```

- [ ] **Step 3: Run focused type-consuming tests**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test \
  src/components/right-pane/view/visual-html/grapes-like/style/styleAdapter.test.mjs \
  src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.test.mjs
```

Expected: PASS. This task should be type-only and behavior-neutral.

- [ ] **Step 4: Commit type addition**

Run:

```bash
git add src/components/right-pane/view/visual-html/grapes-like/types.ts
git commit -m "feat: add visual html style source types"
```

Expected: Commit succeeds.

## Task 2: Implement Source Resolver In Style Adapter

**Files:**
- Modify: `src/components/right-pane/view/visual-html/grapes-like/styleAdapter.ts`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/style/styleAdapter.test.mjs`

- [ ] **Step 1: Add failing tests for source resolution**

Append these tests to `src/components/right-pane/view/visual-html/grapes-like/style/styleAdapter.test.mjs`:

```js
test('readStyleSnapshot resolves inline authored values over computed values', () => {
  const result = readStyleSnapshot({
    selection: [{
      computedStyles: {
        width: 'auto',
        'font-size': '16px',
        color: 'rgb(0, 0, 0)',
      },
      inlineStyles: {
        width: '251.46px',
        'font-size': '21px',
        color: '#ffffff',
      },
      modelStyles: {},
    }],
    activeState: '',
  });

  const layout = result.sectors.find((sector) => sector.key === 'layout');
  const text = result.sectors.find((sector) => sector.key === 'text');
  const width = layout.properties.find((property) => property.property === 'width');
  const fontSize = text.properties.find((property) => property.property === 'fontSize');
  const color = text.properties.find((property) => property.property === 'color');

  assert.equal(width.value.committed.value, '251.46');
  assert.equal(width.value.resolved.source, 'inline');
  assert.deepEqual(width.value.resolved.computed, { value: 'auto', unit: '' });
  assert.deepEqual(width.value.resolved.authored, { value: '251.46', unit: 'px' });
  assert.equal(fontSize.value.committed.value, '21');
  assert.equal(fontSize.value.resolved.source, 'inline');
  assert.equal(color.value.committed.value, '#ffffff');
  assert.equal(color.value.resolved.source, 'inline');
});

test('readStyleSnapshot displays computed-only values without treating them as authored', () => {
  const result = readStyleSnapshot({
    selection: [{
      computedStyles: {
        width: '1200px',
        'font-size': '16px',
      },
      inlineStyles: {},
      modelStyles: {},
    }],
    activeState: '',
  });

  const layout = result.sectors.find((sector) => sector.key === 'layout');
  const text = result.sectors.find((sector) => sector.key === 'text');
  const width = layout.properties.find((property) => property.property === 'width');
  const fontSize = text.properties.find((property) => property.property === 'fontSize');

  assert.equal(width.value.committed.value, '1200');
  assert.equal(width.value.resolved.source, 'computed');
  assert.deepEqual(width.value.resolved.authored, { value: '', unit: '' });
  assert.equal(fontSize.value.committed.value, '16');
  assert.equal(fontSize.value.resolved.source, 'computed');
});

test('readStyleSnapshot treats empty authored values as absent', () => {
  const result = readStyleSnapshot({
    selection: [{
      computedStyles: {
        'font-size': '21px',
      },
      inlineStyles: {},
      modelStyles: {
        'font-size': '',
      },
    }],
    activeState: '',
  });

  const text = result.sectors.find((sector) => sector.key === 'text');
  const fontSize = text.properties.find((property) => property.property === 'fontSize');

  assert.equal(fontSize.value.committed.value, '21');
  assert.equal(fontSize.value.resolved.source, 'computed');
});

test('readStyleSnapshot marks mixed source values consistently', () => {
  const result = readStyleSnapshot({
    selection: [
      {
        computedStyles: { width: '100px' },
        inlineStyles: { width: '100px' },
        modelStyles: {},
      },
      {
        computedStyles: { width: '120px' },
        inlineStyles: { width: '120px' },
        modelStyles: {},
      },
    ],
    activeState: '',
  });

  const layout = result.sectors.find((sector) => sector.key === 'layout');
  const width = layout.properties.find((property) => property.property === 'width');

  assert.equal(width.value.mixed, true);
  assert.equal(width.value.resolved.source, 'mixed');
  assert.deepEqual(width.value.committed, { value: '', unit: '' });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/grapes-like/style/styleAdapter.test.mjs
```

Expected: FAIL because `computedStyles`, `inlineStyles`, `modelStyles`, and `value.resolved` are not implemented yet.

- [ ] **Step 3: Update style source input shape**

In `src/components/right-pane/view/visual-html/grapes-like/styleAdapter.ts`, replace the current selection input type in `readStyleSnapshot` and `getSelectionStyles` with:

```ts
type StyleSourceRecord = Record<string, string | number | null | undefined>;

type StyleSelectionSource = {
  styles?: StyleSourceRecord | null;
  computedStyles?: StyleSourceRecord | null;
  inlineStyles?: StyleSourceRecord | null;
  modelStyles?: StyleSourceRecord | null;
  ruleStyles?: StyleSourceRecord | null;
  classes?: readonly string[] | string | null;
};
```

Keep `styles` as a backward-compatible alias for `modelStyles`.

- [ ] **Step 4: Add helper functions to resolve property values**

In `styleAdapter.ts`, import the new types:

```ts
import {
  EMPTY_STYLE_STATE,
  type BoxValue,
  type BorderValue,
  type RadiusValue,
  type ResolvedStylePropertyValue,
  type ShadowLayerValue,
  type ShadowValue,
  type StylePropertyViewModel,
  type StyleSectorViewModel,
  type StyleSnapshot,
  type StyleState,
  type StyleValueSource,
  type TransitionLayerValue,
  type TransitionValue,
  type TransformValue,
  type UnitValue,
} from './types.ts';
```

Add these helpers near `readPropertyValue`:

```ts
function isEmptyStyleValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === 'string') {
    return value.trim().length === 0;
  }

  if (typeof value === 'object') {
    return JSON.stringify(value) === JSON.stringify({ value: '', unit: '' })
      || JSON.stringify(value) === JSON.stringify({ top: '', right: '', bottom: '', left: '', unit: '' });
  }

  return false;
}

function resolveStylePropertyValue<TValue>({
  defaultValue,
  computedValue,
  inlineValue,
  modelValue,
  ruleValue,
  mixed,
}: {
  defaultValue: TValue;
  computedValue: TValue;
  inlineValue: TValue;
  modelValue: TValue;
  ruleValue: TValue;
  mixed: boolean;
}): ResolvedStylePropertyValue<TValue> {
  if (mixed) {
    return {
      display: defaultValue,
      authored: defaultValue,
      computed: computedValue,
      source: 'mixed',
      writable: true,
      legacyCommitted: defaultValue,
      mixed: true,
    };
  }

  if (!isEmptyStyleValue(inlineValue)) {
    return {
      display: inlineValue,
      authored: inlineValue,
      computed: computedValue,
      source: 'inline',
      writable: true,
      legacyCommitted: inlineValue,
    };
  }

  if (!isEmptyStyleValue(modelValue)) {
    return {
      display: modelValue,
      authored: modelValue,
      computed: computedValue,
      source: 'model',
      writable: true,
      legacyCommitted: modelValue,
    };
  }

  if (!isEmptyStyleValue(ruleValue)) {
    return {
      display: ruleValue,
      authored: defaultValue,
      computed: computedValue,
      source: 'rule',
      writable: true,
      legacyCommitted: ruleValue,
    };
  }

  if (!isEmptyStyleValue(computedValue)) {
    return {
      display: computedValue,
      authored: defaultValue,
      computed: computedValue,
      source: 'computed',
      writable: true,
      legacyCommitted: computedValue,
    };
  }

  return {
    display: defaultValue,
    authored: defaultValue,
    computed: defaultValue,
    source: 'default',
    writable: true,
    legacyCommitted: defaultValue,
  };
}
```

- [ ] **Step 5: Replace `getSelectionStyles` with source-aware state records**

In `styleAdapter.ts`, replace `getSelectionStyles` with:

```ts
type StyleSelectionStates = {
  computed: StyleState;
  inline: StyleState;
  model: StyleState;
  rule: StyleState;
};

function getSelectionStyles(source: {
  selection?: StyleSelectionSource[] | null;
} | null | undefined): StyleSelectionStates[] {
  return (source?.selection ?? []).map((entry) => ({
    computed: readStyleState(entry.computedStyles),
    inline: readStyleState(entry.inlineStyles),
    model: readStyleState(entry.modelStyles ?? entry.styles),
    rule: readStyleState(entry.ruleStyles),
  }));
}
```

- [ ] **Step 6: Update `readStyleSnapshot` property mapping**

Inside `readStyleSnapshot`, replace state reads with source-aware state reads:

```ts
const states = getSelectionStyles(source);
const baseState = states[0] ?? {
  computed: EMPTY_STYLE_STATE,
  inline: EMPTY_STYLE_STATE,
  model: EMPTY_STYLE_STATE,
  rule: EMPTY_STYLE_STATE,
};
```

Update position detection:

```ts
const hasPositionOffset = states.some((state) => {
  const position = [
    state.inline.layout.position.value,
    state.model.layout.position.value,
    state.rule.layout.position.value,
    state.computed.layout.position.value,
  ].find(Boolean);
  return position === 'absolute' || position === 'fixed';
});
```

In the property mapping, compute:

```ts
const defaultValue = readEmptyPropertyValue(sector.key, property.property);
const displayValues = states.map((state) => {
  const resolved = resolveStylePropertyValue({
    defaultValue,
    computedValue: readPropertyValue(state.computed, sector.key, property.property),
    inlineValue: readPropertyValue(state.inline, sector.key, property.property),
    modelValue: readPropertyValue(state.model, sector.key, property.property),
    ruleValue: readPropertyValue(state.rule, sector.key, property.property),
    mixed: false,
  });
  return resolved.legacyCommitted;
});
const mixed = isMixedValue(displayValues);
const resolved = resolveStylePropertyValue({
  defaultValue,
  computedValue: readPropertyValue(baseState.computed, sector.key, property.property),
  inlineValue: readPropertyValue(baseState.inline, sector.key, property.property),
  modelValue: readPropertyValue(baseState.model, sector.key, property.property),
  ruleValue: readPropertyValue(baseState.rule, sector.key, property.property),
  mixed,
});
```

Return:

```ts
value: {
  committed: resolved.legacyCommitted,
  resolved,
  mixed,
  disabled: false,
},
```

- [ ] **Step 7: Run style adapter tests**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/grapes-like/style/styleAdapter.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit source resolver**

Run:

```bash
git add src/components/right-pane/view/visual-html/grapes-like/styleAdapter.ts \
  src/components/right-pane/view/visual-html/grapes-like/style/styleAdapter.test.mjs
git commit -m "feat: resolve visual html style value sources"
```

Expected: Commit succeeds.

## Task 3: Feed Computed, Inline, Model, And Rule Records From Bridge

**Files:**
- Modify: `src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.ts`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.test.mjs`

- [ ] **Step 1: Update bridge tests to assert source metadata**

In `createGrapesLikeInspectorBridge.test.mjs`, update the existing test `createGrapesLikeInspectorBridge prefers DOM inline styles for editable style echo` to assert:

```js
assert.equal(width.value.resolved.source, 'inline');
assert.deepEqual(width.value.resolved.computed, { value: 'auto', unit: '' });
assert.deepEqual(width.value.resolved.authored, { value: '251.46', unit: 'px' });
assert.equal(height.value.resolved.source, 'inline');
assert.equal(fontSize.value.resolved.source, 'inline');
assert.equal(padding.value.resolved.source, 'inline');
assert.equal(backgroundColor.value.resolved.source, 'inline');
```

Add this test after it:

```js
test('createGrapesLikeInspectorBridge keeps rule values contextual while defaulting writes inline', () => {
  const { editor, cta } = createEditorFixture();
  const computedValues = { color: 'rgb(0, 0, 0)' };
  const element = {
    style: {
      getPropertyValue: () => '',
    },
    ownerDocument: {
      defaultView: {
        getComputedStyle: () => ({
          getPropertyValue: (property) => computedValues[property] ?? '',
        }),
      },
    },
  };
  const ruleTarget = {
    getStyle: () => ({ color: '#ffffff' }),
  };

  cta.getStyle = () => ({});
  cta.getEl = () => element;
  cta.getClasses = () => [{ get: (key) => (key === 'name' ? 'form-label' : undefined) }];
  editor.getSelectedToStyle = () => ruleTarget;

  const bridge = createGrapesLikeInspectorBridge(editor);
  const snapshot = bridge.adapter.getSnapshot();
  const text = snapshot.style.sectors.find((sector) => sector.key === 'text');
  const color = text.properties.find((property) => property.property === 'color');

  assert.equal(snapshot.style.targetKind, 'inline');
  assert.equal(color.value.committed.value, '#ffffff');
  assert.equal(color.value.resolved.source, 'rule');
});
```

- [ ] **Step 2: Run bridge tests and verify failure**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.test.mjs
```

Expected: FAIL until bridge passes separate source records.

- [ ] **Step 3: Split bridge style reads into source records**

In `createGrapesLikeInspectorBridge.ts`, replace `getStyleSourceForComponent` with:

```ts
function getStyleSourceForComponent(editor: GrapesEditor, component: GrapesComponent, index: number) {
  const primaryTarget = index === 0
    ? (editor.getSelectedToStyle?.() as GrapesStyleTarget | undefined)
    : undefined;
  const modelTarget = getStyleManager(editor)?.getModelToStyle?.(component);
  const componentStyle = sanitizeStyleRecord(component?.getStyle?.());
  const modelStyle = sanitizeStyleRecord(modelTarget?.getStyle?.());
  const ruleStyle = sanitizeStyleRecord(primaryTarget?.getStyle?.());

  return {
    computedStyles: readComputedStyleRecord(component),
    inlineStyles: readInlineStyleRecord(component),
    modelStyles: Object.keys(modelStyle).length > 0 ? modelStyle : componentStyle,
    ruleStyles: ruleStyle,
  };
}
```

Keep `sanitizeStyleRecord` filtering empty strings.

- [ ] **Step 4: Update `readStyleSnapshot` call sites**

In `createInspectorAdapter` style callbacks, keep this shape:

```ts
style: () => readStyleSnapshot({
  selection: getSelectedComponents(editor).map((component, index) => ({
    ...getStyleSourceForComponent(editor, component, index),
    classes: getComponentClasses(component),
  })),
  activeState: editor.SelectorManager?.getState?.() ?? '',
}),
```

Apply the same shape in snapshot refresh paths if duplicated.

- [ ] **Step 5: Run bridge tests**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit bridge source feed**

Run:

```bash
git add src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.ts \
  src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.test.mjs
git commit -m "feat: feed visual html style source records"
```

Expected: Commit succeeds.

## Task 4: Safe Inline Writeback And Blank Numeric Drafts

**Files:**
- Modify: `src/components/right-pane/view/visual-html/grapes-like/style/fields/NumberField.tsx`
- Create: `src/components/right-pane/view/visual-html/grapes-like/style/fields/NumberField.test.mjs`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.ts`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.test.mjs`

- [ ] **Step 1: Add NumberField blank draft test**

If `src/components/right-pane/view/visual-html/grapes-like/style/fields/NumberField.test.mjs` does not exist, create it with Node test + React test utility patterns used by nearby field tests. Add a source-level fallback test if no renderer is available:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('NumberField keeps blank input as a draft instead of committing deletion on blur', async () => {
  const source = await readFile(new URL('./NumberField.tsx', import.meta.url), 'utf8');

  assert.match(source, /if \\(!draft\\.trim\\(\\)\\) \\{/);
  assert.match(source, /setDraft\\(String\\(value\\.value \\?\\? ''\\)\\)/);
  assert.doesNotMatch(source, /onCommit\\(\\{\\s*value: draft,\\s*unit: getDefaultUnit\\(units, unit\\),\\s*\\}\\);/);
});
```

- [ ] **Step 2: Run NumberField test and verify failure**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/grapes-like/style/fields/NumberField.test.mjs
```

Expected: FAIL until the blank guard exists.

- [ ] **Step 3: Update NumberField blur behavior**

In `NumberField.tsx`, replace the current `onBlur` body with:

```tsx
onBlur={() => {
  if (!draft.trim()) {
    setDraft(String(value.value ?? ''));
    setUnit(getDefaultUnit(units, String(value.unit ?? unit)));
    return;
  }

  onCommit({
    value: draft,
    unit: getDefaultUnit(units, unit),
  });
}}
```

This prevents accidental deletion through empty drafts. Explicit clear UI can be added later.

- [ ] **Step 4: Add bridge writeback test for blank values**

Append to `createGrapesLikeInspectorBridge.test.mjs`:

```js
test('createGrapesLikeInspectorBridge ignores blank inline style writes by default', () => {
  const { editor, cta } = createEditorFixture();
  const styleState = { width: '120px' };

  cta.getStyle = () => ({ ...styleState });
  cta.addStyle = (patch) => Object.assign(styleState, patch);
  cta.removeStyle = (property) => {
    delete styleState[property];
  };

  const bridge = createGrapesLikeInspectorBridge(editor);
  bridge.actions.style.updateStyle({ property: 'width', value: '', targetKind: 'inline' });

  assert.equal(styleState.width, '120px');
});
```

- [ ] **Step 5: Update `updateInlineStyle` blank behavior**

In `createGrapesLikeInspectorBridge.ts`, change:

```ts
if (!nextValue) {
  component?.removeStyle?.(property);
  return;
}
```

to:

```ts
if (!nextValue) {
  return;
}
```

Keep rule style removal unchanged for explicit future advanced rule editing.

- [ ] **Step 6: Run writeback tests**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test \
  src/components/right-pane/view/visual-html/grapes-like/style/fields/NumberField.test.mjs \
  src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit safe blank behavior**

Run:

```bash
git add src/components/right-pane/view/visual-html/grapes-like/style/fields/NumberField.tsx \
  src/components/right-pane/view/visual-html/grapes-like/style/fields/NumberField.test.mjs \
  src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.ts \
  src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.test.mjs
git commit -m "fix: avoid accidental blank style deletion"
```

Expected: Commit succeeds.

## Task 5: Preserve Longhand Spacing And Radius Writeback

**Files:**
- Modify: `src/components/right-pane/view/visual-html/grapes-like/styleMapper.ts`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/style/styleMapper.test.mjs`

- [ ] **Step 1: Add failing tests for longhand preservation**

Append to `styleMapper.test.mjs`:

```js
test('applyStylePatch preserves padding longhands when editing one side', () => {
  const result = applyStylePatch({
    'padding-top': '30px',
    'padding-right': '96px',
    'padding-bottom': '28px',
    'padding-left': '0px',
  }, {
    spacing: {
      padding: {
        right: '104',
        unit: 'px',
      },
    },
  });

  assert.equal(result['padding-top'], '30px');
  assert.equal(result['padding-right'], '104px');
  assert.equal(result['padding-bottom'], '28px');
  assert.equal(result['padding-left'], '0px');
  assert.equal(result.padding, undefined);
});

test('applyStylePatch preserves margin longhands when editing one side', () => {
  const result = applyStylePatch({
    'margin-top': '1rem',
    'margin-right': 'auto',
    'margin-bottom': '2rem',
    'margin-left': 'auto',
  }, {
    spacing: {
      margin: {
        top: '3',
        unit: 'rem',
      },
    },
  });

  assert.equal(result['margin-top'], '3rem');
  assert.equal(result['margin-right'], 'auto');
  assert.equal(result['margin-bottom'], '2rem');
  assert.equal(result['margin-left'], 'auto');
  assert.equal(result.margin, undefined);
});

test('applyStylePatch preserves border radius longhands when present', () => {
  const result = applyStylePatch({
    'border-top-left-radius': '4px',
    'border-top-right-radius': '8px',
    'border-bottom-right-radius': '12px',
    'border-bottom-left-radius': '16px',
  }, {
    appearance: {
      borderRadius: {
        topLeft: '6',
        unit: 'px',
      },
    },
  });

  assert.equal(result['border-top-left-radius'], '6px');
  assert.equal(result['border-top-right-radius'], '8px');
  assert.equal(result['border-bottom-right-radius'], '12px');
  assert.equal(result['border-bottom-left-radius'], '16px');
  assert.equal(result['border-radius'], undefined);
});
```

- [ ] **Step 2: Run mapper tests and verify failure**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/grapes-like/style/styleMapper.test.mjs
```

Expected: FAIL because current implementation deletes longhands and writes shorthand.

- [ ] **Step 3: Add longhand helpers to styleMapper**

In `styleMapper.ts`, add helpers above `applyStylePatch`:

```ts
function hasAnyStyleKey(style: StyleRecord, keys: string[]) {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(style, key));
}

function formatBoxSideValue(value: string, unit: string) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return '';
  }

  if (/^(auto|inherit|initial|unset|revert)$/i.test(trimmed)) {
    return trimmed;
  }

  return unit && /^-?\d*\.?\d+$/.test(trimmed) ? `${trimmed}${unit}` : trimmed;
}

function setLonghandBoxValue(style: StyleRecord, key: 'margin' | 'padding', value: Partial<BoxValue>, fallback: BoxValue) {
  const sideKeys = [`${key}-top`, `${key}-right`, `${key}-bottom`, `${key}-left`];
  const merged: BoxValue = {
    top: value.top ?? fallback.top ?? '',
    right: value.right ?? fallback.right ?? '',
    bottom: value.bottom ?? fallback.bottom ?? '',
    left: value.left ?? fallback.left ?? '',
    unit: value.unit ?? fallback.unit ?? '',
  };
  const sideValues = [merged.top, merged.right, merged.bottom, merged.left];

  sideKeys.forEach((sideKey, index) => {
    const nextValue = formatBoxSideValue(sideValues[index], merged.unit);
    if (nextValue) {
      style[sideKey] = nextValue;
    } else {
      delete style[sideKey];
    }
  });
  delete style[key];
}

function setLonghandRadiusValue(style: StyleRecord, value: Partial<RadiusValue>, fallback: RadiusValue) {
  const sideKeys = [
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-right-radius',
    'border-bottom-left-radius',
  ];
  const merged: RadiusValue = {
    topLeft: value.topLeft ?? fallback.topLeft ?? '',
    topRight: value.topRight ?? fallback.topRight ?? '',
    bottomRight: value.bottomRight ?? fallback.bottomRight ?? '',
    bottomLeft: value.bottomLeft ?? fallback.bottomLeft ?? '',
    unit: value.unit ?? fallback.unit ?? '',
  };
  const values = [merged.topLeft, merged.topRight, merged.bottomRight, merged.bottomLeft];

  sideKeys.forEach((sideKey, index) => {
    const nextValue = formatBoxSideValue(values[index], merged.unit);
    if (nextValue) {
      style[sideKey] = nextValue;
    } else {
      delete style[sideKey];
    }
  });
  delete style['border-radius'];
}
```

- [ ] **Step 4: Update margin and padding writeback**

Replace margin write block with:

```ts
if ('margin' in spacing) {
  const marginKeys = ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'];
  if (hasAnyStyleKey(nextStyle, marginKeys)) {
    setLonghandBoxValue(nextStyle, 'margin', spacing.margin ?? {}, currentState.spacing.margin);
  } else {
    setStyleValue(nextStyle, 'margin', buildBoxValue(spacing.margin, currentState.spacing.margin));
  }
}
```

Replace padding write block with:

```ts
if ('padding' in spacing) {
  const paddingKeys = ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'];
  if (hasAnyStyleKey(nextStyle, paddingKeys)) {
    setLonghandBoxValue(nextStyle, 'padding', spacing.padding ?? {}, currentState.spacing.padding);
  } else {
    setStyleValue(nextStyle, 'padding', buildBoxValue(spacing.padding, currentState.spacing.padding));
  }
}
```

- [ ] **Step 5: Update border radius writeback**

Replace border-radius block with:

```ts
if ('borderRadius' in appearance) {
  const radiusKeys = [
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-right-radius',
    'border-bottom-left-radius',
  ];
  if (hasAnyStyleKey(nextStyle, radiusKeys)) {
    setLonghandRadiusValue(nextStyle, appearance.borderRadius ?? {}, currentState.appearance.borderRadius);
  } else {
    setStyleValue(nextStyle, 'border-radius', buildRadiusValue(appearance.borderRadius, currentState.appearance.borderRadius));
  }
}
```

- [ ] **Step 6: Run mapper tests**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/grapes-like/style/styleMapper.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit longhand preservation**

Run:

```bash
git add src/components/right-pane/view/visual-html/grapes-like/styleMapper.ts \
  src/components/right-pane/view/visual-html/grapes-like/style/styleMapper.test.mjs
git commit -m "fix: preserve visual html longhand style writes"
```

Expected: Commit succeeds.

## Task 6: Save/Reopen Source Round-Trip Coverage

**Files:**
- Modify: `src/components/right-pane/view/visual-html/htmlDocumentTransforms.test.mjs`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.test.mjs`

- [ ] **Step 1: Add save/reopen regression test**

Append to `htmlDocumentTransforms.test.mjs`:

```js
test('buildSavedHtmlPreservingHead round-trips editable inline style source after canvas css inline', () => {
  const source = `<!doctype html>
<html>
<head><style>.form-label{display:block}</style></head>
<body><label id="i1r48" class="form-label">Email address</label></body>
</html>`;

  const html = buildSavedHtmlPreservingHead({
    sourceHtml: source,
    bodyHtml: '<label id="i1r48" class="form-label">Email address</label>',
    canvasCss: '#i1r48{font-size:21px;color:#ffffff;width:251.46px;height:131.33px;padding-right:96px;background-color:#b02121;}',
  });

  assert.match(html, /id="i1r48"[^>]+style="font-size: 21px; color: #ffffff; width: 251.46px; height: 131.33px; padding-right: 96px; background-color: #b02121;"/);
  assert.doesNotMatch(html, /#i1r48\{/);
});
```

- [ ] **Step 2: Add bridge reopen-like inline source test**

In `createGrapesLikeInspectorBridge.test.mjs`, ensure `createGrapesLikeInspectorBridge prefers DOM inline styles for editable style echo` asserts all of these:

```js
assert.equal(width.value.resolved.source, 'inline');
assert.equal(height.value.resolved.source, 'inline');
assert.equal(fontSize.value.resolved.source, 'inline');
assert.equal(padding.value.resolved.source, 'inline');
assert.equal(color.value.resolved.source, 'inline');
assert.equal(backgroundColor.value.resolved.source, 'inline');
```

If already present from Task 3, do not duplicate the test.

- [ ] **Step 3: Run save and bridge tests**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test \
  src/components/right-pane/view/visual-html/htmlDocumentTransforms.test.mjs \
  src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Commit round-trip coverage**

Run:

```bash
git add src/components/right-pane/view/visual-html/htmlDocumentTransforms.test.mjs \
  src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.test.mjs
git commit -m "test: cover visual html style source round trip"
```

Expected: Commit succeeds.

## Task 7: Combined Verification

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run focused combined tests**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test \
  src/components/right-pane/view/visual-html/grapes-like/style/styleAdapter.test.mjs \
  src/components/right-pane/view/visual-html/grapes-like/style/styleMapper.test.mjs \
  src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.test.mjs \
  src/components/right-pane/view/visual-html/grapes-like/style/fields/NumberField.test.mjs \
  src/components/right-pane/view/visual-html/htmlDocumentTransforms.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript check**

Run:

```bash
npm run typecheck
```

Expected: PASS, or fail only on unrelated pre-existing errors. If it fails, capture exact errors and fix any caused by this work.

- [ ] **Step 3: Run diff checks**

Run:

```bash
git diff --check
git status -sb
```

Expected: no whitespace errors. `git status -sb` should show no uncommitted files after the last task commit.

- [ ] **Step 4: Record full test caveat**

If `npm test` is run, note that at the time of this plan the repository had unrelated full-suite failures in file-tree/sidebar string assertion tests. Do not modify those unrelated files unless the failures are newly caused by this work.

## Self-Review

Spec coverage:

- Every property has source metadata: Task 1 and Task 2.
- Computed, inline, model, rule records: Task 2 and Task 3.
- UI compatibility through legacy committed values: Task 2.
- Inline default write target: Task 3 and existing `targetKind = inline` behavior.
- Blank numeric drafts do not delete styles: Task 4.
- Longhand spacing/radius preservation: Task 5.
- Save/reopen round trip: Task 6.
- Focused verification: Task 7.

Placeholder scan:

- No placeholder markers are intentionally present.
- All code-changing steps include concrete code snippets or exact replacement blocks.

Type consistency:

- `StyleValueSource`, `StyleValueOrigin`, and `ResolvedStylePropertyValue` are defined in Task 1 and referenced consistently later.
- `value.resolved` is optional on `StyleValueState<TValue>` so existing UI code can continue compiling.
- `legacyCommitted` is the value assigned to existing `committed` fields.
