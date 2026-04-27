import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SessionProviderLogo from '../../../llm-logo-provider/SessionProviderLogo';
import type {
  ChatMessage,
  ClaudePermissionSuggestion,
  PermissionGrantResult,
} from '../../types/types';
import { getToolUseLeadText } from '@hooks/chat/chatMessagePresentation.js';
import { formatUsageLimitText } from '../../utils/chatFormatting';
import { getClaudePermissionSuggestion } from '../../utils/chatPermissions';
import type { Project } from '../../../../types/app';
import { ToolRenderer, shouldHideToolResult } from '../../tools';
import { Markdown } from './Markdown';
import MessageCopyControl from './MessageCopyControl';
import { getUserMessageCollapseState, shouldCollapseUserMessage } from './messageCollapse';
import StructuredOutputCard from '../../components/StructuredOutputCard.tsx';

type DiffLine = {
  type: string;
  content: string;
  lineNum: number;
};

type MessageComponentProps = {
  messageKey: string;
  message: ChatMessage;
  prevMessage: ChatMessage | null;
  createDiff: (oldStr: string, newStr: string) => DiffLine[];
  onFileOpen?: (filePath: string, diffInfo?: unknown) => void;
  onOpenUrl?: (url: string) => void;
  onShowSettings?: () => void;
  onGrantToolPermission?: (suggestion: ClaudePermissionSuggestion) => PermissionGrantResult | null | undefined;
  autoExpandTools?: boolean;
  showRawParameters?: boolean;
  showThinking?: boolean;
  selectedProject?: Project | null;
  provider?: string;
};

type InteractiveOption = {
  number: string;
  text: string;
  isSelected: boolean;
};

type PermissionGrantState = 'idle' | 'granted' | 'error';
const COPY_HIDDEN_TOOL_NAMES = new Set(['Bash', 'Edit', 'Write', 'ApplyPatch']);
const expandedUserMessages = new Map<string, boolean>();

