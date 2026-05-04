# Visual HTML Inline Style Writeback Design

## Background

The Visual HTML editor currently uses a custom Grapes-like inspector instead of GrapesJS native manager views. The style panel reads a normalized snapshot from GrapesJS selection state and writes changes back through mapper functions.

The current style target selection is too eager for captured pages. `readStyleSnapshot` returns `targetKind: 'rule'` when every selected component has at least one class and no active selector state is selected. Framer and WebScrapBook pages usually give almost every node generated classes such as `framer-*`, so ordinary style edits can be routed to CSS rule targets. That makes a local-looking edit capable of affecting broader generated class rules or adding managed canvas CSS that fights the original page style system.

This design keeps the pure GrapesJS design path, but changes the first preservation step: style edits from the right panel default to inline writes.

## Goal

- Reduce the chance that a right-panel style edit damages imported Framer/WebScrapBook pages.
- Keep the existing Grapes-like inspector UI and mapper architecture.
- Preserve the existing rule writeback code path for a later explicit "rule style" mode.
- Make the first implementation small enough to ship and verify without changing import or save architecture.

## Non-Goals

- Do not redesign HTML import in `VisualCanvasPane`.
- Do not change `buildSavedHtmlPreservingHead` or managed canvas CSS merging.
- Do not remove rule writeback support from `styleMapper` or `createGrapesLikeInspectorBridge`.
- Do not add a visible rule/inline target switch in this phase.
- Do not solve all computed-style versus authored-style ambiguity in this phase.

## Recommended Approach

Use a conservative default:

```ts
StyleSnapshot.targetKind = 'inline'
```

The style panel continues to read the selected component's computed style plus GrapesJS style target state so controls remain populated. The writeback target, however, is inline unless a future explicit rule mode says otherwise.

The rule path remains available internally:

- `styleMapper.updateStyle` still routes `targetKind: 'rule'` to `updateRuleStyle`.
- `createGrapesLikeInspectorBridge` still exposes `updateRuleStyle`.
- Tests keep coverage for rule routing as a supported lower-level capability.

The behavior change is only that `readStyleSnapshot` no longer infers `rule` automatically from the presence of classes.

## Affected Modules

### `styleAdapter.ts`

Current behavior:

- Computes `targetKind` as `rule` when all selected entries have classes and no active selector state exists.

New behavior:

- Always returns `targetKind: 'inline'` for the default inspector snapshot.
- Leaves the `StyleSnapshot` type unchanged.
- Keeps active state, mixed values, and sector visibility behavior unchanged.

### `GrapesLikeStyleManager.tsx`

Current behavior:

- Sends `style.targetKind` back with every update.

New behavior:

- No behavior change required if `style.targetKind` is always inline.
- Keep the prop path intact so a future explicit rule mode can pass `rule`.

### `createGrapesLikeInspectorBridge.ts`

Current behavior:

- Reads computed style, combines it with GrapesJS style target state, and exposes both inline and rule write helpers.

New behavior:

- No functional change required for first phase.
- Existing rule helpers stay available but are no longer automatically selected by `readStyleSnapshot`.

### Tests

Update tests that currently encode automatic rule selection:

- `styleAdapter.test.mjs`: class-based selections should now produce `targetKind: 'inline'`.
- `createGrapesLikeInspectorBridge.test.mjs`: tests that expect automatic rule target snapshots should be rewritten to verify inline default, while preserving separate lower-level rule writeback tests.
- `styleMapper.test.mjs`: keep rule/inline routing coverage unchanged, because the rule pathway remains valid.

Add one protection test:

- A selection with Framer-like classes such as `framer-abc framer-123` returns `targetKind: 'inline'`.

## Data Flow

Read flow remains:

```text
GrapesJS editor -> createGrapesLikeInspectorBridge -> readStyleSnapshot -> React style panel
```

Write flow remains:

```text
React style panel -> actions.style.updateStyle -> styleMapper.updateStyle -> GrapesJS component.addStyle
```

For default style edits, `component.addStyle` receives the selected property and writes it as component-level style. GrapesJS then updates the canvas and marks the design as dirty through existing events.

## User-Visible Behavior

- Editing a style field affects the currently selected element or selected elements.
- Elements with generated classes no longer cause the panel to write shared class/rule styles by default.
- Multi-selection writes inline style to each selected component rather than mutating a shared class rule.
- The UI does not yet expose a rule-editing mode, so users do not need to decide where styles are written.

## Risks

### Inline Style Accumulation

Repeated style edits will increase inline style usage. This is acceptable for this phase because preserving local edits is safer than mutating generated rules.

### Loss Of Convenient Shared-Class Editing

Users who expected one edit to affect all elements sharing a class will no longer get that behavior by default. This can return later as an explicit rule mode.

### Computed Value Ambiguity Remains

The panel may still display values derived from computed style rather than authored inline style. When changed, those values will be written inline. A later phase can add authored/computed source metadata to the style snapshot.

## Validation

Implementation should be considered successful when:

- Existing style controls still render and update selected components.
- Class-heavy imported pages no longer auto-route style panel edits to rule targets.
- Existing rule routing unit tests still pass at mapper level.
- Dirty state and save flow continue to work without additional integration changes.

## Future Work

After this behavior is stable, add an explicit advanced rule mode:

- Expose `inline` versus `rule` target selection in the style panel.
- Show whether a displayed value is authored inline, authored rule, or computed.
- Allow generated-page heuristics such as keeping `framer-*` classes inline-only unless explicitly overridden.
