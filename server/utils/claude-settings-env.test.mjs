import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildClaudeSdkProcessEnv,
  loadClaudeSettingsEnvSync,
} from './claude-settings-env.js';

test('loadClaudeSettingsEnvSync reads string env values from Claude settings', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccui-claude-settings-'));
  const settingsPath = path.join(tempDir, 'settings.json');

  fs.writeFileSync(settingsPath, JSON.stringify({
    env: {
      ANTHROPIC_AUTH_TOKEN: 'token-from-settings',
      ANTHROPIC_BASE_URL: 'https://example.invalid',
      NON_STRING: 123,
    },
  }));

  assert.deepEqual(loadClaudeSettingsEnvSync(settingsPath), {
    ANTHROPIC_AUTH_TOKEN: 'token-from-settings',
    ANTHROPIC_BASE_URL: 'https://example.invalid',
  });

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('buildClaudeSdkProcessEnv lets process env override settings env', () => {
  const merged = buildClaudeSdkProcessEnv({
    processEnv: {
      PATH: '/usr/bin',
      ANTHROPIC_AUTH_TOKEN: 'token-from-process',
    },
    settingsEnv: {
      ANTHROPIC_AUTH_TOKEN: 'token-from-settings',
      ANTHROPIC_BASE_URL: 'https://example.invalid',
    },
  });

  assert.equal(merged.ANTHROPIC_AUTH_TOKEN, 'token-from-process');
  assert.equal(merged.ANTHROPIC_BASE_URL, 'https://example.invalid');
  assert.equal(merged.PATH, '/usr/bin');
});
