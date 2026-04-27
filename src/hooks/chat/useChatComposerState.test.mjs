import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import vm from 'node:vm';

const sourcePath = path.join(process.cwd(), 'src/hooks/chat/useChatComposerState.ts');

const loadUseChatComposerStateModule = async (overrides = {}) => {
  const source = await fs.readFile(sourcePath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
  });

  const storageState = new Map(Object.entries(overrides.storage || {}));
  const safeLocalStorage = overrides.safeLocalStorage || {
    getItem: (key) => {
      if (storageState.has(key)) {
        return storageState.get(key);
      }
      if (key === 'claude-settings') {
        return JSON.stringify(
          overrides.savedToolsSettings || {
            allowedTools: ['Read'],
            disallowedTools: [],
            skipPermissions: false,
          },
        );
      }

      return overrides.draftInput ?? '请帮我总结改动';
    },
    setItem: (key, value) => {
      storageState.set(key, value);
    },
    removeItem: (key) => {
      storageState.delete(key);
    },
  };

  const mocks = {
    react: {
      useCallback: (fn) => fn,
      useEffect: (fn) => fn(),
      useRef: (initialValue) => ({ current: initialValue }),
      useState: (initialValue) => {
        const slot = {
          value: typeof initialValue === 'function' ? initialValue() : initialValue,
        };
        return [
          slot.value,
          (nextValue) => {
            slot.value = typeof nextValue === 'function' ? nextValue(slot.value) : nextValue;
          },
        ];
      },
    },
    'react-dropzone': {
      useDropzone: () => ({
        getRootProps: () => ({}),
        getInputProps: () => ({}),
        isDragActive: false,
        open: () => undefined,
      }),
    },
    '../../../utils/api': {
      authenticatedFetch: overrides.authenticatedFetch || (async () => ({ ok: true, json: async () => ({}) })),
    },
    '../utils/chatInputAppend': {
      appendTextToChatInput: () => undefined,
    },
    '../constants/thinkingModes': {
      thinkingModes: [{ id: 'high', prefix: 'HIGH' }],
    },
    '../utils/chatPermissions': {
      grantClaudeToolPermission: async () => undefined,
    },
    '../utils/chatStorage': {
      safeLocalStorage,
    },
    '../../../utils/clipboard': {
      copyTextToClipboard: async () => true,
    },
    '../utils/chatFormatting': {
      escapeRegExp: (value) => value,
    },
    '../types/transport': {
      CLIENT_EVENT_TYPES: {
        CHAT_RUN_START: 'chat_run_start',
        CHAT_USER_MESSAGE: 'chat_user_message',
        TOOL_APPROVAL_RESPONSE: 'tool_approval_response',
        QUESTION_RESPONSE: 'question_response',
      },
    },
    './useFileMentions': {
      useFileMentions: () => ({
        showFileDropdown: false,
        filteredFiles: [],
        selectedFileIndex: -1,
        renderInputWithMentions: (value) => value,
        selectFile: () => undefined,
        setCursorPosition: () => undefined,
        handleFileMentionsKeyDown: () => undefined,
      }),
    },
    './builtInCommandBehavior.js': {
      shouldResetComposerAfterBuiltInAction: () => false,
      shouldResetComposerImmediatelyAfterSlashCommandIntercept: () => false,
    },
    './chatComposerSessionTarget.js': {
      resolveComposerSubmitTarget: () => overrides.submitTarget || { mode: 'continue', sessionId: 'sess-1' },
    },
    './sessionTranscript.js': {
      buildSessionTranscript: () => 'transcript',
      buildTranscriptFilename: () => 'transcript.md',
    },
    './useSlashCommands': {
      useSlashCommands: () => ({
        slashCommands: overrides.slashCommands || [],
        slashCommandsCount: 0,
        filteredCommands: [],
        frequentCommands: [],
        commandQuery: '',
        showCommandMenu: false,
        selectedCommandIndex: -1,
        resetCommandMenuState: () => undefined,
        handleCommandSelect: () => undefined,
        handleToggleCommandMenu: () => undefined,
        handleCommandInputChange: () => undefined,
        handleCommandMenuKeyDown: () => undefined,
      }),
    },
    '../utils/latencyTrace': {
      markClientLatencyEvent: () => undefined,
    },
    '../../../contexts/WebSocketContext': {
      useWebSocket: () => ({
        clientLatencyTraceStore: {
          delete: () => undefined,
        },
      }),
    },
  };

  const runtimeSource = [
    `const { useCallback, useEffect, useRef, useState } = __mocks.react;`,
    `const { useDropzone } = __mocks['react-dropzone'];`,
    `const { authenticatedFetch } = __mocks['../../../utils/api'];`,
    `const { appendTextToChatInput } = __mocks['../utils/chatInputAppend'];`,
    `const { thinkingModes } = __mocks['../constants/thinkingModes'];`,
    `const { grantClaudeToolPermission } = __mocks['../utils/chatPermissions'];`,
    `const { safeLocalStorage } = __mocks['../utils/chatStorage'];`,
    `const { copyTextToClipboard } = __mocks['../../../utils/clipboard'];`,
    `const { escapeRegExp } = __mocks['../utils/chatFormatting'];`,
    `const { CLIENT_EVENT_TYPES } = __mocks['../types/transport'];`,
    `const { useFileMentions } = __mocks['./useFileMentions'];`,
    `const { shouldResetComposerAfterBuiltInAction, shouldResetComposerImmediatelyAfterSlashCommandIntercept } = __mocks['./builtInCommandBehavior.js'];`,
    `const { resolveComposerSubmitTarget } = __mocks['./chatComposerSessionTarget.js'];`,
    `const { buildSessionTranscript, buildTranscriptFilename } = __mocks['./sessionTranscript.js'];`,
    `const { useSlashCommands } = __mocks['./useSlashCommands'];`,
    `const { markClientLatencyEvent } = __mocks['../utils/latencyTrace'];`,
    `const { useWebSocket } = __mocks['../../../contexts/WebSocketContext'];`,
    outputText
      .replace(/^import[\s\S]*?;\n/gm, '')
      .replace(/^export\s*\{\s*\};?\n?/gm, '')
      .replace(/^export\s+/gm, ''),
    'return { useChatComposerState };',
  ].join('\n');

  const context = {
    __mocks: mocks,
    console,
    setTimeout,
    clearTimeout,
    Date,
    Map,
    FormData,
    Blob,
    URL,
    sessionStorage: {
      removeItem: () => undefined,
    },
    window: {},
    document: undefined,
  };

  if (typeof overrides.setTimeout === 'function') {
    context.setTimeout = overrides.setTimeout;
  }

  const exports = vm.runInNewContext(`(() => { ${runtimeSource} })()`, context);
  return { exports, storageState };
};

