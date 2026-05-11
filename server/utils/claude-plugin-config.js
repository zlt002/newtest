import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getLiteRegistryPath, litePluginsToSdkPlugins } from './lite-registry.js';

function readJsonFileSync(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readSettingsFileSync(filePath) {
  const settings = readJsonFileSync(filePath);
  return settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
}

function normalizeEnabledPluginsMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => typeof key === 'string' && key.trim())
      .map(([key, enabled]) => [key.trim(), Boolean(enabled)]),
  );
}

function mergeEnabledPlugins({ userSettings, projectSettings, localSettings }) {
  return {
    ...normalizeEnabledPluginsMap(userSettings?.enabledPlugins),
    ...normalizeEnabledPluginsMap(projectSettings?.enabledPlugins),
    ...normalizeEnabledPluginsMap(localSettings?.enabledPlugins),
  };
}

function readInstalledPluginsSync(homeDir) {
  const installedPluginsPath = path.join(homeDir, '.claude', 'plugins', 'installed_plugins.json');
  const payload = readJsonFileSync(installedPluginsPath);
  const plugins = payload?.plugins;
  return plugins && typeof plugins === 'object' && !Array.isArray(plugins) ? plugins : {};
}

function readLitePluginsSync(homeDir) {
  const payload = readJsonFileSync(getLiteRegistryPath(homeDir));
  return Array.isArray(payload?.plugins) ? payload.plugins : [];
}

function pickInstallRecord(records, projectPath) {
  if (!Array.isArray(records) || records.length === 0) {
    return null;
  }

  const normalizedProjectPath = typeof projectPath === 'string' ? projectPath.trim() : '';
  if (normalizedProjectPath) {
    const projectMatch = records.find((record) =>
      record
      && record.scope === 'project'
      && typeof record.projectPath === 'string'
      && record.projectPath.trim() === normalizedProjectPath
      && typeof record.installPath === 'string'
      && record.installPath.trim(),
    );
    if (projectMatch) {
      return projectMatch;
    }
  }

  const userMatch = records.find((record) =>
    record
    && record.scope === 'user'
    && typeof record.installPath === 'string'
    && record.installPath.trim(),
  );
  if (userMatch) {
    return userMatch;
  }

  return records.find((record) =>
    record
    && typeof record.installPath === 'string'
    && record.installPath.trim(),
  ) || null;
}

export function loadClaudePluginsSync({ projectPath, homeDir = os.homedir() } = {}) {
  const userSettings = readSettingsFileSync(path.join(homeDir, '.claude', 'settings.json'));
  const projectSettings = projectPath
    ? readSettingsFileSync(path.join(projectPath, '.claude', 'settings.json'))
    : {};
  const localSettings = projectPath
    ? readSettingsFileSync(path.join(projectPath, '.claude', 'settings.local.json'))
    : {};

  const enabledPlugins = mergeEnabledPlugins({ userSettings, projectSettings, localSettings });
  const installedPlugins = readInstalledPluginsSync(homeDir);
  const seenPaths = new Set();
  const resolvedPlugins = [];

  const addSdkPlugin = (plugin) => {
    const pluginPath = typeof plugin?.path === 'string' ? plugin.path.trim() : '';
    if (!pluginPath || seenPaths.has(pluginPath)) {
      return;
    }

    seenPaths.add(pluginPath);
    resolvedPlugins.push({
      type: 'local',
      path: pluginPath,
    });
  };

  for (const [pluginId, enabled] of Object.entries(enabledPlugins)) {
    if (!enabled) {
      continue;
    }

    const installRecord = pickInstallRecord(installedPlugins[pluginId], projectPath);
    const installPath = typeof installRecord?.installPath === 'string' ? installRecord.installPath.trim() : '';
    addSdkPlugin({ type: 'local', path: installPath });
  }

  for (const plugin of litePluginsToSdkPlugins(readLitePluginsSync(homeDir))) {
    addSdkPlugin(plugin);
  }

  return resolvedPlugins;
}
