export type AgentRealtimeEvent =
  | {
      id: string;
      runId?: string | null;
      sessionId: string | null;
      timestamp: string;
      type: 'sdk.message';
      message: {
        kind: string;
        text?: string | null;
        toolName?: string | null;
        input?: unknown;
        output?: unknown;
        requestId?: string | null;
        isError?: boolean;
        detail?: string | null;
        payload?: unknown;
      };
    }
  | {
      id: string;
      runId?: string | null;
      sessionId: string | null;
      timestamp: string;
      type: 'session.status';
      status: string;
      detail?: string | null;
      payload?: unknown;
    }
  | {
      id: string;
      runId?: string | null;
      sessionId: string | null;
      timestamp: string;
      type: 'interaction.required';
      requestId: string;
      interaction: {
        kind: 'permission' | 'interactive_prompt';
        toolName?: string | null;
        message?: string | null;
        input?: unknown;
        context?: unknown;
        payload?: unknown;
      };
    }
  | {
      id: string;
      runId?: string | null;
      sessionId: string | null;
      timestamp: string;
      type: 'interaction.resolved';
      requestId: string;
      outcome: string;
      message?: string | null;
      payload?: unknown;
    }
  | {
      id: string;
      runId?: string | null;
      sessionId: string | null;
      timestamp: string;
      type: 'debug.ref';
      ref: {
        label: string;
        path?: string | null;
      };
      payload?: unknown;
    };

export type LiveSdkFeedBlock = {
  id: string;
  type:
    | 'thinking'
    | 'delta'
    | 'tool_use'
    | 'tool_result'
    | 'interaction_required'
    | 'interaction_resolved'
    | 'session_status'
    | 'debug_ref'
    | 'notice';
  timestamp: string;
  title: string;
  body: string;
  tone: 'neutral' | 'warning' | 'danger' | 'success';
  requestId?: string;
  payload?: unknown;
};

function normalizeText(value: unknown) {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (value == null) {
    return '';
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function joinBodyParts(parts: unknown[]) {
  return parts
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .join('\n\n');
}

function buildSdkMessageBlock(event: Extract<AgentRealtimeEvent, { type: 'sdk.message' }>): LiveSdkFeedBlock | null {
  const kind = String(event.message.kind || '').trim();
  const text = normalizeText(event.message.text);
  const detail = normalizeText(event.message.detail);
  const input = normalizeText(event.message.input);
  const output = normalizeText(event.message.output);
  const payload = event.message.payload;
  const payloadBody = normalizeText(payload);
  const body = joinBodyParts([
    text,
    detail,
    output,
    input,
    !text && !detail && !output && !input ? payloadBody : '',
  ]);

  if (kind === 'thinking') {
    return {
      id: event.id,
      type: 'thinking',
      timestamp: event.timestamp,
      title: 'Thinking',
      body: body || 'Claude 正在思考',
      tone: 'neutral',
      payload,
    };
  }

  if (kind === 'assistant.message.delta') {
    return {
      id: event.id,
      type: 'delta',
      timestamp: event.timestamp,
      title: 'Delta',
      body: body || '收到增量输出',
      tone: 'neutral',
      payload,
    };
  }

  if (
    kind === 'tool.call.started'
    || kind === 'tool.call.delta'
    || kind === 'tool_use'
  ) {
    return {
      id: event.id,
      type: 'tool_use',
      timestamp: event.timestamp,
      title: event.message.toolName ? `Tool Use · ${event.message.toolName}` : 'Tool Use',
      body: body || '工具调用已开始',
      tone: 'neutral',
      payload,
    };
  }

  if (kind === 'tool.call.completed' || kind === 'tool.call.failed') {
    return {
      id: event.id,
      type: 'tool_result',
      timestamp: event.timestamp,
      title: event.message.toolName ? `Tool Result · ${event.message.toolName}` : 'Tool Result',
      body: body || '工具结果已返回',
      tone: event.message.isError ? 'danger' : 'success',
      payload,
    };
  }

  return {
    id: event.id,
    type: 'notice',
    timestamp: event.timestamp,
    title: kind || 'SDK Message',
    body: body || '收到一条 SDK 实时消息',
    tone: 'neutral',
    payload,
  };
}

function buildSessionStatusBlock(event: Extract<AgentRealtimeEvent, { type: 'session.status' }>): LiveSdkFeedBlock {
  const detail = joinBodyParts([
    event.status,
    event.detail,
    event.payload,
  ]);

  return {
    id: event.id,
    type: 'session_status',
    timestamp: event.timestamp,
    title: `Session Status · ${event.status}`,
    body: detail || '会话状态已更新',
    tone: event.status === 'failed' || event.status === 'aborted' ? 'danger' : 'neutral',
    payload: event.payload,
  };
}

function buildInteractionRequiredBlock(event: Extract<AgentRealtimeEvent, { type: 'interaction.required' }>): LiveSdkFeedBlock {
  const body = joinBodyParts([
    event.interaction.message,
    event.interaction.toolName,
    event.interaction.input,
    event.interaction.context,
    event.interaction.payload,
  ]);

  return {
    id: event.id,
    type: 'interaction_required',
    timestamp: event.timestamp,
    title: event.interaction.kind === 'interactive_prompt' ? 'Ask User' : 'Permission Required',
    body: body || '等待用户处理交互请求',
    tone: 'warning',
    requestId: event.requestId,
    payload: event.interaction.payload,
  };
}

function buildInteractionResolvedBlock(event: Extract<AgentRealtimeEvent, { type: 'interaction.resolved' }>): LiveSdkFeedBlock {
  const body = joinBodyParts([
    event.message,
    event.outcome,
    event.payload,
  ]);

  return {
    id: event.id,
    type: 'interaction_resolved',
    timestamp: event.timestamp,
    title: `Interaction Resolved · ${event.outcome}`,
    body: body || '交互请求已处理',
    tone: 'success',
    requestId: event.requestId,
    payload: event.payload,
  };
}

function buildDebugRefBlock(event: Extract<AgentRealtimeEvent, { type: 'debug.ref' }>): LiveSdkFeedBlock {
  const body = joinBodyParts([
    event.ref.label,
    event.ref.path,
    event.payload,
  ]);

  return {
    id: event.id,
    type: 'debug_ref',
    timestamp: event.timestamp,
    title: 'Debug Ref',
    body: body || '可查看调试日志引用',
    tone: 'neutral',
    payload: event.payload,
  };
}

export function projectLiveSdkFeed(events: AgentRealtimeEvent[]): LiveSdkFeedBlock[] {
  if (!Array.isArray(events)) {
    return [];
  }

  return events.flatMap((event) => {
    if (event.type === 'sdk.message') {
      const block = buildSdkMessageBlock(event);
      return block ? [block] : [];
    }

    if (event.type === 'session.status') {
      return [buildSessionStatusBlock(event)];
    }

    if (event.type === 'interaction.required') {
      return [buildInteractionRequiredBlock(event)];
    }

    if (event.type === 'interaction.resolved') {
      return [buildInteractionResolvedBlock(event)];
    }

    if (event.type === 'debug.ref') {
      return [buildDebugRefBlock(event)];
    }

    return [];
  });
}
