# Visual HTML Source Location Mapping Design

## Summary

This document defines a stable source-location mapping architecture for the visual HTML editor so that:

- a selected canvas node can always resolve to the latest source line and column
- unsaved visual edits can still be located in source mode
- AI-assisted edits can target the current editor state instead of stale disk content
- source mode and design mode can share a single mapping model

The design explicitly replaces the current `outerHTML` string-matching approach as the primary source-location strategy.

## Goals

- Use the current in-editor document as the single source of truth for source location.
- Keep source line and column resolution accurate after visual edits, source edits, and AI edits.
- Support future source-mode jump/highlight behavior with the same mapping data.
- Avoid permanently writing editor-only metadata into the user's saved HTML file.

## Non-Goals

- Rebuilding the visual editor away from GrapesJS.
- Implementing fine-grained incremental mapping updates in the first iteration.
- Preserving identity for nodes that were semantically deleted or fully replaced.

## Current Problem

The current editor has three distinct states:

1. Disk HTML file
2. Source editor text
3. GrapesJS canvas runtime state

Visual edits are not written to disk in real time. They live in canvas runtime state until a later transition such as switching to source mode or saving. The current source-location feature tries to locate the selected node by matching `outerHTML` against generated source text. That is fragile because:

- GrapesJS mutates runtime DOM with transient attributes and classes
- style edits change `outerHTML`
- repeated structures create ambiguous matches
- add/remove/reorder operations invalidate previous assumptions

This makes source line and column resolution unreliable, especially for unsaved visual changes.

## Decision

Adopt the current editor document as the only source-location baseline.

Any committed change from design mode, source mode, or AI editing updates the current editor document, invalidates the previous mapping, and triggers a full mapping rebuild from the latest HTML snapshot.

The first implementation uses full rebuilds at commit-level moments instead of incremental updates.

## Architecture

### 1. Disk File State

Represents the last saved HTML on disk.

Responsibilities:

- initial file load
- save target
- external file conflict detection

It is not the source-location baseline while unsaved edits exist.

### 2. Current Editor Document

Represents the latest HTML currently being edited, regardless of origin.

Possible writers:

- design-mode visual edits
- source-mode text edits
- AI-applied edits

This state becomes the single source of truth for source-location mapping.

### 3. Canvas Runtime State

Represents GrapesJS component state, runtime DOM, selection, drag sessions, and visual overlays.

This state is a projection of the current editor document and user interaction context. It is not authoritative for source positions by itself.

### 4. Source Location Mapping Cache

Represents a derived index rebuilt from the current editor document.

Each entry should contain at minimum:

- `componentId`
- `fingerprint`
- `domPath`
- `tagName`
- `startLine`
- `startColumn`
- `endLine`
- `endColumn`

Consumers:

- send-to-AI prompt generation
- source-mode jump and highlight
- reverse lookup from source cursor to canvas node

## Mapping Lifecycle

### Change Sources

The system treats these as document-changing events:

- spacing drag commit
- absolute or fixed position drag commit
- style field commit
- node add/remove/move completion
- source editor text change commit
- AI edit application completion

### Lifecycle Steps

1. A change is committed.
2. The current editor document is updated.
3. Existing source-location mapping is marked stale.
4. A full mapping rebuild runs against the latest document text.
5. Consumers switch to the rebuilt mapping.

### Rebuild Timing

The first iteration rebuilds only at commit-level moments, not during every transient interaction frame.

Recommended rebuild triggers:

- when a spacing drag ends
- when a visual position drag ends
- when a style edit is committed
- when a structural canvas change completes
- when an AI edit has finished applying
- before switching into source mode if mapping is stale
- before sending a selected node to AI if mapping is stale

The system should not rebuild on every `pointermove`.

## Node Identity Strategy

The source-location system uses layered identity instead of relying on `outerHTML` equality.

### Primary Identity: Component ID

Use the GrapesJS component identifier as the primary in-session lookup key whenever available.

### Secondary Identity: Fingerprint

Use a structural fingerprint to re-associate nodes after runtime regeneration. The fingerprint should combine stable signals such as:

