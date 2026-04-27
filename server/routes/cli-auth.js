import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { loadClaudeSettingsEnvSync } from '../utils/claude-settings-env.js';

const router = express.Router();

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

router.get('/claude/status', async (_req, res) => {
  try {
    const result = await checkClaudeCredentials();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      authenticated: false,
      email: null,
      method: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
