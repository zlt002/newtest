# Grapes-like 样式分组与投影支持 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the Grapes-like style inspector so `background / border / shadow / opacity` live under `外观`, `transition / transform` live under `高级`, and `box-shadow` becomes editable end-to-end.

**Architecture:** Keep the existing Grapes-like adapter/snapshot/mapper flow intact. The work is a focused schema and field expansion: update the normalized style model, teach the adapter to read the new CSS properties, add a simple text field for raw shadow editing, then update the mapper so writes round-trip back into GrapesJS. Classic inspector behavior stays untouched.

**Tech Stack:** React 18, TypeScript, GrapesJS, node:test, Tailwind CSS

---

## File Structure

### Create

- `src/components/right-pane/view/visual-html/grapes-like/style/fields/TextField.tsx`
  - A compact raw string input for properties that do not need a specialized control, starting with `box-shadow`.

### Modify

- `src/components/right-pane/view/visual-html/grapes-like/types.ts`
  - Rename the style group model from `decorations` to `appearance`.
  - Add `boxShadow`, `transition`, and `transform` to the normalized style state and patch types.
  - Add `appearance` to `StyleSectorKey` and `STYLE_SECTORS`.
  - Extend `StylePropertyKind` so the shadow field can render as a plain text input.
- `src/components/right-pane/view/visual-html/grapes-like/styleAdapter.ts`
  - Rebuild the style schema so the sectors are `布局 / 弹性布局 / 间距 / 文本 / 外观 / 高级`.
  - Move `opacity` into `appearance`.
  - Add `boxShadow` under `appearance`.
  - Add `transition` and `transform` under `advanced`.
- `src/components/right-pane/view/visual-html/grapes-like/styleMapper.ts`
  - Round-trip `box-shadow`, `opacity`, `transition`, and `transform`.
  - Update `StyleState` and `StyleStatePatch` handling to the new group names.
- `src/components/right-pane/view/visual-html/grapes-like/style/GrapesLikeProperty.tsx`
  - Render the new raw text field for `boxShadow`.
  - Keep existing number/select/radio/composite controls unchanged.
- `src/components/right-pane/view/visual-html/grapes-like/style/GrapesLikeStyleManager.test.mjs`
  - Verify the new groups and the new shadow field are present in the rendered snapshot.
- `src/components/right-pane/view/visual-html/grapes-like/style/styleAdapter.test.mjs`
  - Verify `appearance` and `advanced` are populated with the new fields.
- `src/components/right-pane/view/visual-html/grapes-like/style/styleMapper.test.mjs`
  - Verify `box-shadow`, `opacity`, `transition`, and `transform` write back correctly.

## Task 1: Move the normalized style model to `appearance / advanced`

