/**
 * Unified Agent SDK transport protocol constants and helpers.
 *
 * This module defines the single protocol contract we want both the server
 * and the frontend to converge on during the Agent SDK redesign.
 */

export const CLIENT_EVENT_TYPES = Object.freeze({
  CHAT_RUN_START: 'chat_run_start',
  CHAT_USER_MESSAGE: 'chat_user_message',
  TOOL_APPROVAL_RESPONSE: 'tool_approval_response',
  QUESTION_RESPONSE: 'question_response',
  CHAT_INTERRUPT: 'chat_interrupt',
  CHAT_RECONNECT: 'chat_reconnect',
  GET_PENDING_DECISIONS: 'get-pending-decisions',
});

export const SERVER_EVENT_TYPES = Object.freeze({
  AGENT_LIFECYCLE: 'agent_lifecycle',
  AGENT_SDK_MESSAGE: 'agent_sdk_message',
  TOOL_APPROVAL_REQUEST: 'tool_approval_request',
  QUESTION_REQUEST: 'question_request',
  PENDING_DECISIONS_RESPONSE: 'pending-decisions-response',
  AGENT_ERROR: 'agent_error',
  GIT_BRANCH_CREATED: 'git_branch_created',
  GIT_PR_CREATED: 'git_pr_created',
  DONE: 'done',
});

export const AGENT_LIFECYCLE_PHASES = Object.freeze({
  RUN_STARTED: 'run_started',
  SESSION_CREATED: 'session_created',
  RUN_COMPLETED: 'run_completed',
  RUN_INTERRUPTED: 'run_interrupted',
  RECONNECTED: 'reconnected',
});

export const SDK_MESSAGE_TYPES = Object.freeze([
  'system',
  'assistant',
  'user',
  'stream_event',
  'result',
]);

export const DEFAULT_AGENT_PROVIDER = 'claude';

export const OUTPUT_FORMAT_TYPES = Object.freeze({
  JSON_SCHEMA: 'json_schema',
});

export function isSdkMessageType(value) {
  return SDK_MESSAGE_TYPES.includes(value);
}

export function createBaseAgentEvent(type, fields = {}) {
  return {
    type,
    timestamp: fields.timestamp || new Date().toISOString(),
    sessionId: fields.sessionId ?? null,
    ...fields,
  };
}

export function createLifecycleEvent(phase, fields = {}) {
  return createBaseAgentEvent(SERVER_EVENT_TYPES.AGENT_LIFECYCLE, {
    phase,
    ...fields,
  });
}

export function createSdkMessageEnvelope(sdkType, payload) {
  if (!isSdkMessageType(sdkType)) {
    throw new Error(`Unsupported SDK message type: ${sdkType}`);
  }

  return {
    sdkType,
    payload,
  };
}

export function createSdkMessageEvent(sdkType, payload, fields = {}) {
  return createBaseAgentEvent(SERVER_EVENT_TYPES.AGENT_SDK_MESSAGE, {
    sdkMessage: createSdkMessageEnvelope(sdkType, payload),
    ...fields,
  });
}

export function createToolApprovalRequestEvent(fields = {}) {
  return createBaseAgentEvent(SERVER_EVENT_TYPES.TOOL_APPROVAL_REQUEST, fields);
}

export function createQuestionRequestEvent(fields = {}) {
  return createBaseAgentEvent(SERVER_EVENT_TYPES.QUESTION_REQUEST, fields);
}

export function createAgentErrorEvent(error, fields = {}) {
  const normalizedError = typeof error === 'string'
    ? { message: error }
    : {
      code: error?.code,
      message: error?.message || 'Unknown agent error',
      details: error?.details,
    };

  return createBaseAgentEvent(SERVER_EVENT_TYPES.AGENT_ERROR, {
    error: normalizedError,
    ...fields,
  });
}
