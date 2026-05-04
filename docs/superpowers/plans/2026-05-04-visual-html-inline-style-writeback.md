# Visual HTML Inline Style Writeback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Visual HTML Grapes-like style inspector default all right-panel style writes to inline component styles instead of automatically writing class/rule styles.

**Architecture:** Keep the existing Grapes-like inspector snapshot and mapper flow. Change only the snapshot target selection default in `styleAdapter.ts`, update tests that encoded automatic rule selection, and preserve lower-level rule routing tests for a later explicit rule mode.

**Tech Stack:** React 18, TypeScript, GrapesJS, Node test runner with `--experimental-strip-types`.

---

## File Structure

- Modify: `src/components/right-pane/view/visual-html/grapes-like/styleAdapter.ts`
  - Responsibility: normalize Grapes-like style inspector snapshots, including the default style writeback target.
- Modify: `src/components/right-pane/view/visual-html/grapes-like/style/styleAdapter.test.mjs`
  - Responsibility: unit coverage for style snapshot defaults and style parsing.
- Modify: `src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.test.mjs`
  - Responsibility: integration-ish coverage for the bridge snapshot and writeback action routing.
- Keep unchanged: `src/components/right-pane/view/visual-html/grapes-like/styleMapper.ts`
  - Responsibility: route explicit `rule` or `inline` style updates. Rule support stays available.
- Keep unchanged: `src/components/right-pane/view/visual-html/grapes-like/style/styleMapper.test.mjs`
  - Responsibility: preserve proof that explicit rule writes still route correctly.

## Task 1: Update Style Snapshot Tests For Inline Default

**Files:**
- Modify: `src/components/right-pane/view/visual-html/grapes-like/style/styleAdapter.test.mjs`

- [ ] **Step 1: Update the existing mixed-value test expectation**

In `src/components/right-pane/view/visual-html/grapes-like/style/styleAdapter.test.mjs`, rename the first test and change the final target assertion.

```js
test('readStyleSnapshot marks mixed values and defaults class selections to inline target', () => {
  const result = readStyleSnapshot({
    selection: [
      { styles: { width: '100px', color: '#111111', 'background-color': '#eeeeee' }, classes: ['btn'] },
      { styles: { width: '120px', color: '#222222', 'background-color': '#ffffff' }, classes: ['btn'] },
    ],
    activeState: '',
  });

  const layout = result.sectors.find((sector) => sector.key === 'layout');
  const text = result.sectors.find((sector) => sector.key === 'text');
  const appearance = result.sectors.find((sector) => sector.key === 'appearance');
  const width = layout?.properties.find((property) => property.property === 'width');
  const color = text?.properties.find((property) => property.property === 'color');
  const backgroundColor = appearance?.properties.find((property) => property.property === 'backgroundColor');

  assert.equal(width?.value.mixed, true);
  assert.deepEqual(width?.value.committed, { value: '', unit: '' });
  assert.equal(color?.value.mixed, true);
  assert.deepEqual(color?.value.committed, { value: '', unit: '' });
  assert.equal(backgroundColor?.value.mixed, true);
  assert.deepEqual(backgroundColor?.value.committed, { value: '', unit: '' });
  assert.equal(result.targetKind, 'inline');
});
```

- [ ] **Step 2: Add a Framer-like generated class protection test**

Append this test near the first snapshot test in the same file.

```js
test('readStyleSnapshot keeps Framer-like generated classes on inline target', () => {
  const result = readStyleSnapshot({
    selection: [
      {
        styles: {
          display: 'flex',
          width: '100%',
        },
        classes: ['framer-cgiad', 'framer-1t7cri2'],
      },
    ],
    activeState: '',
  });

  assert.equal(result.targetKind, 'inline');
});
```

- [ ] **Step 3: Run the focused style adapter test and verify it fails**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/grapes-like/style/styleAdapter.test.mjs
```

Expected: FAIL before implementation, with an assertion showing actual `rule` where expected `inline`.

## Task 2: Change Default Style Target To Inline

**Files:**
- Modify: `src/components/right-pane/view/visual-html/grapes-like/styleAdapter.ts`

- [ ] **Step 1: Replace automatic rule target inference**

In `readStyleSnapshot`, replace the current `targetKind` block:

```ts
  const targetKind = selected.length > 0
    && selected.every((entry) => {
      const classes = Array.isArray(entry.classes)
        ? entry.classes
        : String(entry.classes ?? '').split(/\s+/).filter(Boolean);
      return classes.length > 0;
    })
    && !source?.activeState
    ? 'rule'
    : 'inline';
