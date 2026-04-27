import crypto from 'node:crypto';
import { promises as fsPromises } from 'fs';
import path from 'path';
import os from 'os';
import { CLIENT_EVENT_TYPES, SERVER_EVENT_TYPES } from '../../../shared/agentProtocol.js';

/**
 * WebSocket Writer - Wrapper for WebSocket to match SSEStreamWriter interface
 *
 * Provider files use `createNormalizedMessage()` from `providers/types.js` and
 * adapter `normalizeMessage()` to produce unified NormalizedMessage events.
 * The writer simply serialises and sends.
 */
class WebSocketWriter {
    constructor(ws, userId = null) {
        this.ws = ws;
        this.sessionId = null;
        this.userId = userId;
        this.latencyTrace = null;
        this.isWebSocketWriter = true;  // Marker for transport detection
    }

    send(data) {
        if (this.ws.readyState === 1) { // WebSocket.OPEN
            this.ws.send(JSON.stringify(data));
        }
    }

    updateWebSocket(newRawWs) {
        this.ws = newRawWs;
    }

    setSessionId(sessionId) {
        this.sessionId = sessionId;
    }

    getSessionId() {
        return this.sessionId;
    }

    setLatencyTrace(latencyTrace) {
        this.latencyTrace = latencyTrace;
    }

    getLatencyTrace() {
        return this.latencyTrace;
    }
}

function createNormalizedMessage(fields) {
    return {
        ...fields,
        id: fields.id || `msg_${crypto.randomUUID()}`,
        sessionId: fields.sessionId || '',
        timestamp: fields.timestamp || new Date().toISOString(),
        provider: fields.provider,
    };
}

function isChatRunEventType(type) {
    return type === CLIENT_EVENT_TYPES.CHAT_RUN_START
        || type === CLIENT_EVENT_TYPES.CHAT_USER_MESSAGE;
}

function isToolApprovalResponseEventType(type) {
    return type === CLIENT_EVENT_TYPES.TOOL_APPROVAL_RESPONSE;
}

function isReconnectEventType(type) {
    return type === CLIENT_EVENT_TYPES.CHAT_RECONNECT;
}

function isPendingDecisionRecoveryEventType(type) {
    return type === CLIENT_EVENT_TYPES.GET_PENDING_DECISIONS;
}

