import os from 'node:os';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { promises as fs } from 'node:fs';

import { parseFrontmatter } from './frontmatter.js';

const VALID_TYPES = new Set(['skill', 'command']);
const WRITABLE_SOURCE_KINDS = new Set(['user', 'project']);

function createError(message, statusCode = 500, code = 'Error') {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function assertType(type = 'skill') {
  if (!VALID_TYPES.has(type)) {
    throw createError('Capability type must be "skill" or "command".', 400, 'INVALID_CAPABILITY_TYPE');
  }
  return type;
}

function encodeCapabilityId(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCapabilityId(id) {
  if (typeof id !== 'string' || !id.trim()) {
    throw createError('Capability id is required.', 400, 'INVALID_CAPABILITY_ID');
  }

  try {
    const payload = JSON.parse(Buffer.from(id, 'base64url').toString('utf8'));
    if (!payload || typeof payload !== 'object') {
      throw new Error('id payload is not an object');
    }
    const type = assertType(payload.type);
    const sourceKind = typeof payload.sourceKind === 'string' ? payload.sourceKind : '';
    const filepath = typeof payload.filepath === 'string' ? payload.filepath : '';
    if (!sourceKind || !path.isAbsolute(filepath)) {
      throw new Error('id payload is incomplete');
    }
    return { type, sourceKind, filepath };
  } catch (error) {
    if (error?.statusCode) {
      throw error;
    }
    throw createError('Capability id is invalid.', 400, 'INVALID_CAPABILITY_ID');
  }
}

function ensureWritableSource(sourceKind) {
  if (!WRITABLE_SOURCE_KINDS.has(sourceKind)) {
    throw createError('插件来源为只读', 403, 'CAPABILITY_READ_ONLY');
  }
}

function normalizeName(name) {
  if (typeof name !== 'string') {
    throw createError('Capability name is required.', 400, 'INVALID_CAPABILITY_NAME');
  }

  const normalized = name.trim().replace(/[^A-Za-z0-9._-]+/g, '-');
  if (!normalized || normalized === '.' || normalized === '..') {
    throw createError('Capability name is required.', 400, 'INVALID_CAPABILITY_NAME');
  }
  return normalized;
}

function isInsidePath(parentPath, childPath) {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return Boolean(relativePath) && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function getCapabilityFolder(type) {
  return type === 'skill' ? 'skills' : 'commands';
}

function getWritableSourceRoot({ sourceKind, homeDir = os.homedir(), projectPath }) {
  if (sourceKind === 'user') {
    return path.resolve(homeDir);
  }
  if (sourceKind === 'project') {
    if (typeof projectPath !== 'string' || !projectPath.trim()) {
      throw createError('projectPath is required for project capability scope.', 400, 'PROJECT_PATH_REQUIRED');
    }
    return path.resolve(projectPath);
  }
  return null;
}

function assertWritableCapabilityPath({
  type,
  sourceKind,
  filepath,
  homeDir = os.homedir(),
  projectPath,
}) {
  ensureWritableSource(sourceKind);

  const sourceRoot = getWritableSourceRoot({ sourceKind, homeDir, projectPath });
  const managedFolder = path.join(sourceRoot, '.claude', getCapabilityFolder(type));
  const resolvedFilepath = path.resolve(filepath);

  if (!isInsidePath(managedFolder, resolvedFilepath)) {
    throw createError('Capability path is outside the managed source.', 403, 'CAPABILITY_PATH_FORBIDDEN');
  }
  if (type === 'skill' && path.basename(resolvedFilepath) !== 'SKILL.md') {
    throw createError('Skill capability path must end with SKILL.md.', 400, 'INVALID_CAPABILITY_PATH');
  }
  if (type === 'command' && path.extname(resolvedFilepath) !== '.md') {
    throw createError('Command capability path must be a markdown file.', 400, 'INVALID_CAPABILITY_PATH');
  }

  return { filepath: resolvedFilepath, sourceRoot };
}

function assertReadablePluginCapabilityPath({
  type,
  filepath,
  pluginPaths = [],
}) {
  const resolvedFilepath = path.resolve(filepath);
  const allowedPluginRoot = pluginPaths
    .map((pluginPath) => (typeof pluginPath === 'string' ? pluginPath.trim() : ''))
    .filter(Boolean)
    .map((pluginPath) => path.resolve(pluginPath))
    .find((pluginRoot) => isInsidePath(path.join(pluginRoot, getCapabilityFolder(type)), resolvedFilepath));

  if (!allowedPluginRoot) {
    throw createError('Capability path is outside enabled plugin sources.', 403, 'CAPABILITY_PATH_FORBIDDEN');
  }
  if (type === 'skill' && path.basename(resolvedFilepath) !== 'SKILL.md') {
    throw createError('Skill capability path must end with SKILL.md.', 400, 'INVALID_CAPABILITY_PATH');
  }
  if (type === 'command' && path.extname(resolvedFilepath) !== '.md') {
    throw createError('Command capability path must be a markdown file.', 400, 'INVALID_CAPABILITY_PATH');
  }

  return {
    filepath: resolvedFilepath,
    sourceRoot: allowedPluginRoot,
  };
}

function assertReadableCapabilityPath({
  type,
  sourceKind,
  filepath,
  homeDir = os.homedir(),
  projectPath,
  pluginPaths = [],
}) {
  if (sourceKind === 'plugin') {
    return assertReadablePluginCapabilityPath({ type, filepath, pluginPaths });
  }

  return assertWritableCapabilityPath({
    type,
    sourceKind,
    filepath,
    homeDir,
    projectPath,
  });
}

function ensureSingleTrailingNewline(content) {
  const value = typeof content === 'string' ? content : '';
  return `${value.replace(/\n*$/g, '')}\n`;
}

async function pathExists(dirPath) {
  try {
    await fs.access(dirPath);
    return true;
  } catch {
    return false;
  }
}

async function walkMarkdownFiles(rootDir, matcher) {
  if (!(await pathExists(rootDir))) {
    return [];
  }

  const found = [];
  async function visit(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
        continue;
      }
      if (entry.isFile() && matcher(entryPath, entry.name)) {
        found.push(entryPath);
      }
    }
  }

  await visit(rootDir);
  return found;
}

async function scanSource({ type, sourceKind, rootDir, scanDir }) {
  const matcher = type === 'skill'
    ? (_filePath, fileName) => fileName === 'SKILL.md'
    : (_filePath, fileName) => fileName.endsWith('.md');
  const filepaths = await walkMarkdownFiles(scanDir, matcher);

  return Promise.all(
    filepaths.map((filepath) => capabilityFromFile({
      type,
      filepath,
      sourceKind,
      rootDir,
    })),
  );
}

function sourceFor({ sourceKind, rootDir }) {
  if (sourceKind === 'plugin') {
    return {
      kind: sourceKind,
      path: rootDir,
      writable: false,
      reason: '插件来源为只读',
    };
  }

  return {
    kind: sourceKind,
    path: rootDir,
    writable: true,
  };
}

function inferRootDir({ type, sourceKind, filepath }) {
  const marker = sourceKind === 'plugin'
    ? `${path.sep}${type === 'skill' ? 'skills' : 'commands'}${path.sep}`
    : `${path.sep}.claude${path.sep}${type === 'skill' ? 'skills' : 'commands'}${path.sep}`;
  const index = filepath.indexOf(marker);
  if (index === -1) {
    return path.dirname(filepath);
  }
  return filepath.slice(0, index);
}

function getCapabilityName({ type, filepath }) {
  if (type === 'skill') {
    return path.basename(path.dirname(filepath));
  }
  return path.basename(filepath, '.md');
}

function extractDescription(content) {
  let parsed;
  try {
    parsed = parseFrontmatter(content);
  } catch {
    parsed = {
      data: {},
      content: content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, ''),
    };
  }
  const frontmatterDescription = parsed.data?.description;
  if (typeof frontmatterDescription === 'string' && frontmatterDescription.trim()) {
    return frontmatterDescription.trim();
  }

  return parsed.content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#')) || '';
}