```

with:

```ts
  const targetKind = 'inline';
```

This intentionally leaves `source.activeState` and `selection.classes` in the function signature for future explicit rule mode support.

- [ ] **Step 2: Run the focused style adapter test and verify it passes**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/grapes-like/style/styleAdapter.test.mjs
```

Expected: PASS.

## Task 3: Update Bridge Tests For Inline Snapshot Default

**Files:**
- Modify: `src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.test.mjs`

- [ ] **Step 1: Update the rule-target read test name and snapshot assertion**

Find the test named:

```js
test('createGrapesLikeInspectorBridge reads style values from editor.getSelectedToStyle when classes map to a rule target', () => {
```

Rename it to:

```js
test('createGrapesLikeInspectorBridge reads selected style target values while defaulting snapshot writes to inline', () => {
```

Inside that test, keep the value assertions and change:

```js
assert.equal(snapshot.style.targetKind, 'rule');
```

to:

```js
assert.equal(snapshot.style.targetKind, 'inline');
```

- [ ] **Step 2: Update the explicit rule write test to assert rule state without expecting rule snapshot default**

Find the test named:

```js
test('createGrapesLikeInspectorBridge keeps writing rule styles to the same selected style target', () => {
```

Keep the two explicit writes:

```js
bridge.actions.style.updateStyle({ property: 'position', value: 'absolute', targetKind: 'rule' });
bridge.actions.style.updateStyle({ property: 'top', value: '12px', targetKind: 'rule' });
```

Change the final target assertion from:

```js
assert.equal(snapshot.style.targetKind, 'rule');
```

to:

```js
assert.equal(snapshot.style.targetKind, 'inline');
```

Keep these assertions:

```js
assert.equal(positionProperty.value.committed.value, 'absolute');
assert.equal(ruleState.top, '12px');
```

They prove explicit rule writes still work even though the default snapshot target is inline.

- [ ] **Step 3: Run the focused bridge test and verify it passes**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.test.mjs
```

Expected: PASS.

## Task 4: Preserve Mapper Rule Routing Coverage

**Files:**
- Test: `src/components/right-pane/view/visual-html/grapes-like/style/styleMapper.test.mjs`

- [ ] **Step 1: Run the focused mapper test without changing it**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/grapes-like/style/styleMapper.test.mjs
```

Expected: PASS.

This confirms explicit `targetKind: 'rule'` still routes to `updateRuleStyle` for future advanced rule mode.

## Task 5: Run Combined Verification And Commit

**Files:**
- Modify: `src/components/right-pane/view/visual-html/grapes-like/styleAdapter.ts`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/style/styleAdapter.test.mjs`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.test.mjs`

- [ ] **Step 1: Run all affected tests together**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test \
  src/components/right-pane/view/visual-html/grapes-like/style/styleAdapter.test.mjs \
  src/components/right-pane/view/visual-html/grapes-like/style/styleMapper.test.mjs \
  src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Check the diff**

Run:

```bash
git diff -- src/components/right-pane/view/visual-html/grapes-like/styleAdapter.ts src/components/right-pane/view/visual-html/grapes-like/style/styleAdapter.test.mjs src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.test.mjs
```

Expected: Diff only changes the default target behavior and matching test expectations.

- [ ] **Step 3: Commit the implementation**

Run:

```bash
git add src/components/right-pane/view/visual-html/grapes-like/styleAdapter.ts \
  src/components/right-pane/view/visual-html/grapes-like/style/styleAdapter.test.mjs \
  src/components/right-pane/view/visual-html/grapes-like/createGrapesLikeInspectorBridge.test.mjs
git commit -m "fix: default visual html style writes to inline"
```

Expected: Commit succeeds.

## Self-Review

Spec coverage:

- Default inspector writes become inline: Task 2.
- Existing rule route remains available: Task 4.
- Tests updated for class-heavy pages and Framer-like generated classes: Task 1 and Task 3.
- Import and save architecture remain untouched: no task modifies `VisualCanvasPane.tsx` or `htmlDocumentTransforms.ts`.

Placeholder scan:

- No TBD/TODO placeholders are intentionally present.

Type consistency:

- `StyleSnapshot.targetKind` remains `'rule' | 'inline'`.
- `styleMapper.updateStyle` still accepts explicit `targetKind`.
- `GrapesLikeStyleManager` continues passing the snapshot target through unchanged.
