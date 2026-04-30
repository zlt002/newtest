import { useTranslation } from 'react-i18next';
import type {
  ChangeEvent,
  ClipboardEvent,
  Dispatch,
  FormEvent,
  KeyboardEvent,
  MouseEvent,
  PointerEvent,
  ReactNode,
  RefObject,
  SetStateAction,
} from 'react';
import { useState } from 'react';
import MicButton from '../../../mic-button/view/MicButton';
import type { ClaudeEffortLevel } from '../../constants/thinkingModes';
import {
  type PendingDecisionRequest,
  type PermissionMode,
  type Provider,
  isPendingQuestionRequest,
} from '../../types/types';
import CommandMenu from './CommandMenu';
import ImageAttachment from './ImageAttachment';
import ChatInputControls from './ChatInputControls';
import { getComposerPrimaryAction } from './composerChrome';
import TokenUsagePie from './TokenUsagePie';

interface MentionableFile {
  name: string;
  path: string;
}

interface SlashCommand {
  name: string;
  description?: string;
  namespace?: string;
  path?: string;
  type?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

interface ChatComposerProps {
  pendingDecisionRequests: PendingDecisionRequest[];
  isLoading: boolean;
  onAbortSession: () => void;
  provider: Provider | string;
  permissionMode: PermissionMode | string;
  onModeSwitch: () => void;
  claudeModel: string;
  setClaudeModel: Dispatch<SetStateAction<string>>;
  thinkingMode: ClaudeEffortLevel;
  setThinkingMode: Dispatch<SetStateAction<ClaudeEffortLevel>>;
  tokenBudget: { used?: number; total?: number } | null;
  observabilityStatus: {
    enabled: boolean;
    provider: string | null;
    projectName: string | null;
    dashboardUrl: string | null;
  } | null;
  observabilitySessionId: string | null;
  composerStatus?: 'idle' | 'queued' | 'starting' | 'streaming' | 'waiting_for_tool' | 'completed' | 'failed' | 'aborted';
  composerLabel?: string | null;
  slashCommandsCount: number;
  onToggleCommandMenu: () => void;
  hasInput: boolean;
  onClearInput: () => void;
  isUserScrolledUp: boolean;
  hasMessages: boolean;
  onScrollToBottom: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement> | MouseEvent<HTMLButtonElement> | PointerEvent<HTMLButtonElement>) => void;
  isDragActive: boolean;
  attachedImages: File[];
  onRemoveImage: (index: number) => void;
  uploadingImages: Map<string, number>;
  imageErrors: Map<string, string>;
  showFileDropdown: boolean;
  filteredFiles: MentionableFile[];
  selectedFileIndex: number;
  onSelectFile: (file: MentionableFile) => void;
  filteredCommands: SlashCommand[];
  selectedCommandIndex: number;
  onCommandSelect: (command: SlashCommand, index: number, isHover: boolean) => void;
  onCloseCommandMenu: () => void;
  isCommandMenuOpen: boolean;
  frequentCommands: SlashCommand[];
  getRootProps: (...args: unknown[]) => Record<string, unknown>;
  getInputProps: (...args: unknown[]) => Record<string, unknown>;
  openImagePicker: () => void;
  inputHighlightRef: RefObject<HTMLDivElement>;
  renderInputWithMentions: (text: string) => ReactNode;
  textareaRef: RefObject<HTMLTextAreaElement>;
  input: string;
  onInputChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onTextareaClick: (event: MouseEvent<HTMLTextAreaElement>) => void;
  onTextareaKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onTextareaPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onTextareaScrollSync: (target: HTMLTextAreaElement) => void;
  onTextareaInput: (event: FormEvent<HTMLTextAreaElement>) => void;
  onInputFocusChange?: (focused: boolean) => void;
  isInputFocused?: boolean;
  placeholder: string;
  isTextareaExpanded: boolean;
  sendByCtrlEnter?: boolean;
  onTranscript: (text: string) => void;
  contextBar?: ReactNode;
}

