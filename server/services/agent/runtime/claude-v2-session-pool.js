// Claude runtime session pool。
// 这里直接复用 Claude Agent SDK 的原生 SDKSession，并补上权限请求与活跃 session 注册。
import { createClaudeV2PermissionHandlers } from './claude-v2-permissions.js';
import { buildClaudeV2RuntimeOptions } from './claude-v2-request-builder.js';
import * as ClaudeAgentSDK from '@anthropic-ai/claude-agent-sdk';

function readSessionId(session) {
  try {
    const sessionId = session?.sessionId;
    return typeof sessionId === 'string' && sessionId.trim() ? sessionId.trim() : null;
  } catch {
    return null;
  }
}

function normalizeSessionId(sessionId) {
  return String(sessionId || '').trim();
}

function getEntry(pool, sessionId) {
  return pool.sessions.get(normalizeSessionId(sessionId)) || null;
}

function isLiveSessionEntry(entry) {
  return Boolean(entry && entry.session && !['aborted', 'failed'].includes(entry.status));
}

function normalizeCommandCatalog(catalog) {
  return {
    localUi: Array.isArray(catalog?.localUi) ? catalog.localUi : [],
    runtime: Array.isArray(catalog?.runtime) ? catalog.runtime : [],
    skills: Array.isArray(catalog?.skills) ? catalog.skills : [],
  };
}