test('useChatComposerState.ts navigates to a temporary session route before the real session id arrives', async () => {
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /onNavigateToSession\?: \(sessionId: string\) => void;/);
  assert.match(source, /if \(submitTarget\.mode === 'new-conversation'\) \{/);
  assert.match(source, /setCurrentSessionId\(sessionToActivate\);/);
  assert.match(source, /onNavigateToSession\?\.\(sessionToActivate\);/);
});

test('useChatComposerState.ts allows image-only submits when attachments exist', async () => {
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /const hasAttachedImages = attachedImages\.length > 0;/);
  assert.match(source, /if \(\(!currentInput\.trim\(\) && !hasAttachedImages\) \|\| isLoading \|\| !selectedProject\) \{/);
});

test('useChatComposerState.ts supports global input history navigation with ArrowUp and ArrowDown', async () => {
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /const GLOBAL_INPUT_HISTORY_STORAGE_KEY = 'chat_input_history_v1';/);
  assert.match(source, /event\.key === 'ArrowUp'/);
  assert.match(source, /event\.key === 'ArrowDown'/);
  assert.match(source, /draftBeforeHistoryNavigationRef/);
  assert.match(source, /isCursorOnFirstLine/);
  assert.match(source, /isCursorOnLastLine/);
});

test('useChatComposerState persists submitted input into global history storage', async () => {
  const submittedPayloads = [];
  const { exports, storageState } = await loadUseChatComposerStateModule({
    draftInput: '全局历史测试输入',
    storage: {
      'draft_input_demo': '全局历史测试输入',
    },
    setTimeout: (fn) => {
      fn();
      return 0;
    },
  });
  const useChatComposerState = exports.useChatComposerState;

  const api = useChatComposerState({
    selectedProject: {
      name: 'demo',
      fullPath: '/workspace/demo',
      path: '/workspace/demo',
    },
    selectedSession: {
      id: 'sess-1',
      summary: 'demo session',
    },
    currentSessionId: 'sess-1',
    setCurrentSessionId: () => undefined,
    provider: 'claude',
    permissionMode: 'bypassPermissions',
    cyclePermissionMode: () => undefined,
    claudeModel: 'claude-opus-4-7',
    isLoading: false,
    canAbortSession: false,
    tokenBudget: null,
    chatMessages: [],
    sendMessage: () => undefined,
    onSessionActive: () => undefined,
    onSessionProcessing: () => undefined,
    onNavigateToSession: () => undefined,
    onCompactWorkflowStart: () => undefined,
    onInputFocusChange: () => undefined,
    onFileOpen: () => undefined,
    onShowSettings: () => undefined,
    pendingViewSessionRef: { current: null },
    scrollToBottom: () => undefined,
    addMessage: () => undefined,
    clearMessages: () => undefined,
    rewindMessages: () => undefined,
    setIsLoading: () => undefined,
    setCanAbortSession: () => undefined,
    setClaudeStatus: () => undefined,
    setIsUserScrolledUp: () => undefined,
    pendingDecisionRequests: [],
    setPendingDecisionRequests: () => undefined,
    submitAgentRun: async (payload) => {
      submittedPayloads.push(payload);
    },
  });

  await api.handleSubmit({ preventDefault: () => undefined });

  assert.equal(submittedPayloads.length, 1);
  assert.equal(
    storageState.get('chat_input_history_v1'),
    JSON.stringify(['全局历史测试输入']),
  );
});

