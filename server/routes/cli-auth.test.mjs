import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';

import { checkClaudeCredentials, updateClaudeSettingsEnv } from './cli-auth.js';

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

test('updateClaudeSettingsEnv writes supported Anthropic settings into ~/.claude/settings.json', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'cli-auth-settings-home-'));
  await mkdir(path.join(homeDir, '.claude'), { recursive: true });
  await writeFile(
    path.join(homeDir, '.claude', 'settings.json'),
    JSON.stringify({
      permissions: { allow: ['Read(*)'] },
      env: {
        EXISTING: 'keep-me',
      },
    }),
    'utf8',
  );

  const result = await updateClaudeSettingsEnv({
    homeDir,
    env: {
      ANTHROPIC_API_KEY: ' sk-test ',
      ANTHROPIC_BASE_URL: ' https://example.test ',
      UNSUPPORTED_KEY: 'drop-me',
    },
  });

  const settings = JSON.parse(await readFile(path.join(homeDir, '.claude', 'settings.json'), 'utf8'));
  assert.equal(result.success, true);
  assert.deepEqual(result.configuredKeys.sort(), ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL']);
  assert.deepEqual(settings.permissions, { allow: ['Read(*)'] });
  assert.deepEqual(settings.env, {
    EXISTING: 'keep-me',
    ANTHROPIC_API_KEY: 'sk-test',
    ANTHROPIC_BASE_URL: 'https://example.test',
  });
});

test('updateClaudeSettingsEnv rejects empty or unsupported settings', async () => {
  await assert.rejects(
    updateClaudeSettingsEnv({
      homeDir: await mkdtemp(path.join(os.tmpdir(), 'cli-auth-empty-settings-home-')),
      env: {
        UNSUPPORTED_KEY: 'drop-me',
      },
    }),
    /No supported Claude settings were provided/,
  );
});
