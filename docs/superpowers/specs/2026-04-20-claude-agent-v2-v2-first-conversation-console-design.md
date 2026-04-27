# Claude Agent V2 Frontend V2-First Conversation Console Design

## Background

The current frontend still treats Claude Agent V2 as an augmentation of the legacy chat surface rather than the primary interaction model.

Today the page is effectively a bridge:

- the legacy chat message list still defines most of the page rhythm
- V2 execution state is projected separately through `chat-v2`
- permission and interactive flows still feel like overlays on top of chat
- the right pane and surrounding workspace chrome react to execution indirectly

This creates an unstable mental model for users and a maintenance burden for the codebase:

- V2 is the runtime truth, but the page still reads like legacy chat
- execution detail and conversation detail are split across separate UI concepts
- the same run can appear as assistant text, execution panel content, and top-of-page banners
- frontend state still has to reconcile legacy message assumptions with V2 event semantics

The goal of this design is to stop treating V2 as an attached execution panel and instead turn the chat page into a V2-first conversation console.

## User-Approved Direction

This design is based on the following approved product choices:

- V2-first: the main chat page becomes a Claude Agent V2 execution console
- conversation style: the page still feels like a conversation, not a pure log viewer
- execution-heavy: the main stream should directly reveal most execution progress
- mixed expansion: the main timeline remains visible, but complex execution is automatically grouped into task blocks
- right pane as context assist: file previews, diffs, and opened resources stay on the right; execution detail remains primarily in the main stream
- scope includes:
  - main conversation surface
  - execution presentation
  - right-pane and sidebar coordination

## Goals

1. Make the main chat page read like a V2-native conversation rather than a legacy chat page with attached execution UI.
2. Use the V2 event stream as the primary frontend truth source for execution-aware rendering.
3. Present execution as readable conversational progress, not raw SDK event logs.
4. Keep complex runs understandable through automatic task grouping and progressive disclosure.
5. Keep the right pane focused on context artifacts rather than duplicating execution narrative.
6. Clarify component boundaries so legacy chat compatibility stops defining the primary UX.

## Non-Goals

- This design does not attempt to redesign unrelated global navigation, project discovery, or settings IA.
- This design does not remove all compatibility code immediately in the first implementation step.
- This design does not move the entire product to a terminal-like execution console.
- This design does not require the right pane to become a second execution timeline.

## Recommended Approach

We will turn the current chat screen into a V2-first conversation console with a strong conversational tone and an execution-centric inner structure.

The key product decision is:

- preserve a visible dialogue rhythm
- replace legacy chat semantics underneath with V2-native message units
- keep execution in the main stream
- keep files, previews, and diffs in the right pane

This approach avoids two common failure modes:

- a generic chat UI with a few execution cards attached
- a dense debug console that loses conversational readability

## Information Architecture

The page should be reorganized into three stable zones.

### 1. Conversation Stream

This becomes the primary surface.

It should render a single continuous V2-native timeline containing:

- user intent turns
- assistant narrative turns
- task blocks
- decision blocks
- artifact blocks
- recovery blocks
- inline status fragments

This stream is the main place where users understand what Claude is doing.

### 2. Composer Dock

The composer stays visually conversational, but becomes V2-aware.

It must visibly reflect:

- normal prompt entry
- execution in progress
- blocked on user question
- blocked on permission approval
- failed run with recovery options

The composer is no longer just a textarea with controls. It becomes the local control surface for the active V2 session state.

### 3. Context Sidecar

The right pane remains contextual, not narrative.

Its job is to show:

- file previews
- diffs
- generated artifacts
- opened resources
- references related to the currently focused stream block

It should not become a second execution log.

## Primary State Model

The frontend should adopt a stricter ownership model.

### Runtime truth

`agentEventStore` plus V2 projections become the primary truth for:

- active run lifecycle
- execution structure
- decision points
- failures and recoveries
- execution-derived artifacts

### Compatibility layer

The legacy message/session pipeline remains only as a compatibility layer for:

- historical text playback
- legacy transcript rendering where still required
- transitional adapters during migration

### Explicit rule

New primary UI decisions must not depend on legacy chat-only message semantics when the same truth already exists in the V2 event stream.

## Stream Unit Model

The current `ChatMessage`-centric mental model is not sufficient for a V2-first surface.

The new stream should render higher-level conversation units.

### TurnBlock

Represents one conversational turn:

- user request
- assistant narrative response
- embedded execution-aware inserts where relevant

This is the basic rhythm of the page.

### TaskBlock

Represents a meaningful execution cluster when a run becomes multi-step or task-shaped.

This is the core execution unit for the redesigned interface.

### DecisionBlock

