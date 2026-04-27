import os from 'node:os';
import path from 'node:path';

const FILE_SOURCE_KINDS = new Set(['user', 'project', 'local']);
const WRITABLE_SOURCE_KINDS = new Set(['user', 'project', 'local', 'session-memory']);
const READONLY_SOURCE_KINDS = new Set(['plugin', 'skill', 'subagent']);

export function createClaudeHooksStorage({
  homeDir = os.homedir(),
  projectPath = process.cwd(),
  readJson = async () => null,
  writeJson = async () => {},
  sessionMemoryStore = {},
} = {}) {
  async function updateSource({ sourceKind, hooks, projectPath: overrideProjectPath, sessionId } = {}) {
    assertWritableSourceKind(sourceKind);
    const normalizedHooks = requireHooksObject(hooks);

    if (sourceKind === 'session-memory') {
      const resolvedSessionId = requireSessionId(sessionId);
      await writeSessionHooks({ sessionMemoryStore, sessionId: resolvedSessionId, hooks: normalizedHooks });
      return {
        sourceId: `session-memory:${resolvedSessionId}`,
        sourceKind,
      };
    }

    const targetPath = resolveSettingsPath({
      sourceKind,
      homeDir,
      projectPath: overrideProjectPath ?? projectPath,
    });
    const currentPayload = normalizeJsonObject(await readJson(targetPath));
    await writeJson(targetPath, {
      ...currentPayload,
      hooks: normalizedHooks,
    });

    return {
      sourceId: sourceKind,
      sourceKind,
      path: targetPath,
    };
  }

  async function deleteEntry({ sourceKind, entryId, projectPath: overrideProjectPath, sessionId } = {}) {
    assertWritableSourceKind(sourceKind);
    const parsedEntry = parseHookEntryId(entryId);

    if (sourceKind === 'session-memory') {
      const resolvedSessionId = resolveDeletionSessionId({
        querySessionId: sessionId,
        entrySessionId: parsedEntry.sessionId,
      });
      assertEntryBelongsToSource({
        sourceKind,
        expectedSourceId: `session-memory:${resolvedSessionId}`,
        parsedEntry,
      });
      const currentHooks = normalizeHooks(await readSessionHooks({ sessionMemoryStore, sessionId: resolvedSessionId }));
      const nextHooks = removeHookEntry(currentHooks, parsedEntry);
      await writeSessionHooks({ sessionMemoryStore, sessionId: resolvedSessionId, hooks: nextHooks });

      return {
        sourceId: `session-memory:${resolvedSessionId}`,
        sourceKind,
        entryId,
      };
    }

    const targetPath = resolveSettingsPath({
      sourceKind,
      homeDir,
      projectPath: overrideProjectPath ?? projectPath,
    });
    assertEntryBelongsToSource({
      sourceKind,
      expectedSourceId: sourceKind,
      parsedEntry,
    });
    const currentPayload = normalizeJsonObject(await readJson(targetPath));
    const nextHooks = removeHookEntry(normalizeHooks(currentPayload.hooks), parsedEntry);

    await writeJson(targetPath, {
      ...currentPayload,
      hooks: nextHooks,
    });

    return {
      sourceId: sourceKind,
      sourceKind,
      entryId,
      path: targetPath,
    };
  }

  return {
    updateSource,
    deleteEntry,
  };
}

export function resolveSettingsPath({ sourceKind, homeDir = os.homedir(), projectPath = process.cwd() } = {}) {
  if (sourceKind === 'user') {
    return path.join(homeDir, '.claude', 'settings.json');
  }

  if (sourceKind === 'project') {
    return path.join(requireProjectPath(projectPath), '.claude', 'settings.json');
  }

  if (sourceKind === 'local') {
    return path.join(requireProjectPath(projectPath), '.claude', 'settings.local.json');
  }

  throw createHttpError(400, `Unsupported writable hook source kind: ${sourceKind}`);
}

function assertWritableSourceKind(sourceKind) {
  if (READONLY_SOURCE_KINDS.has(sourceKind)) {
    throw createHttpError(400, `${sourceKind} is read-only and cannot be modified.`);
  }

  if (!WRITABLE_SOURCE_KINDS.has(sourceKind)) {
    throw createHttpError(400, `Unsupported hook source kind: ${sourceKind}`);
  }
}

