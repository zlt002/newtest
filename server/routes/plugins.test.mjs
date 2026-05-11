import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import express from 'express';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';

import { createPluginRouter } from './plugins.js';

const execFileAsync = promisify(execFile);

async function withPluginTestServer({ homeDir, runtime } = {}, fn) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.testHomeDir = homeDir;
    next();
  });
  app.use('/api/plugins', createPluginRouter({ runtime }));
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

async function createTempPlugin({ id = 'demo@local', name = 'Demo Plugin', version = '1.2.3' } = {}) {
  const pluginDir = await mkdtemp(path.join(os.tmpdir(), 'ccui-plugin-dir-'));
  const manifestDir = path.join(pluginDir, '.claude-plugin');
  await mkdir(manifestDir, { recursive: true });
  await writeFile(
    path.join(manifestDir, 'plugin.json'),
    JSON.stringify({ id, name, version, description: 'Local demo plugin' }),
  );
  return pluginDir;
}

async function createTempPluginWithManifest(manifest) {
  const pluginDir = await mkdtemp(path.join(os.tmpdir(), 'ccui-plugin-dir-'));
  const manifestDir = path.join(pluginDir, '.claude-plugin');
  await mkdir(manifestDir, { recursive: true });
  await writeFile(path.join(manifestDir, 'plugin.json'), JSON.stringify(manifest));
  return pluginDir;
}

test('imports local directory and lists Lite registry plugins with sdkPlugins', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'ccui-plugin-home-'));
  const pluginDir = await createTempPlugin();

  try {
    await withPluginTestServer({ homeDir }, async (baseUrl) => {
      const importResponse = await fetch(`${baseUrl}/api/plugins/import-directory`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: pluginDir }),
      });
      const importedBody = await importResponse.json();

      assert.equal(importResponse.status, 200);
      assert.equal(importedBody.plugin.id, 'demo@local');
      assert.equal(importedBody.plugin.name, 'Demo Plugin');
      assert.equal(importedBody.plugin.version, '1.2.3');
      assert.equal(importedBody.plugin.path, pluginDir);
      assert.equal(importedBody.plugin.enabled, true);
      assert.equal(importedBody.plugin.source, 'local-directory');
      assert.equal(importedBody.plugin.description, undefined);

      const listResponse = await fetch(`${baseUrl}/api/plugins`);
      const listBody = await listResponse.json();

      assert.equal(listResponse.status, 200);
      assert.equal(listBody.plugins.length, 1);
      assert.equal(listBody.plugins[0].id, 'demo@local');
      assert.deepEqual(listBody.sdkPlugins, [{ type: 'local', path: pluginDir }]);
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
    await rm(pluginDir, { recursive: true, force: true });
  }
});

test('PATCH enables and disables plugins and disabled plugins are omitted from sdkPlugins', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'ccui-plugin-home-'));
  const pluginDir = await createTempPlugin({ id: 'toggle@local' });

  try {
    await withPluginTestServer({ homeDir }, async (baseUrl) => {
      await fetch(`${baseUrl}/api/plugins/import-directory`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: pluginDir }),
      });

      const disableResponse = await fetch(`${baseUrl}/api/plugins/toggle%40local`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      });
      const disabledBody = await disableResponse.json();

      assert.equal(disableResponse.status, 200);
      assert.equal(disabledBody.plugin.enabled, false);

      const disabledListResponse = await fetch(`${baseUrl}/api/plugins`);
      const disabledListBody = await disabledListResponse.json();
      assert.deepEqual(disabledListBody.sdkPlugins, []);

      const enableResponse = await fetch(`${baseUrl}/api/plugins/toggle%40local`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      const enabledBody = await enableResponse.json();

      assert.equal(enableResponse.status, 200);
      assert.equal(enabledBody.plugin.enabled, true);

      const enabledListResponse = await fetch(`${baseUrl}/api/plugins`);
      const enabledListBody = await enabledListResponse.json();
      assert.deepEqual(enabledListBody.sdkPlugins, [{ type: 'local', path: pluginDir }]);
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
    await rm(pluginDir, { recursive: true, force: true });
  }
});

test('PATCH rejects explicitly empty sourceKind without modifying Lite plugins', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'ccui-plugin-home-'));
  const pluginDir = await createTempPlugin({ id: 'patch-empty-source@local' });

  try {
    await withPluginTestServer({ homeDir }, async (baseUrl) => {
      await fetch(`${baseUrl}/api/plugins/import-directory`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: pluginDir }),
      });

      const response = await fetch(`${baseUrl}/api/plugins/patch-empty-source%40local`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: false, sourceKind: '' }),
      });
      const body = await response.json();

      assert.equal(response.status, 400);
      assert.match(body.message, /sourceKind/i);

      const listResponse = await fetch(`${baseUrl}/api/plugins`);
      const listBody = await listResponse.json();
      assert.equal(listResponse.status, 200);
      assert.equal(listBody.plugins[0].id, 'patch-empty-source@local');
      assert.equal(listBody.plugins[0].enabled, true);
      assert.deepEqual(listBody.sdkPlugins, [{ type: 'local', path: pluginDir }]);
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
    await rm(pluginDir, { recursive: true, force: true });
  }
});

