import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { RunCard as RunCardModel } from '../types/runCard.ts';
import { RuntimeMarkdown } from './RuntimeMarkdown';
import { RunCardProcessTimeline } from './RunCardProcessTimeline';
import { TodoListContent } from '../tools/components/ContentRenderers/TodoListContent.tsx';

function ClaudeAvatar() {
  return (
    <div
      data-chat-v2-run-card-avatar="true"
      className="flex h-8 w-8 items-center justify-center rounded-full bg-[#D97757] text-sm font-semibold text-white shadow-sm"
      aria-label="Claude"
      title="Claude"
    >
      ✳
    </div>
  );
}

function resolveCardTone(cardStatus: RunCardModel['cardStatus']) {
  switch (cardStatus) {
    case 'completed':
      return 'border-emerald-200 bg-white dark:border-emerald-900/70 dark:bg-neutral-900/95';
    case 'failed':
      return 'border-red-200 bg-white dark:border-red-900/70 dark:bg-neutral-900/95';
    case 'aborted':
      return 'border-amber-200 bg-white dark:border-amber-900/70 dark:bg-neutral-900/95';
    case 'waiting_for_input':
      return 'border-amber-200 bg-white dark:border-amber-900/70 dark:bg-neutral-900/95';
    default:
      return 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900/95';
  }
}