const MessageComponent = memo(({ messageKey, message, prevMessage, createDiff, onFileOpen, onOpenUrl, onShowSettings, onGrantToolPermission, autoExpandTools, showRawParameters, showThinking, selectedProject, provider = 'claude' }: MessageComponentProps) => {
  const { t } = useTranslation('chat');
  const isGrouped = prevMessage && prevMessage.type === message.type &&
    ((prevMessage.type === 'assistant') ||
      (prevMessage.type === 'user') ||
      (prevMessage.type === 'tool') ||
      (prevMessage.type === 'error'));
  const messageRef = useRef<HTMLDivElement | null>(null);
  const [isToolExpanded, setIsToolExpanded] = useState(false);
  const [isUserMessageExpanded, setIsUserMessageExpanded] = useState(() => expandedUserMessages.get(messageKey) ?? false);
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null);
  const permissionSuggestion = getClaudePermissionSuggestion(message, provider);
  const [permissionGrantState, setPermissionGrantState] = useState<PermissionGrantState>('idle');
  const userCopyContent = String(message.content || '');
  const formattedMessageContent = useMemo(
    () => formatUsageLimitText(String(message.content || '')),
    [message.content]
  );
  const assistantCopyContent = message.isToolUse
    ? String(message.displayText || message.content || '')
    : formattedMessageContent;
  const isCommandOrFileEditToolResponse = Boolean(
    message.isToolUse && COPY_HIDDEN_TOOL_NAMES.has(String(message.toolName || ''))
  );
  const shouldShowUserCopyControl = message.type === 'user' && userCopyContent.trim().length > 0;
  const shouldShowAssistantCopyControl = message.type === 'assistant' &&
    assistantCopyContent.trim().length > 0 &&
    !isCommandOrFileEditToolResponse;
  const userImages = Array.isArray(message.images) ? message.images : [];
  const shouldRenderUserText = userCopyContent.trim().length > 0;
  const activeImage = activeImageIndex != null ? userImages[activeImageIndex] || null : null;


  useEffect(() => {
    setPermissionGrantState('idle');
  }, [permissionSuggestion?.entry, message.toolId]);

  useEffect(() => {
    setIsUserMessageExpanded(expandedUserMessages.get(messageKey) ?? false);
  }, [messageKey]);

  useEffect(() => {
    const node = messageRef.current;
    if (!autoExpandTools || !node || !message.isToolUse) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isToolExpanded) {
            setIsToolExpanded(true);
            const details = node.querySelectorAll<HTMLDetailsElement>('details');
            details.forEach((detail) => {
              detail.open = true;
            });
          }
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(node);

    return () => {
      observer.unobserve(node);
    };
  }, [autoExpandTools, isToolExpanded, message.isToolUse]);

  const formattedTime = useMemo(() => new Date(message.timestamp).toLocaleTimeString(), [message.timestamp]);
  const shouldHideThinkingMessage = Boolean(message.isThinking && !showThinking);
  const toolUseLeadText = useMemo(() => getToolUseLeadText(message), [message]);
  const isUserMessageOverflowing = useMemo(
    () => message.type === 'user' && shouldCollapseUserMessage(userCopyContent),
    [message.type, userCopyContent],
  );
  const userMessageCollapseState = useMemo(
    () => getUserMessageCollapseState({
      isExpanded: isUserMessageExpanded,
      isOverflowing: isUserMessageOverflowing,
    }),
    [isUserMessageExpanded, isUserMessageOverflowing],
  );
  const formattedUsageCost = useMemo(() => {
    if (typeof message.usageSummary?.totalCostUsd !== 'number') {
      return '';
    }
    return `$${message.usageSummary.totalCostUsd.toFixed(4)}`;
  }, [message.usageSummary?.totalCostUsd]);
  const modelUsageEntries = useMemo(
    () => Object.entries((message.usageSummary?.modelUsage as Record<string, any> | null) || {}),
    [message.usageSummary?.modelUsage],
  );

  if (shouldHideThinkingMessage) {
    return null;
  }

  return (
    <div
      ref={messageRef}
      data-message-timestamp={message.timestamp || undefined}
      className={`chat-message ${message.type} ${isGrouped ? 'grouped' : ''} ${message.type === 'user' ? 'flex justify-end px-3 sm:px-0' : 'px-3 sm:px-0'}`}
    >
      {message.type === 'user' ? (
        /* User message bubble on the right */
        <>
          <div className="flex w-full items-end space-x-0 sm:w-auto sm:max-w-[85%] sm:space-x-3 md:max-w-md lg:max-w-lg xl:max-w-xl">
            <div className="group flex-1 rounded-2xl rounded-br-md bg-blue-600 px-3 py-2 text-white shadow-sm sm:flex-initial sm:px-4">
              {shouldRenderUserText && (
                <div
                  className={`whitespace-pre-wrap break-words text-sm ${userMessageCollapseState.shouldClamp ? 'line-clamp-5' : ''}`}
                >
                  {message.content}
                </div>
              )}
              {userMessageCollapseState.shouldShowToggle && (
                <button
                  type="button"
                  onClick={() => {
                    setIsUserMessageExpanded((current) => {
                      const next = !current;
                      expandedUserMessages.set(messageKey, next);
                      return next;
                    });
                  }}
                  className="mt-1 text-xs font-medium text-blue-100 transition-colors hover:text-white"
                >
                  {userMessageCollapseState.toggleLabel}
                </button>
              )}
              {userImages.length > 0 && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {userImages.map((img, idx) => (
                    img.data ? (
                      <button
                        key={img.name || idx}
                        type="button"
                        className="h-20 w-20 overflow-hidden rounded-lg border border-blue-300/40 bg-blue-500/30 transition-opacity hover:opacity-90"
                        onClick={() => setActiveImageIndex(idx)}
                      >
                        <img
                          src={img.data}
                          alt={img.name}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ) : (
                      <div
                        key={img.name || idx}
                        className="flex h-20 w-20 items-center justify-center rounded-lg border border-blue-300/60 bg-blue-500/40 px-2 py-2 text-center text-xs text-blue-50"
                      >
                        {img.placeholderLabel || '已发送图片'}
                      </div>
                    )
                  ))}
                </div>
              )}
              <div className="mt-1 flex items-center justify-end gap-1 text-xs text-blue-100">
                {shouldShowUserCopyControl && (
                  <MessageCopyControl content={userCopyContent} messageType="user" />
                )}
                <span>{formattedTime}</span>
              </div>
            </div>
            {!isGrouped && (
              <div className="hidden h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm text-white sm:flex">
                U
              </div>
            )}
          </div>
          {activeImage?.data ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
              onClick={() => setActiveImageIndex(null)}
            >
              <div
                className="relative max-h-[90vh] max-w-[90vw]"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  aria-label="关闭图片预览"
                  className="absolute right-2 top-2 z-10 rounded-full bg-black/60 px-2 py-1 text-xs text-white"
                  onClick={() => setActiveImageIndex(null)}
                >
                  关闭
                </button>
                <img
                  src={activeImage.data}
                  alt={activeImage.name}
                  className="max-h-[90vh] max-w-[90vw] rounded-xl bg-white object-contain shadow-2xl"
                />
              </div>
            </div>
          ) : null}
        </>
      ) : message.isTaskNotification ? (
        /* Compact task notification on the left */
        <div className="w-full">
          <div className="flex items-center gap-2 py-0.5">
            <span className={`inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full ${message.taskStatus === 'completed' ? 'bg-green-400 dark:bg-green-500' : 'bg-amber-400 dark:bg-amber-500'}`} />
            <span className="text-xs text-gray-500 dark:text-gray-400">{message.content}</span>
          </div>
        </div>
      ) : message.isOrchestrationCard && message.orchestrationState ? (
        <div className="w-full">
          <div className="mb-2 flex items-center space-x-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm text-white shadow-sm">
              ◎
            </div>
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              Claude 编排
            </div>
          </div>

          <div className="rounded-xl border border-blue-200/70 bg-blue-50/80 p-3 text-sm text-blue-950 shadow-sm dark:border-blue-800/50 dark:bg-blue-950/20 dark:text-blue-100">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white">
                编排摘要
              </span>
              <span className="text-xs text-blue-700/90 dark:text-blue-200/80">
                已派发 {message.orchestrationState.taskTitles.length} 个子代理
              </span>
            </div>

            <div className="whitespace-pre-wrap break-words text-sm leading-6">
              {message.orchestrationState.summary}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {message.orchestrationState.taskTitles.map((title, index) => (
                <span
                  key={`${title}-${index}`}
                  className="inline-flex max-w-full items-center rounded-full border border-blue-200/80 bg-white/80 px-2.5 py-1 text-xs font-medium text-blue-700 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-100"
                >
                  <span className="mr-1 text-blue-400 dark:text-blue-300">Task</span>
                  <span className="truncate">{title}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Claude/Error/Tool messages on the left */
        <div className="w-full">
          {!isGrouped && (
            <div className="mb-2 flex items-center space-x-3">
              {message.type === 'error' ? (
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-600 text-sm text-white">
                  !
                </div>
              ) : message.type === 'tool' ? (
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-600 text-sm text-white dark:bg-gray-700">
                  🔧
                </div>
              ) : (
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full p-1 text-sm text-white">
                  <SessionProviderLogo provider={provider} className="h-full w-full" />
                </div>
              )}
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                {message.type === 'error' ? t('messageTypes.error') : message.type === 'tool' ? t('messageTypes.tool') : t('messageTypes.claude')}
              </div>
            </div>
          )}

          <div className="w-full">

            {message.isToolUse ? (
              <>
                {toolUseLeadText && (
                  <div className="flex flex-col">
                    <Markdown className="prose prose-sm max-w-none dark:prose-invert" onOpenUrl={onOpenUrl}>
                      {toolUseLeadText}
                    </Markdown>
                  </div>
                )}

                {message.toolInput && (
                  <ToolRenderer
                    toolName={message.toolName || 'UnknownTool'}
                    toolInput={message.toolInput}
                    toolResult={message.toolResult}
                    toolId={message.toolId}
                    mode="input"
                    onFileOpen={onFileOpen}
                    onOpenUrl={onOpenUrl}
                    createDiff={createDiff}
                    selectedProject={selectedProject}
                    autoExpandTools={autoExpandTools}
                    showRawParameters={showRawParameters}
                    rawToolInput={typeof message.toolInput === 'string' ? message.toolInput : undefined}
                    isSubagentContainer={message.isSubagentContainer}
                    subagentState={message.subagentState}
                  />
                )}

                {/* Tool Result Section */}
                {message.toolResult && !message.isSubagentContainer && !shouldHideToolResult(message.toolName || 'UnknownTool', message.toolResult) && (
                  <div id={`tool-result-${message.toolId}`} className="scroll-mt-4">
                    <ToolRenderer
                      toolName={message.toolName || 'UnknownTool'}
                      toolInput={message.toolInput}
                      toolResult={message.toolResult}
                      toolId={message.toolId}
                      mode="result"
                      onFileOpen={onFileOpen}
                      onOpenUrl={onOpenUrl}
                      createDiff={createDiff}
                      selectedProject={selectedProject}
                      autoExpandTools={autoExpandTools}
                    />
                    {message.toolResult.isError && permissionSuggestion && (
                      <div className="ml-3 mt-3 border-l-2 border-red-300/70 pl-3 dark:border-red-800/60">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (!onGrantToolPermission) return;
                              const result = onGrantToolPermission(permissionSuggestion);
                              if (result?.success) {
                                setPermissionGrantState('granted');
                              } else {
                                setPermissionGrantState('error');
                              }
                            }}
                            disabled={permissionSuggestion.isAllowed || permissionGrantState === 'granted'}
                            className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${permissionSuggestion.isAllowed || permissionGrantState === 'granted'
                              ? 'cursor-default border-green-300/70 bg-green-100 text-green-800 dark:border-green-800/60 dark:bg-green-900/30 dark:text-green-200'
                              : 'border-red-300/70 bg-white/80 text-red-700 hover:bg-white dark:border-red-800/60 dark:bg-gray-900/40 dark:text-red-200 dark:hover:bg-gray-900/70'
                              }`}
                          >
                            {permissionSuggestion.isAllowed || permissionGrantState === 'granted'
                              ? t('permissions.added')
                              : t('permissions.grant', { tool: permissionSuggestion.toolName })}
                          </button>
                          {onShowSettings && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); onShowSettings(); }}
                              className="text-xs text-red-700 underline hover:text-red-800 dark:text-red-200 dark:hover:text-red-100"
                            >
                              {t('permissions.openSettings')}
                            </button>
                          )}
                        </div>
                        <div className="mt-2 text-xs text-red-700/90 dark:text-red-200/80">
                          {t('permissions.addTo', { entry: permissionSuggestion.entry })}
                        </div>
                        {permissionGrantState === 'error' && (
                          <div className="mt-2 text-xs text-red-700 dark:text-red-200">
                            {t('permissions.error')}
                          </div>
                        )}
                        {(permissionSuggestion.isAllowed || permissionGrantState === 'granted') && (
                          <div className="mt-2 text-xs text-green-700 dark:text-green-200">
                            {t('permissions.retry')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : message.isInteractivePrompt ? (
              // Special handling for interactive prompts
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber-500">
                    <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h4 className="mb-3 text-base font-semibold text-amber-900 dark:text-amber-100">
                      {t('interactive.title')}
                    </h4>
                    {(() => {
                      const lines = (message.content || '').split('\n').filter((line) => line.trim());
                      const questionLine = lines.find((line) => line.includes('?')) || lines[0] || '';
                      const options: InteractiveOption[] = [];

                      // Parse the menu options
                      lines.forEach((line) => {
                        // Match lines like "❯ 1. Yes" or "  2. No"
                        const optionMatch = line.match(/[❯\s]*(\d+)\.\s+(.+)/);
                        if (optionMatch) {
                          const isSelected = line.includes('❯');
                          options.push({
                            number: optionMatch[1],
                            text: optionMatch[2].trim(),
                            isSelected
                          });
                        }
                      });

                      return (
                        <>
                          <p className="mb-4 text-sm text-amber-800 dark:text-amber-200">
                            {questionLine}
                          </p>

                          {/* Option buttons */}
                          <div className="mb-4 space-y-2">
                            {options.map((option) => (
                              <button
                                key={option.number}
                                className={`w-full rounded-lg border-2 px-4 py-3 text-left transition-all ${option.isSelected
                                  ? 'border-amber-600 bg-amber-600 text-white shadow-md dark:border-amber-700 dark:bg-amber-700'
                                  : 'border-amber-300 bg-white text-amber-900 dark:border-amber-700 dark:bg-gray-800 dark:text-amber-100'
                                  } cursor-not-allowed opacity-75`}
                                disabled
                              >
                                <div className="flex items-center gap-3">
                                  <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${option.isSelected
                                    ? 'bg-white/20'
                                    : 'bg-amber-100 dark:bg-amber-800/50'
                                    }`}>
                                    {option.number}
                                  </span>
                                  <span className="flex-1 text-sm font-medium sm:text-base">
                                    {option.text}
                                  </span>
                                  {option.isSelected && (
                                    <span className="text-lg">❯</span>
                                  )}
                                </div>
                              </button>
                            ))}
                          </div>

                          <div className="rounded-lg bg-amber-100 p-3 dark:bg-amber-800/30">
                            <p className="mb-1 text-sm font-medium text-amber-900 dark:text-amber-100">
                              {t('interactive.waiting')}
                            </p>
                            <p className="text-xs text-amber-800 dark:text-amber-200">
                              {t('interactive.instruction')}
                            </p>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            ) : message.isThinking ? (
              /* Thinking messages - collapsible by default */
              <div className="text-sm text-gray-700 dark:text-gray-300">
                <details className="group">
                  <summary className="flex cursor-pointer items-center gap-2 font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                    <svg className="h-3 w-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span>{t('thinking.emoji')}</span>
                  </summary>
                  <div className="mt-2 border-l-2 border-gray-300 pl-4 text-sm text-gray-600 dark:border-gray-600 dark:text-gray-400">
                    <Markdown className="prose prose-sm prose-gray max-w-none dark:prose-invert" onOpenUrl={onOpenUrl}>
                      {message.content}
                    </Markdown>
                  </div>
                </details>
              </div>
            ) : (
              <div className="text-sm text-gray-700 dark:text-gray-300">
                {/* Thinking accordion for reasoning */}
                {showThinking && message.reasoning && (
                  <details className="mb-3">
                    <summary className="cursor-pointer font-medium text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200">
                      {t('thinking.emoji')}
                    </summary>
                    <div className="mt-2 border-l-2 border-gray-300 pl-4 text-sm italic text-gray-600 dark:border-gray-600 dark:text-gray-400">
                      <div className="whitespace-pre-wrap">
                        {message.reasoning}
                      </div>
                    </div>
                  </details>
                )}

                {(() => {
                  const content = formattedMessageContent;

                  // Detect if content is pure JSON (starts with { or [)
                  const trimmedContent = content.trim();
                  if ((trimmedContent.startsWith('{') || trimmedContent.startsWith('[')) &&
                    (trimmedContent.endsWith('}') || trimmedContent.endsWith(']'))) {
                    try {
                      const parsed = JSON.parse(trimmedContent);
                      const formatted = JSON.stringify(parsed, null, 2);

                      return (
                        <div className="my-2">
                          <div className="mb-2 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                            <span className="font-medium">{t('json.response')}</span>
                          </div>
                          <div className="overflow-hidden rounded-lg border border-gray-600/30 bg-gray-800 dark:border-gray-700 dark:bg-gray-900">
                            <pre className="overflow-x-auto p-4">
                              <code className="block whitespace-pre font-mono text-sm text-gray-100 dark:text-gray-200">
                                {formatted}
                              </code>
                            </pre>
                          </div>
                        </div>
                      );
                    } catch {
                      // Not valid JSON, fall through to normal rendering
                    }
                  }

                  // Normal rendering for non-JSON content
                  return message.type === 'assistant' ? (
                    <>
                      <Markdown className="prose prose-sm prose-gray max-w-none dark:prose-invert" onOpenUrl={onOpenUrl}>
                        {content}
                      </Markdown>
                      {message.structuredOutput !== undefined && (
                        <StructuredOutputCard
                          value={message.structuredOutput}
                          isError={false}
                        />
                      )}
                      {(formattedUsageCost || modelUsageEntries.length > 0) && (
                        <div className="mt-3 rounded-lg border border-gray-200/70 bg-gray-50/80 p-3 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
                          <div className="mb-2 flex flex-wrap items-center gap-3">
                            <span className="font-medium text-gray-700 dark:text-gray-200">Usage</span>
                            {formattedUsageCost && (
                              <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                Cost {formattedUsageCost}
                              </span>
                            )}
                          </div>
                          {modelUsageEntries.length > 0 && (
                            <div className="space-y-2">
                              {modelUsageEntries.map(([modelName, usage]) => (
                                <div key={modelName} className="rounded border border-gray-200/70 bg-white/80 px-2 py-2 dark:border-gray-800 dark:bg-gray-950/30">
                                  <div className="mb-1 font-medium text-gray-700 dark:text-gray-200">{modelName}</div>
                                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
                                    {typeof usage?.inputTokens === 'number' && <span>输入 {usage.inputTokens.toLocaleString()}</span>}
                                    {typeof usage?.outputTokens === 'number' && <span>输出 {usage.outputTokens.toLocaleString()}</span>}
                                    {typeof usage?.cacheReadInputTokens === 'number' && <span>缓存读 {usage.cacheReadInputTokens.toLocaleString()}</span>}
                                    {typeof usage?.cacheCreationInputTokens === 'number' && <span>缓存写 {usage.cacheCreationInputTokens.toLocaleString()}</span>}
                                    {typeof usage?.webSearchRequests === 'number' && <span>WebSearch {usage.webSearchRequests}</span>}
                                    {typeof usage?.costUSD === 'number' && <span>成本 ${usage.costUSD.toFixed(4)}</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="whitespace-pre-wrap">
                      {content}
                    </div>
                  );
                })()}
              </div>
            )}

            {(shouldShowAssistantCopyControl || !isGrouped) && (
              <div className="mt-1 flex w-full items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500">
                {shouldShowAssistantCopyControl && (
                  <MessageCopyControl content={assistantCopyContent} messageType="assistant" />
                )}
                {!isGrouped && <span>{formattedTime}</span>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default MessageComponent;
