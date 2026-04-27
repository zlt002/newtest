import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';

import { checkClaudeCredentials } from './cli-auth.js';

test('checkClaudeCredentials prefers ANTHROPIC_API_KEY from process env', async () => {
  const result = await checkClaudeCredentials({
    env: { ANTHROPIC_API_KEY: 'test-key' },
  });

  assert.deepEqual(result, {
    authenticated: true,
    email: 'API Key Auth',
    method: 'api_key',
    error: null,
  });
});

test('checkClaudeCredentials reads OAuth credentials from ~/.claude/.credentials.json', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'cli-auth-home-'));
  await mkdir(path.join(homeDir, '.claude'), { recursive: true });
  await writeFile(
    path.join(homeDir, '.claude', '.credentials.json'),
    JSON.stringify({
      email: 'demo@example.com',
      claudeAiOauth: {
        accessToken: 'token',
        expiresAt: Date.now() + 60_000,
      },
    }),
    'utf8',
  );

  const result = await checkClaudeCredentials({
    env: {},
    homeDir,
  });

  assert.deepEqual(result, {
    authenticated: true,
    email: 'demo@example.com',
    method: 'credentials_file',
    error: null,
  });
});

test('checkClaudeCredentials reports not authenticated when no valid Claude credentials exist', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'cli-auth-empty-home-'));

  const result = await checkClaudeCredentials({
    env: {},
    homeDir,
  });

  assert.deepEqual(result, {
    authenticated: false,
    email: null,
    method: null,
    error: 'Not authenticated',
  });
});
