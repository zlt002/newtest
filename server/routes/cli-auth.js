import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { loadClaudeSettingsEnvSync } from '../utils/claude-settings-env.js';

const router = express.Router();

const CLAUDE_SETTINGS_ENV_KEYS = new Set([
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_REASONING_MODEL',
  'API_TIMEOUT_MS',
]);

const SECRET_CLAUDE_SETTINGS_ENV_KEYS = new Set([
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
]);

function getClaudeSettingsPath(homeDir = os.homedir()) {
  return path.join(homeDir, '.claude', 'settings.json');
}

export async function detectClaudeCli({
  spawnImpl = spawn,
} = {}) {
  return new Promise((resolve) => {
    const child = spawnImpl('claude', ['--version'], {
      stdio: 'ignore',
      shell: false,
    });

    child.on('error', () => {
      resolve(false);
    });
    child.on('close', (code) => {
      resolve(code === 0);
    });
  });
}

export async function checkClaudeCredentials({
  env = process.env,
  homeDir = os.homedir(),
  readFile = fs.readFile,
  now = Date.now(),
} = {}) {
  if (typeof env.ANTHROPIC_API_KEY === 'string' && env.ANTHROPIC_API_KEY.trim()) {
    return {
      authenticated: true,
      email: 'API Key Auth',
      method: 'api_key',
      error: null,
    };
  }

  const settingsEnv = loadClaudeSettingsEnvSync(path.join(homeDir, '.claude', 'settings.json'));

  if (typeof settingsEnv.ANTHROPIC_API_KEY === 'string' && settingsEnv.ANTHROPIC_API_KEY.trim()) {
    return {
      authenticated: true,
      email: 'API Key Auth',
      method: 'api_key',
      error: null,
    };
  }

  if (typeof settingsEnv.ANTHROPIC_AUTH_TOKEN === 'string' && settingsEnv.ANTHROPIC_AUTH_TOKEN.trim()) {
    return {
      authenticated: true,
      email: 'Configured via settings.json',
      method: 'api_key',
      error: null,
    };
  }

  try {
    const credentialsPath = path.join(homeDir, '.claude', '.credentials.json');
    const content = await readFile(credentialsPath, 'utf8');
    const credentials = JSON.parse(content);
    const oauth = credentials?.claudeAiOauth;
    const isExpired = oauth?.expiresAt && now >= oauth.expiresAt;

    if (oauth?.accessToken && !isExpired) {
      return {
        authenticated: true,
        email: credentials?.email || credentials?.user || null,
        method: 'credentials_file',
        error: null,
      };
    }
  } catch {
    // Missing or malformed local credentials means Claude is not authenticated.
  }

  return {
    authenticated: false,
    email: null,
    method: null,
    error: 'Not authenticated',
  };
}

function normalizeSettingsEnv(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(input)
      .filter(([key, value]) => CLAUDE_SETTINGS_ENV_KEYS.has(key) && typeof value === 'string' && value.trim())
      .map(([key, value]) => [key, value.trim()]),
  );
}

export async function readClaudeSettingsEnv({
  homeDir = os.homedir(),
  readFile = fs.readFile,
} = {}) {
  const settingsPath = getClaudeSettingsPath(homeDir);
  let settings = {};

  try {
    settings = JSON.parse(await readFile(settingsPath, 'utf8'));
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      settings = {};
    }
  } catch {
    settings = {};
  }

  const env = settings.env && typeof settings.env === 'object' && !Array.isArray(settings.env)
    ? settings.env
    : {};
  const visibleEnv = {};
  const configuredSecretKeys = [];

  for (const [key, value] of Object.entries(env)) {
    if (!CLAUDE_SETTINGS_ENV_KEYS.has(key) || typeof value !== 'string' || !value.trim()) {
      continue;
    }

    if (SECRET_CLAUDE_SETTINGS_ENV_KEYS.has(key)) {
      configuredSecretKeys.push(key);
    } else {
      visibleEnv[key] = value;
    }
  }

  return {
    success: true,
    settingsPath,
    env: visibleEnv,
    configuredSecretKeys,
  };
}

export async function updateClaudeSettingsEnv({
  env,
  homeDir = os.homedir(),
  readFile = fs.readFile,
  writeFile = fs.writeFile,
  mkdir = fs.mkdir,
} = {}) {
  const normalizedEnv = normalizeSettingsEnv(env);

  if (Object.keys(normalizedEnv).length === 0) {
    const error = new Error('No supported Claude settings were provided.');
    error.statusCode = 400;
    throw error;
  }

  const settingsPath = getClaudeSettingsPath(homeDir);
  let existingSettings = {};

  try {
    existingSettings = JSON.parse(await readFile(settingsPath, 'utf8'));
    if (!existingSettings || typeof existingSettings !== 'object' || Array.isArray(existingSettings)) {
      existingSettings = {};
    }
  } catch {
    existingSettings = {};
  }

  const nextSettings = {
    ...existingSettings,
    env: {
      ...(existingSettings.env && typeof existingSettings.env === 'object' && !Array.isArray(existingSettings.env)
        ? existingSettings.env
        : {}),
      ...normalizedEnv,
    },
  };

  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(nextSettings, null, 2)}\n`, 'utf8');

  return {
    success: true,
    settingsPath,
    configuredKeys: Object.keys(normalizedEnv),
  };
}

router.get('/claude/status', async (_req, res) => {
  try {
    const [credentials, cliInstalled] = await Promise.all([
      checkClaudeCredentials(),
      detectClaudeCli(),
    ]);
    res.json({
      ...credentials,
      cliInstalled,
    });
  } catch (error) {
    res.status(500).json({
      authenticated: false,
      email: null,
      method: null,
      cliInstalled: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/claude/settings', async (_req, res) => {
  try {
    res.json(await readClaudeSettingsEnv());
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/claude/settings', async (req, res) => {
  try {
    const result = await updateClaudeSettingsEnv({ env: req.body?.env });
    const status = await checkClaudeCredentials();
    res.json({
      ...result,
      authStatus: status,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
