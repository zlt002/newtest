import React from 'react';
import type { RunCardProcessItem } from '../types/runCard.js';
import { RuntimeMarkdown } from './RuntimeMarkdown';

type ProcessGroupKey = 'primary' | 'status' | 'auxiliary';

type ProcessGroup = {
  key: ProcessGroupKey;
  title: string;
  summary: string;
  items: RenderableTimelineEntry[];
};

type TimelineSingleEntry = {
  type: 'single';
  item: RunCardProcessItem;
};

type TimelineToolChainEntry = {
  type: 'tool-chain';
  use: RunCardProcessItem;
  result: RunCardProcessItem;
};

type RenderableTimelineEntry = TimelineSingleEntry | TimelineToolChainEntry;

function resolveToneClasses(tone: RunCardProcessItem['tone']) {
  switch (tone) {
    case 'danger':
      return 'border-red-200 bg-red-50 text-red-800';
    case 'warning':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    case 'success':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    default:
      return 'border-neutral-200 bg-neutral-50 text-neutral-800';
  }
}

function resolveGroupKey(item: RunCardProcessItem): ProcessGroupKey {
  if (item.kind === 'debug_ref' || item.kind === 'compact_boundary') {
    return 'auxiliary';
  }

  if (
    item.kind === 'session_status' ||
    item.kind === 'subagent_progress' ||
    item.kind === 'interactive_prompt' ||
    item.kind === 'permission_request' ||
    item.kind === 'notice'
  ) {
    return 'status';
  }

  return 'primary';
}

function resolveGroupMeta(key: ProcessGroupKey, count: number) {
  switch (key) {
    case 'primary':
      return {
        title: '主流程',
        summary: `${count} 条思考/工具链`,
      };
    case 'status':
      return {
        title: '状态与互动',
        summary: `${count} 条状态/互动`,
      };
    case 'auxiliary':
      return {
        title: '附属信息',
        summary: `${count} 条附属信息`,
      };
    default:
      return {
        title: '过程',
        summary: `${count} 条过程`,
      };
  }
}

function resolveItemLabel(item: RunCardProcessItem) {
  switch (item.kind) {
    case 'thinking':
      return '思考';
    case 'tool_use':
      return '工具调用';
    case 'tool_result':
      return '工具结果';
    case 'subagent_progress':
      return '子代理进度';
    case 'session_status':
      return '会话状态';
    case 'interactive_prompt':
      return '交互提问';
    case 'permission_request':
      return '权限请求';
    case 'debug_ref':
      return '调试引用';
    case 'compact_boundary':
      return '压缩边界';
    case 'notice':
      return '阶段更新';
    default:
      return item.title;
  }
}

function tryFormatJson(body: string): string | null {
  const trimmed = body.trim();
  const looksLikeJson = (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
  if (!looksLikeJson) return null;
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return null;
  }
}

/**
 * Detect and strip cat -n style line numbers (e.g. "1  # Title", "2  ", "3  ## Sub")
 * so that markdown content from read_file results can render correctly.
 */
function stripLineNumbers(body: string): string {
  const lines = body.split('\n');
  if (lines.length < 3) return body;

  let expectedNum = 1;
  let checked = 0;
  let isNumbered = true;

  for (const line of lines) {
    if (checked >= 8) break;
    if (line.trim() === '') {
      checked++;
      continue;
    }
    const match = line.match(/^\s*(\d+)\s+(.*)$/);
    if (!match || parseInt(match[1], 10) !== expectedNum) {
      isNumbered = false;
      break;
    }
    expectedNum++;
    checked++;
  }

  if (!isNumbered) return body;

  return lines.map(line => {
    const match = line.match(/^\s*\d+\s+(.*)$/);
    return match ? match[1] : line;
  }).join('\n');
}

type ProcessBodyProps = {
  body: string;
  variant?: 'neutral' | 'emerald' | 'slate';
};