Represents points where Claude explicitly needs user input to proceed:

- `interactive_prompt`
- `permission_request`

These should no longer live as detached banners.

### ArtifactBlock

Represents execution outputs that have contextual value:

- file writes
- diffs
- previews
- generated resources

Artifact blocks are the main bridge into the right pane.

### RecoveryBlock

Represents failures, resumability, and next actions:

- retry current run
- start a new session
- inspect related artifact or file

### StatusInline

Represents lightweight execution progress that should not create a full card on its own:

- thinking
- streaming progress
- hook status
- compact boundary
- brief task progress updates

## Implementation Status

- V2-first stream projection: implemented
- task blocks and mixed expansion: implemented
- in-stream decision and recovery blocks: implemented
- context sidecar binding: implemented
- standalone execution panel: compatibility fallback only

## TaskBlock Design

Task blocks should be automatically created by projection rather than directly mirroring raw SDK event lists.

### When to create a TaskBlock

A task block should appear when one or more of the following are true:

- there is explicit V2 task metadata such as `sdk.task.*`
- multiple tool or hook steps form a coherent execution chain
- there is a clear execution title or subtask description
- the work is long-running enough that inline fragments would be noisy

### When not to create a TaskBlock

Do not create a task block for a single simple tool call if it would add more chrome than clarity.

Simple one-off execution should remain inline in the stream.

### Internal structure

Each task block should have four layers:

- title layer
- progress layer
- steps layer
- detail layer

The title layer answers: what is Claude trying to do?

The progress layer answers: where is it now, and is it blocked?

The steps layer answers: what are the most important recent actions?

The detail layer answers: what happened exactly, if the user wants to drill down?

### Default expansion rules

- running task blocks: expanded to progress plus the latest few steps
- completed simple task blocks: collapsed to a concise summary row
- failed task blocks: expanded to the failure point and recovery actions
- task blocks with meaningful artifact output: expanded one level deeper by default

### Anti-goal

Task blocks must not degrade into raw SDK event dumps. If a user sees a debug log instead of a readable workflow block, the design has failed.

## DecisionBlock Design

Decision points should appear directly in the stream at the moment Claude needs intervention.

### Interactive prompts

`interactive_prompt` should feel like Claude asking a focused follow-up question within the current execution thread.

After the user answers, the block should compress into a readable answered state rather than disappearing entirely.

### Permission requests

`permission_request` should feel like an execution checkpoint:

- why the action is blocked
- what the tool is trying to do
- what the available approval scopes are

Permission decisions should happen in place:

- allow once
- allow for session or remembered scope where supported
- deny

### UX principle

These decisions should interrupt the execution narrative without ejecting the user from it.

## RecoveryBlock Design

Failure should not render as detached red logging.

A recovery block should instead answer three questions:

- what failed
- where it failed
- what the user can do next

Recovery actions may include:

- retry this run
- start a new session
- inspect related files or artifacts
- reopen the last relevant context on the right pane

The failure point should remain anchored in the main stream timeline.

## Artifact and Right Pane Coordination

The right pane remains context-assist only.

### Primary role

It should show the context associated with the currently focused block in the stream:

- file content
- diff preview
- generated HTML preview
- output artifact
- referenced resource

### Interaction model

- selecting an artifact block opens the most relevant preview
- selecting a task block highlights associated artifacts or files
- selecting a recovery block opens the last meaningful context near the failure

### Explicit non-goal

Do not mirror the full execution detail tree in the right pane.

The main stream tells the story. The right pane supports the story.

## Sidebar and Workspace Coordination

The sidebar should remain project and session navigation, but its state should be informed by V2-first execution semantics.

Recommended behavior:

- active session indicators should reflect V2 run state rather than legacy chat heuristics
- session switching should preserve V2 context continuity expectations
- starting a new session from failure recovery should map cleanly into sidebar session creation

The sidebar should not become an alternate execution inspector.

## Component Strategy

### Keep, but narrow responsibility

[ChatInterface.tsx](/Users/zhanglt21/Desktop/ccui0414/cc-ui/.worktrees/codex-claude-agent-v2-run-core/src/components/chat/view/ChatInterface.tsx)

- remains the top-level assembly point
- should stop stitching together two competing page models
- should become a V2-first page shell

[ChatMessagesPane.tsx](/Users/zhanglt21/Desktop/ccui0414/cc-ui/.worktrees/codex-claude-agent-v2-run-core/src/components/chat/view/subcomponents/ChatMessagesPane.tsx)

- remains the scroll container
- should become a thin renderer host rather than the semantic owner of the stream

[ChatComposer.tsx](/Users/zhanglt21/Desktop/ccui0414/cc-ui/.worktrees/codex-claude-agent-v2-run-core/src/components/chat/view/subcomponents/ChatComposer.tsx)