**Files:**
- Modify: `src/components/right-pane/view/visual-html/grapes-like/types.ts`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/styleAdapter.ts`
- Test: `src/components/right-pane/view/visual-html/grapes-like/style/styleAdapter.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('readStyleSnapshot groups appearance and advanced fields for shadow opacity transition and transform', () => {
  const result = readStyleSnapshot({
    selection: [
      {
        styles: {
          'background-color': '#ffffff',
          border: '1px solid #111111',
          'box-shadow': '0 12px 24px rgba(0, 0, 0, 0.18)',
          opacity: '0.5',
          transition: 'all 200ms ease',
          transform: 'translateY(4px)',
        },
        classes: [],
      },
    ],
    activeState: '',
  });

  const appearance = result.sectors.find((sector) => sector.key === 'appearance');
  const advanced = result.sectors.find((sector) => sector.key === 'advanced');

  assert.ok(appearance?.properties.find((property) => property.property === 'backgroundColor'));
  assert.ok(appearance?.properties.find((property) => property.property === 'border'));
  assert.ok(appearance?.properties.find((property) => property.property === 'boxShadow'));
  assert.ok(appearance?.properties.find((property) => property.property === 'opacity'));
  assert.ok(advanced?.properties.find((property) => property.property === 'transition'));
  assert.ok(advanced?.properties.find((property) => property.property === 'transform'));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/components/right-pane/view/visual-html/grapes-like/style/styleAdapter.test.mjs`

Expected: FAIL because `appearance` does not exist yet and `boxShadow / transition / transform` are not mapped.

- [ ] **Step 3: Implement the minimal schema and type changes**

```ts
export type StyleSectorKey = 'layout' | 'flex' | 'spacing' | 'text' | 'appearance' | 'advanced';

export type StyleState = {
  layout: {
    display: UnitValue;
    float: UnitValue;
    position: UnitValue;
    inset: BoxValue;
    zIndex: UnitValue;
    width: UnitValue;
    height: UnitValue;
    maxWidth: UnitValue;
    minHeight: UnitValue;
  };
  flex: {
    flexDirection: UnitValue;
    flexWrap: UnitValue;
    justifyContent: UnitValue;
    alignItems: UnitValue;
    alignContent: UnitValue;
    order: UnitValue;
    flexBasis: UnitValue;
    flexGrow: UnitValue;
    flexShrink: UnitValue;
    alignSelf: UnitValue;
  };
  spacing: {
    margin: BoxValue;
    padding: BoxValue;
  };
  text: {
    color: UnitValue;
    fontFamily: UnitValue;
    fontSize: UnitValue;
    fontWeight: UnitValue;
    letterSpacing: UnitValue;
    lineHeight: UnitValue;
    textAlign: UnitValue;
  };
  appearance: {
    backgroundColor: UnitValue;
    border: BorderValue;
    borderRadius: RadiusValue;
    boxShadow: UnitValue;
    opacity: UnitValue;
  };
  advanced: {
    transition: UnitValue;
    transform: UnitValue;
    perspective: UnitValue;
  };
};
```

```ts
const STYLE_SCHEMA = [
  /* layout, flex, spacing, text stay the same */
  {
    key: 'appearance',
    title: '外观',
    properties: [
      { property: 'backgroundColor', label: '背景色', kind: 'color', placeholder: '#ffffff' },
      { property: 'border', label: '边框', kind: 'composite' },
      { property: 'borderRadius', label: '圆角', kind: 'composite' },
      { property: 'boxShadow', label: '投影', kind: 'text', placeholder: '0 12px 24px rgba(0, 0, 0, 0.18)' },
      { property: 'opacity', label: '透明度', kind: 'number' },
    ],
  },
  {
    key: 'advanced',
    title: '高级',
    properties: [
      { property: 'transition', label: '过渡', kind: 'text', placeholder: 'all 200ms ease' },
      { property: 'transform', label: '变换', kind: 'text', placeholder: 'translateY(4px)' },
      { property: 'perspective', label: '透视', kind: 'number', units: ['px'] },
    ],
  },
] as const;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test src/components/right-pane/view/visual-html/grapes-like/style/styleAdapter.test.mjs`

Expected: PASS, and the snapshot should now expose `appearance` and the new advanced fields.

- [ ] **Step 5: Commit**

```bash
git add src/components/right-pane/view/visual-html/grapes-like/types.ts src/components/right-pane/view/visual-html/grapes-like/styleAdapter.ts src/components/right-pane/view/visual-html/grapes-like/style/styleAdapter.test.mjs
git commit -m "feat: regroup grapes-like style sectors"
```

## Task 2: Add a raw text field for shadow and effect-style properties

**Files:**
- Create: `src/components/right-pane/view/visual-html/grapes-like/style/fields/TextField.tsx`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/style/GrapesLikeProperty.tsx`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/styleAdapter.ts`
- Test: `src/components/right-pane/view/visual-html/grapes-like/style/GrapesLikeStyleManager.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('GrapesLikeProperty renders boxShadow as a raw text field', () => {
  const property = {
    property: 'boxShadow',
    label: '投影',
    kind: 'text',
    value: {
      committed: '0 12px 24px rgba(0, 0, 0, 0.18)',
      mixed: false,
      disabled: false,
    },
    placeholder: '0 12px 24px rgba(0, 0, 0, 0.18)',
  };

  const tree = render(React.createElement(GrapesLikeProperty, { property, onCommit: () => {} }));

  assert.match(tree.container.textContent, /投影/);
  assert.match(tree.container.textContent, /0 12px 24px/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/components/right-pane/view/visual-html/grapes-like/style/GrapesLikeStyleManager.test.mjs`

Expected: FAIL because `kind: 'text'` is not handled yet.

- [ ] **Step 3: Implement the minimal field and property rendering**

```tsx
// src/components/right-pane/view/visual-html/grapes-like/style/fields/TextField.tsx
export default function TextField({
  label,
  value,
  placeholder,
  mixed = false,
  disabled = false,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder?: string;
  mixed?: boolean;
  disabled?: boolean;
  onCommit: (value: string) => void;
}) {
  return (
    <label className="gl-field flex w-full min-w-0 flex-1 flex-col gap-0.5 rounded-md text-foreground">
      <span className="text-[10px] font-medium leading-4 text-muted-foreground">{label}</span>
      <input
        aria-label={label}
        className="gl-input h-8 w-full min-w-0 rounded-md border border-border bg-background px-1.5 py-0 text-xs leading-4 text-foreground outline-none transition-colors hover:bg-accent focus:bg-accent"
        placeholder={mixed ? '混合' : placeholder}
        value={value}
        disabled={disabled}
        onChange={(event) => onCommit(event.target.value)}
      />
    </label>
  );
}
```

```tsx
// GrapesLikeProperty.tsx
if (property.kind === 'text') {
  return (
    <div data-style-property={property.property} className={getPropertyLayoutClass(property)}>
      <TextField
        label={property.label}
        value={readScalarValue(property.value.committed)}
        placeholder={property.placeholder}
        mixed={property.value.mixed}
        disabled={property.value.disabled}
        onCommit={onCommit}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test src/components/right-pane/view/visual-html/grapes-like/style/GrapesLikeStyleManager.test.mjs`

Expected: PASS, and `boxShadow` should render as a compact raw text input.

- [ ] **Step 5: Commit**

```bash
git add src/components/right-pane/view/visual-html/grapes-like/style/fields/TextField.tsx src/components/right-pane/view/visual-html/grapes-like/style/GrapesLikeProperty.tsx src/components/right-pane/view/visual-html/grapes-like/styleAdapter.ts src/components/right-pane/view/visual-html/grapes-like/style/GrapesLikeStyleManager.test.mjs
git commit -m "feat: add grapes-like shadow text field"
```

## Task 3: Round-trip `box-shadow`, `opacity`, `transition`, and `transform`

**Files:**
- Modify: `src/components/right-pane/view/visual-html/grapes-like/styleMapper.ts`
- Modify: `src/components/right-pane/view/visual-html/grapes-like/style/styleMapper.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('applyStylePatch writes appearance and advanced fields back to CSS properties', () => {
  const next = applyStylePatch(
    {},
    {
      appearance: {
        backgroundColor: { value: '#ffffff', unit: '' },
        border: { top: '1', right: '1', bottom: '1', left: '1', unit: 'px', style: 'solid', color: '#111111' },
        borderRadius: { topLeft: '8', topRight: '8', bottomRight: '8', bottomLeft: '8', unit: 'px' },
        boxShadow: { value: '0 12px 24px rgba(0, 0, 0, 0.18)', unit: '' },
        opacity: { value: '0.5', unit: '' },
      },
      advanced: {
        transition: { value: 'all 200ms ease', unit: '' },
        transform: { value: 'translateY(4px)', unit: '' },
        perspective: { value: '800', unit: 'px' },
      },
    },
  );

  assert.equal(next['background-color'], '#ffffff');
  assert.equal(next.border, '1px solid #111111');
  assert.equal(next['border-radius'], '8px 8px 8px 8px');
  assert.equal(next['box-shadow'], '0 12px 24px rgba(0, 0, 0, 0.18)');
  assert.equal(next.opacity, '0.5');
  assert.equal(next.transition, 'all 200ms ease');
  assert.equal(next.transform, 'translateY(4px)');
  assert.equal(next.perspective, '800px');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/components/right-pane/view/visual-html/grapes-like/style/styleMapper.test.mjs`

Expected: FAIL because `appearance` does not round-trip `box-shadow` yet and `transition / transform` are not mapped.

- [ ] **Step 3: Implement the minimal writeback mapping**

```ts
appendUnitValue('background-color', state.appearance.backgroundColor);
appendBorderValue('border', state.appearance.border);
appendRadiusValue('border-radius', state.appearance.borderRadius);
setStyleValue(nextStyle, 'box-shadow', String(state.appearance.boxShadow.value ?? '').trim());
appendUnitValue('opacity', state.appearance.opacity);

appendUnitValue('transition', state.advanced.transition);
appendUnitValue('transform', state.advanced.transform);
appendUnitValue('perspective', state.advanced.perspective);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test src/components/right-pane/view/visual-html/grapes-like/style/styleMapper.test.mjs`

Expected: PASS, with `box-shadow`, `opacity`, `transition`, `transform`, and `perspective` all round-tripping correctly.

- [ ] **Step 5: Commit**

```bash
git add src/components/right-pane/view/visual-html/grapes-like/styleMapper.ts src/components/right-pane/view/visual-html/grapes-like/style/styleMapper.test.mjs
git commit -m "feat: round-trip grapes-like appearance styles"
```

## Task 4: Verify the rendered style inspector reflects the new grouping

**Files:**
- Modify: `src/components/right-pane/view/visual-html/grapes-like/style/GrapesLikeStyleManager.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('GrapesLikeStyleManager renders appearance before advanced and keeps shadow inside appearance', () => {
  const tree = render(
    React.createElement(GrapesLikeStyleManager, {
      selection: { selectedIds: ['cmp-1'], primarySelectedId: 'cmp-1', selectedLabel: 'button', isMultiSelection: false, isDetached: false },
      selector: { availableStates: [], activeState: '', commonClasses: [], canAddClass: false, canRemoveClass: false, canSyncStyle: false },
      style: {
        targetKind: 'inline',
        hasMixedValues: false,
        editable: true,
        sectors: [
          { key: 'appearance', title: '外观', properties: [{ property: 'boxShadow', label: '投影', kind: 'text', value: { committed: '0 12px 24px rgba(0, 0, 0, 0.18)', mixed: false, disabled: false }, placeholder: '' }] },
          { key: 'advanced', title: '高级', properties: [{ property: 'transition', label: '过渡', kind: 'text', value: { committed: 'all 200ms ease', mixed: false, disabled: false }, placeholder: '' }] },
        ],
      },
      actions: {
        selector: { addClass() {}, removeClass() {}, setState() {} },
        updateStyle() {},
      },
    }),
  );

  assert.match(tree.container.textContent, /外观/);
  assert.match(tree.container.textContent, /高级/);
  assert.match(tree.container.textContent, /投影/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/components/right-pane/view/visual-html/grapes-like/style/GrapesLikeStyleManager.test.mjs`

Expected: FAIL until the style snapshot and property rendering have been updated in Tasks 1 and 2.

- [ ] **Step 3: Align the snapshot-driven rendering**

```tsx
<GrapesLikeStyleManager
  selection={snapshot.selection}
  selector={snapshot.selector}
  style={snapshot.style}
  actions={{
    selector: actions.selector,
    updateStyle: actions.style.updateStyle,
  }}
/>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test src/components/right-pane/view/visual-html/grapes-like/style/GrapesLikeStyleManager.test.mjs`

Expected: PASS, with `外观` and `高级` appearing in the expected order.

- [ ] **Step 5: Commit**

```bash
git add src/components/right-pane/view/visual-html/grapes-like/style/GrapesLikeStyleManager.test.mjs
git commit -m "test: verify grapes-like style grouping"
```

## Final Verification

Run all focused checks together:

```bash
node --test \
  src/components/right-pane/view/visual-html/grapes-like/style/styleAdapter.test.mjs \
  src/components/right-pane/view/visual-html/grapes-like/style/styleMapper.test.mjs \
  src/components/right-pane/view/visual-html/grapes-like/style/GrapesLikeStyleManager.test.mjs
```

Expected: PASS.

## Coverage Check

- `外观` group with `background / border / shadow / opacity`: covered by Tasks 1, 2, and 4.
- `高级` group with `transition / transform`: covered by Tasks 1 and 3.
- End-to-end `box-shadow` editing: covered by Tasks 2 and 3.
- Classic inspector untouched: preserved by scope; no files under `visual-html/inspector/` are modified.
