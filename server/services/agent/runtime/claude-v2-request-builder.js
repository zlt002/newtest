import { buildClaudeSdkProcessEnv } from '../../../utils/claude-settings-env.js';

const VALID_PERMISSION_MODES = new Set(['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk']);
const VALID_EFFORT_LEVELS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
const DEFAULT_SETTING_SOURCES = ['user', 'project', 'local'];

function cloneValue(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => cloneValue(entry));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]),
    );
  }

  return value;
}

function normalizePermissionMode(permissionMode) {
  const value = typeof permissionMode === 'string' ? permissionMode.trim() : '';
  return VALID_PERMISSION_MODES.has(value) ? value : undefined;
}

function normalizeEffort(effort) {
  const value = typeof effort === 'string' ? effort.trim() : '';
  return VALID_EFFORT_LEVELS.has(value) ? value : undefined;
}

function normalizeToolList(value) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);

  return items.length > 0 ? items : undefined;
}

function normalizeToolsSettings(toolsSettings) {
  if (!toolsSettings || typeof toolsSettings !== 'object') {
    return undefined;
  }

  const allowedTools = normalizeToolList(toolsSettings.allowedTools);
  const disallowedTools = normalizeToolList(toolsSettings.disallowedTools);
  const skipPermissions = Boolean(toolsSettings.skipPermissions);

  if (!allowedTools && !disallowedTools && !skipPermissions) {
    return undefined;
  }

  return {
    ...(allowedTools ? { allowedTools } : {}),
    ...(disallowedTools ? { disallowedTools } : {}),
    ...(skipPermissions ? { skipPermissions: true } : {}),
  };
}

function normalizeWriter(writer) {
  return writer && typeof writer === 'object' ? writer : undefined;
}

function normalizeSettingSources(settingSources) {
  if (!Array.isArray(settingSources) || settingSources.length === 0) {
    return [...DEFAULT_SETTING_SOURCES];
  }

  const normalized = settingSources
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);

  return normalized.length > 0 ? normalized : [...DEFAULT_SETTING_SOURCES];
}

function normalizePlugins(plugins) {
  if (!Array.isArray(plugins)) {
    return undefined;
  }

  const normalized = plugins.filter((entry) => entry && typeof entry === 'object');
  return normalized.length > 0 ? cloneValue(normalized) : undefined;
}

function normalizeSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return undefined;
  }

  return cloneValue(settings);
}

function normalizeHooks(hooks) {
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) {
    return undefined;
  }

  return cloneValue(hooks);
}

export function buildClaudeV2RuntimeOptions({
  model,
  cwd,
  projectPath,
  env,
  settingsEnv,
  effort,
  permissionMode,
  toolsSettings,
  writer,
  settingSources,
  plugins,
  settings,
  hooks,
} = {}) {
  const normalized = {};

  if (typeof model === 'string' && model.trim()) {
    normalized.model = model.trim();
  }

  if (typeof cwd === 'string' && cwd.trim()) {
    normalized.cwd = cwd.trim();
  } else if (typeof projectPath === 'string' && projectPath.trim()) {
    normalized.cwd = projectPath.trim();
  }

  normalized.env = buildClaudeSdkProcessEnv({
    processEnv: env && typeof env === 'object' ? env : process.env,
    settingsEnv,
  });

  const normalizedPermissionMode = normalizePermissionMode(permissionMode);
  if (normalizedPermissionMode) {
    normalized.permissionMode = normalizedPermissionMode;
  }

  const normalizedEffort = normalizeEffort(effort);
  if (normalizedEffort) {
    normalized.effort = normalizedEffort;
  }

  const normalizedToolsSettings = normalizeToolsSettings(toolsSettings);
  if (normalizedToolsSettings) {
    normalized.toolsSettings = normalizedToolsSettings;
  }

  const normalizedWriter = normalizeWriter(writer);
  if (normalizedWriter) {
    normalized.writer = normalizedWriter;
  }

  normalized.settingSources = normalizeSettingSources(settingSources);

  const normalizedPlugins = normalizePlugins(plugins);
  if (normalizedPlugins) {
    normalized.plugins = normalizedPlugins;
  }

  const normalizedSettings = normalizeSettings(settings);
  if (normalizedSettings) {
    normalized.settings = normalizedSettings;
  }

  const normalizedHooks = normalizeHooks(hooks);
  if (normalizedHooks) {
    normalized.hooks = normalizedHooks;
  }

  return normalized;
}