- remains the visible input surface
- should evolve into a V2-aware composer dock

### Retire as standalone primary concepts

[RunExecutionPanel.ts](/Users/zhanglt21/Desktop/ccui0414/cc-ui/.worktrees/codex-claude-agent-v2-run-core/src/components/chat-v2/components/RunExecutionPanel.ts)

- should stop existing as a separate execution island
- its useful projection logic should be absorbed into stream blocks

[PermissionRequestsBanner.tsx](/Users/zhanglt21/Desktop/ccui0414/cc-ui/.worktrees/codex-claude-agent-v2-run-core/src/components/chat/view/subcomponents/PermissionRequestsBanner.tsx)
[InteractiveRequestsBanner.tsx](/Users/zhanglt21/Desktop/ccui0414/cc-ui/.worktrees/codex-claude-agent-v2-run-core/src/components/chat/view/subcomponents/InteractiveRequestsBanner.tsx)

- should stop being banner concepts
- their behavior should migrate into in-stream decision blocks

### Add new stable layers

- `projectConversationStream`
- `ConversationStream`
- `ExecutionBlockRenderer`
- `ContextSidecarBinding`

These names are illustrative, not mandated, but the responsibility split is required.

## Visual Language

The page should feel like a conversation with an agent that is visibly working.

### Tone

- conversational outer shell
- execution-forward interior
- readable, not terminal-like
- deliberate hierarchy between narrative and detail

### Visual hierarchy

- user turns remain recognizably conversational
- assistant narrative reads as primary prose
- task blocks read as active workflow structures
- decision blocks read as interruption points
- recovery blocks read as guided next-action surfaces

### Progressive disclosure

Users should be able to:

- skim the main narrative
- understand current execution status
- expand into more detail only when needed

This must hold on both desktop and mobile.

## Interaction Principles

1. Decisions happen where the block occurs.
2. Users read the main story before drilling into detail.
3. Expansion reveals structured detail, not raw noise.
4. The right pane only supports the currently focused context.
5. The composer always reflects the current V2 session state.

## Data Flow Overview

The frontend data flow should be reshaped as follows:

1. V2 transport and realtime handlers append normalized V2 events into `agentEventStore`.
2. Projection converts run and conversation events into stream blocks.
3. `ConversationStream` renders those blocks in one unified timeline.
4. Block selection updates the context-sidecar binding.
5. The composer uses active run state and active decision state to alter affordances and controls.

## Error Handling

The redesigned UI should clearly distinguish:

- transient execution progress
- blocked decisions
- recoverable failure
- terminal failure

Error handling should not rely on the user understanding raw event types.

Instead, the UI should translate event semantics into action-oriented surfaces.

## Testing Strategy

The implementation should be covered through projection and component tests rather than only DOM snapshots.

Minimum coverage areas:

- stream block projection from V2 events
- task block grouping and default expansion rules
- in-stream decision block rendering
- recovery block rendering and actions
- right-pane context switching from artifact or task selection
- composer state changes for running, blocked, and failed execution
- mobile rendering for dense execution states

## Rollout Strategy

This should be implemented in staged slices even though the product direction is a full V2-first redesign.

Recommended order:

1. introduce the new stream projection layer
2. move execution rendering into stream blocks
3. migrate permission and interactive flows into in-stream decision blocks
4. wire block-to-context-sidecar selection
5. simplify or retire standalone legacy execution surfaces

This sequence keeps the migration understandable while preserving the long-term architecture target.

## Risks

### Risk 1: accidental dual truth sources

If the new stream uses V2 events but key visual decisions still depend on legacy chat semantics, the redesign will look new while staying structurally fragile.

### Risk 2: over-rendering execution noise

If task grouping is too shallow, the page becomes a noisy event feed instead of a readable conversational execution console.

### Risk 3: right pane duplication

If execution detail is mirrored into the right pane, users will have to scan two competing narratives.

### Risk 4: migration drag

If banner-based decision UIs and standalone execution panels stay alive too long, the new design will not feel coherent.

## Success Criteria

The redesign succeeds when:

- users can understand an active V2 run by reading a single main stream
- complex execution is visible without feeling like raw logs
- permission and question flows feel native to the conversation
- the right pane helps with artifacts and context without stealing the main narrative role
- frontend architecture has a clearly V2-first truth model

## Recommendation

Proceed with a V2-first conversation console built around a unified stream model.

This is the cleanest long-term direction for the current project because it:

- aligns the UI with the real runtime model
- preserves conversational readability
- gives execution first-class visibility
- avoids turning the product into either a generic chat shell or a debugging console