test('runtime slash commands continue to raw submit instead of using the local bridge', async () => {
  const submittedPayloads = [];
  const executedCommands = [];
  const { exports } = await loadUseChatComposerStateModule({
    draftInput: '/graphify query',
    slashCommands: [
      {
        name: '/graphify',
        sourceType: 'claude-runtime',
        path: '/tmp/graphify.md',
      },
    ],
    authenticatedFetch: async (url, options) => {
      if (String(url).includes('/api/commands/execute')) {
        executedCommands.push(JSON.parse(options.body));
      }

      return { ok: true, json: async () => ({}) };
    },
    setTimeout: (fn) => {
      fn();
      return 0;
    },
  });
  const useChatComposerState = exports.useChatComposerState;

  const api = useChatComposerState({
    selectedProject: {
      name: 'demo',
      fullPath: '/workspace/demo',
      path: '/workspace/demo',
    },
    selectedSession: {
      id: 'sess-1',
      summary: 'demo session',
    },
    currentSessionId: 'sess-1',
    setCurrentSessionId: () => undefined,
    provider: 'claude',
    permissionMode: 'bypassPermissions',
    cyclePermissionMode: () => undefined,
    claudeModel: 'claude-opus-4-7',
    isLoading: false,
    canAbortSession: false,
    tokenBudget: null,
    chatMessages: [],
    sendMessage: () => undefined,
    onSessionActive: () => undefined,
    onSessionProcessing: () => undefined,
    onNavigateToSession: () => undefined,
    onCompactWorkflowStart: () => undefined,
    onInputFocusChange: () => undefined,
    onFileOpen: () => undefined,
    onShowSettings: () => undefined,
    pendingViewSessionRef: { current: null },
    scrollToBottom: () => undefined,
    addMessage: () => undefined,
    clearMessages: () => undefined,
    rewindMessages: () => undefined,
    setIsLoading: () => undefined,
    setCanAbortSession: () => undefined,
    setClaudeStatus: () => undefined,
    setIsUserScrolledUp: () => undefined,
    pendingDecisionRequests: [],
    setPendingDecisionRequests: () => undefined,
    submitAgentRun: async (payload) => {
      submittedPayloads.push(payload);
    },
  });

  await api.handleSubmit({ preventDefault: () => undefined });

  assert.equal(executedCommands.length, 0);
  assert.equal(submittedPayloads.length, 1);
  assert.equal(submittedPayloads[0].prompt, '/graphify query');
});

