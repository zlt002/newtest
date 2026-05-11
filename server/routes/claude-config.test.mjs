import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import { createClaudeConfigRouter } from './claude-config.js';

async function withClaudeConfigTestServer(service, fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/claude-config', createClaudeConfigRouter({ service }));
  const server = app.listen(0, '127.0.0.1');

  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('GET /runtime calls service and returns public config', async () => {
  const calls = [];
  const config = {
    settingsPath: '/home/me/.claude/settings.json',
    env: { ANTHROPIC_API_KEY: { configured: true } },
    permissions: { allow: ['Read(*)'] },
  };
  const service = {
    async readRuntimeConfig() {
      calls.push('readRuntimeConfig');
      return config;
    },
  };

  await withClaudeConfigTestServer(service, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/claude-config/runtime`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(calls, ['readRuntimeConfig']);
    assert.deepEqual(body, { success: true, config });
  });
});

test('PATCH /runtime passes request body as patch and returns public config', async () => {
  const calls = [];
  const patch = {
    env: { ANTHROPIC_MODEL: 'claude-sonnet' },
    permissions: { allow: ['Read(*)'] },
  };
  const config = {
    settingsPath: '/home/me/.claude/settings.json',
    env: { ANTHROPIC_MODEL: 'claude-sonnet' },
    permissions: { allow: ['Read(*)'] },
  };
  const service = {
    async updateRuntimeConfig(args) {
      calls.push(args);
      return config;
    },
  };

  await withClaudeConfigTestServer(service, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/claude-config/runtime`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(calls, [{ patch }]);
    assert.deepEqual(body, { success: true, config });
  });
});

test('routes return unified error responses', async () => {
  const service = {
    async readRuntimeConfig() {
      const error = new Error('boom');
      error.statusCode = 418;
      error.code = 'TEAPOT';
      throw error;
    },
  };

  await withClaudeConfigTestServer(service, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/claude-config/runtime`);
    const body = await response.json();

    assert.equal(response.status, 418);
    assert.deepEqual(body, {
      success: false,
      message: 'boom',
      error: 'TEAPOT',
    });
  });
});

test('routes use a neutral fallback error message', async () => {
  const service = {
    async readRuntimeConfig() {
      throw { code: 'READ_FAILED' };
    },
  };

  await withClaudeConfigTestServer(service, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/claude-config/runtime`);
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.deepEqual(body, {
      success: false,
      message: 'Failed to handle Claude runtime config request',
      error: 'READ_FAILED',
    });
  });
});
