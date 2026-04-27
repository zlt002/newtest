// Storage and query key constants
// Centralized key definitions to avoid typos and enable easy refactoring

export const STORAGE_KEYS = {
  UI_PREFERENCES: 'cc-ui-preferences',
  PROJECT_SELECTION: 'cc-project-selection',
  SESSION_PROTECTION: 'cc-session-protection',
  ACTIVE_TAB: 'cc-active-tab',
  DEVICE_SETTINGS: 'cc-device-settings',
} as const;

export const QUERY_KEYS = {
  PROJECTS: 'projects',
  SESSIONS: 'sessions',
  CHAT_HISTORY: 'chat-history',
  HOOKS: 'hooks',
  HOOK_EXECUTIONS: 'hook-executions',
  GIT_STATUS: 'git-status',
} as const;

// Environment flags
export const IS_PLATFORM = import.meta.env.VITE_IS_PLATFORM === 'true';

export const API_ENDPOINTS = {
  PROJECTS: '/api/projects',
  SESSIONS: '/api/sessions',
  GIT: '/api/git',
  MCP: '/api/mcp',
  AGENT_V2: '/api/agent-v2',
  SETTINGS: '/api/settings',
  HOOKS: '/api/hooks',
} as const;