test('useChatComposerState.ts sends official effort separately instead of prefixing the prompt', async () => {
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /const selectedThinkingMode = thinkingModes\.find/);
  assert.match(source, /const effort = selectedThinkingMode\?\.id as ClaudeEffortLevel \| undefined;/);
  assert.match(source, /await submitAgentRun\(\{\s*prompt: currentInput,[\s\S]*?model: claudeModel,[\s\S]*?effort,/s);
  assert.match(source, /type: 'chat_user_message'|CLIENT_EVENT_TYPES\.CHAT_USER_MESSAGE/);
  assert.match(source, /type: 'chat_run_start'|CLIENT_EVENT_TYPES\.CHAT_RUN_START/);
  assert.match(source, /content: buildTransportUserContent\(/);
  assert.doesNotMatch(source, /const chatMcpEnabled = typeof toolsSettings\.chatMcpEnabled === 'boolean'/);
  assert.doesNotMatch(source, /messageContent = `\$\{selectedThinkingMode\.prefix\}: \$\{currentInput\}`/);
});

test('useChatComposerState sends interrupt requests through shared chat transport constants', async () => {
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /CLIENT_EVENT_TYPES\.CHAT_INTERRUPT/);
  assert.doesNotMatch(source, /type:\s*'abort-session'/);
});

test('useChatComposerState runtime submitAgentRun payload keeps toolsSettings and omits mcpEnabled', async () => {
  const { exports } = await loadUseChatComposerStateModule();
  const useChatComposerState = exports.useChatComposerState;
  const submitCalls = [];

  const api = useChatComposerState({
    selectedProject: {
      name: 'demo',
      fullPath: '/workspace/demo',
      path: '/workspace/demo',
    },
    selectedSession: null,
    currentSessionId: 'sess-1',
    setCurrentSessionId: () => undefined,
    provider: 'claude',
    permissionMode: 'bypassPermissions',
    cyclePermissionMode: () => undefined,
    claudeModel: 'claude-opus-4-7',
    isLoading: false,
    canAbortSession: false,
    tokenBudget: null,
    chatMessages: [],
    sendMessage: () => undefined,
    onSessionActive: () => undefined,
    onSessionProcessing: () => undefined,
    onNavigateToSession: () => undefined,
    onCompactWorkflowStart: () => undefined,
    onInputFocusChange: () => undefined,
    onFileOpen: () => undefined,
    onShowSettings: () => undefined,
    pendingViewSessionRef: { current: null },
    scrollToBottom: () => undefined,
    addMessage: () => undefined,
    clearMessages: () => undefined,
    rewindMessages: () => undefined,
    setIsLoading: () => undefined,
    setCanAbortSession: () => undefined,
    setClaudeStatus: () => undefined,
    setIsUserScrolledUp: () => undefined,
    pendingDecisionRequests: [],
    setPendingDecisionRequests: () => undefined,
    submitAgentRun: async (payload) => {
      submitCalls.push(payload);
    },
  });

  await api.handleSubmit({ preventDefault: () => undefined });

  assert.equal(submitCalls.length, 1);
  assert.equal(
    JSON.stringify(submitCalls[0].toolsSettings),
    JSON.stringify({
      allowedTools: ['Read'],
      disallowedTools: [],
      skipPermissions: false,
    }),
  );
  assert.equal('mcpEnabled' in submitCalls[0], false);
});

test('useChatComposerState runtime submitAgentRun payload includes the active context file path when enabled', async () => {
  const { exports } = await loadUseChatComposerStateModule();
  const useChatComposerState = exports.useChatComposerState;
  const submitCalls = [];

  const api = useChatComposerState({
    selectedProject: {
      name: 'demo',
      fullPath: '/workspace/demo',
      path: '/workspace/demo',
    },
    selectedSession: null,
    currentSessionId: 'sess-1',
    setCurrentSessionId: () => undefined,
    provider: 'claude',
    permissionMode: 'bypassPermissions',
    cyclePermissionMode: () => undefined,
    claudeModel: 'claude-opus-4-7',
    isLoading: false,
    canAbortSession: false,
    tokenBudget: null,
    chatMessages: [],
    sendMessage: () => undefined,
    onSessionActive: () => undefined,
    onSessionProcessing: () => undefined,
    onNavigateToSession: () => undefined,
    onCompactWorkflowStart: () => undefined,
    onInputFocusChange: () => undefined,
    onFileOpen: () => undefined,
    activeContextFilePath: '/workspace/demo/src/App.tsx',
    onShowSettings: () => undefined,
    pendingViewSessionRef: { current: null },
    scrollToBottom: () => undefined,
    addMessage: () => undefined,
    clearMessages: () => undefined,
    rewindMessages: () => undefined,
    setIsLoading: () => undefined,
    setCanAbortSession: () => undefined,
    setClaudeStatus: () => undefined,
    setIsUserScrolledUp: () => undefined,
    pendingDecisionRequests: [],
    setPendingDecisionRequests: () => undefined,
    submitAgentRun: async (payload) => {
      submitCalls.push(payload);
    },
  });

  await api.handleSubmit({ preventDefault: () => undefined });

  assert.equal(submitCalls.length, 1);
  assert.equal(
    JSON.stringify(submitCalls[0].contextFilePaths),
    JSON.stringify(['/workspace/demo/src/App.tsx']),
  );
});

test('useChatComposerState runtime fallback sendMessage payload uses transport message envelope', async () => {
  const sentMessages = [];
  const { exports } = await loadUseChatComposerStateModule();
  const useChatComposerState = exports.useChatComposerState;

  const api = useChatComposerState({
    selectedProject: {
      name: 'demo',
      fullPath: '/workspace/demo',
      path: '/workspace/demo',
    },
    selectedSession: null,
    currentSessionId: 'sess-1',
    setCurrentSessionId: () => undefined,
    provider: 'claude',
    permissionMode: 'bypassPermissions',
    cyclePermissionMode: () => undefined,
    claudeModel: 'claude-opus-4-7',
    isLoading: false,
    canAbortSession: false,
    tokenBudget: null,
    chatMessages: [],
    sendMessage: (message) => {
      sentMessages.push(message);
    },
    onSessionActive: () => undefined,
    onSessionProcessing: () => undefined,
    onNavigateToSession: () => undefined,
    onCompactWorkflowStart: () => undefined,
    onInputFocusChange: () => undefined,
    onFileOpen: () => undefined,
    onShowSettings: () => undefined,
    pendingViewSessionRef: { current: null },
    scrollToBottom: () => undefined,
    addMessage: () => undefined,
    clearMessages: () => undefined,
    rewindMessages: () => undefined,
    setIsLoading: () => undefined,
    setCanAbortSession: () => undefined,
    setClaudeStatus: () => undefined,
    setIsUserScrolledUp: () => undefined,
    pendingDecisionRequests: [],
    setPendingDecisionRequests: () => undefined,
  });

  await api.handleSubmit({ preventDefault: () => undefined });

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, 'chat_user_message');
  assert.equal(sentMessages[0].sessionId, 'sess-1');
  assert.equal(sentMessages[0].message?.role, 'user');
  assert.equal(sentMessages[0].message?.content, '请帮我总结改动');
  assert.equal('toolsSettings' in sentMessages[0], false);
  assert.equal('mcpEnabled' in sentMessages[0], false);
});