test('DELETE removes Lite plugins from the managed plugin list', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'ccui-plugin-home-'));
  const pluginDir = await createTempPlugin({ id: 'delete@local' });

  try {
    await withPluginTestServer({ homeDir }, async (baseUrl) => {
      await fetch(`${baseUrl}/api/plugins/import-directory`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: pluginDir }),
      });

      const deleteResponse = await fetch(`${baseUrl}/api/plugins/delete%40local?sourceKind=lite`, {
        method: 'DELETE',
      });
      const deleteBody = await deleteResponse.json();

      assert.equal(deleteResponse.status, 200);
      assert.deepEqual(deleteBody, {
        success: true,
        result: { removed: true, disabled: false },
      });

      const listResponse = await fetch(`${baseUrl}/api/plugins`);
      const listBody = await listResponse.json();
      assert.equal(listResponse.status, 200);
      assert.deepEqual(listBody.plugins, []);
      assert.deepEqual(listBody.sdkPlugins, []);
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
    await rm(pluginDir, { recursive: true, force: true });
  }
});

test('DELETE rejects explicitly empty query sourceKind without removing Lite plugins', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'ccui-plugin-home-'));
  const pluginDir = await createTempPlugin({ id: 'delete-empty-source@local' });

  try {
    await withPluginTestServer({ homeDir }, async (baseUrl) => {
      await fetch(`${baseUrl}/api/plugins/import-directory`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: pluginDir }),
      });

      const response = await fetch(`${baseUrl}/api/plugins/delete-empty-source%40local?sourceKind=`, {
        method: 'DELETE',
      });
      const body = await response.json();

      assert.equal(response.status, 400);
      assert.match(body.message, /sourceKind/i);

      const listResponse = await fetch(`${baseUrl}/api/plugins`);
      const listBody = await listResponse.json();
      assert.equal(listResponse.status, 200);
      assert.equal(listBody.plugins.length, 1);
      assert.equal(listBody.plugins[0].id, 'delete-empty-source@local');
      assert.deepEqual(listBody.sdkPlugins, [{ type: 'local', path: pluginDir }]);
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
    await rm(pluginDir, { recursive: true, force: true });
  }
});

test('import-directory rejects relative paths before reading a manifest', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'ccui-plugin-home-'));

  try {
    await withPluginTestServer({ homeDir }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/plugins/import-directory`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: 'relative/plugin' }),
      });
      const body = await response.json();

      assert.equal(response.status, 400);
      assert.match(body.message, /absolute/i);
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('import-directory rejects manifests with non-string fields', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'ccui-plugin-home-'));
  const pluginDir = await createTempPluginWithManifest({
    id: 123,
    name: 'Bad Plugin',
    version: '1.0.0',
  });

  try {
    await withPluginTestServer({ homeDir }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/plugins/import-directory`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: pluginDir }),
      });
      const body = await response.json();

      assert.equal(response.status, 400);
      assert.match(body.message, /id.*string/i);
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
    await rm(pluginDir, { recursive: true, force: true });
  }
});

test('reload calls reloadPlugins on live sessions and skips sessions without the method', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'ccui-plugin-home-'));
  const calls = [];
  const runtime = {
    listLiveSessions() {
      return [
        { id: 'one', reloadPlugins: async () => calls.push('one') },
        { id: 'two' },
        { sessionId: 'three', reloadPlugins: async () => calls.push('three') },
      ];
    },
  };

  try {
    await withPluginTestServer({ homeDir, runtime }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/plugins/reload`, { method: 'POST' });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(calls, ['one', 'three']);
      assert.deepEqual(body, {
        success: true,
        total: 3,
        reloaded: 2,
        skipped: 1,
        sessions: [
          { id: 'one', reloaded: true },
          { id: 'two', reloaded: false, reason: 'Plugin reload is not supported by this session.' },
          { id: 'three', reloaded: true },
        ],
      });
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('reload skips sessions whose reloadPlugins method reports unsupported', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'ccui-plugin-home-'));
  const runtime = {
    listLiveSessions() {
      return [
        {
          id: 'unsupported',
          async reloadPlugins() {
            throw new Error('Plugin reload is not supported by this Claude Agent SDK session');
          },
        },
      ];
    },
  };

  try {
    await withPluginTestServer({ homeDir, runtime }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/plugins/reload`, { method: 'POST' });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.success, true);
      assert.equal(body.reloaded, 0);
      assert.equal(body.skipped, 1);
      assert.deepEqual(body.sessions, [{
        id: 'unsupported',
        reloaded: false,
        reason: 'Plugin reload is not supported by this Claude Agent SDK session',
      }]);
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('importing createPluginRouter and using a fake runtime does not initialize default services', async () => {
  const databasePath = path.join(os.tmpdir(), `ccui-plugin-side-effect-${Date.now()}.db`);
  const script = `
    import { createPluginRouter } from './server/routes/plugins.js';
    const router = createPluginRouter({ runtime: { listLiveSessions: () => [] } });
    if (!router || typeof router.use !== 'function') {
      throw new Error('router was not created');
    }
  `;

  const { stdout, stderr } = await execFileAsync(process.execPath, [
    '--experimental-strip-types',
    '--experimental-specifier-resolution=node',
    '--input-type=module',
    '-e',
    script,
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_PATH: databasePath,
    },
  });

  assert.doesNotMatch(stdout, /Database:/);
  assert.doesNotMatch(stdout, /App Installation:/);
  assert.equal(stderr, '');
});
