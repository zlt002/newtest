import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ChangeEvent,
  ClipboardEvent,
  Dispatch,
  FormEvent,
  KeyboardEvent,
  MouseEvent,
  SetStateAction,
  TouchEvent,
} from 'react';
import { useDropzone } from 'react-dropzone';
import { authenticatedFetch } from '@utils/api';
import { appendTextToChatInput } from '@components/chat/utils/chatInputAppend';
import { thinkingModes } from '@components/chat/constants/thinkingModes';
import type { ClaudeEffortLevel } from '@components/chat/constants/thinkingModes';
import { grantClaudeToolPermission } from '@components/chat/utils/chatPermissions';
import { safeLocalStorage } from '@components/chat/utils/chatStorage';
import { copyTextToClipboard } from '@utils/clipboard';
import type {
  ChatMessage,
  PendingPermissionRequest,
  PermissionMode,
  Question,
} from '@components/chat/types/types';
import { CLIENT_EVENT_TYPES } from '@components/chat/types/transport';
import type { OutputFormatConfig } from '@components/chat/types/transport';
import { escapeRegExp } from '@components/chat/utils/chatFormatting';
import { markClientLatencyEvent } from '@components/chat/utils/latencyTrace';
import { useFileMentions } from './useFileMentions';
import {
  shouldResetComposerAfterBuiltInAction,
  shouldResetComposerImmediatelyAfterSlashCommandIntercept,
} from './builtInCommandBehavior.js';
import {
  resolveComposerSubmitTarget,
} from './chatComposerSessionTarget.js';
import { buildSessionTranscript, buildTranscriptFilename } from './sessionTranscript.js';
import { type SlashCommand, useSlashCommands } from './useSlashCommands';
import type { Project, ProjectSession, SessionProvider } from '@/types/app';
import { useWebSocket } from '@/contexts/WebSocketContext';

type PendingViewSession = {
  sessionId: string | null;
  traceId: string | null;
  startedAt: number;
};

interface UseChatComposerStateArgs {
  selectedProject: Project | null;
  selectedSession: ProjectSession | null;
  currentSessionId: string | null;
  setCurrentSessionId: (sessionId: string | null) => void;
  provider: SessionProvider;
  permissionMode: PermissionMode | string;
  cyclePermissionMode: () => void;
  claudeModel: string;
  setClaudeModel?: Dispatch<SetStateAction<string>>;
  isLoading: boolean;
  canAbortSession: boolean;
  tokenBudget: Record<string, unknown> | null;
  chatMessages: ChatMessage[];
  sendMessage: (message: unknown) => void;
  sendByCtrlEnter?: boolean;
  onSessionActive?: (sessionId?: string | null) => void;
  onSessionProcessing?: (sessionId?: string | null) => void;
  onNavigateToSession?: (sessionId: string) => void;
  onCompactWorkflowStart?: (sessionId: string | null) => void;
  onInputFocusChange?: (focused: boolean) => void;
  onFileOpen?: (filePath: string, diffInfo?: unknown) => void;
  onMarkdownDraftOpen?: (payload: {
    filePath: string;
    fileName?: string;
    content?: string;
    statusText?: string;
    sourceSessionId?: string | null;
  }) => void;
  activeContextFilePath?: string | null;
  onShowSettings?: () => void;
  pendingCompactionSeedRef?: { current: string | null };
  pendingViewSessionRef: { current: PendingViewSession | null };
  scrollToBottom: () => void;
  addMessage: (msg: ChatMessage, targetSessionId?: string | null) => void;
  clearMessages: () => void;
  rewindMessages: (count: number) => void;
  setIsLoading: (loading: boolean) => void;
  setCanAbortSession: (canAbort: boolean) => void;
  setClaudeStatus: (status: { text: string; tokens: number; can_interrupt: boolean } | null) => void;
  setIsUserScrolledUp: (isScrolledUp: boolean) => void;
  pendingDecisionRequests: PendingPermissionRequest[];
  setPendingDecisionRequests: Dispatch<SetStateAction<PendingPermissionRequest[]>>;
  outputFormat?: OutputFormatConfig | null;
  submitAgentRun?: (payload: {
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
  }) => Promise<void>;
}

interface MentionableFile {
  name: string;
  path: string;
}

interface CommandExecutionResult {
  type: 'builtin' | 'custom';
  action?: string;
  data?: any;
  content?: string;
  hasBashCommands?: boolean;
  hasFileIncludes?: boolean;
}

const GLOBAL_INPUT_HISTORY_STORAGE_KEY = 'chat_input_history_v1';
const MAX_GLOBAL_INPUT_HISTORY_ENTRIES = 100;

const createFakeSubmitEvent = () => {
  return { preventDefault: () => undefined } as unknown as FormEvent<HTMLFormElement>;
};

const isTemporarySessionId = (sessionId: string | null | undefined) =>
  Boolean(sessionId && sessionId.startsWith('new-session-'));

function getPendingDecisionQuestions(request: PendingPermissionRequest): Question[] {
  if (Array.isArray(request.questions)) {
    return request.questions;
  }

  const input = request.input;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return [];
  }

  const questions = (input as { questions?: unknown }).questions;
  return Array.isArray(questions) ? questions as Question[] : [];
}

function isQuestionDecisionRequest(request: PendingPermissionRequest) {
  return request.kind === 'interactive_prompt' || getPendingDecisionQuestions(request).length > 0;
}

function shouldExecuteSlashCommandLocally(command: SlashCommand | undefined) {
  return Boolean(
    command
    && command.sourceType === 'local-ui',
  );
}

function isValidClaudeModelName(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim();
  if (!normalized || normalized.length > 128) {
    return false;
  }

  return /^[A-Za-z0-9][A-Za-z0-9._\-\[\]]*$/.test(normalized);
}

function getAvailableClaudeModels(data: any): string[] {
  const availableModels = data?.available?.claude;
  if (!Array.isArray(availableModels)) {
    return [];
  }

  return availableModels
    .filter(isValidClaudeModelName)
    .map((model) => model.trim());
}