test('useChatComposerState runtime fallback includes traceId when starting a new session', async () => {
  const sentMessages = [];
  const setCurrentSessionIds = [];
  const { exports } = await loadUseChatComposerStateModule({
    submitTarget: { mode: 'new-conversation', sessionId: null },
  });
  const useChatComposerState = exports.useChatComposerState;

  const api = useChatComposerState({
    selectedProject: {
      name: 'demo',
      fullPath: '/workspace/demo',
      path: '/workspace/demo',
    },
    selectedSession: null,
    currentSessionId: null,
    setCurrentSessionId: (sessionId) => {
      setCurrentSessionIds.push(sessionId);
    },
    provider: 'claude',
    permissionMode: 'bypassPermissions',
    cyclePermissionMode: () => undefined,
    claudeModel: 'claude-opus-4-7',
    isLoading: false,
    canAbortSession: false,
    tokenBudget: null,
    chatMessages: [],
    sendMessage: (message) => {
      sentMessages.push(message);
    },
    onSessionActive: () => undefined,
    onSessionProcessing: () => undefined,
    onNavigateToSession: () => undefined,
    onCompactWorkflowStart: () => undefined,
    onInputFocusChange: () => undefined,
    onFileOpen: () => undefined,
    onShowSettings: () => undefined,
    pendingViewSessionRef: { current: null },
    scrollToBottom: () => undefined,
    addMessage: () => undefined,
    clearMessages: () => undefined,
    rewindMessages: () => undefined,
    setIsLoading: () => undefined,
    setCanAbortSession: () => undefined,
    setClaudeStatus: () => undefined,
    setIsUserScrolledUp: () => undefined,
    pendingDecisionRequests: [],
    setPendingDecisionRequests: () => undefined,
  });

  await api.handleSubmit({ preventDefault: () => undefined });

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, 'chat_run_start');
  assert.equal(sentMessages[0].sessionId, null);
  assert.equal(typeof sentMessages[0].traceId, 'string');
  assert.match(sentMessages[0].traceId, /^new-session-\d+$/);
  assert.equal(sentMessages[0].message?.role, 'user');
  assert.equal(sentMessages[0].message?.content, '请帮我总结改动');
  assert.deepEqual(setCurrentSessionIds, [sentMessages[0].traceId]);
});