function normalizeSlashCommandName(name) {
  const normalized = typeof name === 'string' ? name.trim().replace(/^\//, '') : '';
  return normalized || null;
}

function normalizeCommandEntries(commands, { ensureLeadingSlash = false } = {}) {
  if (!Array.isArray(commands)) {
    return [];
  }

  return commands
    .map((command) => {
      if (typeof command === 'string') {
        const name = normalizeSlashCommandName(command);
        return name ? { name } : null;
      }
      if (command && typeof command === 'object') {
        const name = normalizeSlashCommandName(command.name);
        if (!name) {
          return null;
        }
        return {
          ...command,
          name: ensureLeadingSlash ? `/${name}` : name,
        };
      }
      return null;
    })
    .filter(Boolean);
}

function normalizeSkills(skills) {
  return normalizeCommandEntries(skills);
}

function normalizeRuntimeCommands(commands) {
  return normalizeCommandEntries(commands, { ensureLeadingSlash: true });
}

async function readInitializationMetadata(session, entry = null) {
  const queryInitialization = session?.query?.initialization;
  const initialization = queryInitialization && typeof queryInitialization.then === 'function'
    ? await queryInitialization
    : null;

  let initializationResult = null;
  if (typeof session?.initializationResult === 'function') {
    initializationResult = await session.initializationResult();
  }

  const runtimeNames =
    (entry?.initializationData && Array.isArray(entry.initializationData.slashCommands))
      ? entry.initializationData.slashCommands
      : [];
  const skillNames =
    (entry?.initializationData && Array.isArray(entry.initializationData.skills))
      ? entry.initializationData.skills
      : Array.isArray(initializationResult?.skills)
        ? initializationResult.skills
        : [];

  return {
    commands: normalizeCommandEntries(initialization?.commands),
    runtimeNames: runtimeNames
      .map(normalizeSlashCommandName)
      .filter(Boolean),
    skillNames: skillNames
      .map((value) => {
        if (typeof value === 'string') {
          return normalizeSlashCommandName(value);
        }
        if (value && typeof value === 'object') {
          return normalizeSlashCommandName(value.name);
        }
        return null;
      })
      .filter(Boolean),
    initializationSkills: normalizeSkills(initializationResult?.skills),
  };
}

function splitInitializationCommands({ commands, runtimeNames, skillNames, initializationSkills }) {
  const runtimeNameSet = new Set(runtimeNames);
  const skillNameSet = new Set(skillNames);

  const runtime = [];
  const skills = [];

  for (const command of commands) {
    const normalizedName = normalizeSlashCommandName(command.name);
    if (!normalizedName) {
      continue;
    }

    if (skillNameSet.has(normalizedName)) {
      skills.push({
        ...command,
        name: normalizedName,
      });
      continue;
    }

    if (runtimeNameSet.size === 0 || runtimeNameSet.has(normalizedName)) {
      runtime.push({
        ...command,
        name: `/${normalizedName}`,
      });
    }
  }

  const mergedSkills = skills.length > 0 ? skills : initializationSkills;

  return {
    runtime,
    skills: mergedSkills,
  };
}

async function readInitializationCatalog(session, entry = null) {
  const metadata = await readInitializationMetadata(session, entry);
  const { runtime, skills } = splitInitializationCommands(metadata);

  return normalizeCommandCatalog({
    localUi: [],
    runtime,
    skills,
  });
}

async function readInitializationSkills(session, entry = null) {
  const catalog = await readInitializationCatalog(session, entry);
  if (catalog.skills.length > 0) {
    return catalog.skills;
  }

  const queryInitialization = session?.query?.initialization;
  if (queryInitialization && typeof queryInitialization.then === 'function') {
    return [];
  }

  if (typeof session?.initializationResult !== 'function') {
    return [];
  }

  const initializationResult = await session.initializationResult();
  return normalizeSkills(initializationResult?.skills);
}

async function readCommandCatalog(entry, session) {
  const initializationCatalog = await readInitializationCatalog(session, entry);

  if (typeof session?.commandCatalog === 'function') {
    const catalog = normalizeCommandCatalog(await session.commandCatalog());
    const normalizedSkills = normalizeSkills(catalog.skills);
    const normalizedRuntime = normalizeRuntimeCommands(catalog.runtime);
    const catalogWithNormalizedData = {
      ...catalog,
      runtime: normalizedRuntime.length > 0 ? normalizedRuntime : initializationCatalog.runtime,
      skills: normalizedSkills.length > 0 ? normalizedSkills : initializationCatalog.skills,
    };
    return catalogWithNormalizedData;
  }
  if (typeof session?.listSlashCommands === 'function') {
    const runtime = await session.listSlashCommands();
    return normalizeCommandCatalog({
      localUi: [],
      runtime: normalizeRuntimeCommands(Array.isArray(runtime) ? runtime : []),
      skills: initializationCatalog.skills,
    });
  }
  return initializationCatalog;
}

async function loadCommandCatalog(entry, session) {
  if (!entry.commandCatalogPromise) {
    entry.commandCatalogPromise = readCommandCatalog(entry, session)
      .then((catalog) => {
        entry.commandCatalog = catalog;
        return catalog;
      })
      .finally(() => {
        entry.commandCatalogPromise = null;
      });
  }
  return entry.commandCatalogPromise;
}

function isCatalogEmpty(catalog) {
  return (!Array.isArray(catalog?.runtime) || catalog.runtime.length === 0)
    && (!Array.isArray(catalog?.skills) || catalog.skills.length === 0);
}

function canProbeFromOptions(options = {}) {
  return Boolean(options?.projectPath || options?.cwd);
}

function shouldFallbackToProbeCatalog(error) {
  const message = String(error?.message || '');
  return /No conversation found with session ID/i.test(message);
}

function buildSessionOptions(options, pool, entry) {
  const permissionHandlers = createClaudeV2PermissionHandlers({ pool, entry, options });
  const runtimeOptions = buildClaudeV2RuntimeOptions(options);
  const permissionMode = runtimeOptions.permissionMode || 'default';
  const {
    model,
    cwd,
    env,
    effort,
    settingSources,
    plugins,
    settings,
    hooks,
    toolsSettings,
  } = runtimeOptions;

  return {
    model,
    cwd,
    env,
    ...(typeof effort === 'string' ? { effort } : {}),
    permissionMode,
    ...(Array.isArray(settingSources) ? { settingSources } : {}),
    ...(Array.isArray(plugins) ? { plugins } : {}),
    ...(settings && typeof settings === 'object' ? { settings } : {}),
    ...(hooks && typeof hooks === 'object' && !Array.isArray(hooks) ? { hooks } : {}),
    ...(toolsSettings && typeof toolsSettings === 'object' ? { toolsSettings } : {}),
    allowDangerouslySkipPermissions: permissionHandlers.allowDangerouslySkipPermissions,
    allowedTools: permissionHandlers.allowedTools,
    disallowedTools: permissionHandlers.disallowedTools,
    includePartialMessages: true,
    canUseTool: permissionHandlers.canUseTool,
  };
}

function createTrackedSession(session, entry, pool) {
  return {
    get sessionId() {
      return session.sessionId;
    },
    async refreshCommandCatalog() {
      entry.commandCatalog = null;
      return await loadCommandCatalog(entry, session);
    },
    async send(message) {
      entry.status = 'active';
      try {
        await session.send(message);
      } catch (error) {
        entry.status = 'failed';
        throw error;
      }
    },
    async *stream() {
      try {
        for await (const sdkMessage of session.stream()) {
          if (sdkMessage?.type === 'system' && sdkMessage?.subtype === 'init') {
            entry.initializationData = {
              slashCommands: Array.isArray(sdkMessage.slash_commands) ? sdkMessage.slash_commands : [],
              skills: Array.isArray(sdkMessage.skills) ? sdkMessage.skills : [],
            };
          }
          const nextSessionId = sdkMessage?.session_id || readSessionId(session);
          if (nextSessionId && !entry.sessionId) {
            entry.sessionId = nextSessionId;
            pool.sessions.set(nextSessionId, entry);
          }
          yield sdkMessage;
        }
        entry.status = 'completed';
      } catch (error) {
        entry.status = entry.status === 'aborted' ? 'aborted' : 'failed';
        throw error;
      }
    },
    close() {
      entry.status = 'aborted';
      session.close();
    },
    async [Symbol.asyncDispose]() {
      entry.status = 'aborted';
      await session[Symbol.asyncDispose]?.();
    },
  };
}

export const __testables = {
  readInitializationSkills,
};

export function createClaudeV2SessionPool(sdk = ClaudeAgentSDK) {
  const pool = {
    sessions: new Map(),
    pendingToolApprovals: new Map(),
    pendingInteractivePrompts: new Map(),
  };

  async function readProbeCommandCatalog(options = {}) {
    if (!options?.projectPath && !options?.cwd) {
      return { localUi: [], runtime: [], skills: [] };
    }

    const entry = {
      session: null,
      sdkSession: null,
      sessionId: null,
      status: 'idle',
      writer: null,
      commandCatalog: null,
      commandCatalogPromise: null,
      initializationData: null,
    };
    const probeSession = sdk.unstable_v2_createSession(buildSessionOptions(options, pool, entry));

    try {
      return await readCommandCatalog(entry, probeSession);
    } finally {
      try {
        probeSession.close?.();
      } catch {
        // Ignore probe-session close failures; catalog read already completed.
      }
    }
  }

  return {
    create(options = {}) {
      const entry = {
        session: null,
        sdkSession: null,
        sessionId: null,
        status: 'idle',
        writer: options.writer || null,
        commandCatalog: null,
        commandCatalogPromise: null,
        initializationData: null,
      };
      const session = sdk.unstable_v2_createSession(buildSessionOptions(options, pool, entry));
      entry.sdkSession = session;
      entry.session = session;
      const trackedSession = createTrackedSession(session, entry, pool);
      entry.session = trackedSession;
      const sessionId = readSessionId(session);
      if (sessionId) {
        entry.sessionId = sessionId;
        pool.sessions.set(sessionId, entry);
      }
      return trackedSession;
    },
    resume(sessionId, options = {}) {
      const normalizedSessionId = normalizeSessionId(sessionId);
      const liveEntry = getEntry(pool, normalizedSessionId);
      if (isLiveSessionEntry(liveEntry)) {
        if (options.writer) {
          liveEntry.writer = options.writer;
        }
        return liveEntry.session;
      }

      const entry = {
        session: null,
        sdkSession: null,
        sessionId: normalizedSessionId,
        status: 'idle',
        writer: options.writer || null,
        commandCatalog: null,
        commandCatalogPromise: null,
        initializationData: null,
      };
      const session = sdk.unstable_v2_resumeSession(
        normalizedSessionId,
        buildSessionOptions(options, pool, entry),
      );
      entry.sdkSession = session;
      const trackedSession = createTrackedSession(session, entry, pool);
      entry.session = trackedSession;
      pool.sessions.set(normalizedSessionId, entry);
      return trackedSession;
    },
    getLiveSession(sessionId) {
      const entry = getEntry(pool, sessionId);
      return isLiveSessionEntry(entry) ? entry.session : null;
    },
    hasLiveSession(sessionId) {
      return Boolean(this.getLiveSession(sessionId));
    },
    get(sessionId) {
      return getEntry(pool, sessionId)?.session || null;
    },
    async getCommandCatalog(sessionId, options = {}) {
      const normalizedSessionId = normalizeSessionId(sessionId);
      let entry = normalizedSessionId ? getEntry(pool, normalizedSessionId) : null;

      if (!entry && normalizedSessionId) {
        try {
          this.resume(sessionId, options);
          entry = getEntry(pool, normalizedSessionId);
        } catch (error) {
          if (canProbeFromOptions(options) && shouldFallbackToProbeCatalog(error)) {
            return await readProbeCommandCatalog(options);
          }
          throw error;
        }
      }
      if (!entry) {
        return await readProbeCommandCatalog(options);
      }

      let catalog;
      try {
        catalog = entry.commandCatalog || await loadCommandCatalog(entry, entry.sdkSession);
      } catch (error) {
        if (canProbeFromOptions(options) && shouldFallbackToProbeCatalog(error)) {
          pool.sessions.delete(normalizedSessionId);
          return await readProbeCommandCatalog(options);
        }
        throw error;
      }
      if (!isCatalogEmpty(catalog) || (!options?.projectPath && !options?.cwd)) {
        return catalog;
      }

      return await readProbeCommandCatalog(options);
    },
    close(sessionId) {
      const normalizedSessionId = normalizeSessionId(sessionId);
      const entry = getEntry(pool, normalizedSessionId);
      if (!entry) {
        return false;
      }
      entry.status = 'aborted';
      entry.session?.close?.();
      pool.sessions.delete(normalizedSessionId);
      return true;
    },
    isActive(sessionId) {
      const entry = getEntry(pool, sessionId);
      return Boolean(entry) && entry.status === 'active';
    },
    updateWriter(sessionId, writer) {
      return this.reconnectSessionWriter(sessionId, writer);
    },
    reconnectSessionWriter(sessionId, writer) {
      const entry = getEntry(pool, sessionId);
      if (!isLiveSessionEntry(entry) || !writer) {
        return false;
      }
      entry.writer = writer;
      return true;
    },
    listPendingApprovals(sessionId) {
      const normalizedSessionId = normalizeSessionId(sessionId);
      return [...pool.pendingToolApprovals.values()]
        .filter((request) => request.sessionId === normalizedSessionId)
        .map((request) => ({
          requestId: request.requestId,
          toolName: request.toolName,
          input: request.input,
          sessionId: request.sessionId,
          receivedAt: request.receivedAt,
        }));
    },
    listPendingInteractivePrompts(sessionId) {
      const normalizedSessionId = normalizeSessionId(sessionId);
      return [...pool.pendingInteractivePrompts.values()]
        .filter((request) => request.sessionId === normalizedSessionId)
        .map((request) => ({
          requestId: request.requestId,
          toolName: request.toolName,
          input: request.input,
          sessionId: request.sessionId,
          receivedAt: request.receivedAt,
          questions: request.questions || [],
        }));
    },
    resolvePermissionRequest(requestId, decision) {
      const normalizedRequestId = String(requestId || '').trim();
      const request = pool.pendingToolApprovals.get(normalizedRequestId);
      if (request) {
        request.resolve(decision);
        return true;
      }

      const interactiveRequest = pool.pendingInteractivePrompts.get(normalizedRequestId);
      if (interactiveRequest) {
        interactiveRequest.resolve(decision);
        return true;
      }

      return false;
    },
    resolveInteractivePrompt(requestId, decision) {
      const request = pool.pendingInteractivePrompts.get(normalizeSessionId(requestId));
      if (!request) {
        return false;
      }
      request.resolve(decision);
      return true;
    },
  };
}