const openSettingsTab = (target?: string, fallback?: () => void) => {
  if (typeof window !== 'undefined' && typeof window.openSettings === 'function') {
    window.openSettings(target);
    return;
  }
  fallback?.();
};

function buildTransportUserContent(prompt: string, images: unknown[]) {
  const normalizedPrompt = String(prompt || '');
  const uploadedImages = Array.isArray(images) ? images : [];

  if (uploadedImages.length === 0) {
    return normalizedPrompt;
  }

  const contentBlocks: Array<
    | { type: 'text'; text: string }
    | {
        type: 'image';
        source: {
          type: 'base64';
          media_type: string;
          data: string;
        };
      }
  > = [];

  if (normalizedPrompt.trim()) {
    contentBlocks.push({
      type: 'text',
      text: normalizedPrompt,
    });
  }

  for (const image of uploadedImages as Array<{ data?: string; mimeType?: string }>) {
    const dataUrl = typeof image?.data === 'string' ? image.data : '';
    const mimeType = typeof image?.mimeType === 'string' ? image.mimeType : '';
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

function readGlobalInputHistory(): string[] {
  try {
    const raw = safeLocalStorage.getItem(GLOBAL_INPUT_HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((value) => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function writeGlobalInputHistory(history: string[]) {
  try {
    if (history.length > 0) {
      safeLocalStorage.setItem(GLOBAL_INPUT_HISTORY_STORAGE_KEY, JSON.stringify(history));
    } else {
      safeLocalStorage.removeItem(GLOBAL_INPUT_HISTORY_STORAGE_KEY);
    }
  } catch {
    // Ignore storage persistence failures.
  }
}

function isCursorOnFirstLine(value: string, selectionStart: number) {
  return !String(value || '').slice(0, Math.max(0, selectionStart)).includes('\n');
}

function isCursorOnLastLine(value: string, selectionEnd: number) {
  return !String(value || '').slice(Math.max(0, selectionEnd)).includes('\n');
}

function normalizeContextFilePaths(filePaths: unknown): string[] {
  if (!Array.isArray(filePaths)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of filePaths) {
    if (typeof value !== 'string') {
      continue;
    }

    const filePath = value.trim();
    if (!filePath || seen.has(filePath)) {
      continue;
    }

    seen.add(filePath);
    normalized.push(filePath);
  }

  return normalized;
}

function isMarkdownFilePath(value: string | null | undefined) {
  return typeof value === 'string' && /\.(md|markdown)$/i.test(value.trim());
}

function getMarkdownDraftFilePath({
  prompt,
  activeContextFilePath,
}: {
  prompt: string;
  activeContextFilePath: string | null;
}) {
  if (isMarkdownFilePath(activeContextFilePath)) {
    return activeContextFilePath?.trim() || null;
  }

  const filePathMatch = prompt.match(/([^\s`"'<>]+\.md(?:own)?)/i);
  return filePathMatch?.[1] || null;
}

function shouldOpenMarkdownDraft({
  prompt,
  activeContextFilePath,
}: {
  prompt: string;
  activeContextFilePath: string | null;
}) {
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) {
    return false;
  }

  if (/[^\s`"'<>]+\.md(?:own)?/i.test(normalizedPrompt)) {
    return true;
  }

  if (!isMarkdownFilePath(activeContextFilePath)) {
    return false;
  }

  return /(prd|markdown|README|文档|需求|方案|写|改写|更新|完善|生成|起草|撰写|补充)/iu.test(normalizedPrompt);
}

const getNotificationSessionSummary = (
  selectedSession: ProjectSession | null,
  fallbackInput: string,
): string | null => {
  const sessionSummary = selectedSession?.summary || selectedSession?.name || selectedSession?.title;
  if (typeof sessionSummary === 'string' && sessionSummary.trim()) {
    const normalized = sessionSummary.replace(/\s+/g, ' ').trim();
    return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
  }

  const normalizedFallback = fallbackInput.replace(/\s+/g, ' ').trim();
  if (!normalizedFallback) {
    return null;
  }

  return normalizedFallback.length > 80 ? `${normalizedFallback.slice(0, 77)}...` : normalizedFallback;
};

export function useChatComposerState({
  selectedProject,
  selectedSession,
  currentSessionId,
  setCurrentSessionId,
  provider,
  permissionMode,
  cyclePermissionMode,
  claudeModel,
  setClaudeModel,
  isLoading,
  canAbortSession,
  tokenBudget,
  chatMessages,
  sendMessage,
  sendByCtrlEnter,
  onSessionActive,
  onSessionProcessing,
  onNavigateToSession,
  onCompactWorkflowStart,
  onInputFocusChange,
  onFileOpen,
  onMarkdownDraftOpen,
  activeContextFilePath = null,
  onShowSettings,
  pendingCompactionSeedRef,
  pendingViewSessionRef,
  scrollToBottom,
  addMessage,
  clearMessages,
  rewindMessages,
  setIsLoading,
  setCanAbortSession,
  setClaudeStatus,
  setIsUserScrolledUp,
  pendingDecisionRequests,
  setPendingDecisionRequests,
  outputFormat = null,
  submitAgentRun,
}: UseChatComposerStateArgs) {
  const { clientLatencyTraceStore } = useWebSocket();
  const [input, setInput] = useState(() => {
    if (typeof window !== 'undefined' && selectedProject) {
      return safeLocalStorage.getItem(`draft_input_${selectedProject.name}`) || '';
    }
    return '';
  });
  const [attachedImages, setAttachedImages] = useState<File[]>([]);
  const [uploadingImages, setUploadingImages] = useState<Map<string, number>>(new Map());
  const [imageErrors, setImageErrors] = useState<Map<string, string>>(new Map());
  const [isContextFileEnabled, setIsContextFileEnabled] = useState(true);
  const [isTextareaExpanded, setIsTextareaExpanded] = useState(false);
  const [thinkingMode, setThinkingMode] = useState<ClaudeEffortLevel>('high');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputHighlightRef = useRef<HTMLDivElement>(null);
  const handleSubmitRef = useRef<
    ((event: FormEvent<HTMLFormElement> | MouseEvent | TouchEvent | KeyboardEvent<HTMLTextAreaElement>) => Promise<void>) | null
  >(null);
  const inputValueRef = useRef(input);
  const pendingVisibleCommandInputRef = useRef<string | null>(null);
  const inputHistoryRef = useRef<string[]>(readGlobalInputHistory());
  const inputHistoryIndexRef = useRef<number>(-1);
  const draftBeforeHistoryNavigationRef = useRef<string>('');

  const applyComposerInput = useCallback((nextValue: string) => {
    setInput(nextValue);
    inputValueRef.current = nextValue;

    setTimeout(() => {
      if (!textareaRef.current) {
        return;
      }

      textareaRef.current.focus();
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      const cursor = nextValue.length;
      textareaRef.current.setSelectionRange(cursor, cursor);
      const lineHeight = parseInt(window.getComputedStyle(textareaRef.current).lineHeight);
      setIsTextareaExpanded(textareaRef.current.scrollHeight > lineHeight * 2);
    }, 0);
  }, []);

  const pushGlobalInputHistory = useCallback((value: string) => {
    const normalized = String(value || '').trim();
    if (!normalized) {
      return;
    }

    const previousHistory = inputHistoryRef.current;
    if (previousHistory[previousHistory.length - 1] === normalized) {
      inputHistoryIndexRef.current = -1;
      draftBeforeHistoryNavigationRef.current = '';
      return;
    }

    const nextHistory = [...previousHistory, normalized].slice(-MAX_GLOBAL_INPUT_HISTORY_ENTRIES);
    inputHistoryRef.current = nextHistory;
    inputHistoryIndexRef.current = -1;
    draftBeforeHistoryNavigationRef.current = '';
    writeGlobalInputHistory(nextHistory);
  }, []);

  const handleBuiltInCommand = useCallback(
    async (result: CommandExecutionResult) => {
      const { action, data } = result;
      switch (action) {
        case 'add_project_directory': {
          if (!data?.hasPath || !data?.path) {
            addMessage({
              type: 'assistant',
              content: data?.message || 'Usage: /add-dir <absolute-or-relative-path>',
              timestamp: Date.now(),
            });
            break;
          }

          try {
            const response = await authenticatedFetch('/api/projects/create', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ path: data.path }),
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
              throw new Error(payload?.error || payload?.message || 'Failed to add project directory');
            }

            await window.refreshProjects?.();
            addMessage({
              type: 'assistant',
              content: `Added project directory:\n\n- Path: \`${payload?.project?.fullPath || data.path}\`\n- Project: \`${payload?.project?.displayName || payload?.project?.name || 'New project'}\``,
              timestamp: Date.now(),
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            addMessage({
              type: 'assistant',
              content: `Error adding project directory: ${message}`,
              timestamp: Date.now(),
            });
          }
          break;
        }

        case 'clear':
          clearMessages();
          break;

        case 'help':
          addMessage({
            type: 'assistant',
            content: data.content,
            timestamp: Date.now(),
          });
          break;

        case 'model': {
          const currentModel = isValidClaudeModelName(data?.current?.model)
            ? data.current.model.trim()
            : null;
          const availableClaudeModels = getAvailableClaudeModels(data);

          if (setClaudeModel && currentModel) {
            setClaudeModel(currentModel);
          }
          addMessage({
            type: 'assistant',
            content: `**Current Model**: ${currentModel || '未知'}\n\n**Available Models**:\n\nClaude: ${availableClaudeModels.length > 0 ? availableClaudeModels.join(', ') : '暂无可用 Claude 模型'}`,
            timestamp: Date.now(),
          });
          break;
        }

        case 'cost': {
          const costMessage = `**Token Usage**: ${data.tokenUsage.used.toLocaleString()} / ${data.tokenUsage.total.toLocaleString()} (${data.tokenUsage.percentage}%)\n\n**Estimated Cost**:\n- Input: $${data.cost.input}\n- Output: $${data.cost.output}\n- **Total**: $${data.cost.total}\n\n**Model**: ${data.model}`;
          addMessage({ type: 'assistant', content: costMessage, timestamp: Date.now() });
          break;
        }

        case 'status': {
          const statusMessage = `**System Status**\n\n- Version: ${data.version}\n- Uptime: ${data.uptime}\n- Model: ${data.model}\n- Provider: ${data.provider}\n- Node.js: ${data.nodeVersion}\n- Platform: ${data.platform}`;
          addMessage({ type: 'assistant', content: statusMessage, timestamp: Date.now() });
          break;
        }

        case 'context': {
          const contextMessage = `**Context Usage**\n\n- Used: ${data.used.toLocaleString()} / ${data.total.toLocaleString()} (${data.percentage}%)\n- Status: ${data.status}\n- Suggestion: ${data.suggestion}`;
          addMessage({ type: 'assistant', content: contextMessage, timestamp: Date.now() });
          break;
        }

        case 'memory':
          if (data.error) {
            addMessage({
              type: 'assistant',
              content: `Warning: ${data.message}`,
              timestamp: Date.now(),
            });
          } else {
            addMessage({
              type: 'assistant',
              content: `${data.message}\n\nPath: \`${data.path}\``,
              timestamp: Date.now(),
            });
            if (data.exists && data.target === 'project' && onFileOpen) {
              onFileOpen(data.path);
            }
          }
          break;

        case 'open_settings_tab':
          openSettingsTab(
            data?.section ? `${data?.tab || 'appearance'}:${data.section}` : data?.tab,
            onShowSettings,
          );
          if (data?.content) {
            addMessage({
              type: 'assistant',
              content: data.content,
              timestamp: Date.now(),
            });
          }
          if (data?.message) {
            addMessage({
              type: 'assistant',
              content: data.message,
              timestamp: Date.now(),
            });
          }
          break;

        case 'copy_transcript': {
          const explicitText = String(data?.text || '').trim();
          const contentToCopy =
            explicitText ||
            buildSessionTranscript(chatMessages, 'text', {
              sessionTitle: selectedSession?.summary || selectedSession?.title || selectedProject?.displayName || selectedProject?.name,
            });
          const copied = await copyTextToClipboard(contentToCopy);
          addMessage({
            type: 'assistant',
            content: copied
              ? explicitText
                ? 'Copied the provided text to the clipboard.'
                : 'Copied the current conversation transcript to the clipboard.'
              : 'Failed to copy to the clipboard.',
            timestamp: Date.now(),
          });
          break;
        }

        case 'compact': {
          const compactPrompt =
            data?.prompt ||
            'Summarize the conversation so far into a concise handoff note.';
          onCompactWorkflowStart?.(selectedSession?.id || currentSessionId || null);
          setInput(compactPrompt);
          inputValueRef.current = compactPrompt;
          if (data?.message) {
            addMessage({
              type: 'assistant',
              content: data.message,
              timestamp: Date.now(),
            });
          }
          setTimeout(() => {
            if (handleSubmitRef.current) {
              handleSubmitRef.current(createFakeSubmitEvent());
            }
          }, 0);
          break;
        }

        case 'export_transcript': {
          const transcriptTitle =
            selectedSession?.summary ||
            selectedSession?.title ||
            selectedProject?.displayName ||
            selectedProject?.name ||
            'conversation';
          const transcript = buildSessionTranscript(chatMessages, 'markdown', {
            sessionTitle: transcriptTitle,
          });
          const filename = buildTranscriptFilename(transcriptTitle);
          const blob = new Blob([transcript], { type: 'text/markdown;charset=utf-8' });
          const objectUrl = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = objectUrl;
          anchor.download = filename;
          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);
          URL.revokeObjectURL(objectUrl);

          addMessage({
            type: 'assistant',
            content: `Exported the current conversation transcript as \`${filename}\`.`,
            timestamp: Date.now(),
          });
          break;
        }

        case 'rewind':
          if (data.error) {
            addMessage({
              type: 'assistant',
              content: `Warning: ${data.message}`,
              timestamp: Date.now(),
            });
          } else {
            rewindMessages(data.steps * 2);
            addMessage({
              type: 'assistant',
              content: `Rewound ${data.steps} step(s). ${data.message}`,
              timestamp: Date.now(),
            });
          }
          break;

        default:
          console.warn('Unknown built-in command action:', action);
      }
    },
    [chatMessages, onFileOpen, onShowSettings, addMessage, clearMessages, rewindMessages, pushGlobalInputHistory, selectedProject, selectedSession],
  );

  const handleCustomCommand = useCallback(async (result: CommandExecutionResult, rawInput?: string) => {
    const { content, hasBashCommands } = result;

    if (hasBashCommands) {
      const confirmed = window.confirm(
        'This command contains bash commands that will be executed. Do you want to proceed?',
      );
      if (!confirmed) {
        addMessage({
          type: 'assistant',
          content: 'Command execution cancelled',
          timestamp: Date.now(),
        });
        return;
      }
    }

    const commandContent = content || '';
    pendingVisibleCommandInputRef.current = typeof rawInput === 'string' && rawInput.trim()
      ? rawInput
      : null;
    setInput(commandContent);
    inputValueRef.current = commandContent;

    // Defer submit to next tick so the command text is reflected in UI before dispatching.
    setTimeout(() => {
      if (handleSubmitRef.current) {
        handleSubmitRef.current(createFakeSubmitEvent());
      }
    }, 0);
  }, [addMessage]);

  const executeCommand = useCallback(
    async (command: SlashCommand, rawInput?: string) => {
      if (!command || !selectedProject) {
        return;
      }

      try {
        const effectiveInput = rawInput ?? input;
        const commandMatch = effectiveInput.match(new RegExp(`${escapeRegExp(command.name)}\\s*(.*)`));
        const args =
          commandMatch && commandMatch[1] ? commandMatch[1].trim().split(/\s+/) : [];

        const context = {
          projectPath: selectedProject.fullPath || selectedProject.path,
          projectName: selectedProject.name,
          sessionId: currentSessionId,
          provider,
          model: claudeModel,
          tokenUsage: tokenBudget,
        };

        const response = await authenticatedFetch('/api/commands/execute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            commandName: command.name,
            commandPath: command.path,
            args,
            context,
          }),
        });

        if (!response.ok) {
          let errorMessage = `Failed to execute command (${response.status})`;
          try {
            const errorData = await response.json();
            errorMessage = errorData?.message || errorData?.error || errorMessage;
          } catch {
            // Ignore JSON parse failures and use fallback message.
          }
          throw new Error(errorMessage);
        }

        const result = (await response.json()) as CommandExecutionResult;
        if (result.type === 'builtin') {
          await handleBuiltInCommand(result);
          if (typeof result.action === 'string' && shouldResetComposerAfterBuiltInAction(result.action)) {
            setInput('');
            inputValueRef.current = '';
          }
      } else if (result.type === 'custom') {
          await handleCustomCommand(result, effectiveInput);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error executing command:', error);
        addMessage({
          type: 'assistant',
          content: `Error executing command: ${message}`,
          timestamp: Date.now(),
        });
      }
    },
    [
      claudeModel,
      currentSessionId,
      handleBuiltInCommand,
      handleCustomCommand,
      input,
      provider,
      selectedProject,
      addMessage,
      tokenBudget,
    ],
  );

  const slashCommandSessionId =
    selectedSession?.id || (isTemporarySessionId(currentSessionId) ? null : currentSessionId) || null;

  const {
    slashCommands,
    slashCommandsCount,
    filteredCommands,
    frequentCommands,
    commandQuery,
    showCommandMenu,
    selectedCommandIndex,
    resetCommandMenuState,
    handleCommandSelect,
    handleToggleCommandMenu,
    handleCommandInputChange,
    handleCommandMenuKeyDown,
  } = useSlashCommands({
    selectedProject,
    sessionId: slashCommandSessionId,
    input,
    setInput,
    textareaRef,
  });

  const {
    showFileDropdown,
    filteredFiles,
    selectedFileIndex,
    renderInputWithMentions,
    selectFile,
    setCursorPosition,
    handleFileMentionsKeyDown,
  } = useFileMentions({
    selectedProject,
    input,
    setInput,
    textareaRef,
  });

  const syncInputOverlayScroll = useCallback((target: HTMLTextAreaElement) => {
    if (!inputHighlightRef.current || !target) {
      return;
    }
    inputHighlightRef.current.scrollTop = target.scrollTop;
    inputHighlightRef.current.scrollLeft = target.scrollLeft;
  }, []);

  const handleImageFiles = useCallback((files: File[]) => {
    const validFiles = files.filter((file) => {
      try {
        if (!file || typeof file !== 'object') {
          console.warn('Invalid file object:', file);
          return false;
        }

        if (!file.type || !file.type.startsWith('image/')) {
          return false;
        }

        if (!file.size || file.size > 5 * 1024 * 1024) {
          const fileName = file.name || 'Unknown file';
          setImageErrors((previous) => {
            const next = new Map(previous);
            next.set(fileName, 'File too large (max 5MB)');
            return next;
          });
          return false;
        }

        return true;
      } catch (error) {
        console.error('Error validating file:', error, file);
        return false;
      }
    });

    if (validFiles.length > 0) {
      setAttachedImages((previous) => [...previous, ...validFiles].slice(0, 5));
    }
  }, []);

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = Array.from(event.clipboardData.items);

      items.forEach((item) => {
        if (!item.type.startsWith('image/')) {
          return;
        }
        const file = item.getAsFile();
        if (file) {
          handleImageFiles([file]);
        }
      });

      if (items.length === 0 && event.clipboardData.files.length > 0) {
        const files = Array.from(event.clipboardData.files);
        const imageFiles = files.filter((file) => file.type.startsWith('image/'));
        if (imageFiles.length > 0) {
          handleImageFiles(imageFiles);
        }
      }
    },
    [handleImageFiles],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'],
    },
    maxSize: 5 * 1024 * 1024,
    maxFiles: 5,
    onDrop: handleImageFiles,
    noClick: true,
    noKeyboard: true,
  });

  const handleSubmit = useCallback(
    async (
      event: FormEvent<HTMLFormElement> | MouseEvent | TouchEvent | KeyboardEvent<HTMLTextAreaElement>,
    ) => {
      event.preventDefault();
      const currentInput = inputValueRef.current;
      const hasAttachedImages = attachedImages.length > 0;
      if ((!currentInput.trim() && !hasAttachedImages) || isLoading || !selectedProject) {
        return;
      }

      const trimmedInput = currentInput.trim();
      let matchedCommand: SlashCommand | undefined;
      if (trimmedInput.startsWith('/')) {
        const firstSpace = trimmedInput.indexOf(' ');
        const commandName = firstSpace > 0 ? trimmedInput.slice(0, firstSpace) : trimmedInput;
        matchedCommand = slashCommands.find((cmd: SlashCommand) => {
          if (cmd.name === commandName) {
            return true;
          }

          const aliases = Array.isArray(cmd.metadata?.aliases) ? cmd.metadata.aliases : [];
          return aliases.includes(commandName);
        });
        if (matchedCommand) {
          if (shouldExecuteSlashCommandLocally(matchedCommand)) {
            await executeCommand(matchedCommand, trimmedInput);
            setAttachedImages([]);
            setUploadingImages(new Map());
            setImageErrors(new Map());
            resetCommandMenuState();
            setIsTextareaExpanded(false);
            if (shouldResetComposerImmediatelyAfterSlashCommandIntercept()) {
              setInput('');
              inputValueRef.current = '';
            }
            if (textareaRef.current) {
              textareaRef.current.style.height = 'auto';
            }
            return;
          }
        }
      }

      const shouldExecuteLocally = shouldExecuteSlashCommandLocally(matchedCommand);
      const shouldSubmitRawSlashCommand = Boolean(matchedCommand && !shouldExecuteLocally);
      let messageContent = currentInput;
      const selectedThinkingMode = thinkingModes.find((mode: { id: string }) => mode.id === thinkingMode);
      const effort = selectedThinkingMode?.id as ClaudeEffortLevel | undefined;

      let uploadedImages: unknown[] = [];
      if (attachedImages.length > 0) {
        const formData = new FormData();
        attachedImages.forEach((file) => {
          formData.append('images', file);
        });

        try {
          const response = await authenticatedFetch(`/api/projects/${selectedProject.name}/upload-images`, {
            method: 'POST',
            headers: {},
            body: formData,
          });

          if (!response.ok) {
            throw new Error('Failed to upload images');
          }

          const result = await response.json();
          uploadedImages = result.images;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          console.error('Image upload failed:', error);
          addMessage({
            type: 'error',
            content: `Failed to upload images: ${message}`,
            timestamp: new Date(),
          });
          return;
        }
      }

      const submitTarget = resolveComposerSubmitTarget({
        selectedSessionId: selectedSession?.id || null,
        currentSessionId,
      });
      const effectiveSessionId = submitTarget.sessionId || null;
      const pendingCompactionSeed =
        !effectiveSessionId && typeof pendingCompactionSeedRef?.current === 'string'
          ? pendingCompactionSeedRef.current.trim()
          : '';
      if (!shouldSubmitRawSlashCommand && pendingCompactionSeed) {
        messageContent = `Use the following compacted conversation summary as the starting context for this new session.\n\n${pendingCompactionSeed}\n\nContinue naturally from that context and help with the user's next request below.\n\nUser request:\n${messageContent}`;
      }
      const sessionToActivate = effectiveSessionId || `new-session-${Date.now()}`;
      const resolvedProjectPath = selectedProject.fullPath || selectedProject.path || '';
      const traceId = sessionToActivate;
      const traceMetadata = {
        provider,
        projectPath: resolvedProjectPath,
        model: claudeModel,
        permissionMode,
        thinkingMode,
        hasCompactSeed: Boolean(pendingCompactionSeed),
        traceId,
      };

      clientLatencyTraceStore.delete(traceId);
      markClientLatencyEvent(
        clientLatencyTraceStore,
        traceId,
        'send_clicked',
        Date.now(),
        traceMetadata,
      );

      const visibleUserInput = pendingVisibleCommandInputRef.current || currentInput;
      pushGlobalInputHistory(visibleUserInput);
      const userMessage: ChatMessage = {
        type: 'user',
        content: visibleUserInput,
        images: uploadedImages as any,
        timestamp: new Date(),
      };
      pendingVisibleCommandInputRef.current = null;

      if (submitTarget.mode === 'new-conversation') {
        if (typeof window !== 'undefined') {
          // Reset stale pending IDs from previous interrupted runs before creating a new one.
          sessionStorage.removeItem('pendingSessionId');
        }
        pendingViewSessionRef.current = {
          sessionId: null,
          traceId,
          startedAt: Date.now(),
        };
        setCurrentSessionId(sessionToActivate);
        onNavigateToSession?.(sessionToActivate);
      }

      addMessage(userMessage, sessionToActivate);
      setIsLoading(true); // Processing banner starts
      setCanAbortSession(true);
      setClaudeStatus({
        text: '处理中',
        tokens: 0,
        can_interrupt: true,
      });

      setIsUserScrolledUp(false);
      setTimeout(() => scrollToBottom(), 100);

      onSessionActive?.(sessionToActivate);
      if (submitTarget.mode === 'continue' && effectiveSessionId && !isTemporarySessionId(effectiveSessionId)) {
        onSessionProcessing?.(effectiveSessionId);
      }

      const getToolsSettings = () => {
        try {
          const settingsKey = 'claude-settings';
          const savedSettings = safeLocalStorage.getItem(settingsKey);
          if (savedSettings) {
            return JSON.parse(savedSettings);
          }
        } catch (error) {
          console.error('Error loading tools settings:', error);
        }

        return {
          allowedTools: [],
          disallowedTools: [],
          skipPermissions: false,
        };
      };

      const toolsSettings = getToolsSettings();
      const sessionSummary = getNotificationSessionSummary(selectedSession, currentInput);
      const contextFilePaths = isContextFileEnabled && activeContextFilePath
        ? normalizeContextFilePaths([activeContextFilePath])
        : [];
      const markdownDraftFilePath = shouldOpenMarkdownDraft({
        prompt: visibleUserInput,
        activeContextFilePath,
      })
        ? getMarkdownDraftFilePath({
            prompt: visibleUserInput,
            activeContextFilePath,
          })
        : null;

      if (markdownDraftFilePath && onMarkdownDraftOpen) {
        onMarkdownDraftOpen({
          filePath: markdownDraftFilePath,
          content: '',
          statusText: '正在起草...',
          sourceSessionId: sessionToActivate,
        });
      }

      if (submitAgentRun) {
        try {
          if (shouldSubmitRawSlashCommand) {
            await submitAgentRun({
              prompt: currentInput,
              projectPath: resolvedProjectPath,
              sessionId: effectiveSessionId,
              model: claudeModel,
              effort,
              permissionMode,
              sessionSummary,
              images: uploadedImages,
              toolsSettings,
              traceId,
              outputFormat: outputFormat || undefined,
              contextFilePaths,
            });
          } else {
            await submitAgentRun({
              prompt: messageContent,
              projectPath: resolvedProjectPath,
              sessionId: effectiveSessionId,
              model: claudeModel,
              effort,
              permissionMode,
              sessionSummary,
              images: uploadedImages,
              toolsSettings,
              traceId,
              outputFormat: outputFormat || undefined,
              contextFilePaths,
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Agent V2 request failed';
          addMessage({
            type: 'error',
            content: message,
            timestamp: new Date(),
          });
          setIsLoading(false);
          setCanAbortSession(false);
          setClaudeStatus(null);
        }
      } else {
        const transportMessage = {
          role: 'user',
          content: buildTransportUserContent(
            shouldSubmitRawSlashCommand ? currentInput : messageContent,
            uploadedImages,
          ),
        };

        if (effectiveSessionId) {
          sendMessage({
            type: CLIENT_EVENT_TYPES.CHAT_USER_MESSAGE,
            sessionId: effectiveSessionId,
            message: transportMessage,
            ...(contextFilePaths.length > 0 ? { contextFilePaths } : {}),
          });
        } else {
          sendMessage({
            type: CLIENT_EVENT_TYPES.CHAT_RUN_START,
            sessionId: null,
            projectPath: resolvedProjectPath,
            model: claudeModel,
            permissionMode,
            traceId,
            message: transportMessage,
            ...(contextFilePaths.length > 0 ? { contextFilePaths } : {}),
            ...(outputFormat ? { outputFormat } : {}),
          });
        }
      }

      if (!effectiveSessionId && pendingCompactionSeedRef && pendingCompactionSeed) {
        pendingCompactionSeedRef.current = null;
      }

      setInput('');
      inputValueRef.current = '';
      inputHistoryIndexRef.current = -1;
      draftBeforeHistoryNavigationRef.current = '';
      resetCommandMenuState();
      setAttachedImages([]);
      setUploadingImages(new Map());
      setImageErrors(new Map());
      setIsTextareaExpanded(false);
      setThinkingMode('high');

      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }

      safeLocalStorage.removeItem(`draft_input_${selectedProject.name}`);
    },
    [
      selectedSession,
      attachedImages,
      claudeModel,
      currentSessionId,
      setCurrentSessionId,
      clientLatencyTraceStore,
      executeCommand,
      isLoading,
      onSessionActive,
      onSessionProcessing,
      onNavigateToSession,
      onCompactWorkflowStart,
      pendingViewSessionRef,
      pendingCompactionSeedRef,
      permissionMode,
      provider,
      resetCommandMenuState,
      scrollToBottom,
      selectedProject,
      sendMessage,
      setCanAbortSession,
      addMessage,
      setClaudeStatus,
      setIsLoading,
      setIsUserScrolledUp,
      slashCommands,
      submitAgentRun,
      activeContextFilePath,
      isContextFileEnabled,
      onMarkdownDraftOpen,
      thinkingMode,
    ],
  );

  useEffect(() => {
    handleSubmitRef.current = handleSubmit;
  }, [handleSubmit]);

  useEffect(() => {
    inputValueRef.current = input;
  }, [input]);

  useEffect(() => {
    if (!selectedProject) {
      return;
    }
    const savedInput = safeLocalStorage.getItem(`draft_input_${selectedProject.name}`) || '';
    setInput((previous) => {
      const next = previous === savedInput ? previous : savedInput;
      inputValueRef.current = next;
      return next;
    });
  }, [selectedProject?.name]);

  useEffect(() => {
    if (!selectedProject) {
      return;
    }
    if (input !== '') {
      safeLocalStorage.setItem(`draft_input_${selectedProject.name}`, input);
    } else {
      safeLocalStorage.removeItem(`draft_input_${selectedProject.name}`);
    }
  }, [input, selectedProject]);

  useEffect(() => {
    if (!textareaRef.current) {
      return;
    }
    // Re-run when input changes so restored drafts get the same autosize behavior as typed text.
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    const lineHeight = parseInt(window.getComputedStyle(textareaRef.current).lineHeight);
    const expanded = textareaRef.current.scrollHeight > lineHeight * 2;
    setIsTextareaExpanded(expanded);
  }, [input]);

  useEffect(() => {
    if (!textareaRef.current || input.trim()) {
      return;
    }
    textareaRef.current.style.height = 'auto';
    setIsTextareaExpanded(false);
  }, [input]);

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = event.target.value;
      const cursorPos = event.target.selectionStart;

      setInput(newValue);
      inputValueRef.current = newValue;
      setCursorPosition(cursorPos);
      if (inputHistoryIndexRef.current >= 0) {
        inputHistoryIndexRef.current = -1;
        draftBeforeHistoryNavigationRef.current = '';
      }

      if (!newValue.trim()) {
        event.target.style.height = 'auto';
        setIsTextareaExpanded(false);
        resetCommandMenuState();
        return;
      }

      handleCommandInputChange(newValue, cursorPos);
    },
    [handleCommandInputChange, resetCommandMenuState, setCursorPosition],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (handleCommandMenuKeyDown(event)) {
        return;
      }

      if (handleFileMentionsKeyDown(event)) {
        return;
      }

      if (!event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const value = event.currentTarget.value;
        const selectionStart = event.currentTarget.selectionStart ?? value.length;
        const selectionEnd = event.currentTarget.selectionEnd ?? value.length;
        const canNavigateHistory = selectionStart === selectionEnd && inputHistoryRef.current.length > 0;

        if (event.key === 'ArrowUp' && canNavigateHistory && isCursorOnFirstLine(value, selectionStart)) {
          event.preventDefault();
          if (inputHistoryIndexRef.current === -1) {
            draftBeforeHistoryNavigationRef.current = value;
          }

          const nextIndex = inputHistoryIndexRef.current === -1
            ? inputHistoryRef.current.length - 1
            : Math.max(0, inputHistoryIndexRef.current - 1);
          inputHistoryIndexRef.current = nextIndex;
          applyComposerInput(inputHistoryRef.current[nextIndex] || '');
          return;
        }

        if (event.key === 'ArrowDown' && canNavigateHistory && isCursorOnLastLine(value, selectionEnd)) {
          if (inputHistoryIndexRef.current === -1) {
            return;
          }

          event.preventDefault();
          const nextIndex = inputHistoryIndexRef.current + 1;
          if (nextIndex >= inputHistoryRef.current.length) {
            inputHistoryIndexRef.current = -1;
            const restoredDraft = draftBeforeHistoryNavigationRef.current;
            draftBeforeHistoryNavigationRef.current = '';
            applyComposerInput(restoredDraft);
            return;
          }

          inputHistoryIndexRef.current = nextIndex;
          applyComposerInput(inputHistoryRef.current[nextIndex] || '');
          return;
        }
      }

      if (event.key === 'Tab' && !showFileDropdown && !showCommandMenu) {
        event.preventDefault();
        cyclePermissionMode();
        return;
      }

      if (event.key === 'Enter') {
        if (event.nativeEvent.isComposing) {
          return;
        }

        if ((event.ctrlKey || event.metaKey) && !event.shiftKey) {
          event.preventDefault();
          handleSubmit(event);
        } else if (!event.shiftKey && !event.ctrlKey && !event.metaKey && !sendByCtrlEnter) {
          event.preventDefault();
          handleSubmit(event);
        }
      }
    },
    [
      applyComposerInput,
      cyclePermissionMode,
      handleCommandMenuKeyDown,
      handleFileMentionsKeyDown,
      handleSubmit,
      sendByCtrlEnter,
      showCommandMenu,
      showFileDropdown,
    ],
  );

  const handleTextareaClick = useCallback(
    (event: MouseEvent<HTMLTextAreaElement>) => {
      setCursorPosition(event.currentTarget.selectionStart);
    },
    [setCursorPosition],
  );

  const handleTextareaInput = useCallback(
    (event: FormEvent<HTMLTextAreaElement>) => {
      const target = event.currentTarget;
      target.style.height = 'auto';
      target.style.height = `${target.scrollHeight}px`;
      setCursorPosition(target.selectionStart);
      syncInputOverlayScroll(target);

      const lineHeight = parseInt(window.getComputedStyle(target).lineHeight);
      setIsTextareaExpanded(target.scrollHeight > lineHeight * 2);
    },
    [setCursorPosition, syncInputOverlayScroll],
  );

  const handleClearInput = useCallback(() => {
    setInput('');
    inputValueRef.current = '';
    resetCommandMenuState();
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.focus();
    }
    setIsTextareaExpanded(false);
  }, [resetCommandMenuState]);

  const handleAbortSession = useCallback(() => {
    if (!canAbortSession) {
      return;
    }

    const pendingSessionId =
      typeof window !== 'undefined' ? sessionStorage.getItem('pendingSessionId') : null;

    const candidateSessionIds = [
      currentSessionId,
      pendingViewSessionRef.current?.sessionId || null,
      pendingSessionId,
      selectedSession?.id || null,
    ];

    const targetSessionId =
      candidateSessionIds.find((sessionId) => Boolean(sessionId) && !isTemporarySessionId(sessionId)) || null;

    if (!targetSessionId) {
      console.warn('Abort requested but no concrete session ID is available yet.');
      return;
    }

    sendMessage({
      type: CLIENT_EVENT_TYPES.CHAT_INTERRUPT,
      sessionId: targetSessionId,
      provider,
    });
  }, [canAbortSession, currentSessionId, pendingViewSessionRef, provider, selectedSession?.id, sendMessage]);

  const handleTranscript = useCallback((text: string) => {
    if (!text.trim()) {
      return;
    }

    setInput((previousInput) => {
      const newInput = previousInput.trim() ? `${previousInput} ${text}` : text;
      inputValueRef.current = newInput;

      setTimeout(() => {
        if (!textareaRef.current) {
          return;
        }

        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        const lineHeight = parseInt(window.getComputedStyle(textareaRef.current).lineHeight);
        setIsTextareaExpanded(textareaRef.current.scrollHeight > lineHeight * 2);
      }, 0);

      return newInput;
    });
  }, []);

  const appendExternalInput = useCallback((text: string) => {
    if (!text.trim()) {
      return;
    }

    setInput((previousInput) => {
      const newInput = appendTextToChatInput(previousInput, text);
      inputValueRef.current = newInput;

      setTimeout(() => {
        if (!textareaRef.current) {
          return;
        }

        textareaRef.current.focus();
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        const lineHeight = parseInt(window.getComputedStyle(textareaRef.current).lineHeight);
        setIsTextareaExpanded(textareaRef.current.scrollHeight > lineHeight * 2);
      }, 0);

      return newInput;
    });
  }, []);

  const handleGrantToolPermission = useCallback(
    (suggestion: { entry: string; toolName: string }) => {
      if (!suggestion) {
        return { success: false };
      }
      return grantClaudeToolPermission(suggestion.entry);
    },
    [],
  );

  const handlePermissionDecision = useCallback(
    (
      requestIds: string | string[],
      decision: { allow?: boolean; message?: string; rememberEntry?: string | null; updatedInput?: unknown },
    ) => {
      const ids = Array.isArray(requestIds) ? requestIds : [requestIds];
      const validIds = ids.filter(Boolean);
      if (validIds.length === 0) {
        return;
      }

      validIds.forEach((requestId) => {
        const matchedRequest = pendingDecisionRequests.find((request) => request.requestId === requestId);
        if (matchedRequest && isQuestionDecisionRequest(matchedRequest)) {
          const updatedInput = decision?.updatedInput;
          const answers = updatedInput && typeof updatedInput === 'object' && !Array.isArray(updatedInput)
            ? ((updatedInput as { answers?: unknown }).answers && typeof (updatedInput as { answers?: unknown }).answers === 'object'
                ? (updatedInput as { answers?: Record<string, unknown> }).answers
                : {})
            : {};

          sendMessage({
            type: CLIENT_EVENT_TYPES.QUESTION_RESPONSE,
            requestId,
            questions: getPendingDecisionQuestions(matchedRequest),
            answers,
          });
          return;
        }

        sendMessage({
          type: CLIENT_EVENT_TYPES.TOOL_APPROVAL_RESPONSE,
          requestId,
          decision: Boolean(decision?.allow) ? 'allow' : 'deny',
          updatedInput: decision?.updatedInput,
          message: decision?.message,
          rememberEntry: decision?.rememberEntry,
        });
      });

      setPendingDecisionRequests((previous) => {
        const next = previous.filter((request) => !validIds.includes(request.requestId));
        if (next.length === 0) {
          setClaudeStatus(null);
        }
        return next;
      });
    },
    [pendingDecisionRequests, sendMessage, setClaudeStatus, setPendingDecisionRequests],
  );

  const [isInputFocused, setIsInputFocused] = useState(false);

  const handleInputFocusChange = useCallback(
    (focused: boolean) => {
      setIsInputFocused(focused);
      onInputFocusChange?.(focused);
    },
    [onInputFocusChange],
  );

  return {
    input,
    setInput,
    textareaRef,
    inputHighlightRef,
    isTextareaExpanded,
    thinkingMode,
    setThinkingMode,
    slashCommandsCount,
    filteredCommands,
    frequentCommands,
    commandQuery,
    showCommandMenu,
    selectedCommandIndex,
    resetCommandMenuState,
    handleCommandSelect,
    handleToggleCommandMenu,
    showFileDropdown,
    filteredFiles: filteredFiles as MentionableFile[],
    selectedFileIndex,
    renderInputWithMentions,
    selectFile,
    attachedImages,
    setAttachedImages,
    uploadingImages,
    imageErrors,
    getRootProps,
    getInputProps,
    isDragActive,
    openImagePicker: open,
    handleSubmit,
    handleInputChange,
    handleKeyDown,
    handlePaste,
    handleTextareaClick,
    handleTextareaInput,
    syncInputOverlayScroll,
    handleClearInput,
    handleAbortSession,
    handleTranscript,
    appendExternalInput,
    handlePermissionDecision,
    handleGrantToolPermission,
    handleInputFocusChange,
    isInputFocused,
    isContextFileEnabled,
    setIsContextFileEnabled,
  };
}