test('useChatComposerState includes outputFormat only on chat_run_start payloads', async () => {
  const sentMessages = [];
  const { exports } = await loadUseChatComposerStateModule({
    submitTarget: { mode: 'new-conversation', sessionId: null },
  });
  const useChatComposerState = exports.useChatComposerState;

  const api = useChatComposerState({
    selectedProject: {
      name: 'demo',
      fullPath: '/workspace/demo',
      path: '/workspace/demo',
    },
    selectedSession: null,
    currentSessionId: null,
    setCurrentSessionId: () => undefined,
    provider: 'claude',
    permissionMode: 'bypassPermissions',
    cyclePermissionMode: () => undefined,
    claudeModel: 'claude-opus-4-7',
    isLoading: false,
    canAbortSession: false,
    tokenBudget: null,
    chatMessages: [],
    sendMessage: (message) => {
      sentMessages.push(message);
    },
    onSessionActive: () => undefined,
    onSessionProcessing: () => undefined,
    onNavigateToSession: () => undefined,
    onCompactWorkflowStart: () => undefined,
    onInputFocusChange: () => undefined,
    onFileOpen: () => undefined,
    onShowSettings: () => undefined,
    pendingViewSessionRef: { current: null },
    scrollToBottom: () => undefined,
    addMessage: () => undefined,
    clearMessages: () => undefined,
    rewindMessages: () => undefined,
    setIsLoading: () => undefined,
    setCanAbortSession: () => undefined,
    setClaudeStatus: () => undefined,
    setIsUserScrolledUp: () => undefined,
    pendingDecisionRequests: [],
    setPendingDecisionRequests: () => undefined,
    outputFormat: {
      type: 'json_schema',
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
        },
        required: ['title'],
      },
    },
  });

  await api.handleSubmit({ preventDefault: () => undefined });

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, 'chat_run_start');
  assert.deepEqual(sentMessages[0].outputFormat, {
    type: 'json_schema',
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
      },
      required: ['title'],
    },
  });
});

test('useChatComposerState sends tool_approval_response for permission decisions', async () => {
  const sentMessages = [];
  const { exports } = await loadUseChatComposerStateModule();
  const useChatComposerState = exports.useChatComposerState;

  const api = useChatComposerState({
    selectedProject: null,
    selectedSession: null,
    currentSessionId: 'sess-1',
    setCurrentSessionId: () => undefined,
    provider: 'claude',
    permissionMode: 'bypassPermissions',
    cyclePermissionMode: () => undefined,
    claudeModel: 'claude-opus-4-7',
    isLoading: false,
    canAbortSession: false,
    tokenBudget: null,
    chatMessages: [],
    sendMessage: (message) => {
      sentMessages.push(message);
    },
    onSessionActive: () => undefined,
    onSessionProcessing: () => undefined,
    onNavigateToSession: () => undefined,
    onCompactWorkflowStart: () => undefined,
    onInputFocusChange: () => undefined,
    onFileOpen: () => undefined,
    onShowSettings: () => undefined,
    pendingViewSessionRef: { current: null },
    scrollToBottom: () => undefined,
    addMessage: () => undefined,
    clearMessages: () => undefined,
    rewindMessages: () => undefined,
    setIsLoading: () => undefined,
    setCanAbortSession: () => undefined,
    setClaudeStatus: () => undefined,
    setIsUserScrolledUp: () => undefined,
    pendingDecisionRequests: [{
      requestId: 'perm-1',
      toolName: 'Bash',
      kind: 'permission_request',
    }],
    setPendingDecisionRequests: () => undefined,
  });

  api.handlePermissionDecision('perm-1', { allow: true });

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, 'tool_approval_response');
  assert.equal(sentMessages[0].requestId, 'perm-1');
  assert.equal(sentMessages[0].decision, 'allow');
});

