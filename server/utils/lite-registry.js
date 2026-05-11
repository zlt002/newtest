import os from 'node:os';
import path from 'node:path';

import { readJsonObjectFile, updateJsonObjectFile } from './json-file-store.js';

export function getLiteRegistryPath(homeDir = os.homedir()) {
  return path.join(homeDir, '.ccui', 'lite-registry.json');
}

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function derivePluginId(plugin) {
  return trimString(plugin?.id) || trimString(plugin?.name) || trimString(plugin?.path);
}

function normalizePlugin(plugin, { updatedAt } = {}) {
  const id = derivePluginId(plugin);
  const pluginPath = typeof plugin?.path === 'string' ? plugin.path.trim() : '';

  if (!pluginPath) {
    return null;
  }

  return {
    ...plugin,
    id,
    name: typeof plugin.name === 'string' && plugin.name.trim() ? plugin.name.trim() : id,
    version: typeof plugin.version === 'string' && plugin.version.trim() ? plugin.version.trim() : 'local',
    path: pluginPath,
    source: typeof plugin.source === 'string' && plugin.source.trim() ? plugin.source.trim() : 'local-directory',
    type: typeof plugin.type === 'string' && plugin.type.trim() ? plugin.type.trim() : 'local',
    local: typeof plugin.local === 'boolean' ? plugin.local : true,
    enabled: plugin.enabled !== false,
    updatedAt: updatedAt ?? plugin.updatedAt,
  };
}

function normalizePlugins(value) {
  return (Array.isArray(value) ? value : [])
    .map(normalizePlugin)
    .filter(Boolean);
}

export async function listLitePlugins({
  homeDir = os.homedir(),
  fileSystem,
} = {}) {
  const registry = await readJsonObjectFile(getLiteRegistryPath(homeDir), { fileSystem });
  return normalizePlugins(registry.plugins);
}

export async function upsertLitePlugin({
  homeDir = os.homedir(),
  fileSystem,
  plugin,
} = {}) {
  const normalized = normalizePlugin(plugin);
  if (!normalized) {
    const error = new Error('Plugin path is required.');
    error.statusCode = 400;
    throw error;
  }

  const now = new Date().toISOString();
  const incomingId = normalized.id;
  let updated = null;

  await updateJsonObjectFile(getLiteRegistryPath(homeDir), (current) => {
    const plugins = normalizePlugins(current.plugins);
    const existingIndex = plugins.findIndex((entry) => entry.id === incomingId);

    if (existingIndex === -1) {
      updated = normalizePlugin(plugin, { updatedAt: now });
      return {
        ...current,
        plugins: [...plugins, updated],
      };
    }

    updated = normalizePlugin({
      ...plugins[existingIndex],
      ...plugin,
      id: incomingId,
    }, { updatedAt: now });
    plugins[existingIndex] = updated;
    return {
      ...current,
      plugins,
    };
  }, { fileSystem });

  return updated;
}

export async function setLitePluginEnabled({
  homeDir = os.homedir(),
  fileSystem,
  id,
  enabled,
} = {}) {
  const normalizedId = typeof id === 'string' ? id.trim() : '';
  if (!normalizedId) {
    const error = new Error('Plugin id is required.');
    error.statusCode = 400;
    throw error;
  }

  let updated = null;

  await updateJsonObjectFile(getLiteRegistryPath(homeDir), (current) => {
    const now = new Date().toISOString();
    const plugins = normalizePlugins(current.plugins).map((plugin) => {
      if (plugin.id !== normalizedId) {
        return plugin;
      }
      updated = { ...plugin, enabled: Boolean(enabled), updatedAt: now };
      return updated;
    });
    return { ...current, plugins };
  }, { fileSystem });

  if (!updated) {
    const error = new Error(`Plugin not found: ${normalizedId}`);
    error.statusCode = 404;
    throw error;
  }

  return updated;
}

export function litePluginsToSdkPlugins(plugins = []) {
  const seenPaths = new Set();
  const sdkPlugins = [];

  for (const plugin of normalizePlugins(plugins)) {
    if (!plugin.enabled || seenPaths.has(plugin.path)) {
      continue;
    }
    seenPaths.add(plugin.path);
    sdkPlugins.push({ type: 'local', path: plugin.path });
  }

  return sdkPlugins;
}
