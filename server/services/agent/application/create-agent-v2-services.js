// V2 应用层服务装配器。
// 这里把 repository、runtime 和各个 use case 组合成一个可被路由层直接调用的服务对象。
// sessionId 是唯一运行真相，conversation 仅保留返回结构兼容。
import { createAgentEventEnvelope } from '../domain/agent-event.js';
import { createClaudeV2EventTranslator } from '../runtime/claude-v2-event-translator.js';
import { executeClaudeRun } from '../runtime/claude-run-executor.js';
import { startConversationRun as startConversationRunUseCase } from './start-conversation-run.js';
import { continueConversationRun as continueConversationRunUseCase } from './continue-conversation-run.js';

// 从 session 对象里安全读取 sessionId。
// runtime 在 session 完成初始化之前有时拿不到这个值，所以这里要做防御性处理。
function readSessionId(session) {
  try {
    const sessionId = session?.sessionId;
    return typeof sessionId === 'string' && sessionId.trim() ? sessionId : null;
  } catch {
    return null;
  }
}

function readSessionIdFromSdkMessage(message) {
  const sessionId = message?.session_id ?? message?.sessionId ?? null;
  return typeof sessionId === 'string' && sessionId.trim() ? sessionId.trim() : null;
}

async function appendDebugLogEntry({ debugLog, sessionId, sdkMessage }) {
  if (!sessionId || typeof debugLog?.append !== 'function') {
    return null;
  }

  try {
    return await debugLog.append({
      sessionId,
      type: typeof sdkMessage?.type === 'string' && sdkMessage.type.trim()
        ? sdkMessage.type.trim()
        : 'sdk.message',
      payload: sdkMessage,
    });
  } catch {
    return null;
  }
}

function queueDebugLogEntry({ debugLog, sessionId, sdkMessage, tailRef }) {
  if (!sessionId || typeof debugLog?.append !== 'function') {
    return;
  }

  const nextTask = tailRef.current.then(() => appendDebugLogEntry({
    debugLog,
    sessionId,
    sdkMessage,
  }));
  tailRef.current = nextTask.catch(() => null);
}

function enqueueTerminalTask(activeRun, task) {
  const previousTail = activeRun.terminalTail || Promise.resolve();
  const nextTail = previousTail.then(task);
  activeRun.terminalTail = nextTail.catch(() => {});
  return nextTail;
}

function closeLiveSession({ runtime, session, sessionId }) {
  const normalizedSessionId = normalizeSessionId(sessionId);
  if (normalizedSessionId && typeof runtime?.close === 'function') {
    return runtime.close(normalizedSessionId);
  }

  if (typeof session?.close === 'function') {
    session.close();
    return true;
  }

  return false;
}

async function hasPendingRuntimeInteraction(runtime, sessionId) {
  const normalizedSessionId = normalizeSessionId(sessionId);
  if (!normalizedSessionId) {
    return false;
  }

  const pendingApprovals = typeof runtime?.listPendingApprovals === 'function'
    ? runtime.listPendingApprovals(normalizedSessionId)
    : [];
  if (Array.isArray(pendingApprovals) && pendingApprovals.length > 0) {
    return true;
  }

  const pendingPrompts = typeof runtime?.listPendingInteractivePrompts === 'function'
    ? runtime.listPendingInteractivePrompts(normalizedSessionId)
    : [];
  return Array.isArray(pendingPrompts) && pendingPrompts.length > 0;
}

function createRunEventPipeline({ runStateStore, runId, onEvent }) {
  let degraded = false;
  let degradedMarked = false;
  let slowLaneTail = Promise.resolve();

  function emit(event) {
    if (onEvent) {
      onEvent(event);
    }
    return event;
  }

  async function markDegraded(message) {
    if (degradedMarked) {
      return null;
    }

    degraded = true;
    degradedMarked = true;

    if (typeof runStateStore.markRunPersistenceDegraded !== 'function') {
      return null;
    }

    try {
      const degradedEvent = await runStateStore.markRunPersistenceDegraded(runId, message);
      if (degradedEvent) {
        emit(degradedEvent);
      }
      return degradedEvent;
    } catch {
      return null;
    }
  }

  async function flush() {
    await slowLaneTail;
  }

  async function publishCritical(event) {
    await flush();
    const persistedEvent = await runStateStore.appendRunEvent(event);
    emit(persistedEvent);
    return persistedEvent;
  }

  function publishRealtimeFirst(event) {
    emit(event);

    const nextAppend = slowLaneTail.then(async () => {
      try {
        await runStateStore.appendRunEvent(event);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Non-critical persistence failed';
        await markDegraded(message);
      }
    });

    slowLaneTail = nextAppend.catch(() => {});
    return event;
  }

  return {
    get degraded() {
      return degraded;
    },
    flush,
    publishCritical,
    publishRealtimeFirst,
  };
}