function ProcessBody({ body, variant = 'neutral' }: ProcessBodyProps) {
  const formattedJson = tryFormatJson(body);
  if (formattedJson) {
    const variantClasses = {
      neutral: 'border-neutral-200 bg-neutral-100 text-neutral-800',
      emerald: 'border-emerald-200 bg-emerald-50/60 text-emerald-900',
      slate: 'border-slate-200 bg-slate-100 text-slate-800',
    };
    return (
      <pre className={`mt-1 overflow-x-auto rounded-lg border p-3 font-mono text-xs leading-5 ${variantClasses[variant]}`}>
        {formattedJson}
      </pre>
    );
  }

  if (variant === 'slate') {
    const cleaned = stripLineNumbers(body);
    return (
      <div className="mt-1 text-sm leading-6 text-slate-800">
        <RuntimeMarkdown className="prose prose-sm max-w-none">{cleaned}</RuntimeMarkdown>
      </div>
    );
  }

  return <div className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-current">{body}</div>;
}

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function toRenderableEntries(items: RunCardProcessItem[]) {
  const entries: RenderableTimelineEntry[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const current = items[index];
    const next = items[index + 1];

    if (current.kind === 'tool_use' && next?.kind === 'tool_result') {
      entries.push({
        type: 'tool-chain',
        use: current,
        result: next,
      });
      index += 1;
      continue;
    }

    entries.push({
      type: 'single',
      item: current,
    });
  }

  return entries;
}

function groupEntries(items: RunCardProcessItem[]): ProcessGroup[] {
  const seed: Record<ProcessGroupKey, RenderableTimelineEntry[]> = {
    primary: [],
    status: [],
    auxiliary: [],
  };

  for (const entry of toRenderableEntries(items)) {
    const key = entry.type === 'tool-chain' ? 'primary' : resolveGroupKey(entry.item);
    seed[key].push(entry);
  }

  return (['primary', 'status', 'auxiliary'] as ProcessGroupKey[])
    .map((key) => ({
      key,
      ...resolveGroupMeta(key, seed[key].length),
      items: seed[key],
    }))
    .filter((group) => group.items.length > 0);
}

function renderSingleItem(item: RunCardProcessItem) {
  return (
    <div
      key={item.id}
      data-chat-v2-run-card-process-item={item.kind}
      className={`rounded-2xl border px-4 py-3 shadow-sm ${resolveToneClasses(item.tone)}`}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="border-current/10 inline-flex items-center rounded-full border bg-white/70 px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em]">
          {resolveItemLabel(item)}
        </div>
        <div className="text-[11px] opacity-70">{formatTimestamp(item.timestamp)}</div>
      </div>
      <div className="text-xs font-medium text-neutral-500">{item.title}</div>
      <ProcessBody body={item.body} variant="neutral" />
    </div>
  );
}

function renderToolChain(entry: TimelineToolChainEntry) {
  return (
    <div
      key={`${entry.use.id}:${entry.result.id}`}
      data-chat-v2-run-card-process-combo="tool-chain"
      className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm"
    >
      <div className="grid gap-px bg-emerald-100">
        <div className="bg-emerald-50 px-4 py-3 text-emerald-900">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="inline-flex items-center rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-emerald-700">
              工具调用
            </div>
            <div className="text-[11px] text-emerald-700/80">{formatTimestamp(entry.use.timestamp)}</div>
          </div>
          <div className="text-xs font-medium text-emerald-700/80">{entry.use.title}</div>
          <ProcessBody body={entry.use.body} variant="emerald" />
        </div>
        <div className="bg-slate-50 px-4 py-3 text-slate-800">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-slate-600">
              工具结果
            </div>
            <div className="text-[11px] text-slate-500">{formatTimestamp(entry.result.timestamp)}</div>
          </div>
          <div className="text-xs font-medium text-slate-500">{entry.result.title}</div>
          <ProcessBody body={entry.result.body} variant="slate" />
        </div>
      </div>
    </div>
  );
}

export function RunCardProcessTimeline({
  items,
}: {
  items: RunCardProcessItem[];
}) {
  if (items.length === 0) {
    return null;
  }

  const groups = groupEntries(items);

  return (
    <div data-chat-v2-run-card-process-timeline="true" className="space-y-5">
      {groups.map((group) => (
        <section
          key={group.key}
          data-chat-v2-run-card-process-group={group.key}
          className="rounded-3xl border border-neutral-200 bg-white/80 p-4 shadow-sm"
        >
          <div className="mb-3 flex items-center justify-between gap-3 border-b border-neutral-100 pb-3">
            <div>
              <div className="text-sm font-semibold text-neutral-900">{group.title}</div>
              <div className="text-xs text-neutral-500">{group.summary}</div>
            </div>
            <div className="rounded-full bg-neutral-100 px-3 py-1 text-[11px] text-neutral-600">
              {group.items.length} 项
            </div>
          </div>
          <div className="space-y-3">
            {group.items.map((entry) => (entry.type === 'tool-chain'
              ? renderToolChain(entry)
              : renderSingleItem(entry.item)))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default RunCardProcessTimeline;