function requireProjectPath(projectPath) {
  if (typeof projectPath === 'string' && projectPath.trim() !== '') {
    return projectPath;
  }

  throw createHttpError(400, 'projectPath is required for project and local hook sources.');
}

function requireSessionId(sessionId) {
  if (typeof sessionId === 'string' && sessionId.trim() !== '') {
    return sessionId;
  }

  throw createHttpError(400, 'sessionId is required for session-memory hook sources.');
}

function normalizeJsonObject(value) {
  return isPlainObject(value) ? value : {};
}

function normalizeHooks(hooks) {
  return isPlainObject(hooks) ? hooks : {};
}

function requireHooksObject(hooks) {
  if (!isPlainObject(hooks)) {
    throw createHttpError(400, 'hooks must be a plain object.');
  }

  return hooks;
}

async function readSessionHooks({ sessionMemoryStore, sessionId }) {
  if (typeof sessionMemoryStore?.getHooks === 'function') {
    return sessionMemoryStore.getHooks(sessionId);
  }

  if (typeof sessionMemoryStore?.readHooks === 'function') {
    return sessionMemoryStore.readHooks(sessionId);
  }

  throw createHttpError(500, 'sessionMemoryStore.getHooks is required for session-memory deletions.');
}

async function writeSessionHooks({ sessionMemoryStore, sessionId, hooks }) {
  if (typeof sessionMemoryStore?.setHooks === 'function') {
    await sessionMemoryStore.setHooks(sessionId, hooks);
    return;
  }

  if (typeof sessionMemoryStore?.writeHooks === 'function') {
    await sessionMemoryStore.writeHooks(sessionId, hooks);
    return;
  }

  throw createHttpError(500, 'sessionMemoryStore.setHooks is required for session-memory updates.');
}

function parseHookEntryId(entryId) {
  if (typeof entryId !== 'string' || entryId.trim() === '') {
    throw createHttpError(400, 'entryId is required.');
  }

  const segments = entryId.split(':');
  if (segments.length < 3) {
    throw createHttpError(400, `Invalid hook entry id: ${entryId}`);
  }

  const matcherIndex = Number.parseInt(segments.at(-1), 10);
  const event = segments.at(-2);
  if (!Number.isInteger(matcherIndex) || matcherIndex < 0 || !event) {
    throw createHttpError(400, `Invalid hook entry id: ${entryId}`);
  }

  const sourceId = segments.slice(0, -2).join(':');
  const sessionId = sourceId.startsWith('session-memory:') ? sourceId.slice('session-memory:'.length) : undefined;

  return {
    entryId,
    sourceId,
    sessionId,
    event,
    matcherIndex,
  };
}

function resolveDeletionSessionId({ querySessionId, entrySessionId }) {
  if (querySessionId !== undefined && querySessionId !== null && querySessionId !== '') {
    const resolvedQuerySessionId = requireSessionId(querySessionId);
    if (entrySessionId !== undefined && entrySessionId !== resolvedQuerySessionId) {
      throw createHttpError(400, 'sessionId does not match the target hook entry session.');
    }
    return resolvedQuerySessionId;
  }

  return requireSessionId(entrySessionId);
}

function assertEntryBelongsToSource({ expectedSourceId, parsedEntry, sourceKind }) {
  if (parsedEntry.sourceId !== expectedSourceId) {
    throw createHttpError(
      400,
      `Hook entry source mismatch for ${sourceKind}: expected ${expectedSourceId}, received ${parsedEntry.sourceId}.`,
    );
  }
}

function removeHookEntry(hooks, { event, matcherIndex, entryId }) {
  const eventEntries = Array.isArray(hooks[event]) ? hooks[event] : null;
  if (!eventEntries || matcherIndex >= eventEntries.length) {
    throw createHttpError(404, `Hook entry not found: ${entryId}`);
  }

  const nextEventEntries = eventEntries.filter((_, index) => index !== matcherIndex);
  const nextHooks = { ...hooks };

  if (nextEventEntries.length > 0) {
    nextHooks[event] = nextEventEntries;
  } else {
    delete nextHooks[event];
  }

  return nextHooks;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export { FILE_SOURCE_KINDS };
