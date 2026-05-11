import os from 'node:os';
import path from 'node:path';

import { readJsonObjectFile, updateJsonObjectFile } from './json-file-store.js';

const SECRET_ENV_KEYS = new Set([
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
]);

const PUBLIC_ENV_KEYS = [
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_REASONING_MODEL',
];

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stringifyEnvValue(value) {
  return typeof value === 'string' ? value : '';
}

function toPublicConfig(settingsPath, data) {
  const sourceEnv = normalizeObject(data.env);
  const env = {};

  for (const key of PUBLIC_ENV_KEYS) {
    if (SECRET_ENV_KEYS.has(key)) {
      env[key] = { configured: typeof sourceEnv[key] === 'string' && sourceEnv[key].length > 0 };
      continue;
    }

    env[key] = stringifyEnvValue(sourceEnv[key]);
  }

  return {
    settingsPath,
    env,
    permissions: normalizeObject(data.permissions),
  };
}

function mergeEnvPatch(currentEnv, patchEnv) {
  const nextEnv = { ...normalizeObject(currentEnv) };

  for (const [key, value] of Object.entries(normalizeObject(patchEnv))) {
    if (SECRET_ENV_KEYS.has(key)) {
      if (typeof value !== 'string' || value.length === 0) {
        continue;
      }

      nextEnv[key] = value;
      continue;
    }

    nextEnv[key] = typeof value === 'string' ? value : '';
  }

  return nextEnv;
}

export function getClaudeRuntimeSettingsPath(homeDir = os.homedir()) {
  return path.join(homeDir, '.claude', 'settings.json');
}

export async function readClaudeRuntimeConfig({
  homeDir = os.homedir(),
  fileSystem,
} = {}) {
  const settingsPath = getClaudeRuntimeSettingsPath(homeDir);
  const data = await readJsonObjectFile(settingsPath, { fileSystem });

  return toPublicConfig(settingsPath, data);
}

export async function updateClaudeRuntimeConfig({
  homeDir = os.homedir(),
  fileSystem,
  patch = {},
} = {}) {
  const settingsPath = getClaudeRuntimeSettingsPath(homeDir);
  const patchObject = normalizeObject(patch);

  const data = await updateJsonObjectFile(settingsPath, (current) => {
    const currentObject = normalizeObject(current);
    const next = { ...currentObject };

    if ('env' in patchObject) {
      next.env = mergeEnvPatch(currentObject.env, patchObject.env);
    }

    if ('permissions' in patchObject) {
      next.permissions = {
        ...normalizeObject(currentObject.permissions),
        ...normalizeObject(patchObject.permissions),
      };
    }

    return next;
  }, { fileSystem });

  return toPublicConfig(settingsPath, data);
}

export function createClaudeRuntimeConfigService(options = {}) {
  return {
    readRuntimeConfig() {
      return readClaudeRuntimeConfig(options);
    },
    updateRuntimeConfig({ patch } = {}) {
      return updateClaudeRuntimeConfig({ ...options, patch });
    },
  };
}
