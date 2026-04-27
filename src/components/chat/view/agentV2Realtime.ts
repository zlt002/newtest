// 前端到后端的 V2 实时协调器。
// 它只做消息打包和事件回收，不直接承担 UI 渲染职责。
import type { AgentEventEnvelope } from '../types/agentEvents.ts';
import type { ClaudeEffortLevel } from '../constants/thinkingModes';
import { CLIENT_EVENT_TYPES } from '../types/transport.ts';
import type { OutputFormatConfig } from '../types/transport.ts';

type UploadedImage = {
  data?: string;
  mimeType?: string;
};

type SubmitAgentRunRealtimeInput = {
  prompt: string;
  projectPath: string;
  sessionId: string | null;
  model: string;
  effort?: ClaudeEffortLevel;
  permissionMode: string;
  sessionSummary: string | null;
  images: unknown[];
  toolsSettings: Record<string, unknown>;
  traceId: string;
  outputFormat?: OutputFormatConfig;
  contextFilePaths?: string[];
};

type AgentV2RealtimeCoordinatorArgs = {
  sendMessage: (message: unknown) => void;
  appendEvent: (event: AgentEventEnvelope) => void;
};

function createUserContent(prompt: string, images: unknown[]) {
  const normalizedPrompt = String(prompt || '');
  const uploadedImages = Array.isArray(images) ? images : [];

  if (uploadedImages.length === 0) {
    return normalizedPrompt;
  }

  const contentBlocks = [];

  if (normalizedPrompt.trim()) {
    contentBlocks.push({
      type: 'text',
      text: normalizedPrompt,
    });
  }

  for (const image of uploadedImages) {
    const candidate = image as UploadedImage;
    const dataUrl = typeof candidate?.data === 'string' ? candidate.data : '';
    const mimeType = typeof candidate?.mimeType === 'string' ? candidate.mimeType : '';
    const base64Marker = ';base64,';
    const markerIndex = dataUrl.indexOf(base64Marker);

    if (!mimeType || markerIndex < 0) {
      continue;
    }

    contentBlocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: mimeType,
        data: dataUrl.slice(markerIndex + base64Marker.length),
      },
    });
  }

  return contentBlocks.length > 0 ? contentBlocks : normalizedPrompt;
}

export function createAgentV2RealtimeCoordinator({
  sendMessage,
  appendEvent,
}: AgentV2RealtimeCoordinatorArgs) {
  return {
    // 提交 run 时，向后端发送 chat transport 包。
    submitRun({
      prompt,
      projectPath,
      sessionId,
      model,
      effort,
      permissionMode,
      sessionSummary,
      images,
      toolsSettings,
      traceId,
      outputFormat,
      contextFilePaths,
    }: SubmitAgentRunRealtimeInput) {
      const optimisticSessionId = sessionId || traceId;
      const optimisticRunId = `optimistic:${traceId}`;
      const timestamp = new Date().toISOString();

      appendEvent({
        eventId: `${optimisticRunId}:run.created`,
        runId: optimisticRunId,
        sessionId: optimisticSessionId,
        sequence: -1,
        type: 'run.created',
        timestamp,
        payload: {
          userInput: prompt,
          optimistic: true,
          traceId,
        },
      });
      appendEvent({
        eventId: `${optimisticRunId}:run.started`,
        runId: optimisticRunId,
        sessionId: optimisticSessionId,
        sequence: 0,
        type: 'run.started',
        timestamp,
        payload: {
          optimistic: true,
          traceId,
        },
      });

      const message = {
        role: 'user',
        content: createUserContent(prompt, images),
      };

      if (sessionId) {
        sendMessage({
          type: CLIENT_EVENT_TYPES.CHAT_USER_MESSAGE,
          sessionId,
          projectPath,
          message,
          ...(Array.isArray(contextFilePaths) && contextFilePaths.length > 0 ? { contextFilePaths } : {}),
        });
        return;
      }

      sendMessage({
        type: CLIENT_EVENT_TYPES.CHAT_RUN_START,
        sessionId: null,
        projectPath,
        model,
        permissionMode,
        traceId,
        message,
        ...(Array.isArray(contextFilePaths) && contextFilePaths.length > 0 ? { contextFilePaths } : {}),
        ...(outputFormat ? { outputFormat } : {}),
      });
    },
    // 后端回推事件后，直接把事件扔进事件 store。
    consumeEvent(event: AgentEventEnvelope) {
      appendEvent(event);
    },
  };
}