export default function ChatComposer({
  pendingDecisionRequests,
  isLoading,
  onAbortSession,
  provider,
  permissionMode,
  onModeSwitch,
  claudeModel,
  setClaudeModel,
  thinkingMode,
  setThinkingMode,
  tokenBudget,
  observabilityStatus,
  observabilitySessionId,
  composerStatus,
  composerLabel,
  slashCommandsCount,
  onToggleCommandMenu,
  hasInput,
  onClearInput,
  isUserScrolledUp,
  hasMessages,
  onScrollToBottom,
  onSubmit,
  isDragActive,
  attachedImages,
  onRemoveImage,
  uploadingImages,
  imageErrors,
  showFileDropdown,
  filteredFiles,
  selectedFileIndex,
  onSelectFile,
  filteredCommands,
  selectedCommandIndex,
  onCommandSelect,
  onCloseCommandMenu,
  isCommandMenuOpen,
  frequentCommands,
  getRootProps,
  getInputProps,
  openImagePicker,
  inputHighlightRef,
  renderInputWithMentions,
  textareaRef,
  input,
  onInputChange,
  onTextareaClick,
  onTextareaKeyDown,
  onTextareaPaste,
  onTextareaScrollSync,
  onTextareaInput,
  onInputFocusChange,
  isInputFocused,
  placeholder,
  isTextareaExpanded,
  sendByCtrlEnter,
  onTranscript,
  contextBar,
}: ChatComposerProps) {
  const { t } = useTranslation('chat');
  const [copiedSessionId, setCopiedSessionId] = useState(false);
  const textareaRect = textareaRef.current?.getBoundingClientRect();
  const commandMenuPosition = {
    top: textareaRect ? Math.max(16, textareaRect.top - 316) : 0,
    left: textareaRect ? textareaRect.left : 16,
    bottom: textareaRect ? window.innerHeight - textareaRect.top + 8 : 90,
  };

  const hasQuestionPanel = pendingDecisionRequests.some(isPendingQuestionRequest);
  const isBlockedOnDecision = pendingDecisionRequests.length > 0;
  const isFailed = composerStatus === 'failed';

  // On mobile, when input is focused, float the input box at the bottom
  const mobileFloatingClass = isInputFocused
    ? 'max-sm:fixed max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:z-50 max-sm:bg-background max-sm:shadow-[0_-4px_20px_rgba(0,0,0,0.15)]'
    : '';
  const primaryAction = getComposerPrimaryAction({ isLoading, hasInput });

  const handleCopyObservabilitySessionId = async () => {
    if (!observabilitySessionId) {
      return;
    }

    try {
      await navigator.clipboard.writeText(observabilitySessionId);
      setCopiedSessionId(true);
      window.setTimeout(() => setCopiedSessionId(false), 1500);
    } catch {
      setCopiedSessionId(false);
    }
  };

  return (
    <div className="flex-shrink-0 p-4">
      {contextBar && (
        <div className="mx-auto mb-3 max-w-4xl">
          {contextBar}
        </div>
      )}

      <div className="mx-auto mb-3 max-w-4xl">
        {isFailed ? (
          <div
            data-chat-v2-composer-failed="true"
            className="mb-3 rounded-2xl border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-100"
          >
            {composerLabel || '当前运行失败，请检查恢复建议后继续。'}
          </div>
        ) : null}

        {isBlockedOnDecision ? (
          <div
            data-chat-v2-composer-blocked="true"
            className="mb-3 rounded-2xl border border-amber-900/60 bg-amber-950/30 p-3 text-sm text-amber-100"
          >
            {hasQuestionPanel ? '需要先回答问题，才能继续当前执行。' : '需要先处理权限请求，才能继续当前执行。'}
          </div>
        ) : null}

      </div>

      {!hasQuestionPanel && (
        <form
          data-chat-v2-composer-dock="true"
          onSubmit={onSubmit as (event: FormEvent<HTMLFormElement>) => void}
          className="relative mx-auto max-w-4xl"
        >
        {isDragActive && (
          <div className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary/50 bg-primary/15">
            <div className="rounded-xl border border-border/30 bg-card p-4 shadow-lg">
              <svg className="mx-auto mb-2 h-8 w-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <p className="text-sm font-medium">Drop images here</p>
            </div>
          </div>
        )}

        {showFileDropdown && filteredFiles.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 z-50 mb-2 max-h-48 overflow-y-auto rounded-xl border border-border/50 bg-card/95 shadow-lg backdrop-blur-md">
            {filteredFiles.map((file, index) => (
              <div
                key={file.path}
                className={`cursor-pointer touch-manipulation border-b border-border/30 px-4 py-3 last:border-b-0 ${
                  index === selectedFileIndex
                    ? 'bg-primary/8 text-primary'
                    : 'text-foreground hover:bg-accent/50'
                }`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onSelectFile(file);
                }}
              >
                <div className="text-sm font-medium">{file.name}</div>
                <div className="font-mono text-xs text-muted-foreground">{file.path}</div>
              </div>
            ))}
          </div>
        )}

        <CommandMenu
          commands={filteredCommands}
          selectedIndex={selectedCommandIndex}
          onSelect={onCommandSelect}
          onClose={onCloseCommandMenu}
          position={commandMenuPosition}
          isOpen={isCommandMenuOpen}
          frequentCommands={frequentCommands}
        />

        <div
          {...getRootProps()}
          className={`relative overflow-hidden rounded-2xl border border-border/50 bg-card/80 shadow-sm backdrop-blur-sm transition-all duration-200 focus-within:border-primary/30 focus-within:shadow-md focus-within:ring-1 focus-within:ring-primary/15 ${
            isTextareaExpanded ? 'chat-input-expanded' : ''}`}
        >
          <input {...getInputProps()} />
          <div ref={inputHighlightRef} aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden rounded-2xl">
            <div className="chat-input-placeholder block w-full whitespace-pre-wrap break-words px-4 pb-2.5 pt-3 text-base leading-6 text-transparent sm:px-5 sm:pb-3 sm:pt-3.5">
              {renderInputWithMentions(input)}
            </div>
          </div>

          <div className="relative z-10">
            {attachedImages.length > 0 && (
              <div className="border-b border-border/50 bg-muted/30 px-3 py-2 sm:px-4">
                <div className="flex flex-wrap gap-2">
                  {attachedImages.map((file, index) => (
                    <ImageAttachment
                      key={index}
                      file={file}
                      onRemove={() => onRemoveImage(index)}
                      uploadProgress={uploadingImages.get(file.name)}
                      error={imageErrors.get(file.name)}
                    />
                  ))}
                </div>
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={input}
              onChange={onInputChange}
              onClick={onTextareaClick}
              onKeyDown={onTextareaKeyDown}
              onPaste={onTextareaPaste}
              onScroll={(event) => onTextareaScrollSync(event.target as HTMLTextAreaElement)}
              onFocus={() => onInputFocusChange?.(true)}
              onBlur={() => onInputFocusChange?.(false)}
              onInput={onTextareaInput}
              placeholder={placeholder}
              className="chat-input-placeholder block max-h-[40vh] min-h-[64px] w-full resize-none overflow-y-auto bg-transparent px-4 pb-2.5 pt-3 text-sm leading-6 text-foreground placeholder-muted-foreground/50 transition-all duration-200 focus:outline-none sm:max-h-[300px] sm:min-h-[72px] sm:px-5 sm:pb-3 sm:pt-3.5"
              style={{ height: '64px' }}
            />

            <div className="absolute right-14 top-3 sm:right-[72px] sm:top-4" style={{ display: 'none' }}>
              <MicButton onTranscript={onTranscript} className="h-10 w-10 sm:h-10 sm:w-10" />
            </div>

            <div className="border-t border-border/50 bg-muted/20 px-2.5 py-1.5 sm:px-3 sm:py-2">
              <div className="flex flex-wrap items-center gap-1.5 sm:flex-nowrap sm:justify-between">
                <div className="order-2 flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:order-1">
                  <ChatInputControls
                    menuPosition={commandMenuPosition}
                    onOpenImagePicker={openImagePicker}
                    permissionMode={permissionMode}
                    onModeSwitch={onModeSwitch}
                    provider={provider}
                    claudeModel={claudeModel}
                    setClaudeModel={setClaudeModel}
                    thinkingMode={thinkingMode}
                    setThinkingMode={setThinkingMode}
                    tokenBudget={tokenBudget}
                    slashCommandsCount={slashCommandsCount}
                    onToggleCommandMenu={onToggleCommandMenu}
                    hasInput={hasInput}
                    onClearInput={onClearInput}
                  />
                  {observabilityStatus?.enabled && (
                    <>
                      <a
                        href={observabilityStatus.dashboardUrl || 'https://smith.langchain.com'}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                        title={`LangSmith tracing 已启用${observabilityStatus.projectName ? ` · 项目 ${observabilityStatus.projectName}` : ''}`}
                      >
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        <span>LangSmith</span>
                        {observabilityStatus.projectName && <span className="text-emerald-600/80">{observabilityStatus.projectName}</span>}
                      </a>
                      {observabilitySessionId && (
                        <button
                          type="button"
                          onClick={handleCopyObservabilitySessionId}
                          className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          title={`复制当前会话 ID：${observabilitySessionId}`}
                        >
                          <span>{copiedSessionId ? '已复制会话ID' : '复制会话ID'}</span>
                        </button>
                      )}
                    </>
                  )}
                </div>

                <div className="order-1 flex w-full items-center justify-between gap-2 sm:order-2 sm:w-auto sm:justify-end">
                  <TokenUsagePie
                    used={tokenBudget?.used || 0}
                    total={tokenBudget?.total || parseInt(import.meta.env.VITE_CONTEXT_WINDOW) || 160000}
                  />

                  {primaryAction.kind === 'stop' ? (
                    <button
                      type="button"
                      onClick={onAbortSession}
                      aria-label={t('claudeStatus.controls.stopGeneration', { defaultValue: 'Stop Generation' })}
                      title={t('claudeStatus.controls.stopGeneration', { defaultValue: 'Stop Generation' })}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm transition-all duration-200 hover:bg-destructive/90 focus:outline-none focus:ring-2 focus:ring-destructive/30 focus:ring-offset-1 focus:ring-offset-background"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={primaryAction.disabled}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary transition-all duration-200 hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-1 focus:ring-offset-background disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                    >
                      <svg className="h-3.5 w-3.5 rotate-90 transform text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {isUserScrolledUp && hasMessages && (
          <button
            type="button"
            onClick={onScrollToBottom}
            className="absolute left-1/2 top-0 inline-flex h-9 w-9 -translate-x-1/2 -translate-y-[calc(100%+8px)] items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-all duration-200 hover:scale-105 hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-1 focus:ring-offset-background"
            title={t('input.scrollToBottom')}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        )}
        </form>
      )}
    </div>
  );
}
