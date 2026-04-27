import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  assertClaudeAgentSdkVersionState,
  loadClaudeAgentSdkVersionState,
} from '../../../../scripts/check-claude-agent-sdk-version.mjs';

const SDK_ROOT = path.resolve(process.cwd(), 'node_modules/@anthropic-ai/claude-agent-sdk');
const SDK_DTS_PATH = path.join(SDK_ROOT, 'sdk.d.ts');
const SDK_TOOLS_DTS_PATH = path.join(SDK_ROOT, 'sdk-tools.d.ts');

const smokeEnabled = /^(1|true|yes)$/i.test(process.env.CLAUDE_AGENT_SDK_SMOKE ?? '');
const smokeTest = smokeEnabled ? test : test.skip;

test('Claude Agent SDK is pinned exactly to 0.2.112', async () => {
  const state = await loadClaudeAgentSdkVersionState(process.cwd());

  assert.deepEqual(state, {
    packageJsonSpec: '0.2.112',
    packageLockSpec: '0.2.112',
    lockfileVersion: '0.2.112',
    lockfileResolved:
      'https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk/-/claude-agent-sdk-0.2.112.tgz',
    installedVersion: '0.2.112',
  });

  assert.doesNotThrow(() => assertClaudeAgentSdkVersionState(state));
});

test('Claude Agent SDK contract exposes the official permission and ask-user types', async () => {
  const [sdkDts, sdkToolsDts] = await Promise.all([
    readFile(SDK_DTS_PATH, 'utf8'),
    readFile(SDK_TOOLS_DTS_PATH, 'utf8'),
  ]);

  assert.match(sdkDts, /export declare function query\(/);
  assert.match(sdkDts, /export declare type PermissionResult = \{/);
  assert.match(sdkDts, /behavior: 'allow';[\s\S]*updatedPermissions\?: PermissionUpdate\[\];[\s\S]*behavior: 'deny';[\s\S]*message: string;/);
  assert.match(sdkDts, /allowDangerouslySkipPermissions\?: boolean;/);
  assert.match(sdkDts, /effort\?: \('low' \| 'medium' \| 'high'( \| 'xhigh')? \| 'max'\) \| number;/);
  assert.match(sdkDts, /export declare type PermissionMode = 'default' \| 'acceptEdits' \| 'bypassPermissions' \| 'plan' \| 'dontAsk'( \| 'auto')?;/);

  assert.match(sdkToolsDts, /export interface AskUserQuestionInput \{/);
  assert.match(sdkToolsDts, /export interface AskUserQuestionOutput \{/);
});

test('Claude Agent SDK contract exposes the official hook event surface', async () => {
  const sdkDts = await readFile(SDK_DTS_PATH, 'utf8');

  assert.match(
    sdkDts,
    /export declare const HOOK_EVENTS: readonly \["PreToolUse", "PostToolUse", "PostToolUseFailure", "Notification", "UserPromptSubmit", "SessionStart", "SessionEnd", "Stop", "StopFailure", "SubagentStart", "SubagentStop", "PreCompact", "PostCompact", "PermissionRequest", "PermissionDenied", "Setup", "TeammateIdle", "TaskCreated", "TaskCompleted", "Elicitation", "ElicitationResult", "ConfigChange", "WorktreeCreate", "WorktreeRemove", "InstructionsLoaded", "CwdChanged", "FileChanged"\]/,
  );
  assert.match(
    sdkDts,
    /export declare type HookEvent = 'PreToolUse' \| 'PostToolUse' \| 'PostToolUseFailure' \| 'Notification' \| 'UserPromptSubmit' \| 'SessionStart' \| 'SessionEnd' \| 'Stop' \| 'StopFailure' \| 'SubagentStart' \| 'SubagentStop' \| 'PreCompact' \| 'PostCompact' \| 'PermissionRequest' \| 'PermissionDenied' \| 'Setup' \| 'TeammateIdle' \| 'TaskCreated' \| 'TaskCompleted' \| 'Elicitation' \| 'ElicitationResult' \| 'ConfigChange' \| 'WorktreeCreate' \| 'WorktreeRemove' \| 'InstructionsLoaded' \| 'CwdChanged' \| 'FileChanged';/,
  );
  assert.match(
    sdkDts,
    /export declare type HookInput = PreToolUseHookInput \| PostToolUseHookInput \| PostToolUseFailureHookInput \| PermissionDeniedHookInput \| NotificationHookInput \| UserPromptSubmitHookInput \| SessionStartHookInput \| SessionEndHookInput \| StopHookInput \| StopFailureHookInput \| SubagentStartHookInput \| SubagentStopHookInput \| PreCompactHookInput \| PostCompactHookInput \| PermissionRequestHookInput \| SetupHookInput \| TeammateIdleHookInput \| TaskCreatedHookInput \| TaskCompletedHookInput \| ElicitationHookInput \| ElicitationResultHookInput \| ConfigChangeHookInput \| InstructionsLoadedHookInput \| WorktreeCreateHookInput \| WorktreeRemoveHookInput \| CwdChangedHookInput \| FileChangedHookInput;/,
  );
});

test('Claude Agent SDK hook types expose the key official mutation and continuation outputs', async () => {
  const sdkDts = await readFile(SDK_DTS_PATH, 'utf8');

  assert.match(sdkDts, /export declare type HookPermissionDecision = 'allow' \| 'deny' \| 'ask' \| 'defer';/);
  assert.match(
    sdkDts,
    /export declare type PreToolUseHookSpecificOutput = \{[\s\S]*permissionDecision\?: HookPermissionDecision;[\s\S]*permissionDecisionReason\?: string;[\s\S]*updatedInput\?: Record<string, unknown>;[\s\S]*additionalContext\?: string;[\s\S]*\};/,
  );
  assert.match(
    sdkDts,
    /export declare type NotificationHookSpecificOutput = \{[\s\S]*hookEventName: 'Notification';[\s\S]*additionalContext\?: string;[\s\S]*\};/,
  );
  assert.match(
    sdkDts,
    /export declare type SyncHookJSONOutput = \{[\s\S]*continue\?: boolean;[\s\S]*systemMessage\?: string;[\s\S]*hookSpecificOutput\?: PreToolUseHookSpecificOutput[\s\S]*\};/,
  );
});

test('Claude Agent SDK runtime exports the expected surface without starting a session', async () => {
  const sdk = await import('@anthropic-ai/claude-agent-sdk');

  assert.equal(typeof sdk.query, 'function');
  assert.equal(typeof sdk.createSdkMcpServer, 'function');
  assert.equal(typeof sdk.AbortError, 'function');
  assert.ok(Object.keys(sdk).includes('query'));
  assert.ok(Object.keys(sdk).includes('createSdkMcpServer'));
});

smokeTest(
  'Claude Agent SDK smoke prompt can complete when explicitly enabled',
  async () => {
    const sdk = await import('@anthropic-ai/claude-agent-sdk');
    const model = process.env.CLAUDE_AGENT_SDK_SMOKE_MODEL;
    const query = sdk.query({
      prompt: 'Reply with exactly: smoke-ok',
      options: {
        cwd: process.cwd(),
        persistSession: false,
        maxTurns: 1,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        ...(model ? { model } : {}),
      },
    });

    let sawResult = false;
    for await (const message of query) {
      if (message.type === 'result') {
        sawResult = true;
      }
    }

    assert.equal(sawResult, true);
  }
);