export function createChatHandler(deps) {
    const {
        connectedClients,
        normalizeAgentRunTransportOptions,
        shouldResumeClaudeSession,
        createLatencyTrace,
        markLatencyTrace,
        buildClaudeInvocationSnapshot,
        handleClaudeCommandWithAgentV2,
        defaultAgentV2Services,
    } = deps;

    return function handleChatConnection(ws, request) {
        console.log('[INFO] Chat WebSocket connected');

        // Add to connected clients for project updates
        connectedClients.add(ws);

        // Wrap WebSocket with writer for consistent interface with SSEStreamWriter
        const writer = new WebSocketWriter(ws, request?.user?.id ?? request?.user?.userId ?? null);

        ws.on('message', async (message) => {
            try {
                const data = JSON.parse(message);

                // V2 输入统一走 chat transport event。
                // 这里先把 transport 解到当前 V2 服务层还能消费的 prompt/images 结构。
                if (isChatRunEventType(data.type)) {
                    const normalizedOptions = normalizeAgentRunTransportOptions(data);
                    const command = normalizedOptions?.prompt || data.prompt;
                    const shouldResume = shouldResumeClaudeSession(normalizedOptions || {});
                    console.log('[DEBUG] User message:', command || '[Continue/Resume]');
                    console.log('📁 Project:', normalizedOptions?.projectPath || 'Unknown');
                    console.log('🔄 Session:', shouldResume ? 'Resume' : 'New');

                    const traceId = normalizedOptions?.traceId || `claude-ws-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
                    const latencyTrace = createLatencyTrace({
                        traceId,
                        sessionId: normalizedOptions?.sessionId || null,
                        source: 'chat_websocket',
                        commandPreview: command || ''
                    });
                    markLatencyTrace(latencyTrace, 'send_clicked');
                    const latencyTraceMetadata = latencyTrace.metadata || (latencyTrace.metadata = {});
                    latencyTraceMetadata.requestedOptions = buildClaudeInvocationSnapshot(normalizedOptions || {});
                    writer.setLatencyTrace(latencyTrace);

                    // 读取 hooks 配置并传递给 SDK runtime
                    let hooks = null;
                    try {
                        const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
                        const settingsContent = await fsPromises.readFile(settingsPath, 'utf8');
                        const settings = JSON.parse(settingsContent);
                        hooks = settings?.hooks || null;
                    } catch {
                        // 忽略 settings 文件读取失败
                    }

                    await handleClaudeCommandWithAgentV2({
                        command,
                        options: normalizedOptions,
                        services: defaultAgentV2Services,
                        writer,
                        hooks,
                    });
                // 终止会话时，优先尝试中断 V2 当前 run；如果没有绑定 run，再回退到旧 SDK 中断逻辑。
                } else if (data.type === CLIENT_EVENT_TYPES.CHAT_INTERRUPT) {
                    console.log('[DEBUG] Abort session request:', data.sessionId);
                    const aborted = await defaultAgentV2Services.abortSession({
                        sessionId: data.sessionId,
                        onEvent: (event) => writer.send(event),
                    });

                    if (!aborted) {
                        writer.send({
                            type: 'session-status',
                            sessionId: data.sessionId,
                            provider: 'claude',
                            isProcessing: false,
                        });
                    }
                // 工具授权统一走 transport event。
                } else if (isToolApprovalResponseEventType(data.type)) {
                    // Relay UI approval decisions back into the SDK control flow.
                    // This does not persist permissions; it only resolves the in-flight request,
                    // introduced so the SDK can resume once the user clicks Allow/Deny.
                    if (data.requestId) {
                        defaultAgentV2Services.resolvePermissionRequest(data.requestId, {
                            allow: data.type === CLIENT_EVENT_TYPES.TOOL_APPROVAL_RESPONSE
                                ? data.decision === 'allow'
                                : Boolean(data.allow),
                            updatedInput: data.updatedInput,
                            message: data.message,
                            rememberEntry: data.rememberEntry
                        });
                    }
                } else if (data.type === CLIENT_EVENT_TYPES.QUESTION_RESPONSE) {
                    if (data.requestId && typeof defaultAgentV2Services.resolveInteractivePrompt === 'function') {
                        defaultAgentV2Services.resolveInteractivePrompt(data.requestId, {
                            allow: true,
                            questions: Array.isArray(data.questions) ? data.questions : [],
                            answers: data.answers && typeof data.answers === 'object' ? data.answers : {},
                        });
                    }
                } else if (isReconnectEventType(data.type)) {
                    // Check if a specific session is currently processing
                    const sessionId = data.sessionId;
                    const provider = 'claude';
                    const isActive = defaultAgentV2Services.isSessionActive(sessionId);
                    if (isActive) {
                        // Reconnect the session's writer to the new WebSocket so
                        // subsequent SDK output flows to the refreshed client.
                        defaultAgentV2Services.reconnectSessionWriter(sessionId, writer);
                    }

                    writer.send({
                        type: 'session-status',
                        sessionId,
                        provider,
                        isProcessing: isActive
                    });
                } else if (isPendingDecisionRecoveryEventType(data.type)) {
                    // Return pending approval/question requests for a session.
                    const sessionId = data.sessionId;
                    if (sessionId && defaultAgentV2Services.isSessionActive(sessionId)) {
                        const pendingApprovals = defaultAgentV2Services.listPendingApprovals(sessionId);
                        const pendingInteractivePrompts = typeof defaultAgentV2Services.listPendingInteractivePrompts === 'function'
                            ? defaultAgentV2Services.listPendingInteractivePrompts(sessionId)
                            : [];
                        writer.send({
                            type: SERVER_EVENT_TYPES.PENDING_DECISIONS_RESPONSE,
                            sessionId,
                            approvals: pendingApprovals,
                            questions: pendingInteractivePrompts,
                            data: [...pendingApprovals, ...pendingInteractivePrompts]
                        });
                    }
                }
            } catch (error) {
                console.error('[ERROR] Chat WebSocket error:', error.message);
                writer.send(createNormalizedMessage({
                    kind: 'error',
                    provider: 'claude',
                    sessionId: writer.getSessionId?.() || null,
                    content: error.message,
                    isError: true,
                }));
            }
        });

        ws.on('close', () => {
            console.log('🔌 Chat client disconnected');
            // Remove from connected clients
            connectedClients.delete(ws);
        });
    };
}

export { WebSocketWriter };