function normalizePreviewText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeTodoToolName(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isTodoToolName(value: unknown) {
  const normalized = normalizeTodoToolName(value);
  return normalized === 'todowrite' || normalized === 'todoread';
}

function isTodoItem(value: unknown): value is { content: string; status: string } {
  return Boolean(
    value
    && typeof value === 'object'
    && typeof (value as Record<string, unknown>).content === 'string'
    && typeof (value as Record<string, unknown>).status === 'string'
  );
}

function extractTodoItems(value: unknown): Array<{ content: string; status: string }> | null {
  if (Array.isArray(value)) {
    const todos = value.filter(isTodoItem);
    return todos.length > 0 ? todos : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    try {
      return extractTodoItems(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  return extractTodoItems(record.todos)
    || extractTodoItems(record.newTodos)
    || extractTodoItems(record.oldTodos)
    || extractTodoItems(record.input)
    || extractTodoItems(record.output)
    || extractTodoItems(record.result)
    || extractTodoItems(record.toolInput)
    || extractTodoItems(record.payload)
    || null;
}

function getTodoPanelItems(item: { body: string; title: string; payload?: unknown }) {
  const payload = item.payload && typeof item.payload === 'object' ? item.payload as Record<string, unknown> : null;
  const toolName = payload?.toolName
    || payload?.tool_name
    || payload?.name
    || item.title;

  if (!isTodoToolName(toolName)) {
    return null;
  }

  return extractTodoItems(payload) || extractTodoItems(item.body);
}

function isTodoProcessItem(item: { body: string; title: string; payload?: unknown }) {
  return Array.isArray(getTodoPanelItems(item)) && getTodoPanelItems(item)!.length > 0;
}

function normalizeFilePath(value: string) {
  return value.replace(/\\/g, '/').trim();
}

function getFileName(filePath: string) {
  const normalized = normalizeFilePath(filePath);
  return normalized.split('/').pop() || normalized;
}

function looksLikeFilePath(value: unknown) {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = normalizeFilePath(value);
  if (!normalized) {
    return false;
  }

  return normalized.includes('/')
    || /\.(md|markdown|txt|tsx?|jsx?|vue|json|ya?ml|html?|css|scss|less|py|java|go|rs|sh)$/i.test(normalized);
}

function collectFilePaths(value: unknown, results: Set<string>, seen: WeakSet<object>, depth = 0) {
  if (depth > 6 || value == null) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectFilePaths(item, results, seen, depth + 1);
    }
    return;
  }

  if (typeof value === 'object') {
    if (seen.has(value as object)) {
      return;
    }
    seen.add(value as object);

    const record = value as Record<string, unknown>;
    for (const key of ['filePath', 'file_path', 'path']) {
      const candidate = record[key];
      if (looksLikeFilePath(candidate)) {
        results.add(normalizeFilePath(String(candidate)));
      }
    }

    for (const nestedValue of Object.values(record)) {
      collectFilePaths(nestedValue, results, seen, depth + 1);
    }
  }
}

function resolveProcessPreviewLabel(title: string) {
  const normalized = String(title || '').trim().toLowerCase();
  if (normalized === 'thinking') {
    return '思考';
  }
  if (normalized === 'debug ref') {
    return '调试引用';
  }
  if (normalized.startsWith('session status')) {
    return '会话状态';
  }
  if (normalized === 'tool_use') {
    return '工具调用';
  }
  if (normalized === 'tool_result') {
    return '工具结果';
  }
  if (normalized === 'subagent_progress') {
    return '子代理进度';
  }
  if (normalized === 'interactive_prompt') {
    return '交互提问';
  }
  if (normalized === 'permission_request') {
    return '权限请求';
  }
  if (normalized === 'compact_boundary') {
    return '压缩边界';
  }

  return title || '过程';
}

export function scrollContainerToBottom(container: { scrollTop: number; scrollHeight: number } | null) {
  if (!container) {
    return;
  }

  container.scrollTop = container.scrollHeight;
}

export function RunCard({
  card,
  interactionNode = null,
  onFileOpen = null,
}: {
  card: RunCardModel;
  interactionNode?: ReactNode;
  onFileOpen?: ((filePath: string, diffInfo?: unknown) => void) | null;
}) {
  const [isProcessModalOpen, setIsProcessModalOpen] = useState(false);
  const modalScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const todoPanelItems = useMemo(() => {
    for (let index = card.processItems.length - 1; index >= 0; index -= 1) {
      const todos = getTodoPanelItems(card.processItems[index]);
      if (todos && todos.length > 0) {
        return todos;
      }
    }
    return null;
  }, [card.processItems]);
  const processTimelineItems = useMemo(
    () => card.processItems.filter((item) => item.kind !== 'notice' && !isTodoProcessItem(item)),
    [card.processItems],
  );
  const processPreviewItems = useMemo(
    () => {
      const explicitPreviewItems = Array.isArray(card.previewItems)
        ? card.previewItems.filter((item) => item.kind !== 'notice')
        : null;
      return (explicitPreviewItems ?? processTimelineItems).slice(-2);
    },
    [card.previewItems, processTimelineItems],
  );
  const responseSegments = useMemo(() => {
    const canonicalResponseMessages = Array.isArray(card.responseMessages)
      ? card.responseMessages.filter((item) => String(item?.body || '').trim())
      : [];
    const segments = canonicalResponseMessages.map((item) => ({
      id: item.id,
      body: item.body,
      kind: item.kind,
    }));

    if (segments.length > 0) {
      return segments;
    }

    const noticeItems = card.processItems
      .filter((item) => item.kind === 'notice' && String(item.body || '').trim())
      .map((item) => ({
        id: item.id,
        body: item.body,
        kind: 'phase' as const,
      }));
    segments.push(...noticeItems);

    const finalResponse = String(card.finalResponse || '').trim();
    if (finalResponse) {
      segments.push({
        id: `${card.anchorMessageId || card.sessionId || 'run-card'}-final`,
        body: finalResponse,
        kind: 'final' as const,
      });
    }

    if (segments.length === 0) {
      segments.push({
        id: `${card.anchorMessageId || card.sessionId || 'run-card'}-headline`,
        body: card.headline,
        kind: 'final' as const,
      });
    }

    return segments;
  }, [card.anchorMessageId, card.finalResponse, card.headline, card.processItems, card.responseMessages, card.sessionId]);
  const hasProcessItems = processTimelineItems.length > 0;
  const relatedFiles = useMemo(() => {
    const files = new Set<string>();
    const seen = new WeakSet<object>();

    for (const item of card.processItems) {
      collectFilePaths(item.payload, files, seen);
    }

    if (card.activeInteraction) {
      collectFilePaths(card.activeInteraction.input, files, seen);
      collectFilePaths(card.activeInteraction.context, files, seen);
      collectFilePaths(card.activeInteraction.payload, files, seen);
    }

    return [...files].map((filePath) => ({
      filePath,
      fileName: getFileName(filePath),
    }));
  }, [card.activeInteraction, card.processItems]);

  useEffect(() => {
    if (!isProcessModalOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsProcessModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isProcessModalOpen]);

  useEffect(() => {
    const container = modalScrollContainerRef.current;
    if (!container || !isProcessModalOpen) {
      return;
    }

    scrollContainerToBottom(container);
  }, [isProcessModalOpen, processTimelineItems]);

  return (
    <>
      <div
        data-chat-v2-run-card-shell="true"
        className="flex w-full items-start gap-3"
      >
        <div
          data-chat-v2-run-card-avatar-column="true"
          className="flex h-8 w-8 shrink-0 items-start justify-center pt-1"
        >
          <ClaudeAvatar />
        </div>
        <article
          data-chat-v2-run-card="true"
          data-chat-v2-run-card-expanded={isProcessModalOpen ? 'true' : 'false'}
          data-chat-v2-run-card-card-column="true"
          className={`min-w-0 flex-1 space-y-3 rounded-2xl border px-4 py-4 shadow-sm ${resolveCardTone(card.cardStatus)}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Claude</div>
              <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{card.headline}</div>
            </div>

            {hasProcessItems ? (
              <button
                type="button"
                className="shrink-0 rounded-full border border-neutral-200 bg-white px-3 py-1 text-[11px] text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300 dark:hover:border-neutral-600 dark:hover:text-neutral-100"
                onClick={() => setIsProcessModalOpen(true)}
              >
                共 {processTimelineItems.length} 条过程
              </button>
            ) : null}
          </div>

          {interactionNode ? (
            <div data-chat-v2-run-card-interaction="true">{interactionNode}</div>
          ) : null}
          {hasProcessItems ? (
            <section
              data-chat-v2-run-card-process-preview="true"
              className="rounded-2xl bg-neutral-50 px-3 py-1.5 dark:bg-neutral-950/80"
            >
              <div className="space-y-0.5">
                {processPreviewItems.map((item) => (
                  <div
                    key={item.id}
                    data-chat-v2-run-card-process-item={item.kind}
                    className="flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-neutral-700 dark:text-neutral-300"
                  >
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="shrink-0 rounded-full border border-neutral-200 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.06em] text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                        {resolveProcessPreviewLabel(item.title)}
                      </span>
                      <span className="shrink-0 text-[10px] text-neutral-400 dark:text-neutral-500">
                        {item.timestamp ? new Date(item.timestamp).toLocaleTimeString('zh-CN', {
                          hour12: false,
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        }) : ''}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1 truncate text-neutral-700 dark:text-neutral-300">
                      {normalizePreviewText(item.body)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {todoPanelItems && todoPanelItems.length > 0 ? (
            <section
              data-chat-v2-run-card-todo-panel="true"
              className="rounded-2xl bg-violet-50/60 px-4 py-2 dark:bg-violet-950/30"
            >
              <TodoListContent todos={todoPanelItems} compact />
            </section>
          ) : null}

          {relatedFiles.length > 0 ? (
            <section
              data-chat-v2-run-card-related-files="true"
              className=""
            >
              <div className="flex flex-wrap gap-2">
                {relatedFiles.map((file) => (
                  <button
                    key={file.filePath}
                    type="button"
                    title={file.filePath}
                    data-chat-v2-run-card-related-file={file.filePath}
                    onClick={() => onFileOpen?.(file.filePath)}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-700 transition hover:border-neutral-300 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300 dark:hover:border-neutral-600 dark:hover:text-neutral-100"
                  >
                    <span className="truncate">{file.fileName}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <div data-chat-v2-run-card-response="true" className="space-y-3 text-sm leading-7 text-neutral-800 dark:text-neutral-200">
            {responseSegments.map((segment) => (
              <div
                key={segment.id}
                data-chat-v2-run-card-response-segment={segment.kind}
                className={''}
              >
                <RuntimeMarkdown className="max-w-none prose prose-sm dark:prose-invert">
                  {segment.body}
                </RuntimeMarkdown>
              </div>
            ))}
          </div>
        </article>
      </div>

      {isProcessModalOpen && hasProcessItems ? (
        <div
          data-chat-v2-run-card-process-modal="true"
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
        >
          <div
            className="fixed inset-0 backdrop-blur-sm bg-black/60"
            onClick={() => setIsProcessModalOpen(false)}
          />
          <div
            className="relative flex h-[min(88vh,960px)] w-[min(96vw,1080px)] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900"
            role="dialog"
            aria-modal="true"
            aria-label="完整过程时间轴"
          >
            <div className="flex justify-between items-center px-5 py-4 border-b border-neutral-200 dark:border-neutral-800">
              <div className="space-y-1">
                <div className="text-base font-semibold text-neutral-900 dark:text-neutral-100">完整过程时间轴</div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">共 {processTimelineItems.length} 条过程事件，按时间顺序查看</div>
              </div>
              <button
                type="button"
                className="rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300 dark:hover:border-neutral-600 dark:hover:text-neutral-100"
                onClick={() => setIsProcessModalOpen(false)}
              >
                关闭
              </button>
            </div>
            <div
              ref={modalScrollContainerRef}
              className="flex-1 overflow-y-auto bg-neutral-50/80 px-5 py-5 dark:bg-neutral-950/70"
            >
              <RunCardProcessTimeline items={processTimelineItems} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default RunCard;
