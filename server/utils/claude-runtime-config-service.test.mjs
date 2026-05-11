import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getClaudeRuntimeSettingsPath,
  readClaudeRuntimeConfig,
  updateClaudeRuntimeConfig,
} from './claude-runtime-config-service.js';

function createMemoryFs(initialFiles = {}) {
  const files = { ...initialFiles };
  const mkdirCalls = [];

  return {
    files,
    mkdirCalls,
    async readFile(filepath, encoding) {
      assert.equal(encoding, 'utf8');
      if (!(filepath in files)) {
        const error = new Error(`ENOENT: ${filepath}`);
        error.code = 'ENOENT';
        throw error;
      }
      return files[filepath];
    },
    async mkdir(filepath, options) {
      mkdirCalls.push({ filepath, options });
    },
    async writeFile(filepath, content, encoding) {
      assert.equal(encoding, 'utf8');
      files[filepath] = content;
    },
  };
}

test('getClaudeRuntimeSettingsPath points to ~/.claude/settings.json', () => {
  assert.equal(
    getClaudeRuntimeSettingsPath('/home/me'),
    '/home/me/.claude/settings.json',
  );
});

test('readClaudeRuntimeConfig masks configured keys and fills missing env defaults', async () => {
  const homeDir = '/home/me';
  const settingsPath = '/home/me/.claude/settings.json';
  const fileSystem = createMemoryFs({
    [settingsPath]: JSON.stringify({
      env: {
        ANTHROPIC_AUTH_TOKEN: 'auth-token',
        ANTHROPIC_API_KEY: 'api-key',
        ANTHROPIC_BASE_URL: 'https://api.example.com',
        ANTHROPIC_MODEL: 'claude-sonnet',
      },
      permissions: { allow: ['Read(*)'] },
    }),
  });

  const config = await readClaudeRuntimeConfig({ homeDir, fileSystem });

  assert.deepEqual(config, {
    settingsPath,
    env: {
      ANTHROPIC_AUTH_TOKEN: { configured: true },
      ANTHROPIC_API_KEY: { configured: true },
      ANTHROPIC_BASE_URL: 'https://api.example.com',
      ANTHROPIC_MODEL: 'claude-sonnet',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: '',
      ANTHROPIC_DEFAULT_SONNET_MODEL: '',
      ANTHROPIC_DEFAULT_OPUS_MODEL: '',
      ANTHROPIC_REASONING_MODEL: '',
    },
    permissions: { allow: ['Read(*)'] },
  });
});

test('updateClaudeRuntimeConfig keeps existing model env when omitted and ignores empty key patches', async () => {
  const homeDir = '/home/me';
  const settingsPath = '/home/me/.claude/settings.json';
  const fileSystem = createMemoryFs({
    [settingsPath]: JSON.stringify({
      env: {
        ANTHROPIC_AUTH_TOKEN: 'old-token',
        ANTHROPIC_API_KEY: 'old-key',
        ANTHROPIC_MODEL: 'old-model',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'haiku-old',
      },
      permissions: { allow: ['Read(*)'] },
    }),
  });

  const config = await updateClaudeRuntimeConfig({
    homeDir,
    fileSystem,
    patch: {
      env: {
        ANTHROPIC_AUTH_TOKEN: '',
        ANTHROPIC_API_KEY: 'new-key',
        ANTHROPIC_BASE_URL: 'https://proxy.example.com',
      },
      permissions: { deny: ['Bash(rm *)'] },
    },
  });

  assert.deepEqual(config.env, {
    ANTHROPIC_AUTH_TOKEN: { configured: true },
    ANTHROPIC_API_KEY: { configured: true },
    ANTHROPIC_BASE_URL: 'https://proxy.example.com',
    ANTHROPIC_MODEL: 'old-model',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'haiku-old',
    ANTHROPIC_DEFAULT_SONNET_MODEL: '',
    ANTHROPIC_DEFAULT_OPUS_MODEL: '',
    ANTHROPIC_REASONING_MODEL: '',
  });
  assert.deepEqual(config.permissions, { allow: ['Read(*)'], deny: ['Bash(rm *)'] });

  const written = JSON.parse(fileSystem.files[settingsPath]);
  assert.equal(written.env.ANTHROPIC_AUTH_TOKEN, 'old-token');
  assert.equal(written.env.ANTHROPIC_API_KEY, 'new-key');
});

test('updateClaudeRuntimeConfig ignores non-string secret patches without clearing existing keys', async () => {
  const homeDir = '/home/me';
  const settingsPath = '/home/me/.claude/settings.json';
  const fileSystem = createMemoryFs({
    [settingsPath]: JSON.stringify({
      env: {
        ANTHROPIC_AUTH_TOKEN: 'old-token',
        ANTHROPIC_API_KEY: 'old-key',
        ANTHROPIC_MODEL: 'old-model',
      },
    }),
  });

  await updateClaudeRuntimeConfig({
    homeDir,
    fileSystem,
    patch: {
      env: {
        ANTHROPIC_AUTH_TOKEN: null,
        ANTHROPIC_API_KEY: false,
        ANTHROPIC_MODEL: '',
      },
    },
  });

  const written = JSON.parse(fileSystem.files[settingsPath]);
  assert.equal(written.env.ANTHROPIC_AUTH_TOKEN, 'old-token');
  assert.equal(written.env.ANTHROPIC_API_KEY, 'old-key');
  assert.equal(written.env.ANTHROPIC_MODEL, '');
});

test('updateClaudeRuntimeConfig preserves unknown settings fields', async () => {
  const homeDir = '/home/me';
  const settingsPath = '/home/me/.claude/settings.json';
  const fileSystem = createMemoryFs({
    [settingsPath]: JSON.stringify({
      env: { ANTHROPIC_MODEL: 'old-model' },
      permissions: { allow: ['Read(*)'] },
      mcpServers: { keep: { command: 'node', args: ['server.js'] } },
      customSetting: true,
    }),
  });

  await updateClaudeRuntimeConfig({
    homeDir,
    fileSystem,
    patch: {
      env: { ANTHROPIC_MODEL: 'new-model' },
      permissions: { allow: ['Read(*)', 'Write(*)'] },
    },
  });

  const written = JSON.parse(fileSystem.files[settingsPath]);
  assert.deepEqual(written, {
    env: { ANTHROPIC_MODEL: 'new-model' },
    permissions: { allow: ['Read(*)', 'Write(*)'] },
    mcpServers: { keep: { command: 'node', args: ['server.js'] } },
    customSetting: true,
  });
}
);