function normalizeSessionId(sessionId) {
  const normalized = String(sessionId || '').trim();
  return normalized || null;
}

function createCanonicalHistoryFallback(sessionId) {
  return {
    sessionId,
    cwd: null,
    metadata: {
      title: null,
      pinned: false,
      starred: false,
      lastViewedAt: null,
    },
    messages: [],
    diagnosticsSummary: {
      officialMessageCount: 0,
      debugLogAvailable: false,
    },
  };
}

function normalizeSessionTitle(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

function buildSessionShell(sessionId, title = null) {
  const normalizedSessionId = normalizeSessionId(sessionId);
  if (!normalizedSessionId) {
    return {
      id: null,
      title: normalizeSessionTitle(title),
      createdAt: null,
    };
  }

  return {
    id: normalizedSessionId,
    title: normalizeSessionTitle(title) || `Session ${normalizedSessionId}`,
    createdAt: null,
  };
}

function findActiveRunIdBySessionId(activeRuns, sessionId) {
  const normalizedSessionId = normalizeSessionId(sessionId);
  if (!normalizedSessionId) {
    return null;
  }

  for (const [runId, activeRun] of activeRuns.entries()) {
    if (activeRun?.sessionId === normalizedSessionId) {
      return runId;
    }
  }

  return null;
}

// 执行一轮 run 的公共流程：
// 1) 写 run.started
// 2) 消费 runtime stream
// 3) 持久化每条事件
// 4) 根据终态事件更新 run 状态
// 其中 session 绑定只用于把产品 conversation 映射回 Claude runtime truth。
async function executeRun({
  runStateStore,
  debugLog = null,
  run,
  session,
  initialSessionId,
  prompt,
  images = [],
  message = null,
  traceId = null,
  onEvent,
  onSessionReady,
  activeRuns,
  runtime,
  runInactivityTimeoutMs,
}) {
  let sequence = 1;
  let boundSessionId = String(initialSessionId || '').trim() || readSessionId(session);
  let sessionReadyEmitted = false;
  const debugLogTailRef = {
    current: Promise.resolve(),
  };
  // 运行中的 run 需要登记，方便 abort 时通过 runId 找到对应 session。
  const emitEventRef = {
    current: onEvent || null,
  };
  const pipeline = createRunEventPipeline({
    runStateStore,
    runId: run.id,
    onEvent(event) {
      if (emitEventRef.current) {
        emitEventRef.current(event);
      }
    },
  });
  const inactivityTimeoutMs = Number.isFinite(runInactivityTimeoutMs) && runInactivityTimeoutMs > 0
    ? runInactivityTimeoutMs
    : 0;
  let terminalEventSeen = false;
  let idleTimer = null;
  let rejectIdleWait = null;

  const clearIdleTimer = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };

  const scheduleIdleTimer = () => {
    clearIdleTimer();
    if (!inactivityTimeoutMs || terminalEventSeen) {
      return;
    }

    idleTimer = setTimeout(async () => {
      idleTimer = null;

      if (terminalEventSeen) {
        return;
      }

      if (await hasPendingRuntimeInteraction(runtime, boundSessionId || readSessionId(session))) {
        scheduleIdleTimer();
        return;
      }

      closeLiveSession({
        runtime,
        session,
        sessionId: boundSessionId || readSessionId(session),
      });

      if (rejectIdleWait) {
        rejectIdleWait(new Error(`Run idle timeout after ${inactivityTimeoutMs}ms without terminal result`));
      }
    }, inactivityTimeoutMs);
  };

  const idleWatchPromise = inactivityTimeoutMs
    ? new Promise((_, reject) => {
        rejectIdleWait = reject;
      })
    : null;
  activeRuns.set(run.id, {
    session,
    sessionId: boundSessionId,
    traceId,
    emitEventRef,
    pipeline,
    terminalTail: Promise.resolve(),
  });
  if (boundSessionId) {
    await runStateStore.updateRun(run.id, { sessionId: boundSessionId });
    if (onSessionReady) {
      onSessionReady(boundSessionId);
      sessionReadyEmitted = true;
    }
  }
  // translator 负责把 SDK 消息转成稳定事件。
  const translate = createClaudeV2EventTranslator({
    runId: run.id,
    sessionId: boundSessionId,
    traceId,
  });

  await pipeline.publishCritical(createAgentEventEnvelope({
    runId: run.id,
    sessionId: boundSessionId,
    sequence,
    type: 'run.started',
    payload: {},
    traceId,
  }));

  await runStateStore.updateRun(run.id, { status: 'starting' });
  scheduleIdleTimer();
  try {
    // 统一通过执行器消费 stream，不在这里直接碰 SDK 的细节。
    const executePromise = executeClaudeRun({
      session,
      prompt,
      images,
      message,
      onMessage: async (sdkMessage) => {
        clearIdleTimer();
        const currentRun = await runStateStore.getRun(run.id);
        if (currentRun?.status === 'aborted') {
          return;
        }

        // 第一次拿到 sessionId 时，绑定 conversation 和 session。
        if (!boundSessionId) {
          boundSessionId = readSessionId(session) || readSessionIdFromSdkMessage(sdkMessage);
          if (boundSessionId) {
            await runStateStore.updateRun(run.id, { sessionId: boundSessionId });
            const activeRun = activeRuns.get(run.id);
            if (activeRun) {
              activeRun.sessionId = boundSessionId;
            }
            if (onSessionReady && !sessionReadyEmitted) {
              onSessionReady(boundSessionId);
              sessionReadyEmitted = true;
            }
          }
        }

        queueDebugLogEntry({
          debugLog,
          sessionId: boundSessionId || readSessionIdFromSdkMessage(sdkMessage),
          sdkMessage,
          tailRef: debugLogTailRef,
        });

        sequence += 1;
        const translated = translate(sdkMessage, sequence);
        const events = Array.isArray(translated) ? translated : [translated];

        for (const event of events) {
          if (boundSessionId) {
            event.sessionId = boundSessionId;
          }
          const isCriticalEvent = event.type === 'run.completed'
            || event.type === 'run.failed'
            || event.type === 'run.aborted';

          if (isCriticalEvent) {
            terminalEventSeen = true;
            clearIdleTimer();
            await pipeline.publishCritical(event);
          } else {
            pipeline.publishRealtimeFirst(event);
          }

          // 终态事件直接驱动 run 落库。
          if (event.type === 'run.completed') {
            await runStateStore.updateRun(run.id, { status: 'completed' });
          } else if (event.type === 'run.failed') {
            await runStateStore.updateRun(run.id, { status: 'failed' });
          } else if (event.type === 'run.aborted') {
            await runStateStore.updateRun(run.id, { status: 'aborted' });
          }
        }
        if (!terminalEventSeen) {
          scheduleIdleTimer();
        }
      },
    });
    await (idleWatchPromise ? Promise.race([executePromise, idleWatchPromise]) : executePromise);
  } catch (error) {
    const currentRun = await runStateStore.getRun(run.id);
    if (!currentRun || ['completed', 'failed', 'aborted'].includes(currentRun.status)) {
      await pipeline.flush();
      return runStateStore.listRunEvents(run.id);
    }
    const activeRun = activeRuns.get(run.id);
    const finishTerminalFailure = async () => {
      await pipeline.flush();
      const currentRunAfterFlush = await runStateStore.getRun(run.id);
      if (!currentRunAfterFlush || ['completed', 'failed', 'aborted'].includes(currentRunAfterFlush.status)) {
        return runStateStore.listRunEvents(run.id);
      }

      const existingEvents = await runStateStore.listRunEvents(run.id);
      sequence = existingEvents.reduce((max, event) => Math.max(max, event.sequence), 0) + 1;
      const message = error instanceof Error ? error.message : 'Run execution failed';
      const failureEvent = createAgentEventEnvelope({
        runId: run.id,
        sessionId: boundSessionId,
        sequence,
        type: 'run.failed',
        payload: {
          error: message,
          subtype: 'runtime_error',
        },
        traceId,
      });
      await pipeline.publishCritical(failureEvent);
      await runStateStore.updateRun(run.id, { status: 'failed' });
      return runStateStore.listRunEvents(run.id);
    };

    if (activeRun) {
      await enqueueTerminalTask(activeRun, finishTerminalFailure);
    } else if (currentRun.status !== 'aborted') {
      await finishTerminalFailure();
    }
  } finally {
    terminalEventSeen = true;
    clearIdleTimer();
    // 无论成功还是失败，都要释放 active run 登记。
    activeRuns.delete(run.id);
  }

  const finalRun = await runStateStore.getRun(run.id);
  if (finalRun?.status === 'aborted') {
    const activeRun = activeRuns.get(run.id);
    const finishTerminalAbort = async () => {
      await pipeline.flush();
      const currentRunAfterFlush = await runStateStore.getRun(run.id);
      if (!currentRunAfterFlush || ['completed', 'failed', 'aborted'].includes(currentRunAfterFlush.status)) {
        return runStateStore.listRunEvents(run.id);
      }

      const existingEvents = await runStateStore.listRunEvents(run.id);
      const hasAbortEvent = existingEvents.some((event) => event.type === 'run.aborted');
      if (!hasAbortEvent) {
        sequence = existingEvents.reduce((max, event) => Math.max(max, event.sequence), 0) + 1;
        const event = createAgentEventEnvelope({
          runId: run.id,
          sessionId: boundSessionId,
          sequence,
          type: 'run.aborted',
          payload: {},
          traceId,
        });
        await pipeline.publishCritical(event);
      }
      return runStateStore.listRunEvents(run.id);
    };

    if (activeRun) {
      await enqueueTerminalTask(activeRun, finishTerminalAbort);
    } else {
      await finishTerminalAbort();
    }
  }

  // 返回完整事件序列，方便路由层或测试层直接读取。
  return runStateStore.listRunEvents(run.id);
}

