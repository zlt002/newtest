import type { ClaudePermissionMode } from '../types/types';

type MainTab = 'agents' | 'appearance' | 'git';

interface ClaudePermissions {
  permissionMode: ClaudePermissionMode;
  allowedTools: string[];
  disallowedTools: string[];
}

const KNOWN_MAIN_TABS: MainTab[] = ['agents', 'appearance', 'git'];

export const DEFAULT_CLAUDE_ALLOWED_TOOLS: string[] = [
  'Bash(git log:*)',
  'Bash(git diff:*)',
  'Bash(git status:*)',
  'Write',
  'Read',
  'Edit',
  'Glob',
  'Grep',
  'MultiEdit',
  'Task',
  'TodoWrite',
  'TodoRead',
  'WebFetch',
  'WebSearch',
];

export const DEFAULT_CLAUDE_PERMISSIONS: ClaudePermissions = {
  permissionMode: 'bypassPermissions',
  allowedTools: DEFAULT_CLAUDE_ALLOWED_TOOLS,
  disallowedTools: [],
};

function normalizePermissionMode(mode: string): ClaudePermissionMode {
  return (
    mode === 'default'
    || mode === 'dontAsk'
    || mode === 'acceptEdits'
    || mode === 'bypassPermissions'
    || mode === 'plan'
  )
    ? mode
    : DEFAULT_CLAUDE_PERMISSIONS.permissionMode;
}

export function normalizeMainTab(tab: string): MainTab {
  if (tab === 'tools' || tab === 'api') {
    return 'agents';
  }

  if (tab === 'settings' || tab === 'general') {
    return 'appearance';
  }

  return KNOWN_MAIN_TABS.includes(tab as MainTab) ? (tab as MainTab) : 'appearance';
}

export function readClaudePermissions(value: string | null | undefined): ClaudePermissions {
  if (!value) {
    return {
      permissionMode: DEFAULT_CLAUDE_PERMISSIONS.permissionMode,
      allowedTools: [...DEFAULT_CLAUDE_PERMISSIONS.allowedTools],
      disallowedTools: [...DEFAULT_CLAUDE_PERMISSIONS.disallowedTools],
    };
  }

  try {
    const parsed = JSON.parse(value) as Partial<ClaudePermissions>;
    return {
      permissionMode: typeof parsed.permissionMode === 'string'
        ? normalizePermissionMode(parsed.permissionMode)
        : DEFAULT_CLAUDE_PERMISSIONS.permissionMode,
      allowedTools: Array.isArray(parsed.allowedTools)
        ? parsed.allowedTools
        : [...DEFAULT_CLAUDE_PERMISSIONS.allowedTools],
      disallowedTools: Array.isArray(parsed.disallowedTools)
        ? parsed.disallowedTools
        : [...DEFAULT_CLAUDE_PERMISSIONS.disallowedTools],
    };
  } catch {
    return {
      permissionMode: DEFAULT_CLAUDE_PERMISSIONS.permissionMode,
      allowedTools: [...DEFAULT_CLAUDE_PERMISSIONS.allowedTools],
      disallowedTools: [...DEFAULT_CLAUDE_PERMISSIONS.disallowedTools],
    };
  }
}

export function mergeClaudeSettingsForSave(
  existing: string | Record<string, unknown> | null | undefined,
  updates: Record<string, unknown>,
): Record<string, unknown> {
  let base: Record<string, unknown> = {};

  if (typeof existing === 'string') {
    try {
      base = JSON.parse(existing) as Record<string, unknown>;
    } catch {
      base = {};
    }
  } else if (existing && typeof existing === 'object') {
    base = existing;
  }

  return {
    ...base,
    ...updates,
  };
}
