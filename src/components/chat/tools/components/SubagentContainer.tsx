import React from 'react';
import type { SubagentChildTool, SubagentProgressState } from '../../types/types';
import { ToolHistoryDisclosure } from './ToolHistoryDisclosure';
import { buildSubagentProgressView, buildSubagentToolHistoryEntries } from './subagentProgressView';

interface SubagentContainerProps {
  toolInput: unknown;
  toolResult?: { content?: unknown; isError?: boolean } | null;
  subagentState: {
    childTools: SubagentChildTool[];
    currentToolIndex: number;
    isComplete: boolean;
    progress?: SubagentProgressState | null;
  };
}

function parseObjectLikeInput(input: unknown) {
  if (typeof input === 'string') {
    try {
      return JSON.parse(input);
    } catch {
      return {};
    }
  }

  return input || {};
}

const getCompactToolDisplay = (toolName: string, toolInput: unknown): string => {
  const input = parseObjectLikeInput(toolInput);

  switch (toolName) {
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'ApplyPatch':
      return input.file_path?.split('/').pop() || input.file_path || '';
    case 'Grep':
    case 'Glob':
      return input.pattern || '';
    case 'Bash': {
      const cmd = input.command || '';
      return cmd.length > 40 ? `${cmd.slice(0, 40)}...` : cmd;
    }
    case 'Task':
      return input.description || input.subagent_type || '';
    case 'WebFetch':
    case 'WebSearch':
      return input.url || input.query || '';
    default:
      return '';
  }
};

function getStatusClasses(tone: ReturnType<typeof buildSubagentProgressView>['status']['tone']) {
  switch (tone) {
    case 'completed':
      return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300';
    case 'degraded':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
    case 'failed':
      return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
    case 'running':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300';
  }
}

function getTimelineDotClasses(status?: string) {
  switch (status) {
    case 'completed':
      return 'bg-green-400 dark:bg-green-500';
    case 'failed':
      return 'bg-red-400 dark:bg-red-500';
    case 'waiting':
      return 'bg-blue-400 dark:bg-blue-500';
    default:
      return 'bg-amber-400 dark:bg-amber-500';
  }
}

function normalizeToolResultContent(content: unknown) {
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        const textParts = parsed
          .filter((part: any) => part.type === 'text' && part.text)
          .map((part: any) => part.text);

        if (textParts.length > 0) {
          return textParts.join('\n');
        }
      }
    } catch {
      return content;
    }

    return content;
  }

  if (Array.isArray(content)) {
    const textParts = content
      .filter((part: any) => part.type === 'text' && part.text)
      .map((part: any) => part.text);

    if (textParts.length > 0) {
      return textParts.join('\n');
    }
  }

  return content;
}

export const SubagentContainer: React.FC<SubagentContainerProps> = ({
  toolInput,
  toolResult,
  subagentState,
}) => {
  const parsedInput = parseObjectLikeInput(toolInput);
  const description = parsedInput?.description || 'Running task';
  const prompt = parsedInput?.prompt || '';
  const { childTools, currentToolIndex, isComplete, progress } = subagentState;
  const progressView = buildSubagentProgressView(progress, isComplete, Boolean(toolResult?.isError));
  const rawResult = normalizeToolResultContent(toolResult?.content);
  const historyEntries = buildSubagentToolHistoryEntries(childTools, currentToolIndex);

  return (
    <div className="space-y-2 py-1 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${getStatusClasses(progressView.status.tone)}`}>
          {progressView.status.label}
        </span>
        <span className="font-medium text-gray-800 dark:text-gray-100">{description}</span>
        {progressView.outputFileName && (
          <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 font-mono text-[11px] text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            {progressView.outputFileName}
          </span>
        )}
      </div>

      {progressView.headlineStats.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {progressView.headlineStats.map(stat => (
            <span
              key={stat}
              className="inline-flex items-center rounded-full border border-gray-200/80 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-600 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-300"
            >
              {stat}
            </span>
          ))}
        </div>
      )}

      {progressView.recentSteps.length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400">最近步骤</div>
          <div className="space-y-1">
            {progressView.recentSteps.map((event, index) => (
              <div key={`${event.kind}-${event.timestamp || index}`} className="flex items-start gap-2 text-[11px] text-gray-600 dark:text-gray-300">
                <span className={`mt-1 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full ${getTimelineDotClasses(event.status)}`} />
                <span className="min-w-0 flex-1 break-words">{event.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {progressView.warningItems.length > 0 && (
        <div className="rounded-md border border-amber-200/70 bg-amber-50/70 px-2 py-1.5 text-[11px] text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-200">
          <div className="mb-1 font-medium">Warning</div>
          <div className="space-y-1">
            {progressView.warningItems.map((warning, index) => (
              <div key={`${warning.kind}-${index}`} className="break-words">
                {warning.message}
              </div>
            ))}
            {progressView.warningOverflowCount > 0 && (
              <div className="text-[10px] text-amber-700/80 dark:text-amber-200/80">
                另有 {progressView.warningOverflowCount} 条
              </div>
            )}
          </div>
        </div>
      )}

      {progressView.resultPreview && (
        <div className="rounded-md border border-gray-200/70 bg-white/80 px-2 py-1.5 text-[11px] text-gray-600 dark:border-gray-700 dark:bg-gray-950/20 dark:text-gray-300">
          <div className="mb-1 font-medium text-gray-700 dark:text-gray-200">结果摘要</div>
          <div className="line-clamp-4 whitespace-pre-wrap break-words">{progressView.resultPreview}</div>
        </div>
      )}

      {prompt && (
        <details className="text-[11px] text-gray-500 dark:text-gray-400">
          <summary className="cursor-pointer select-none font-medium">任务说明</summary>
          <div className="mt-1 whitespace-pre-wrap break-words">{prompt}</div>
        </details>
      )}

      {childTools.length > 0 && (
        <ToolHistoryDisclosure
          title="工具历史"
          entries={childTools.map((child, index) => ({
            id: child.toolId,
            title: child.toolName,
            detail: getCompactToolDisplay(child.toolName, child.toolInput),
            status: historyEntries[index]?.status,
          }))}
        />
      )}

      {isComplete && toolResult && (
        <details className="rounded-md border border-gray-200/70 bg-white/70 px-2 py-1.5 text-[11px] text-gray-600 dark:border-gray-700 dark:bg-gray-950/20 dark:text-gray-300">
          <summary className="cursor-pointer select-none font-medium text-gray-700 dark:text-gray-200">
            {progressView.resultDisplayMode === 'preview' ? '完整结果（已折叠）' : '原始结果'}
          </summary>
          <div className="mt-2">
            {typeof rawResult === 'string' ? (
              <div className="whitespace-pre-wrap break-words">{rawResult}</div>
            ) : rawResult ? (
              <pre className="whitespace-pre-wrap break-words font-mono text-[11px]">
                {JSON.stringify(rawResult, null, 2)}
              </pre>
            ) : null}
          </div>
        </details>
      )}
    </div>
  );
};
