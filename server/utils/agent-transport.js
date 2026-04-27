import {
  AGENT_LIFECYCLE_PHASES,
  DEFAULT_AGENT_PROVIDER,
  createAgentErrorEvent,
  createLifecycleEvent,
  createQuestionRequestEvent,
  createSdkMessageEvent,
  createToolApprovalRequestEvent,
} from '../../shared/agentProtocol.js';

export function createAgentRunStartedEvent({ sessionId = null, provider = DEFAULT_AGENT_PROVIDER, data = {} } = {}) {
  return createLifecycleEvent(AGENT_LIFECYCLE_PHASES.RUN_STARTED, {
    sessionId,
    provider,
    data,
  });
}

export function createAgentSessionCreatedEvent({ sessionId, provider = DEFAULT_AGENT_PROVIDER, data = {} } = {}) {
  return createLifecycleEvent(AGENT_LIFECYCLE_PHASES.SESSION_CREATED, {
    sessionId: sessionId ?? null,
    provider,
    data,
  });
}

export function createAgentRunCompletedEvent({ sessionId, provider = DEFAULT_AGENT_PROVIDER, data = {} } = {}) {
  return createLifecycleEvent(AGENT_LIFECYCLE_PHASES.RUN_COMPLETED, {
    sessionId: sessionId ?? null,
    provider,
    data,
  });
}

export function createAgentRunInterruptedEvent({ sessionId, provider = DEFAULT_AGENT_PROVIDER, data = {} } = {}) {
  return createLifecycleEvent(AGENT_LIFECYCLE_PHASES.RUN_INTERRUPTED, {
    sessionId: sessionId ?? null,
    provider,
    data,
  });
}

export function createAgentReconnectedEvent({ sessionId, provider = DEFAULT_AGENT_PROVIDER, data = {} } = {}) {
  return createLifecycleEvent(AGENT_LIFECYCLE_PHASES.RECONNECTED, {
    sessionId: sessionId ?? null,
    provider,
    data,
  });
}

export function createTransportSdkMessage(message, { sessionId = null, provider = DEFAULT_AGENT_PROVIDER } = {}) {
  return createSdkMessageEvent(message?.type, message, {
    sessionId,
    provider,
  });
}

export function createTransportToolApprovalRequest({
  sessionId = null,
  requestId,
  toolName,
  input,
  provider = DEFAULT_AGENT_PROVIDER,
} = {}) {
  return createToolApprovalRequestEvent({
    sessionId,
    requestId,
    toolName,
    input,
    provider,
  });
}

export function createTransportQuestionRequest({
  sessionId = null,
  requestId,
  questions,
  provider = DEFAULT_AGENT_PROVIDER,
} = {}) {
  return createQuestionRequestEvent({
    sessionId,
    requestId,
    questions,
    provider,
  });
}

export function createTransportError(error, { sessionId = null, provider = DEFAULT_AGENT_PROVIDER } = {}) {
  return createAgentErrorEvent(error, {
    sessionId,
    provider,
  });
}