export function createAgentV2Services({
  repo,
  runStateStore = repo,
  runtime,
  sessionHistoryService = null,
  debugLog = null,
  runInactivityTimeoutMs = 5 * 60 * 1000,
}) {
  const activeRuns = new Map();

  async function resolveSessionTitle(sessionId, fallbackTitle = null) {
    const normalizedSessionId = normalizeSessionId(sessionId);
    if (!normalizedSessionId) {
      return normalizeSessionTitle(fallbackTitle);
    }

    if (typeof sessionHistoryService?.getSessionHistory === 'function') {
      try {
        const history = await sessionHistoryService.getSessionHistory({ sessionId: normalizedSessionId });
        const metadataTitle = normalizeSessionTitle(history?.metadata?.title);
        if (metadataTitle) {
          return metadataTitle;
        }
      } catch {
        // History is best-effort here; fall back to provided title or session id.
      }
    }

    return normalizeSessionTitle(fallbackTitle) || `Session ${normalizedSessionId}`;
  }

  async function resolveSessionShell(sessionId, fallbackTitle = null) {
    const normalizedSessionId = normalizeSessionId(sessionId);
    if (!normalizedSessionId) {
      return null;
    }

    if (typeof runStateStore?.getSession === 'function') {
      try {
        const storedSession = await runStateStore.getSession(normalizedSessionId);
        if (storedSession) {
          return buildSessionShell(normalizedSessionId, storedSession.title || fallbackTitle);
        }
      } catch {
        // Some callers still inject a side-channel repo shim that should not decide session truth.
      }
    }

    if (typeof sessionHistoryService?.getSessionHistory === 'function') {
      try {
        const history = await sessionHistoryService.getSessionHistory({ sessionId: normalizedSessionId });
        const metadataTitle = normalizeSessionTitle(history?.metadata?.title);
        const hasMeaningfulHistory = Boolean(
          history?.cwd
          || metadataTitle
          || (Array.isArray(history?.messages) && history.messages.length > 0)
          || history?.diagnosticsSummary?.debugLogAvailable,
        );

        if (hasMeaningfulHistory) {
          return buildSessionShell(normalizedSessionId, metadataTitle || fallbackTitle);
        }
      } catch {
        return null;
      }
    }

    return fallbackTitle ? buildSessionShell(normalizedSessionId, fallbackTitle) : null;
  }

  async function startSessionRun({ title, prompt, images = [], message = null, model, projectPath, effort, permissionMode, toolsSettings, traceId, writer, onEvent, onSessionReady, hooks }) {
    const result = await startConversationRunUseCase({
      repo: runStateStore,
      runtime,
      title,
      prompt,
      message,
      model,
      projectPath,
      effort,
      permissionMode,
      toolsSettings,
      writer,
      hooks,
    });

    const events = await executeRun({
      runStateStore,
      debugLog,
      run: result.run,
      session: result.session,
      initialSessionId: result.sessionId,
      prompt,
      images,
      message,
      traceId,
      onEvent,
      onSessionReady,
      activeRuns,
      runtime,
      runInactivityTimeoutMs,
    });

    const sessionId = (await runStateStore.getRun(result.run.id))?.sessionId || readSessionId(result.session);
    const persistedRun = await runStateStore.getRun(result.run.id);
    const sessionShell = buildSessionShell(sessionId, await resolveSessionTitle(sessionId, title));
    return {
      ...result,
      run: persistedRun || result.run,
      session: sessionShell,
      conversation: sessionShell,
      sessionId,
      events,
    };
  }

  async function continueSessionRun({ sessionId, prompt, images = [], message = null, model, projectPath, effort, permissionMode, toolsSettings, traceId, writer, onEvent, onSessionReady, hooks }) {
    const result = await continueConversationRunUseCase({
      repo: runStateStore,
      runtime,
      sessionId,
      prompt,
      message,
      model,
      projectPath,
      effort,
      permissionMode,
      toolsSettings,
      writer,
      hooks,
    });

    const events = await executeRun({
      runStateStore,
      debugLog,
      run: result.run,
      session: result.session,
      initialSessionId: result.sessionId,
      prompt,
      images,
      message,
      traceId,
      onEvent,
      onSessionReady,
      activeRuns,
      runtime,
      runInactivityTimeoutMs,
    });

    const persistedRun = await runStateStore.getRun(result.run.id);
    const sessionShell = buildSessionShell(sessionId, await resolveSessionTitle(sessionId));
    return {
      ...result,
      run: persistedRun || result.run,
      session: sessionShell,
      conversation: sessionShell,
      sessionId,
      events,
    };
  }

  return {
    async createSession({ sessionId, title }) {
      const resolvedSessionId = String(sessionId || '').trim();
      if (!resolvedSessionId) {
        throw new Error('createSession requires a concrete sessionId');
      }
      if (typeof runStateStore?.createSession === 'function') {
        await runStateStore.createSession({
          sessionId: resolvedSessionId,
          title,
        });
      }
      return buildSessionShell(resolvedSessionId, title);
    },
    async getSession({ sessionId }) {
      return resolveSessionShell(sessionId);
    },
    async listSessionRuns({ sessionId }) {
      return typeof runStateStore?.listSessionRuns === 'function' ? runStateStore.listSessionRuns(sessionId) : [];
    },
    async getSessionHistory({ sessionId, limit = null, offset = null, full = false }) {
      if (typeof sessionHistoryService?.getSessionHistory === 'function') {
        return sessionHistoryService.getSessionHistory({ sessionId, limit, offset, full });
      }

      return createCanonicalHistoryFallback(String(sessionId || '').trim());
    },
    startSessionRun,
    continueSessionRun,
    // 新 conversation 的起始 run。
    async startConversationRun({ title, prompt, images = [], message = null, model, projectPath, effort, permissionMode, toolsSettings, traceId, writer, onEvent, onSessionReady }) {
      return startSessionRun({ title, prompt, images, message, model, projectPath, effort, permissionMode, toolsSettings, traceId, writer, onEvent, onSessionReady });
    },
    // 继续已有 conversation 的下一轮 run。
    async continueConversationRun({ conversationId, prompt, images = [], message = null, model, projectPath, effort, permissionMode, toolsSettings, traceId, writer, onEvent, onSessionReady }) {
      return continueSessionRun({
        sessionId: conversationId,
        prompt,
        images,
        message,
        model,
        projectPath,
        effort,
        permissionMode,
        toolsSettings,
        traceId,
        writer,
        onEvent,
        onSessionReady,
      });
    },
    async abortSession({ sessionId, onEvent }) {
      const normalizedSessionId = normalizeSessionId(sessionId);
      if (!normalizedSessionId) {
        throw new Error('abortSession requires a concrete sessionId');
      }

      const activeRunId = findActiveRunIdBySessionId(activeRuns, normalizedSessionId);
      if (activeRunId) {
        return this.abortRun({ runId: activeRunId, onEvent });
      }

      const closed = typeof runtime.close === 'function'
        ? runtime.close(normalizedSessionId)
        : false;
      if (closed) {
        return {
          sessionId: normalizedSessionId,
          status: 'aborted',
        };
      }

      const liveSession = typeof runtime.getLiveSession === 'function'
        ? runtime.getLiveSession(normalizedSessionId)
        : typeof runtime.get === 'function'
          ? runtime.get(normalizedSessionId)
          : null;
      if (liveSession?.close) {
        liveSession.close();
        return {
          sessionId: normalizedSessionId,
          status: 'aborted',
        };
      }

      return null;
    },
    // 中断当前 run。
    async abortRun({ runId, onEvent }) {
      const currentRun = await runStateStore.getRun(runId);
      if (!currentRun) {
        throw new Error(`Run ${runId} not found`);
      }
      if (['completed', 'failed', 'aborted'].includes(currentRun.status)) {
        return currentRun;
      }
      const activeRun = activeRuns.get(runId);
      const finishTerminalAbort = async () => {
        if (activeRun?.pipeline) {
          await activeRun.pipeline.flush();
        }

        const result = typeof runStateStore.markRunAbortedIfActive === 'function'
          ? await runStateStore.markRunAbortedIfActive(runId)
          : await runStateStore.updateRun(runId, { status: 'aborted' });

        if (!result) {
          return (await runStateStore.getRun(runId)) || currentRun;
        }

        if (activeRun?.sessionId && runtime.close) {
          runtime.close(activeRun.sessionId);
        } else if (activeRun?.session?.close) {
          activeRun.session.close();
        }

        const pipelineForAbort = activeRun?.pipeline || createRunEventPipeline({
          runStateStore,
          runId,
          onEvent(event) {
            if (onEvent) {
              onEvent(event);
            }
          },
        });
        const events = await runStateStore.listRunEvents(runId);
        const nextSequence = events.reduce((max, event) => Math.max(max, event.sequence), 0) + 1;
        const abortedEvent = createAgentEventEnvelope({
          runId,
          sessionId: activeRun?.sessionId || result.sessionId || null,
          sequence: nextSequence,
          type: 'run.aborted',
          payload: {},
          traceId: activeRun?.traceId || null,
        });
        await pipelineForAbort.publishCritical(abortedEvent);

        return result;
      };

      if (activeRun) {
        return enqueueTerminalTask(activeRun, finishTerminalAbort);
      }

      return finishTerminalAbort();
    },
    // 回放某 run 的事件序列。
    async listRunEvents({ runId }) {
      return runStateStore.listRunEvents(runId);
    },
    isSessionActive(sessionId) {
      return typeof runtime.isActive === 'function' ? runtime.isActive(sessionId) : false;
    },
    reconnectSessionWriter(sessionId, writer) {
      if (typeof runtime.updateWriter === 'function' && !runtime.updateWriter(sessionId, writer)) {
        return false;
      }

      for (const activeRun of activeRuns.values()) {
        if (activeRun.sessionId === sessionId) {
          activeRun.emitEventRef.current = (event) => writer.send(event);
          return true;
        }
      }

      return typeof runtime.get === 'function' ? Boolean(runtime.get(sessionId)) : false;
    },
    listPendingApprovals(sessionId) {
      return typeof runtime.listPendingApprovals === 'function'
        ? runtime.listPendingApprovals(sessionId)
        : [];
    },
    listPendingInteractivePrompts(sessionId) {
      return typeof runtime.listPendingInteractivePrompts === 'function'
        ? runtime.listPendingInteractivePrompts(sessionId)
        : [];
    },
    resolvePermissionRequest(requestId, decision) {
      return typeof runtime.resolvePermissionRequest === 'function'
        ? runtime.resolvePermissionRequest(requestId, decision)
        : false;
    },
    resolveInteractivePrompt(requestId, decision) {
      return typeof runtime.resolveInteractivePrompt === 'function'
        ? runtime.resolveInteractivePrompt(requestId, decision)
        : false;
    },
  };
}