async function capabilityFromFile({ type, filepath, sourceKind, rootDir }) {
  const resolvedFilepath = path.resolve(filepath);
  const resolvedRootDir = rootDir ? path.resolve(rootDir) : inferRootDir({
    type,
    sourceKind,
    filepath: resolvedFilepath,
  });
  const content = await fs.readFile(resolvedFilepath, 'utf8');

  return {
    id: encodeCapabilityId({ type, sourceKind, filepath: resolvedFilepath }),
    type,
    name: getCapabilityName({ type, filepath: resolvedFilepath }),
    description: extractDescription(content),
    path: resolvedFilepath,
    source: sourceFor({ sourceKind, rootDir: resolvedRootDir }),
    editable: WRITABLE_SOURCE_KINDS.has(sourceKind),
    enabled: true,
  };
}

export async function listCapabilities({
  type = 'skill',
  homeDir = os.homedir(),
  projectPath,
  pluginPaths = [],
} = {}) {
  const capabilityType = assertType(type);
  const capabilities = [];

  const userRoot = path.resolve(homeDir);
  capabilities.push(...await scanSource({
    type: capabilityType,
    sourceKind: 'user',
    rootDir: userRoot,
    scanDir: path.join(userRoot, '.claude', capabilityType === 'skill' ? 'skills' : 'commands'),
  }));

  if (typeof projectPath === 'string' && projectPath.trim()) {
    const projectRoot = path.resolve(projectPath);
    capabilities.push(...await scanSource({
      type: capabilityType,
      sourceKind: 'project',
      rootDir: projectRoot,
      scanDir: path.join(projectRoot, '.claude', capabilityType === 'skill' ? 'skills' : 'commands'),
    }));
  }

  for (const pluginPath of pluginPaths) {
    if (typeof pluginPath !== 'string' || !pluginPath.trim()) {
      continue;
    }
    const pluginRoot = path.resolve(pluginPath);
    capabilities.push(...await scanSource({
      type: capabilityType,
      sourceKind: 'plugin',
      rootDir: pluginRoot,
      scanDir: path.join(pluginRoot, capabilityType === 'skill' ? 'skills' : 'commands'),
    }));
  }

  return capabilities;
}

