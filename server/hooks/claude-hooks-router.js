import express from 'express';
import os from 'node:os';

import { discoverClaudeHookSources } from './claude-hooks-discovery.js';
import { buildEffectiveHooksView } from './claude-hooks-effective.js';
import { buildHookExecutionDetail, buildHookExecutionList } from './claude-hooks-events.js';
import { normalizeHookEntries } from './claude-hooks-normalizer.js';
import { createClaudeHooksStorage, resolveSettingsPath } from './claude-hooks-storage.js';

export function createClaudeHooksRouter({ services = createDefaultClaudeHooksServices() } = {}) {
  const resolvedServices = {
    ...createDefaultClaudeHooksServices(),
    ...services,
  };
  const router = express.Router();

  router.get('/overview', async (req, res, next) => {
    try {
      const overview = await resolvedServices.getOverview(parseHooksInput(req.query));
      res.json(overview);
    } catch (error) {
      next(error);
    }
  });

  router.get('/effective', async (req, res, next) => {
    try {
      const effectiveInput = parseHooksInput(req.query);
      const effective = await resolvedServices.getEffective(effectiveInput);
      res.json(effective);
    } catch (error) {
      next(error);
    }
  });

  router.get('/events', async (req, res, next) => {
    try {
      const result = await resolvedServices.getExecutions(parseHookEventsInput(req.query));
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/events/:hookId', async (req, res, next) => {
    try {
      const result = await resolvedServices.getExecutionDetail({
        hookId: req.params.hookId,
        ...parseHookEventsInput(req.query),
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  for (const sourceKind of ['user', 'project', 'local', 'session-memory']) {
    router.put(`/${sourceKind}`, async (req, res, next) => {
      try {
        const input = parseHooksInput(req.query);
        const result = await resolvedServices.updateSource({
          sourceKind,
          projectPath: input.projectPath,
          sessionId: input.sessionId,
          hooks: req.body?.hooks,
        });
        res.json(result);
      } catch (error) {
        next(error);
      }
    });
  }

  router.delete('/:sourceKind/:entryId', async (req, res, next) => {
    try {
      const input = parseHooksInput(req.query);
      const result = await resolvedServices.deleteEntry({
        sourceKind: req.params.sourceKind,
        entryId: req.params.entryId,
        projectPath: input.projectPath,
        sessionId: input.sessionId,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/sources/:sourceId', async (req, res, next) => {
    try {
      const input = parseHooksInput(req.query);
      const result = await resolvedServices.getSourceDetail({
        sourceId: req.params.sourceId,
        projectPath: input.projectPath,
        sessionId: input.sessionId,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export function createDefaultClaudeHooksServices({
  homeDir = os.homedir(),
  projectPath = process.cwd(),
  discoveryOptions = {},
  resolveSessionMemorySources = async () => [],
  hookEventsProvider = {},
  writeJson = async () => {},
  sessionMemoryStore = {},
} = {}) {
  const storage = createClaudeHooksStorage({
    homeDir,
    projectPath,
    readJson: discoveryOptions.settingsReader ?? (async () => null),
    writeJson,
    sessionMemoryStore,
  });

  async function getOverview(effectiveInput = {}) {
    const normalizedInput = normalizeHooksInput(effectiveInput);
    const discoveryInput = await buildDiscoveryInput({
      homeDir,
      projectPath,
      discoveryOptions,
      resolveSessionMemorySources,
      effectiveInput: normalizedInput,
    });
    const discovered = await discoverClaudeHookSources(discoveryInput);

    const filtered = applySettingSourcesFilter(discovered, normalizedInput.settingSources);

    return withCapabilities(filtered);
  }

  async function getEffective(effectiveInput = {}) {
    const overview = await getOverview(effectiveInput);
    return buildEffectiveHooksView(overview);
  }

  async function getExecutions(input = {}) {
    const events = await listHookLifecycleEvents(hookEventsProvider, normalizeHookEventsInput(input));
    return buildHookExecutionList(events);
  }

  async function getExecutionDetail({ hookId, ...input } = {}) {
    const normalizedHookId = normalizeScalarQueryValue(hookId);
    const normalizedFilters = normalizeHookEventsInput(input);
    const events = await listHookLifecycleEvents(hookEventsProvider, {
      hookId: normalizedHookId,
      ...normalizedFilters,
    });

    return buildHookExecutionDetail(events, normalizedHookId, normalizedFilters);
  }

  async function updateSource({ sourceKind, projectPath: overrideProjectPath, sessionId, hooks } = {}) {
    return storage.updateSource({
      sourceKind,
      projectPath: overrideProjectPath,
      sessionId,
      hooks,
    });
  }

  async function deleteEntry({ sourceKind, entryId, projectPath: overrideProjectPath, sessionId } = {}) {
    return storage.deleteEntry({
      sourceKind,
      entryId,
      projectPath: overrideProjectPath,
      sessionId,
    });
  }

  async function getSourceDetail({ sourceId, projectPath: overrideProjectPath, sessionId } = {}) {
    if (typeof discoveryOptions.getSourceDetail === 'function') {
      return discoveryOptions.getSourceDetail({
        sourceId,
        projectPath: overrideProjectPath,
        sessionId,
      });
    }

    const detailInput = normalizeHooksInput({
      projectPath: overrideProjectPath,
      sessionId,
    });
    const discoveryInput = await buildDiscoveryInput({
      homeDir,
      projectPath,
      discoveryOptions,
      resolveSessionMemorySources,
      effectiveInput: detailInput,
    });
    const discovered = await discoverClaudeHookSources(discoveryInput);
    const source = discovered.sources.find((candidate) => candidate?.id === sourceId);

    if (!source) {
      throw createHttpError(404, `Hook source not found: ${sourceId}`);
    }

    const raw = await readRawSource({
      source,
      homeDir,
      projectPath: detailInput.projectPath ?? projectPath,
      settingsReader: discoveryInput.settingsReader,
      sessionMemoryStore,
      sessionId,
      discoveryInput,
    });

    return {
      source,
      raw,
      normalized: {
        entries: normalizeHookEntries({ source, hooks: raw?.hooks }),
      },
      aboutSource: buildAboutSource(source),
    };
  }

  return {
    getOverview,
    getEffective,
    getExecutions,
    getExecutionDetail,
    updateSource,
    deleteEntry,
    getSourceDetail,
  };
}

function parseHooksInput(query = {}) {
  return normalizeHooksInput({
    projectPath: query.projectPath,
    sessionId: query.sessionId,
    settingSources: query.settingSources,
    plugins: query.plugins,
  });
}

function parseHookEventsInput(query = {}) {
  return normalizeHookEventsInput({
    sessionId: query.sessionId,
    runId: query.runId,
    hookEvent: query.hookEvent,
    hookName: query.hookName,
  });
}

function normalizeHooksInput(input = {}) {
  return {
    projectPath: normalizeScalarQueryValue(input.projectPath),
    sessionId: normalizeScalarQueryValue(input.sessionId),
    settingSources: normalizeStringListQueryValue(input.settingSources),
    plugins: normalizePluginListQueryValue(input.plugins),
  };
}

function normalizeHookEventsInput(input = {}) {
  return {
    sessionId: normalizeScalarQueryValue(input.sessionId),
    runId: normalizeScalarQueryValue(input.runId),
    hookEvent: normalizeScalarQueryValue(input.hookEvent),
    hookName: normalizeScalarQueryValue(input.hookName),
  };
}

function normalizeScalarQueryValue(value) {
  const candidate = Array.isArray(value) ? lastNonEmptyValue(value) : value;
  if (candidate === undefined || candidate === null) {
    return undefined;
  }

  if (typeof candidate !== 'string') {
    return candidate;
  }

  const trimmed = candidate.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeStringListQueryValue(value) {
  if (Array.isArray(value)) {
    const trimmedValues = value
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);

    if (trimmedValues.length === 0) {
      return undefined;
    }

    if (trimmedValues.every(isAllowedSettingSourceKind)) {
      return trimmedValues;
    }

    return normalizeStringFragmentList(trimmedValues);
  }

  const candidate = value;
  if (candidate === undefined || candidate === null || candidate === '') {
    return undefined;
  }

  if (typeof candidate === 'string') {
    const parsed = parseMaybeJson(candidate);
    if (Array.isArray(parsed)) {
      const normalized = parsed.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
      return normalized.length > 0 ? normalized : [];
    }
    if (typeof parsed === 'string') {
      const trimmed = parsed.trim();
      return trimmed ? [trimmed] : [];
    }
    return [];
  }

  return [];
}

function normalizePluginListQueryValue(value) {
  if (Array.isArray(value)) {
    if (value.every(isPlainObject)) {
      return value.filter(isPlainObject);
    }

    if (value.every((item) => typeof item === 'string')) {
      return normalizePluginFragmentList(value);
    }

    return value.filter(isPlainObject);
  }

  const candidate = value;
  if (candidate === undefined || candidate === null || candidate === '') {
    return undefined;
  }

  if (typeof candidate === 'string') {
    const parsed = parseMaybeJson(candidate);
    if (Array.isArray(parsed)) {
      return parsed.filter(isPlainObject);
    }
    if (isPlainObject(parsed)) {
      return [parsed];
    }
    return [];
  }

  if (isPlainObject(candidate)) {
    return [candidate];
  }

  return [];
}

function parseMaybeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function lastNonEmptyValue(values) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (value === undefined || value === null) {
      continue;
    }
    if (typeof value === 'string') {
      if (value.trim() !== '') {
        return value;
      }
      continue;
    }
    return value;
  }
  return undefined;
}

function normalizeStringFragmentList(values) {
  const lastValue = lastNonEmptyValue(values);
  if (lastValue === undefined) {
    return undefined;
  }

  const parsed = parseMaybeJson(lastValue);
  if (Array.isArray(parsed)) {
    return parsed.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
  }

  if (typeof parsed === 'string') {
    const trimmed = parsed.trim();
    return trimmed ? [trimmed] : [];
  }

  return [];
}

function normalizePluginFragmentList(values) {
  const lastValue = lastNonEmptyValue(values);
  if (lastValue === undefined) {
    return undefined;
  }

  const parsed = parseMaybeJson(lastValue);
  if (Array.isArray(parsed)) {
    return parsed.filter(isPlainObject);
  }

  if (isPlainObject(parsed)) {
    return [parsed];
  }

  return [];
}

function isAllowedSettingSourceKind(value) {
  return value === 'user' || value === 'project' || value === 'local';
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function uniqueKinds(sources = [], isWritable) {
  const kinds = [];
  const seen = new Set();

  for (const source of Array.isArray(sources) ? sources : []) {
    if (!source || typeof source !== 'object') {
      continue;
    }

    if (Boolean(source.writable) !== isWritable) {
      continue;
    }

    if (typeof source.kind !== 'string' || seen.has(source.kind)) {
      continue;
    }

    seen.add(source.kind);
    kinds.push(source.kind);
  }

  return kinds;
}

async function buildDiscoveryInput({
  homeDir,
  projectPath,
  discoveryOptions,
  resolveSessionMemorySources,
  effectiveInput,
}) {
  const effectiveProjectPath = normalizeScalarQueryValue(effectiveInput.projectPath) ?? projectPath;
  const pluginSources = Array.isArray(effectiveInput.plugins)
    ? effectiveInput.plugins
    : (Array.isArray(discoveryOptions.pluginSources) ? discoveryOptions.pluginSources : []);
  const sessionMemorySources = await resolveSessionMemorySourcesIfNeeded({
    sessionId: normalizeScalarQueryValue(effectiveInput.sessionId),
    resolveSessionMemorySources,
  });

  return {
    homeDir,
    projectPath: effectiveProjectPath,
    settingsReader: discoveryOptions.settingsReader ?? (async () => null),
    pluginSources,
    skillSources: Array.isArray(discoveryOptions.skillSources) ? discoveryOptions.skillSources : [],
    subagentSources: Array.isArray(discoveryOptions.subagentSources) ? discoveryOptions.subagentSources : [],
    sessionMemorySources: [
      ...(Array.isArray(discoveryOptions.sessionMemorySources) ? discoveryOptions.sessionMemorySources : []),
      ...sessionMemorySources,
    ],
  };
}

async function resolveSessionMemorySourcesIfNeeded({
  sessionId,
  resolveSessionMemorySources,
}) {
  if (typeof sessionId !== 'string' || sessionId.trim() === '') {
    return [];
  }

  const resolved = await resolveSessionMemorySources(sessionId);
  if (!Array.isArray(resolved)) {
    return [];
  }

  return resolved.filter((source) => source && typeof source === 'object');
}

async function listHookLifecycleEvents(hookEventsProvider, filters) {
  if (typeof hookEventsProvider?.listHookEvents !== 'function') {
    return [];
  }

  const events = await hookEventsProvider.listHookEvents(filters);
  return Array.isArray(events) ? events : [];
}

function applySettingSourcesFilter(discovered, settingSources) {
  if (!Array.isArray(settingSources)) {
    return discovered;
  }

  const fileKinds = new Set(['user', 'project', 'local']);
  const allowedFileKinds = new Set(settingSources.filter((kind) => fileKinds.has(kind)));
  const sources = discovered.sources.filter((source) => {
    if (!source || typeof source !== 'object') {
      return false;
    }

    if (!fileKinds.has(source.kind)) {
      return true;
    }

    return allowedFileKinds.has(source.kind);
  });

  const allowedSourceIds = new Set(sources.map((source) => source.id));
  const entries = discovered.entries.filter((entry) => allowedSourceIds.has(entry.sourceId));

  return {
    ...discovered,
    sources,
    entries,
  };
}

function withCapabilities(discovered) {
  return {
    ...discovered,
    diagnostics: [],
    capabilities: {
      writableKinds: uniqueKinds(discovered.sources, true),
      readonlyKinds: uniqueKinds(discovered.sources, false),
    },
  };
}

async function readRawSource({
  source,
  homeDir,
  projectPath,
  settingsReader,
  sessionMemoryStore,
  discoveryInput,
}) {
  if (source.kind === 'session-memory') {
    const resolvedSessionId = source.id.slice('session-memory:'.length);
    if (typeof sessionMemoryStore?.getHooks === 'function') {
      return { hooks: await sessionMemoryStore.getHooks(resolvedSessionId) };
    }

    const fallback = Array.isArray(discoveryInput.sessionMemorySources)
      ? discoveryInput.sessionMemorySources.find((candidate) => candidate?.sessionId === resolvedSessionId)
      : null;
    return { hooks: fallback?.hooks ?? {} };
  }

  if (source.kind === 'user' || source.kind === 'project' || source.kind === 'local') {
    const targetPath = resolveSettingsPath({
      sourceKind: source.kind,
      homeDir,
      projectPath,
    });
    return (await settingsReader(targetPath)) ?? null;
  }

  const providerSource = findReadonlyProviderSource({
    source,
    discoveryInput,
  });

  return {
    hooks: providerSource?.hooks ?? null,
  };
}

function findReadonlyProviderSource({ source, discoveryInput }) {
  const providerCollectionsByKind = {
    plugin: Array.isArray(discoveryInput.pluginSources) ? discoveryInput.pluginSources : [],
    skill: Array.isArray(discoveryInput.skillSources) ? discoveryInput.skillSources : [],
    subagent: Array.isArray(discoveryInput.subagentSources) ? discoveryInput.subagentSources : [],
  };

  const providerCollection = providerCollectionsByKind[source.kind];
  if (!Array.isArray(providerCollection)) {
    return null;
  }

  return providerCollection.find((candidate) => candidate?.id === source.id) ?? null;
}

function buildAboutSource(source) {
  return {
    id: source.id,
    kind: source.kind,
    label: source.label,
    writable: source.writable,
    path: source.path,
    description: source.description ?? null,
  };
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

const claudeHooksRouter = createClaudeHooksRouter();

export default claudeHooksRouter;
