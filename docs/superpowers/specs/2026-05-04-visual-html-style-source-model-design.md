# Visual HTML Style Source Model Design

## Goal

Make the Visual HTML design-mode inspector reliable for captured pages by separating style values into display values and authored/writable values across every style property.

The current inspector merges computed styles, DOM inline styles, and GrapesJS model/style-target styles into one `committed` value. That makes the panel appear useful, but it loses source information. A value may be displayed because the browser computed it, because it was authored inline, because GrapesJS stored it on a component, or because a rule target provided it. When the user edits that value, the writeback path cannot tell whether it is modifying authored source or freezing a computed/default value into the document.

This design replaces the single-value style model with a unified source-aware model while preserving compatibility with the existing UI during migration.

## Non-Goals

- Do not introduce a pure runtime overlay editor.
- Do not switch the default write target back to class/rule styles.
- Do not build a full CSS cascade editor in this phase.
- Do not make complex selector/rule editing a first-class UI feature yet.
- Do not change import cleaning behavior.

## Current Problems

1. The inspector has one `committed` value per property, but no source metadata.
2. Computed values can be shown and then accidentally written as inline styles.
3. DOM inline values are now read, but they are still flattened into the same value as computed/model values.
4. Empty GrapesJS style-target values can hide real DOM/computed values unless manually filtered.
5. Composite properties such as margin, padding, border, and border radius can rewrite longhand source into shorthand.
6. Clearing a numeric input can delete a style immediately.
7. Some fields commit on every change while others commit on blur, creating inconsistent write behavior.
8. Save-time normalization can preserve the final visual result, but it cannot recover source intent lost during inspector writeback.

## Design Principles

- All style properties must pass through one source-aware model.
- The UI may keep using a legacy value during migration, but that value must be derived from the source-aware model.
- Displaying a computed value must not imply that the value is authored or safe to write back unchanged.
- User edits should write to the selected element inline by default.
- Existing authored longhand declarations should be preserved where possible.
- Rule writing remains available internally for future explicit advanced mode, but it is not the default.

## Source Model

Add source metadata for every property in every sector.

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

Field meaning:

- `computed`: browser-computed value from `getComputedStyle`.
- `authored`: the strongest editable authored value from DOM inline style or Grapes model style.
- `display`: value shown in the panel.
- `source`: the source that won the display decision.
- `writable`: whether an edit should write to the selected element by default.
- `legacyCommitted`: temporary bridge for current UI components.

Source priority:

1. `inline`: `element.style`.
2. `model`: Grapes component/model style.
3. `rule`: explicit rule style target, only when explicitly requested in future rule mode.
4. `computed`: `getComputedStyle`.
5. `default`: inspector fallback default.

For default design mode, rule values may be read for context only when GrapesJS exposes them, but they must not become the default write target.

## Data Flow

### Read

For each selected component:

1. Read computed record from `getComputedStyle(element)`.
2. Read DOM inline declaration record from `element.style`.
3. Read Grapes component/model style record.
4. Optionally read Grapes selected style target record as `rule` metadata.
5. Convert each record into `StyleState`.
6. Resolve each property into `ResolvedStylePropertyValue`.

Resolution rules:

- If an authored inline/model value exists, display it and mark source as `inline` or `model`.
- Else if a computed value exists, display it and mark source as `computed`.
- Else display the default value and mark source as `default`.
- For multi-selection, if display values differ, mark source as `mixed` and keep the empty legacy committed value.
- Empty strings from authored records are treated as absent, not as values.

### UI Compatibility

Existing fields continue to receive `property.value.committed` for now.

During migration:

```ts
property.value.committed = resolved.legacyCommitted;
property.value.resolved = resolved;
```

This lets every property use the new model immediately without requiring all field components to be rewritten in the same commit.

### Write

All normal design-mode edits write to inline style on the selected component.

Writeback receives:

```ts
{
  property,
  value,
  targetKind: 'inline',
  source,
  authoredValue,
}
```

Rules:

- If the user edits a computed/default display value, write the new value inline.
- If the user edits an inline/model authored value, write the new value inline.
- Empty values should not delete authored styles by default from ordinary text entry. Deletion should be a separate explicit clear action.
- Rule writeback remains supported only when a future advanced UI explicitly passes `targetKind: 'rule'`.

## Composite Writeback

Composite properties need source-preserving behavior.

### Margin and Padding

Read should track whether values came from shorthand or longhand.

Write rules:

- If the user edits one side and existing authored style used longhand, update that longhand side.
- If existing authored style used shorthand and the user edits all sides uniformly, keep shorthand.
- If existing authored style used shorthand but the user edits one side, expand to longhand only when necessary.
- Do not delete unrelated longhand declarations unless replacing them intentionally.

### Inset

Use the same source-preserving approach as margin/padding for `top/right/bottom/left` versus `inset`.

### Border and Radius

First-phase handling:

- Preserve existing longhand radius properties when present.
- Preserve existing border side declarations when present.
- Only write shorthand for simple uniform values.

Complex per-side border editing can remain limited, but it must not silently erase unrelated authored border declarations.

## Save Behavior

The existing save transformation should remain:

- Editable element `#id` canvas rules are inlined into `style=""`.
- Non-editable source runtime nodes can keep managed canvas CSS.
- Orphan/runtime selectors are dropped where appropriate.

The new source model reduces how often save-time cleanup has to repair GrapesJS output. Save remains a safety net, not the primary source of truth.

## UI Behavior

Initial UI changes should be conservative.

- Show computed/default values in the same inputs so the page is inspectable.
- Add source metadata to the property view model so future UI can show badges such as `计算值`, `内联`, or `默认`.
- Do not block editing computed values; writing them inline is acceptable once the user intentionally changes them.
- Avoid immediate delete on empty numeric fields. Treat blank as a draft until explicit clear behavior exists.

## Testing Strategy

Add a style-source test matrix.

Read tests:

- Inline value wins over computed.
- Model value wins over computed when no inline value exists.
- Empty model value does not hide inline or computed.
- Computed-only values display but source is `computed`.
- Defaults display with source `default`.
- Mixed selections mark source `mixed`.

Write tests:

- Editing computed-only width writes inline width.
- Editing inline font size updates inline font size.
- Clearing a number input does not delete until explicit clear path is used.
- Padding-right authored as longhand stays longhand after right-side edit.
- Padding shorthand only expands when a side-specific edit requires it.
- Border-radius longhand is preserved when present.

Save/reopen tests:

- Inline-authored values round-trip through save and reopen.
- Canvas `#id` editable rules inline into body and then read back as inline source.
- Computed-only values do not get written on save without user edit.

## Rollout Plan

Although the architecture should be implemented in one coherent pass, the commits should be small:

1. Add source-aware types and resolver for all style properties while preserving legacy committed values.
2. Update bridge read flow to produce computed, inline, model, and optional rule records.
3. Update inspector UI to consume legacy committed values from the resolved model and expose source metadata.
4. Update writeback to use source-aware inline writing and stop accidental deletion on blank drafts.
5. Update composite writeback to preserve longhand/shorthand intent where possible.
6. Add save/reopen and source matrix regression tests.

## Acceptance Criteria

- Every style property has source metadata.
- Existing UI still renders without a broad visual rewrite.
- Inline `style=""` values for common layout, spacing, text, and appearance fields reliably echo in the inspector.
- Computed-only values can display but are not treated as authored values.
- User edits write inline by default.
- Empty numeric drafts do not immediately delete authored values.
- Margin/padding writeback preserves existing longhand where possible.
- Existing focused tests pass.
- New source matrix tests cover read, write, and save/reopen behavior.