test('useChatComposerState sends question_response for interactive decisions', async () => {
  const sentMessages = [];
  const { exports } = await loadUseChatComposerStateModule();
  const useChatComposerState = exports.useChatComposerState;

  const api = useChatComposerState({
    selectedProject: null,
    selectedSession: null,
    currentSessionId: 'sess-1',
    setCurrentSessionId: () => undefined,
    provider: 'claude',
    permissionMode: 'bypassPermissions',
    cyclePermissionMode: () => undefined,
    claudeModel: 'claude-opus-4-7',
    isLoading: false,
    canAbortSession: false,
    tokenBudget: null,
    chatMessages: [],
    sendMessage: (message) => {
      sentMessages.push(message);
    },
    onSessionActive: () => undefined,
    onSessionProcessing: () => undefined,
    onNavigateToSession: () => undefined,
    onCompactWorkflowStart: () => undefined,
    onInputFocusChange: () => undefined,
    onFileOpen: () => undefined,
    onShowSettings: () => undefined,
    pendingViewSessionRef: { current: null },
    scrollToBottom: () => undefined,
    addMessage: () => undefined,
    clearMessages: () => undefined,
    rewindMessages: () => undefined,
    setIsLoading: () => undefined,
    setCanAbortSession: () => undefined,
    setClaudeStatus: () => undefined,
    setIsUserScrolledUp: () => undefined,
    pendingDecisionRequests: [{
      requestId: 'question-1',
      toolName: 'AskUserQuestion',
      kind: 'interactive_prompt',
      questions: [{
        question: '选择执行方式',
        options: [{ label: '继续' }, { label: '停止' }],
      }],
    }],
    setPendingDecisionRequests: () => undefined,
  });

  api.handlePermissionDecision('question-1', {
    allow: true,
    updatedInput: {
      answers: {
        选择执行方式: '继续',
      },
    },
  });

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, 'question_response');
  assert.equal(sentMessages[0].requestId, 'question-1');
  assert.equal(sentMessages[0].questions?.[0]?.question, '选择执行方式');
  assert.equal(sentMessages[0].answers?.['选择执行方式'], '继续');
});

test('useSlashCommands.ts includes sessionId in the commands list request body', async () => {
  const sourcePath = path.join(process.cwd(), 'src/hooks/chat/useSlashCommands.ts');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /sessionId\?: string \| null;/);
  assert.match(source, /const toolsSettings = readClaudeToolsSettings\(\);/);
  assert.match(source, /body: JSON\.stringify\(\{\s*projectPath: selectedProjectPath,\s*sessionId,\s*toolsSettings,\s*\}\)/s);
});

