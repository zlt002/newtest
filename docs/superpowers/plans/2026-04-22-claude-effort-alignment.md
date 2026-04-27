# Claude Effort Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align chat thinking mode with the official Claude Agent SDK `effort` option end-to-end and stop encoding thinking mode in the prompt text.

**Architecture:** Keep the existing selector UI shell, switch its internal values to official `effort` values, thread an explicit `effort` field through the realtime transport, and normalize it into Claude runtime options. Remove prompt-prefix behavior so the SDK option is the single source of truth.

**Tech Stack:** React, TypeScript, Node test runner, Claude Agent SDK transport/runtime bridge

---

### Task 1: Lock the transport contract with failing tests

**Files:**
- Modify: `src/components/chat/view/agentV2Realtime.test.mjs`
- Modify: `server/agent-v2/runtime/claude-v2-request-builder.test.mjs`
- Modify: `server/agent-v2/runtime/claude-v2-sdk-contract.test.mjs`

- [ ] Add a failing test that expects the realtime coordinator to include `effort` in the `agent-run` payload.
- [ ] Run the targeted frontend transport test and confirm it fails for missing `effort`.
- [ ] Add a failing test that expects runtime option normalization to preserve a valid official `effort`.
- [ ] Run the targeted runtime normalization test and confirm it fails for missing `effort`.
- [ ] Add a failing contract assertion that the installed SDK exposes `effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'`.
- [ ] Run the targeted SDK contract test and confirm it fails if the local assumptions are wrong.

### Task 2: Switch chat composer and selector to official `effort`

**Files:**
- Modify: `src/components/chat/constants/thinkingModes.ts`
- Modify: `src/components/chat/view/subcomponents/ThinkingModeSelector.tsx`
- Modify: `src/components/chat/hooks/useChatComposerState.ts`
- Modify: `src/i18n/locales/zh-CN/chat.json`

- [ ] Replace legacy internal thinking-mode ids with official `effort` values while preserving friendly labels in the selector.
- [ ] Remove prompt-prefix injection so message submission sends the user input unchanged.
- [ ] Include explicit `effort` in the V2 submit payload.
- [ ] Update any selector copy that still implies unofficial command-prefix behavior.
- [ ] Run the targeted frontend tests and confirm they pass.

### Task 3: Thread `effort` through the V2 runtime

**Files:**
- Modify: `src/components/chat/view/agentV2Realtime.ts`
- Modify: `src/components/chat/view/ChatInterface.tsx`
- Modify: `server/index.js`
- Modify: `server/agent-v2/runtime/claude-v2-request-builder.js`
- Modify: any runtime file that forwards normalized options into `sdk.query(...)`

- [ ] Extend the realtime submit types and websocket transport to carry `effort`.
- [ ] Normalize only official `effort` values on the server runtime boundary.
- [ ] Forward normalized `effort` into the Claude SDK query options.
- [ ] Run targeted runtime tests and confirm they pass.

### Task 4: Verify the final behavior end-to-end

**Files:**
- Modify: any touched tests above as needed

- [ ] Run the focused frontend and backend test suite for the touched files.
- [ ] Inspect the diff to confirm no prompt-prefix fallback remains.
- [ ] Report the exact verification commands and outcomes.
