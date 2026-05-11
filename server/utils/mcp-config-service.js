import os from 'node:os';
import path from 'node:path';

import { updateJsonObjectFile } from './json-file-store.js';

function createBadRequestError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizeName(name) {
  if (typeof name !== 'string' || !name.trim()) {
    throw createBadRequestError('MCP server name is required');
  }
  return name.trim();
}

function normalizeConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw createBadRequestError('MCP server config must be an object');
  }

  const type = config.type || config.transport || (config.url ? 'http' : 'stdio');
  if (type === 'stdio' && (typeof config.command !== 'string' || !config.command.trim())) {
    throw createBadRequestError('stdio MCP server config requires command');
  }
  if ((type === 'http' || type === 'sse') && (typeof config.url !== 'string' || !config.url.trim())) {
    throw createBadRequestError(`${type} MCP server config requires url`);
  }

  return { ...config };
}

export function validateMcpServerConfig({ name, config } = {}) {
  return {
    name: normalizeName(name),
    config: normalizeConfig(config),
  };
}

export function toManagedMcpServers(servers = []) {
  const nameCounts = servers.reduce((counts, server) => {
    const name = server?.name;
    if (typeof name === 'string') {
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return counts;
  }, new Map());

  return servers.map((server) => ({
    ...server,
    enabled: server?.enabled !== false,
    ...(nameCounts.get(server?.name) > 1 ? { duplicateName: true } : {}),
    source: {
      kind: server?.scope || 'unknown',
      path: server?.sourcePath || '',
      writable: Boolean(server?.sourcePath),
    },
  }));
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeAllowedProjectPaths(allowedProjectPaths) {
  return Array.isArray(allowedProjectPaths)
    ? allowedProjectPaths
        .filter((projectPath) => typeof projectPath === 'string' && projectPath.trim())
        .map((projectPath) => path.resolve(projectPath.trim()))
    : null;
}

function assertAllowedProjectPath(projectPath, allowedProjectPaths, scope = 'project') {
  const normalizedProjectPath = normalizeProjectPath(projectPath, scope);
  const normalizedAllowedProjectPaths = normalizeAllowedProjectPaths(allowedProjectPaths);
  if (
    normalizedAllowedProjectPaths
    && !normalizedAllowedProjectPaths.includes(path.resolve(normalizedProjectPath))
  ) {
    throw createBadRequestError('projectPath is not a managed project path');
  }
  return normalizedProjectPath;
}

function getScopedConfigPath({ scope, homeDir, projectPath, allowedProjectPaths }) {
  if (scope === 'project') {
    return path.join(assertAllowedProjectPath(projectPath, allowedProjectPaths, 'project'), '.mcp.json');
  }

  if (scope === 'local') {
    assertAllowedProjectPath(projectPath, allowedProjectPaths, 'local');
    return path.join(homeDir, '.claude.json');
  }

  if (scope === 'legacy') {
    return path.join(homeDir, '.claude.json');
  }

  return path.join(homeDir, '.claude', 'settings.json');
}

function normalizeSourcePath(sourcePath) {
  if (typeof sourcePath !== 'string' || !sourcePath.trim()) {
    throw createBadRequestError('sourcePath is required');
  }
  return sourcePath.trim();
}

function normalizeProjectPath(projectPath, scope = 'local') {
  if (typeof projectPath !== 'string' || !projectPath.trim()) {
    throw createBadRequestError(`projectPath is required for ${scope} scope`);
  }
  return projectPath.trim();
}

function normalizeScope(scope) {
  if (scope === undefined || scope === null || scope === '') {
    return 'user';
  }
  if (scope === 'user' || scope === 'project' || scope === 'local') {
    return scope;
  }
  throw createBadRequestError(`Unsupported MCP config scope: ${scope}`);
}

function samePath(left, right) {
  return path.resolve(left) === path.resolve(right);
}

function getUserConfigPaths(homeDir) {
  return [
    path.join(homeDir, '.claude.json'),
    path.join(homeDir, '.claude', 'settings.json'),
  ];
}

function assertManagedSourcePath({
  scope,
  homeDir = os.homedir(),
  projectPath,
  sourcePath,
  allowedProjectPaths,
}) {
  const normalizedScope = normalizeScope(scope);
  const normalizedSourcePath = normalizeSourcePath(sourcePath);
  const normalizedHomeDir = typeof homeDir === 'string' && homeDir.trim()
    ? homeDir.trim()
    : os.homedir();

  if (normalizedScope === 'project') {
    const normalizedProjectPath = assertAllowedProjectPath(projectPath, allowedProjectPaths, 'project');
    const expectedSourcePath = path.join(normalizedProjectPath, '.mcp.json');
    if (!samePath(normalizedSourcePath, expectedSourcePath)) {
      throw createBadRequestError('sourcePath is not a managed MCP config path for project scope');
    }
    return {
      scope: normalizedScope,
      sourcePath: normalizedSourcePath,
      projectPath: normalizedProjectPath,
    };
  }

  const allowedUserPaths = getUserConfigPaths(normalizedHomeDir);
  if (!allowedUserPaths.some((allowedPath) => samePath(normalizedSourcePath, allowedPath))) {
    throw createBadRequestError(`sourcePath is not a managed MCP config path for ${normalizedScope} scope`);
  }

  return {
    scope: normalizedScope,
    sourcePath: normalizedSourcePath,
    projectPath: normalizedScope === 'local' ? assertAllowedProjectPath(projectPath, allowedProjectPaths, 'local') : null,
  };
}

function updateTopLevelMcpServers(current, serverName, serverConfig) {
  return {
    ...current,
    mcpServers: {
      ...normalizeObject(current.mcpServers),
      [serverName]: serverConfig,
    },
  };
}

function updateLocalMcpServers(current, projectPath, serverName, serverConfig) {
  const projects = normalizeObject(current.projects);
  const projectConfig = normalizeObject(projects[projectPath]);

  return {
    ...current,
    projects: {
      ...projects,
      [projectPath]: {
        ...projectConfig,
        mcpServers: {
          ...normalizeObject(projectConfig.mcpServers),
          [serverName]: serverConfig,
        },
      },
    },
  };
}

function deleteTopLevelMcpServer(current, serverName) {
  const mcpServers = { ...normalizeObject(current.mcpServers) };
  delete mcpServers[serverName];

  return {
    ...current,
    mcpServers,
  };
}

function deleteLocalMcpServer(current, projectPath, serverName) {
  const projects = normalizeObject(current.projects);
  const projectConfig = normalizeObject(projects[projectPath]);
  const mcpServers = { ...normalizeObject(projectConfig.mcpServers) };
  delete mcpServers[serverName];

  return {
    ...current,
    projects: {
      ...projects,
      [projectPath]: {
        ...projectConfig,
        mcpServers,
      },
    },
  };
}

export async function createMcpServerConfig({
  scope = 'user',
  homeDir = os.homedir(),
  projectPath,
  allowedProjectPaths,
  fileSystem,
  name,
  config,
} = {}) {
  const serverName = normalizeName(name);
  const serverConfig = normalizeConfig(config);
  const sourcePath = getScopedConfigPath({ scope, homeDir, projectPath, allowedProjectPaths });
  const normalizedProjectPath = scope === 'local' ? assertAllowedProjectPath(projectPath, allowedProjectPaths, 'local') : null;

  const data = await updateJsonObjectFile(sourcePath, (current) => (
    scope === 'local'
      ? updateLocalMcpServers(current, normalizedProjectPath, serverName, serverConfig)
      : updateTopLevelMcpServers(current, serverName, serverConfig)
  ), { fileSystem });

  return { sourcePath, data };
}

export async function updateMcpServerConfig({
  scope,
  homeDir = os.homedir(),
  projectPath,
  sourcePath,
  allowedProjectPaths,
  fileSystem,
  name,
  config,
} = {}) {
  const serverName = normalizeName(name);
  const serverConfig = normalizeConfig(config);
  const managedSource = assertManagedSourcePath({
    scope,
    homeDir,
    projectPath,
    sourcePath,
    allowedProjectPaths,
  });

  const data = await updateJsonObjectFile(managedSource.sourcePath, (current) => (
    managedSource.scope === 'local'
      ? updateLocalMcpServers(current, managedSource.projectPath, serverName, serverConfig)
      : updateTopLevelMcpServers(current, serverName, serverConfig)
  ), { fileSystem });

  return { sourcePath: managedSource.sourcePath, data };
}

export async function deleteMcpServerConfig({
  scope,
  homeDir = os.homedir(),
  projectPath,
  sourcePath,
  allowedProjectPaths,
  fileSystem,
  name,
} = {}) {
  const serverName = normalizeName(name);
  const managedSource = assertManagedSourcePath({
    scope,
    homeDir,
    projectPath,
    sourcePath,
    allowedProjectPaths,
  });

  const data = await updateJsonObjectFile(managedSource.sourcePath, (current) => {
    if (managedSource.scope === 'local') {
      return deleteLocalMcpServer(current, managedSource.projectPath, serverName);
    }

    return deleteTopLevelMcpServer(current, serverName);
  }, { fileSystem });

  return { sourcePath: managedSource.sourcePath, data };
}