- tag name
- index among siblings
- selected meaningful attributes like `id`, `class`, `name`, and stable `data-*`
- short text-content summary when useful

### Tertiary Identity: DOM Path

Use a path-like fallback such as:

- `body > div[2] > section[1] > button[0]`

This helps reattach when component ids are no longer directly usable.

### Final Fallback

Keep sanitized `outerHTML` or similar textual matching only as a last-resort recovery mechanism, not as the primary strategy.

## Failure Handling and Fallback Rules

### Canvas Node to Source Location

Resolve in this order:

1. exact `componentId`
2. matching `fingerprint`
3. nearest `domPath`
4. nearest parent node
5. nearest recognizable source tag
6. file path only if no source location can be trusted

### Node Deleted or Replaced

If an AI edit or manual edit deletes, splits, merges, or fully replaces the original node:

- do not pretend the original node still exists
- first try to identify the closest semantic replacement
- otherwise fall back to parent node
- otherwise fall back to the modified region start

### Invalid or Unparseable HTML

When the current editor document cannot be parsed into a trustworthy mapping:

- mark the mapping unavailable
- disable precise jump/send behaviors that require valid positions
- show a clear UI state instead of returning stale positions
- automatically retry rebuild when the document becomes parseable again

### Disk Conflict

If the disk file changes while unsaved edits exist:

- preserve the conflict state already enforced by the editor
- treat existing mapping as stale relative to the disk version
- require reload or explicit resolution before claiming disk-aligned positions

## AI Editing Integration

AI edits must target the current editor document, not only the last saved disk file.

### Send-to-AI Flow

1. User selects a canvas node.
2. If the mapping is stale, rebuild it first.
3. Resolve the node to the latest source location from the current editor document.
4. Send file path and source line/column metadata to the AI workflow.

### Apply-AI-Edit Flow

1. AI returns a modification.
2. The modification is applied to the current editor document.
3. Previous mapping is invalidated immediately.
4. A full mapping rebuild runs on the updated document.
5. Canvas and source consumers use the new mapping.

The system should treat this as effectively real-time from the user's perspective, while still batching rebuild work at edit-application completion instead of token-by-token.

## Source Mode Integration

### Canvas to Source

Selecting a visual node should scroll and highlight the corresponding region in source mode using the shared mapping cache.

### Source to Canvas

Placing the cursor in source mode or selecting a source region should resolve the nearest mapped node and select or highlight it on the canvas.

### Shared Mapping Contract

Both directions must use the same mapping table built from the same current editor document revision.

## Data Ownership

Editor-only identity and mapping metadata should remain in runtime/editor state and derived caches.

The saved HTML file should remain clean and should not be permanently annotated with editor-only ids solely for mapping purposes in the first iteration.

## Performance Strategy

The first version prioritizes correctness over maximal optimization.

Performance choices:

- full rebuild after commit-level document changes
- no rebuild on transient drag frames
- stale-check before AI send and source-mode transitions

Future optimization options, explicitly deferred:

- incremental subtree remapping
- partial region diffing
- background idle rebuild scheduling for very large documents

## Testing Strategy

Add or update tests to cover:

- unsaved visual edits resolving to current source locations
- mapping rebuild after spacing and position drag commits
- mapping rebuild after node add/remove/reorder
- mapping rebuild after AI-applied edits
- fallback from exact node to parent or nearest region
- invalid HTML entering and leaving "mapping unavailable" state
- consistent canvas-to-source and source-to-canvas resolution

## Risks and Trade-offs

### Pros

- accurate source positioning for unsaved edits
- shared foundation for AI prompts and source-mode navigation
- simpler first implementation than incremental mapping
- avoids persisting editor-only metadata into user HTML

### Cons

- full rebuild cost after each committed change
- more state coordination between editor document, canvas, and mapping cache
- some node identity loss is unavoidable after destructive structural edits

## Recommended Implementation Direction

Implement the first version with:

- current editor document as the single source of truth
- commit-level full mapping rebuilds
- layered node identity using `componentId`, `fingerprint`, and `domPath`
- shared mapping for AI send and source-mode navigation

Do not continue investing in `outerHTML` string matching as the long-term foundation.

