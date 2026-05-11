import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';

import { getLiteRegistryPath } from './lite-registry.js';
import {
  listManagedPlugins,
  removeManagedPlugin,
  setManagedPluginEnabled,
} from './plugin-management-service.js';

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2));
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

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

test('listManagedPlugins merges Lite registry and CLI installed plugins', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'ccui-managed-plugin-home-'));
  const litePath = '/tmp/plugins/lite';
  const cliPath = '/tmp/plugins/cli';

  try {
    await writeJson(getLiteRegistryPath(homeDir), {
      plugins: [
        { id: 'lite@local', name: 'Lite Plugin', path: litePath, enabled: true },
      ],
    });
    await writeJson(path.join(homeDir, '.claude', 'settings.json'), {
      enabledPlugins: {
        'cli-enabled@vendor': true,
        'cli-disabled@vendor': false,
      },
    });
    await writeJson(path.join(homeDir, '.claude', 'plugins', 'installed_plugins.json'), {
      plugins: {
        'cli-enabled@vendor': [
          { scope: 'user', installPath: cliPath, version: '2.0.0' },
        ],
        'cli-disabled@vendor': [
          { scope: 'user', installPath: '/tmp/plugins/disabled' },
        ],
      },
    });

    const plugins = await listManagedPlugins({ homeDir });

    assert.equal(plugins.length, 3);
    assert.deepEqual(plugins.map((plugin) => plugin.id), [
      'lite@local',
      'cli-enabled@vendor',
      'cli-disabled@vendor',
    ]);
    assert.deepEqual(plugins[0].source, {
      kind: 'lite',
      path: getLiteRegistryPath(homeDir),
      writable: true,
      removable: true,
    });
    assert.equal(plugins[0].sdkResolved, true);
    assert.deepEqual(plugins[1].source, {
      kind: 'cli',
      path: path.join(homeDir, '.claude', 'settings.json'),
      writable: true,
      removable: false,
    });
    assert.equal(plugins[1].enabled, true);
    assert.equal(plugins[1].path, cliPath);
    assert.equal(plugins[1].sdkResolved, true);
    assert.equal(plugins[2].enabled, false);
    assert.equal(plugins[2].sdkResolved, false);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('listManagedPlugins uses injected SDK plugin paths with memory fileSystem', async () => {
  const homeDir = '/tmp/ccui-memory-home';
  const sdkOnlyPath = '/tmp/plugins/sdk-only';
  const liteOnlyPath = '/tmp/plugins/lite-only';
  const cliPath = '/tmp/plugins/cli';
  const fs = createMemoryFs({
    [getLiteRegistryPath(homeDir)]: JSON.stringify({
      plugins: [
        { id: 'sdk-only@local', name: 'SDK Only', path: sdkOnlyPath, enabled: false },
        { id: 'lite-only@local', name: 'Lite Only', path: liteOnlyPath, enabled: false },
      ],
    }),
    [path.join(homeDir, '.claude', 'settings.json')]: JSON.stringify({
      enabledPlugins: { 'cli@vendor': true },
    }),
    [path.join(homeDir, '.claude', 'plugins', 'installed_plugins.json')]: JSON.stringify({
      plugins: {
        'cli@vendor': [
          { scope: 'user', installPath: cliPath },
        ],
      },
    }),
  });

  const plugins = await listManagedPlugins({
    homeDir,
    fileSystem: fs,
    sdkPlugins: [{ type: 'local', path: sdkOnlyPath }],
  });

  assert.deepEqual(
    plugins.map((plugin) => [plugin.id, plugin.sdkResolved]),
    [
      ['sdk-only@local', true],
      ['lite-only@local', false],
      ['cli@vendor', true],
    ],
  );
});

test('setManagedPluginEnabled updates CLI enabledPlugins in settings.json', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'ccui-managed-plugin-home-'));
  const settingsPath = path.join(homeDir, '.claude', 'settings.json');

  try {
    await writeJson(settingsPath, {
      theme: 'dark',
      enabledPlugins: { 'cli@vendor': true },
    });

    const result = await setManagedPluginEnabled({
      homeDir,
      id: 'cli@vendor',
      sourceKind: 'cli',
      enabled: false,
    });

    assert.deepEqual(result, {
      id: 'cli@vendor',
      enabled: false,
      source: {
        kind: 'cli',
        path: settingsPath,
        writable: true,
      },
    });
    assert.deepEqual(await readJson(settingsPath), {
      theme: 'dark',
      enabledPlugins: { 'cli@vendor': false },
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('setManagedPluginEnabled rejects unknown sourceKind without writing settings', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'ccui-managed-plugin-home-'));
  const settingsPath = path.join(homeDir, '.claude', 'settings.json');
  const initialSettings = {
    enabledPlugins: { 'sdk@vendor': true },
  };

  try {
    await writeJson(settingsPath, initialSettings);

    await assert.rejects(
      setManagedPluginEnabled({
        homeDir,
        id: 'sdk@vendor',
        sourceKind: 'sdk',
        enabled: false,
      }),
      (error) => {
        assert.equal(error.statusCode, 400);
        assert.match(error.message, /sourceKind/i);
        assert.match(error.message, /lite/i);
        assert.match(error.message, /cli/i);
        return true;
      },
    );
    assert.deepEqual(await readJson(settingsPath), initialSettings);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('removeManagedPlugin removes Lite plugins from the registry', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'ccui-managed-plugin-home-'));
  const registryPath = getLiteRegistryPath(homeDir);

  try {
    await writeJson(registryPath, {
      plugins: [
        { id: 'keep@local', path: '/tmp/keep', enabled: true },
        { id: 'remove@local', path: '/tmp/remove', enabled: true },
      ],
    });

    const result = await removeManagedPlugin({
      homeDir,
      id: 'remove@local',
      sourceKind: 'lite',
    });

    assert.deepEqual(result, { removed: true, disabled: false });
    assert.deepEqual((await readJson(registryPath)).plugins.map((plugin) => plugin.id), ['keep@local']);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('removeManagedPlugin rejects unknown sourceKind without writing settings', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'ccui-managed-plugin-home-'));
  const settingsPath = path.join(homeDir, '.claude', 'settings.json');
  const initialSettings = {
    enabledPlugins: { 'sdk@vendor': true },
  };

  try {
    await writeJson(settingsPath, initialSettings);

    await assert.rejects(
      removeManagedPlugin({
        homeDir,
        id: 'sdk@vendor',
        sourceKind: 'sdk',
      }),
      (error) => {
        assert.equal(error.statusCode, 400);
        assert.match(error.message, /sourceKind/i);
        assert.match(error.message, /lite/i);
        assert.match(error.message, /cli/i);
        return true;
      },
    );
    assert.deepEqual(await readJson(settingsPath), initialSettings);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('removeManagedPlugin disables CLI plugins instead of uninstalling them', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'ccui-managed-plugin-home-'));
  const settingsPath = path.join(homeDir, '.claude', 'settings.json');

  try {
    await writeJson(settingsPath, {
      enabledPlugins: { 'cli@vendor': true },
    });

    const result = await removeManagedPlugin({
      homeDir,
      id: 'cli@vendor',
      sourceKind: 'cli',
    });

    assert.deepEqual(result, { removed: false, disabled: true });
    assert.equal((await readJson(settingsPath)).enabledPlugins['cli@vendor'], false);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});