export async function createCapability({
  type = 'skill',
  scope = 'user',
  homeDir = os.homedir(),
  projectPath,
  name,
  content = '',
} = {}) {
  const capabilityType = assertType(type);
  if (!WRITABLE_SOURCE_KINDS.has(scope)) {
    throw createError('Capability scope must be "user" or "project".', 400, 'INVALID_CAPABILITY_SCOPE');
  }
  if (scope === 'project' && (typeof projectPath !== 'string' || !projectPath.trim())) {
    throw createError('projectPath is required for project capability scope.', 400, 'PROJECT_PATH_REQUIRED');
  }

  const rootDir = path.resolve(scope === 'project' ? projectPath : homeDir);
  const safeName = normalizeName(name);
  const filepath = capabilityType === 'skill'
    ? path.join(rootDir, '.claude', 'skills', safeName, 'SKILL.md')
    : path.join(rootDir, '.claude', 'commands', `${safeName}.md`);

  await fs.mkdir(path.dirname(filepath), { recursive: true });
  await fs.writeFile(filepath, ensureSingleTrailingNewline(content), 'utf8');

  return capabilityFromFile({
    type: capabilityType,
    filepath,
    sourceKind: scope,
    rootDir,
  });
}

export async function updateCapability({
  id,
  content = '',
  homeDir = os.homedir(),
  projectPath,
} = {}) {
  const { type, sourceKind, filepath } = decodeCapabilityId(id);
  const managedPath = assertWritableCapabilityPath({
    type,
    sourceKind,
    filepath,
    homeDir,
    projectPath,
  });

  await fs.writeFile(managedPath.filepath, ensureSingleTrailingNewline(content), 'utf8');
  return capabilityFromFile({
    type,
    filepath: managedPath.filepath,
    sourceKind,
    rootDir: managedPath.sourceRoot,
  });
}

export async function readCapability({
  id,
  homeDir = os.homedir(),
  projectPath,
  pluginPaths = [],
} = {}) {
  const { type, sourceKind, filepath } = decodeCapabilityId(id);
  const readablePath = assertReadableCapabilityPath({
    type,
    sourceKind,
    filepath,
    homeDir,
    projectPath,
    pluginPaths,
  });
  const content = await fs.readFile(readablePath.filepath, 'utf8');
  const capability = await capabilityFromFile({
    type,
    filepath: readablePath.filepath,
    sourceKind,
    rootDir: readablePath.sourceRoot,
  });

  return {
    capability,
    content,
  };
}

export async function deleteCapability({
  id,
  homeDir = os.homedir(),
  projectPath,
} = {}) {
  const { type, sourceKind, filepath } = decodeCapabilityId(id);
  const managedPath = assertWritableCapabilityPath({
    type,
    sourceKind,
    filepath,
    homeDir,
    projectPath,
  });

  await fs.rm(managedPath.filepath, { force: true });
  return { deleted: true };
}