test('useSlashCommands.ts lazy-loads command catalog behind cache instead of fetching on every session switch', async () => {
  const sourcePath = path.join(process.cwd(), 'src/hooks/chat/useSlashCommands.ts');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /const COMMAND_CACHE_TTL_MS =/);
  assert.match(source, /const slashCommandCache = new Map/);
  assert.match(source, /const slashCommandRequests = new Map/);
  assert.match(source, /const ensureSlashCommandsLoaded = useCallback\(async \(\) =>/);
  assert.match(source, /const refreshSlashCommands = useCallback\(async \(\) =>/);
  assert.match(source, /const cachedCommands = readCachedSlashCommands/);
  assert.match(source, /if \(isOpening\) \{\s*void \(sessionId \? refreshSlashCommands\(\) : ensureSlashCommandsLoaded\(\)\);/s);
  assert.match(source, /if \(match\) \{\s*void \(sessionId \? refreshSlashCommands\(\) : ensureSlashCommandsLoaded\(\)\);/s);
  assert.doesNotMatch(source, /useEffect\(\(\) => \{\s*const fetchCommands = async \(\) =>/);
});

test('local-ui custom commands submit expanded prompt but keep the raw slash command as the visible user bubble', async () => {
  const submittedPayloads = [];
  const addedMessages = [];
  const rawCommand = "/graphify query 'IT资产报废'";
  const expandedPrompt = `Base directory for this skill: /Users/demo/.claude/skills/graphify

# graphify

Turn any folder into a graph.`;

  const { exports } = await loadUseChatComposerStateModule({
    draftInput: rawCommand,
    slashCommands: [
      {
        name: '/graphify',
        sourceType: 'local-ui',
        path: '/Users/demo/.claude/commands/graphify.md',
      },
    ],
    setTimeout: (fn) => {
      fn();
      return 0;
    },
    authenticatedFetch: async (url) => {
      if (String(url).includes('/api/commands/execute')) {
        return {
          ok: true,
          json: async () => ({
            type: 'custom',
            command: '/graphify',
            content: expandedPrompt,
            hasBashCommands: false,
            hasFileIncludes: false,
          }),
        };
      }

      return { ok: true, json: async () => ({}) };
    },
  });
  const useChatComposerState = exports.useChatComposerState;

  const api = useChatComposerState({
    selectedProject: {
      name: 'demo',
      fullPath: '/workspace/demo',
      path: '/workspace/demo',
    },
    selectedSession: {
      id: 'sess-1',
      summary: 'demo session',
    },
    currentSessionId: 'sess-1',
    setCurrentSessionId: () => undefined,
    provider: 'claude',
    permissionMode: 'bypassPermissions',
    cyclePermissionMode: () => undefined,
    claudeModel: 'claude-opus-4-7',
    isLoading: false,
    canAbortSession: false,
    tokenBudget: null,
    chatMessages: [],
    sendMessage: () => undefined,
    onSessionActive: () => undefined,
    onSessionProcessing: () => undefined,
    onNavigateToSession: () => undefined,
    onCompactWorkflowStart: () => undefined,
    onInputFocusChange: () => undefined,
    onFileOpen: () => undefined,
    onShowSettings: () => undefined,
    pendingViewSessionRef: { current: null },
    scrollToBottom: () => undefined,
    addMessage: (message) => {
      addedMessages.push(message);
    },
    clearMessages: () => undefined,
    rewindMessages: () => undefined,
    setIsLoading: () => undefined,
    setCanAbortSession: () => undefined,
    setClaudeStatus: () => undefined,
    setIsUserScrolledUp: () => undefined,
    pendingDecisionRequests: [],
    setPendingDecisionRequests: () => undefined,
    submitAgentRun: async (payload) => {
      submittedPayloads.push(payload);
    },
  });

  await api.handleSubmit({ preventDefault: () => undefined });

  assert.equal(submittedPayloads.length, 1);
  assert.equal(submittedPayloads[0].prompt, expandedPrompt);
  assert.equal(addedMessages.length, 1);
  assert.equal(addedMessages[0].type, 'user');
  assert.equal(addedMessages[0].content, rawCommand);
});

test('runtime /model submits raw slash command instead of local execution', async () => {
  const executedCommands = [];
  const submittedPayloads = [];
  const { exports } = await loadUseChatComposerStateModule({
    draftInput: '/model opus',
    slashCommands: [
      {
        name: '/model',
        sourceType: 'claude-runtime',
        path: '/tmp/model.md',
      },
    ],
    authenticatedFetch: async (url, options) => {
      if (String(url).includes('/api/commands/execute')) {
        executedCommands.push(JSON.parse(options.body));
        return {
          ok: true,
          json: async () => ({
            type: 'builtin',
            action: 'model',
            data: {},
          }),
        };
      }

      return { ok: true, json: async () => ({}) };
    },
    setTimeout: (fn) => {
      fn();
      return 0;
    },
  });
  const useChatComposerState = exports.useChatComposerState;

  const api = useChatComposerState({
    selectedProject: {
      name: 'demo',
      fullPath: '/workspace/demo',
      path: '/workspace/demo',
    },
    selectedSession: {
      id: 'sess-1',
      summary: 'demo session',
    },
    currentSessionId: 'sess-1',
    setCurrentSessionId: () => undefined,
    provider: 'claude',
    permissionMode: 'bypassPermissions',
    cyclePermissionMode: () => undefined,
    claudeModel: 'claude-opus-4-7',
    setClaudeModel: () => undefined,
    isLoading: false,
    canAbortSession: false,
    tokenBudget: null,
    chatMessages: [],
    sendMessage: () => undefined,
    onSessionActive: () => undefined,
    onSessionProcessing: () => undefined,
    onNavigateToSession: () => undefined,
    onCompactWorkflowStart: () => undefined,
    onInputFocusChange: () => undefined,
    onFileOpen: () => undefined,
    onShowSettings: () => undefined,
    pendingViewSessionRef: { current: null },
    scrollToBottom: () => undefined,
    addMessage: () => undefined,
    clearMessages: () => undefined,
    rewindMessages: () => undefined,
    setIsLoading: () => undefined,
    setCanAbortSession: () => undefined,
    setClaudeStatus: () => undefined,
    setIsUserScrolledUp: () => undefined,
    pendingDecisionRequests: [],
    setPendingDecisionRequests: () => undefined,
    submitAgentRun: async (payload) => {
      submittedPayloads.push(payload);
    },
  });

  await api.handleSubmit({ preventDefault: () => undefined });

  assert.equal(executedCommands.length, 0);
  assert.equal(submittedPayloads.length, 1);
  assert.equal(submittedPayloads[0].prompt, '/model opus');
});
