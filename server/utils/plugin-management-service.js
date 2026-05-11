import os from 'node:os';
import path from 'node:path';

import { loadClaudePluginsSync } from './claude-plugin-config.js';
import { readJsonObjectFile, updateJsonObjectFile } from './json-file-store.js';
import {
  getLiteRegistryPath,
  listLitePlugins,
  setLitePluginEnabled,
} from './lite-registry.js';

function getCliSettingsPath(homeDir) {
  return path.join(homeDir, '.claude', 'settings.json');
}

function getCliInstalledPluginsPath(homeDir) {
  return path.join(homeDir, '.claude', 'plugins', 'installed_plugins.json');
}

function normalizeId(id) {
  return typeof id === 'string' ? id.trim() : '';
}

function assertPluginId(id) {
  const normalizedId = normalizeId(id);
  if (!normalizedId) {
    const error = new Error('Plugin id is required.');
    error.statusCode = 400;
    throw error;
  }
  return normalizedId;
}

function assertSourceKind(sourceKind) {
  const normalizedKind = typeof sourceKind === 'string' ? sourceKind.trim() : '';
  if (normalizedKind === 'lite' || normalizedKind === 'cli') {
    return normalizedKind;
  }

  const error = new Error('Plugin sourceKind must be one of: lite, cli.');
  error.statusCode = 400;
  throw error;
}

function normalizeEnabledPlugins(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => typeof key === 'string' && key.trim())
      .map(([key, enabled]) => [key.trim(), Boolean(enabled)]),
  );
}

function normalizeInstalledPlugins(value) {
  const plugins = value?.plugins;
  return plugins && typeof plugins === 'object' && !Array.isArray(plugins) ? plugins : {};
}

function pickInstallRecord(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return null;
  }

  const userRecord = records.find((record) =>
    record
    && record.scope === 'user'
    && typeof record.installPath === 'string'
    && record.installPath.trim(),
  );
  if (userRecord) {
    return userRecord;
  }

  return records.find((record) =>
    record
    && typeof record.installPath === 'string'
    && record.installPath.trim(),
  ) || null;
}

function toCliManagedPlugin({ id, enabled, installRecord, settingsPath }) {
  const installPath = typeof installRecord?.installPath === 'string'
    ? installRecord.installPath.trim()
    : '';

  return {
    id,
    name: typeof installRecord?.name === 'string' && installRecord.name.trim()
      ? installRecord.name.trim()
      : id,
    ...(typeof installRecord?.version === 'string' && installRecord.version.trim()
      ? { version: installRecord.version.trim() }
      : {}),
    ...(installPath ? { path: installPath } : {}),
    type: 'local',
    local: true,
    enabled,
    source: {
      kind: 'cli',
      path: settingsPath,
      writable: true,
      removable: false,
    },
    sdkResolved: enabled && Boolean(installPath),
  };
}

function normalizeSdkPluginPaths(plugins) {
  return new Set(
    (Array.isArray(plugins) ? plugins : [])
      .map((plugin) => (typeof plugin?.path === 'string' ? plugin.path.trim() : ''))
      .filter(Boolean),
  );
}

export async function listManagedPlugins({
  homeDir = os.homedir(),
  fileSystem,
  sdkPlugins,
  loadSdkPlugins,
} = {}) {
  const liteRegistryPath = getLiteRegistryPath(homeDir);
  const settingsPath = getCliSettingsPath(homeDir);
  const [litePlugins, settings, installedPayload] = await Promise.all([
    listLitePlugins({ homeDir, fileSystem }),
    readJsonObjectFile(settingsPath, { fileSystem }),
    readJsonObjectFile(getCliInstalledPluginsPath(homeDir), { fileSystem }),
  ]);
  const resolvedSdkPlugins = Array.isArray(sdkPlugins)
    ? sdkPlugins
    : (typeof loadSdkPlugins === 'function'
      ? loadSdkPlugins({ homeDir })
      : (fileSystem ? [] : loadClaudePluginsSync({ homeDir })));
  const sdkPluginPaths = normalizeSdkPluginPaths(resolvedSdkPlugins);
  const enabledPlugins = normalizeEnabledPlugins(settings.enabledPlugins);
  const installedPlugins = normalizeInstalledPlugins(installedPayload);
  const cliIds = [
    ...new Set([
      ...Object.keys(installedPlugins),
      ...Object.keys(enabledPlugins),
    ]),
  ].filter(Boolean);
  for (const plugin of litePlugins) {
    if (plugin.enabled !== false && typeof plugin.path === 'string' && plugin.path.trim()) {
      sdkPluginPaths.add(plugin.path.trim());
    }
  }
  for (const id of cliIds) {
    const installRecord = pickInstallRecord(installedPlugins[id]);
    const installPath = typeof installRecord?.installPath === 'string'
      ? installRecord.installPath.trim()
      : '';
    if (enabledPlugins[id] && installPath) {
      sdkPluginPaths.add(installPath);
    }
  }

  return [
    ...litePlugins.map((plugin) => ({
      ...plugin,
      source: {
        kind: 'lite',
        path: liteRegistryPath,
        writable: true,
        removable: true,
      },
      sdkResolved: sdkPluginPaths.has(plugin.path),
    })),
    ...cliIds.map((id) => toCliManagedPlugin({
      id,
      enabled: Boolean(enabledPlugins[id]),
      installRecord: pickInstallRecord(installedPlugins[id]),
      settingsPath,
    })),
  ];
}

export async function setManagedPluginEnabled({
  homeDir = os.homedir(),
  fileSystem,
  id,
  sourceKind = 'lite',
  enabled,
} = {}) {
  const normalizedId = assertPluginId(id);
  const normalizedSourceKind = assertSourceKind(sourceKind);
  if (normalizedSourceKind === 'lite') {
    return setLitePluginEnabled({
      homeDir,
      fileSystem,
      id: normalizedId,
      enabled,
    });
  }

  const settingsPath = getCliSettingsPath(homeDir);
  await updateJsonObjectFile(settingsPath, (current) => ({
    ...current,
    enabledPlugins: {
      ...normalizeEnabledPlugins(current.enabledPlugins),
      [normalizedId]: Boolean(enabled),
    },
  }), { fileSystem });

  return {
    id: normalizedId,
    enabled: Boolean(enabled),
    source: {
      kind: 'cli',
      path: settingsPath,
      writable: true,
    },
  };
}

export async function removeManagedPlugin({
  homeDir = os.homedir(),
  fileSystem,
  id,
  sourceKind = 'lite',
} = {}) {
  const normalizedId = assertPluginId(id);
  const normalizedSourceKind = assertSourceKind(sourceKind);
  if (normalizedSourceKind === 'cli') {
    await setManagedPluginEnabled({
      homeDir,
      fileSystem,
      id: normalizedId,
      sourceKind: 'cli',
      enabled: false,
    });
    return { removed: false, disabled: true };
  }

  await updateJsonObjectFile(getLiteRegistryPath(homeDir), (current) => {
    const plugins = Array.isArray(current.plugins)
      ? current.plugins.filter((plugin) => normalizeId(plugin?.id) !== normalizedId)
      : [];
    return { ...current, plugins };
  }, { fileSystem });

  return { removed: true, disabled: false };
}
