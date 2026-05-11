import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  getLiteRegistryPath,
  listLitePlugins,
  upsertLitePlugin,
  setLitePluginEnabled,
  litePluginsToSdkPlugins,
} from './lite-registry.js';

function createMemoryFs(initialFiles = {}) {
  const files = { ...initialFiles };
  return {
    files,
    async readFile(filepath, encoding) {
      assert.equal(encoding, 'utf8');
      if (!(filepath in files)) {
        const error = new Error(`ENOENT: ${filepath}`);
        error.code = 'ENOENT';
        throw error;
      }
      return files[filepath];
    },
    async mkdir() {},
    async writeFile(filepath, content, encoding) {
      assert.equal(encoding, 'utf8');
      files[filepath] = content;
    },
  };
}

test('getLiteRegistryPath uses ~/.ccui/lite-registry.json', () => {
  assert.equal(
    getLiteRegistryPath('/tmp/home'),
    path.join('/tmp/home', '.ccui', 'lite-registry.json'),
  );
});

test('upsertLitePlugin writes normalized plugin metadata and listLitePlugins reads it back', async () => {
  const fs = createMemoryFs();
  const homeDir = '/tmp/home';
  const plugin = await upsertLitePlugin({
    homeDir,
    fileSystem: fs,
    plugin: {
      id: 'superpowers@claude-plugins-official',
      path: '/tmp/plugins/superpowers/5.0.7',
    },
  });

  assert.deepEqual(plugin, {
    id: 'superpowers@claude-plugins-official',
    name: 'superpowers@claude-plugins-official',
    version: 'local',
    path: '/tmp/plugins/superpowers/5.0.7',
    source: 'local-directory',
    type: 'local',
    local: true,
    enabled: true,
    updatedAt: plugin.updatedAt,
  });
  assert.match(plugin.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(await listLitePlugins({ homeDir, fileSystem: fs }), [plugin]);
});

test('upsertLitePlugin derives id and preserves unknown metadata', async () => {
  const fs = createMemoryFs();
  const homeDir = '/tmp/home';
  const plugin = await upsertLitePlugin({
    homeDir,
    fileSystem: fs,
    plugin: {
      name: 'Demo Plugin',
      path: '/tmp/plugins/demo',
      customField: { nested: true },
    },
  });

  assert.equal(plugin.id, 'Demo Plugin');
  assert.equal(plugin.type, 'local');
  assert.equal(plugin.local, true);
  assert.deepEqual(plugin.customField, { nested: true });
});

test('upsertLitePlugin updates an existing plugin without dropping other fields', async () => {
  const homeDir = '/tmp/home';
  const registryPath = getLiteRegistryPath(homeDir);
  const fs = createMemoryFs({
    [registryPath]: JSON.stringify({
      plugins: [{
        id: 'demo@local',
        name: 'Demo',
        version: '1.0.0',
        path: '/tmp/demo',
        source: 'zip',
        type: 'archive',
        local: false,
        enabled: false,
        updatedAt: '2024-01-01T00:00:00.000Z',
        customField: 'keep-me',
      }],
    }),
  });

  const updated = await upsertLitePlugin({
    homeDir,
    fileSystem: fs,
    plugin: {
      id: 'demo@local',
      path: '/tmp/demo-new',
      enabled: true,
    },
  });

  assert.equal(updated.path, '/tmp/demo-new');
  assert.equal(updated.enabled, true);
  assert.equal(updated.name, 'Demo');
  assert.equal(updated.version, '1.0.0');
  assert.equal(updated.source, 'zip');
  assert.equal(updated.type, 'archive');
  assert.equal(updated.local, false);
  assert.equal(updated.customField, 'keep-me');
  assert.notEqual(updated.updatedAt, '2024-01-01T00:00:00.000Z');
});

test('setLitePluginEnabled toggles an existing plugin without dropping metadata', async () => {
  const homeDir = '/tmp/home';
  const registryPath = getLiteRegistryPath(homeDir);
  const fs = createMemoryFs({
    [registryPath]: JSON.stringify({
      plugins: [{
        id: 'demo@local',
        name: 'Demo',
        version: '1.0.0',
        path: '/tmp/demo',
        source: 'zip',
        type: 'archive',
        local: false,
        enabled: true,
        updatedAt: '2024-01-01T00:00:00.000Z',
        customField: 'keep-me',
      }],
    }),
  });

  const updated = await setLitePluginEnabled({
    homeDir,
    fileSystem: fs,
    id: 'demo@local',
    enabled: false,
  });

  assert.equal(updated.enabled, false);
  assert.equal(updated.customField, 'keep-me');
  assert.notEqual(updated.updatedAt, '2024-01-01T00:00:00.000Z');
  const listed = await listLitePlugins({ homeDir, fileSystem: fs });
  assert.deepEqual(listed, [{
    id: 'demo@local',
    name: 'Demo',
    version: '1.0.0',
    path: '/tmp/demo',
    source: 'zip',
    type: 'archive',
    local: false,
    enabled: false,
    updatedAt: updated.updatedAt,
    customField: 'keep-me',
  }]);
});

test('setLitePluginEnabled rejects blank plugin id', async () => {
  await assert.rejects(
    setLitePluginEnabled({
      homeDir: '/tmp/home',
      fileSystem: createMemoryFs(),
      id: '   ',
      enabled: false,
    }),
    (error) => error.statusCode === 400,
  );
});

test('setLitePluginEnabled does not match invalid registry entries without path', async () => {
  const homeDir = '/tmp/home';
  const registryPath = getLiteRegistryPath(homeDir);
  const fs = createMemoryFs({
    [registryPath]: JSON.stringify({
      plugins: [{
        id: 'ghost',
        name: 'Ghost',
        enabled: true,
        updatedAt: '2024-01-01T00:00:00.000Z',
      }],
    }),
  });

  await assert.rejects(
    setLitePluginEnabled({
      homeDir,
      fileSystem: fs,
      id: 'ghost',
      enabled: false,
    }),
    (error) => error.statusCode === 404,
  );
  assert.deepEqual(await listLitePlugins({ homeDir, fileSystem: fs }), []);
});

test('setLitePluginEnabled preserves unknown fields on valid entries', async () => {
  const homeDir = '/tmp/home';
  const registryPath = getLiteRegistryPath(homeDir);
  const fs = createMemoryFs({
    [registryPath]: JSON.stringify({
      plugins: [{
        id: 'custom@local',
        path: '/tmp/custom',
        enabled: false,
        updatedAt: '2024-01-01T00:00:00.000Z',
        customField: { keep: true },
      }],
    }),
  });

  const updated = await setLitePluginEnabled({
    homeDir,
    fileSystem: fs,
    id: 'custom@local',
    enabled: true,
  });

  assert.equal(updated.enabled, true);
  assert.deepEqual(updated.customField, { keep: true });
  assert.notEqual(updated.updatedAt, '2024-01-01T00:00:00.000Z');
});

test('upsertLitePlugin rejects plugins without path', async () => {
  await assert.rejects(
    upsertLitePlugin({
      homeDir: '/tmp/home',
      fileSystem: createMemoryFs(),
      plugin: { id: 'missing-path' },
    }),
    (error) => error.statusCode === 400,
  );
});

test('litePluginsToSdkPlugins returns enabled local plugins deduplicated by path', () => {
  assert.deepEqual(litePluginsToSdkPlugins([
    { id: 'a', path: '/tmp/a', enabled: true },
    { id: 'b', path: '/tmp/a', enabled: true },
    { id: 'c', path: '/tmp/c', enabled: false },
    { id: 'd', path: '/tmp/d' },
  ]), [
    { type: 'local', path: '/tmp/a' },
    { type: 'local', path: '/tmp/d' },
  ]);
});
