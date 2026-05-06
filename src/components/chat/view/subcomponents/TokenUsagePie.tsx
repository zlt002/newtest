import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { authenticatedFetch } from '../../../../utils/api';

type ContextUsageCategory = {
  name: string;
  tokens: number;
  color: string;
  isDeferred?: boolean;
};

type MessageBreakdown = {
  toolCallTokens?: number;
  toolResultTokens?: number;
  attachmentTokens?: number;
  assistantMessageTokens?: number;
  userMessageTokens?: number;
  redirectedContextTokens?: number;
  unattributedTokens?: number;
  toolCallsByType?: {
    name: string;
    callTokens?: number;
    resultTokens?: number;
  }[];
  attachmentsByType?: {
    name: string;
    tokens?: number;
  }[];
};

type MemoryFileUsage = {
  path: string;
  type?: string;
  tokens?: number;
};

type McpToolUsage = {
  name: string;
  serverName?: string;
  tokens?: number;
  isLoaded?: boolean;
};

type SystemToolUsage = {
  name: string;
  tokens?: number;
  isLoaded?: boolean;
};

type SystemPromptSectionUsage = {
  name: string;
  tokens?: number;
};

type AgentUsage = {
  agentType: string;
  source?: string;
  tokens?: number;
};

type SkillUsage = {
  name: string;
  source?: string;
  tokens?: number;
};

type ContextUsageDetail = {
  totalTokens?: number;
  maxTokens?: number;
  rawMaxTokens?: number;
  percentage?: number;
  categories?: ContextUsageCategory[];
  memoryFiles?: MemoryFileUsage[];
  mcpTools?: McpToolUsage[];
  deferredBuiltinTools?: SystemToolUsage[];
  systemTools?: SystemToolUsage[];
  systemPromptSections?: SystemPromptSectionUsage[];
  agents?: AgentUsage[];
  slashCommands?: {
    totalCommands?: number;
    includedCommands?: number;
    tokens?: number;
  };
  skills?: {
    includedSkills?: number;
    totalSkills?: number;
    tokens?: number;
    skillFrontmatter?: SkillUsage[];
  };
  messageBreakdown?: MessageBreakdown;
  apiUsage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  } | null;
};

type TokenBudgetBreakdown = {
  input?: number;
  cacheCreation?: number;
  cacheRead?: number;
};

type TokenUsagePieProps = {
  used: number;
  total: number;
  sessionId?: string | null;
  contextUsage?: ContextUsageDetail | null;
  fallbackBudget?: {
    breakdown?: TokenBudgetBreakdown;
  } | null;
};

type DisplayCategory = ContextUsageCategory & {
  percentage: number;
  count?: number;
};

type DetailRow = {
  name: string;
  tokens: number;
  percentage: number;
  meta?: string;
  isDeferred?: boolean;
};

type PanelPosition = {
  top: number;
  left: number;
  width: number;
};

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatCompactTokens(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0';
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }

  return Math.round(value).toLocaleString();
}

function formatPathTail(path: string): string {
  const normalized = String(path || '').replace(/\\/g, '/');
  const tail = normalized.split('/').filter(Boolean).pop();
  return tail || normalized || 'Memory file';
}

function pushDetailRow(
  rows: DetailRow[],
  totalTokens: number,
  name: string,
  tokens: unknown,
  options: { meta?: string; isDeferred?: boolean } = {},
) {
  const tokenCount = Math.max(0, toFiniteNumber(tokens) ?? 0);
  if (tokenCount <= 0) {
    return;
  }

  rows.push({
    name,
    tokens: tokenCount,
    percentage: totalTokens > 0 ? (tokenCount / totalTokens) * 100 : 0,
    ...options,
  });
}

function buildMessageDetailRows(contextUsage: ContextUsageDetail | null, totalTokens: number): DetailRow[] {
  const breakdown = contextUsage?.messageBreakdown;
  const rows: DetailRow[] = [];
  if (!breakdown) {
    return rows;
  }

  pushDetailRow(rows, totalTokens, 'User messages', breakdown.userMessageTokens);
  pushDetailRow(rows, totalTokens, 'Assistant messages', breakdown.assistantMessageTokens);
  pushDetailRow(rows, totalTokens, 'Tool calls', breakdown.toolCallTokens);
  pushDetailRow(rows, totalTokens, 'Tool results', breakdown.toolResultTokens);
  pushDetailRow(rows, totalTokens, 'Attachments', breakdown.attachmentTokens);
  pushDetailRow(rows, totalTokens, 'Redirected context', breakdown.redirectedContextTokens);
  pushDetailRow(rows, totalTokens, 'Unattributed', breakdown.unattributedTokens);

  for (const tool of breakdown.toolCallsByType || []) {
    pushDetailRow(rows, totalTokens, `${tool.name} call`, tool.callTokens);
    pushDetailRow(rows, totalTokens, `${tool.name} result`, tool.resultTokens);
  }
  for (const attachment of breakdown.attachmentsByType || []) {
    pushDetailRow(rows, totalTokens, `Attachment: ${attachment.name}`, attachment.tokens);
  }

  return rows;
}

function buildSubcategoryRows(
  categoryName: string,
  contextUsage: ContextUsageDetail | null,
  totalTokens: number,
): DetailRow[] {
  if (!contextUsage) {
    return [];
  }

  const rows: DetailRow[] = [];
  const normalizedName = categoryName.toLowerCase();

  if (normalizedName.includes('message')) {
    return buildMessageDetailRows(contextUsage, totalTokens);
  }

  if (normalizedName.includes('mcp')) {
    for (const tool of contextUsage.mcpTools || []) {
      const label = tool.serverName ? `${tool.serverName}:${tool.name}` : tool.name;
      pushDetailRow(rows, totalTokens, label, tool.tokens, {
        isDeferred: tool.isLoaded === false,
      });
    }
    return rows;
  }

  if (normalizedName.includes('memory')) {
    for (const file of contextUsage.memoryFiles || []) {
      pushDetailRow(rows, totalTokens, formatPathTail(file.path), file.tokens, {
        meta: file.type,
      });
    }
    return rows;
  }

  if (normalizedName.includes('system prompt')) {
    for (const section of contextUsage.systemPromptSections || []) {
      pushDetailRow(rows, totalTokens, section.name, section.tokens);
    }
    return rows;
  }

  if (normalizedName.includes('agent')) {
    for (const agent of contextUsage.agents || []) {
      pushDetailRow(rows, totalTokens, agent.agentType, agent.tokens, {
        meta: agent.source,
      });
    }
    return rows;
  }

  if (normalizedName.includes('skill')) {
    for (const skill of contextUsage.skills?.skillFrontmatter || []) {
      pushDetailRow(rows, totalTokens, skill.name, skill.tokens, {
        meta: skill.source,
      });
    }
    return rows;
  }

  if (normalizedName.includes('slash')) {
    pushDetailRow(rows, totalTokens, 'Included slash commands', contextUsage.slashCommands?.tokens, {
      meta:
        typeof contextUsage.slashCommands?.includedCommands === 'number'
          && typeof contextUsage.slashCommands?.totalCommands === 'number'
          ? `${contextUsage.slashCommands.includedCommands}/${contextUsage.slashCommands.totalCommands}`
          : undefined,
    });
    return rows;
  }

  if ((normalizedName.includes('system') && normalizedName.includes('tool')) || normalizedName === 'tools') {
    for (const tool of contextUsage.systemTools || []) {
      pushDetailRow(rows, totalTokens, tool.name, tool.tokens, {
        isDeferred: tool.isLoaded === false,
      });
    }
    for (const tool of contextUsage.deferredBuiltinTools || []) {
      pushDetailRow(rows, totalTokens, tool.name, tool.tokens, {
        isDeferred: tool.isLoaded === false,
      });
    }
  }

  return rows;
}

function buildFallbackCategories(used: number, fallbackBudget?: TokenUsagePieProps['fallbackBudget']): ContextUsageCategory[] {
  const breakdown = fallbackBudget?.breakdown;
  const inputTokens = toFiniteNumber(breakdown?.input) ?? 0;
  const cacheCreationTokens = toFiniteNumber(breakdown?.cacheCreation) ?? 0;
  const cacheReadTokens = toFiniteNumber(breakdown?.cacheRead) ?? 0;
  const rows: ContextUsageCategory[] = [];

  if (inputTokens > 0) {
    rows.push({ name: 'Messages', tokens: inputTokens, color: '#5b8def' });
  }
  if (cacheCreationTokens > 0) {
    rows.push({ name: 'Cache writes', tokens: cacheCreationTokens, color: '#8ab4f8' });
  }
  if (cacheReadTokens > 0) {
    rows.push({ name: 'Cache reads', tokens: cacheReadTokens, color: '#a7c7f9' });
  }

  if (rows.length === 0 && used > 0) {
    rows.push({ name: 'Messages', tokens: used, color: '#5b8def' });
  }

  return rows;
}

function getCategoryCount(categoryName: string, contextUsage: ContextUsageDetail | null): number | undefined {
  if (!contextUsage) {
    return undefined;
  }

  const normalizedName = categoryName.toLowerCase();
  if (normalizedName.includes('mcp')) {
    return Array.isArray(contextUsage.mcpTools) ? contextUsage.mcpTools.length : undefined;
  }
  if (normalizedName.includes('memory')) {
    return Array.isArray(contextUsage.memoryFiles) ? contextUsage.memoryFiles.length : undefined;
  }
  if (normalizedName.includes('agent')) {
    return Array.isArray(contextUsage.agents) ? contextUsage.agents.length : undefined;
  }
  if (normalizedName.includes('skill')) {
    return contextUsage.skills?.includedSkills;
  }
  if (normalizedName.includes('system tool')) {
    return Array.isArray(contextUsage.systemTools) ? contextUsage.systemTools.length : undefined;
  }

  return undefined;
}

function buildDisplayCategories({
  contextUsage,
  fallbackBudget,
  used,
  total,
}: {
  contextUsage: ContextUsageDetail | null;
  fallbackBudget?: TokenUsagePieProps['fallbackBudget'];
  used: number;
  total: number;
}): {
  usedTokens: number;
  totalTokens: number;
  percentage: number;
  categories: DisplayCategory[];
} {
  const totalTokens = Math.max(
    0,
    toFiniteNumber(contextUsage?.maxTokens)
      ?? toFiniteNumber(contextUsage?.rawMaxTokens)
      ?? total,
  );
  const usedTokens = Math.max(0, toFiniteNumber(contextUsage?.totalTokens) ?? used);
  const sourceCategories = Array.isArray(contextUsage?.categories) && contextUsage.categories.length > 0
    ? contextUsage.categories
    : buildFallbackCategories(usedTokens, fallbackBudget);

  const categories: DisplayCategory[] = sourceCategories
    .map((category) => {
      const tokens = Math.max(0, toFiniteNumber(category.tokens) ?? 0);
      return {
        ...category,
        tokens,
        percentage: totalTokens > 0 ? (tokens / totalTokens) * 100 : 0,
        count: getCategoryCount(category.name, contextUsage),
      };
    })
    .filter((category) => category.tokens > 0);

  const freeTokens = Math.max(0, totalTokens - usedTokens);
  if (freeTokens > 0) {
    categories.push({
      name: 'Free space',
      tokens: freeTokens,
      color: '#d1d5db',
      percentage: totalTokens > 0 ? (freeTokens / totalTokens) * 100 : 0,
    });
  }

  return {
    usedTokens,
    totalTokens,
    percentage: totalTokens > 0 ? (usedTokens / totalTokens) * 100 : 0,
    categories,
  };
}

export default function TokenUsagePie({
  used,
  total,
  sessionId = null,
  contextUsage = null,
  fallbackBudget = null,
}: TokenUsagePieProps) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<PanelPosition>({ top: 12, left: 12, width: 452 });
  const [remoteContextUsage, setRemoteContextUsage] = useState<ContextUsageDetail | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const resolvedContextUsage = remoteContextUsage || contextUsage;
  const percentage = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  const detail = useMemo(
    () => buildDisplayCategories({
      contextUsage: resolvedContextUsage,
      fallbackBudget,
      used,
      total,
    }),
    [fallbackBudget, resolvedContextUsage, total, used],
  );

  const getColor = () => {
    if (percentage < 50) return '#3b82f6';
    if (percentage < 75) return '#f59e0b';
    return '#ef4444';
  };

  const loadLiveDetails = async () => {
    if (!sessionId || remoteContextUsage || contextUsage || isLoadingDetails) {
      return;
    }

    setIsLoadingDetails(true);
    setDetailError(null);
    try {
      const response = await authenticatedFetch(`/api/agent-v2/sessions/${encodeURIComponent(sessionId)}/context-usage`);
      if (!response.ok) {
        throw new Error(`Context usage unavailable (${response.status})`);
      }
      setRemoteContextUsage(await response.json());
    } catch {
      setDetailError('Live context details are unavailable; showing the current estimate.');
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const updatePanelPosition = useCallback(() => {
    const anchor = detailsRef.current?.querySelector('summary');
    if (!anchor || typeof window === 'undefined') {
      return;
    }

    const viewportPadding = 12;
    const gap = 8;
    const maxWidth = 452;
    const estimatedHeight = 260;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(maxWidth, Math.max(280, window.innerWidth - viewportPadding * 2));
    const left = clamp(rect.right - width, viewportPadding, window.innerWidth - width - viewportPadding);
    let top = rect.top - estimatedHeight - gap;

    if (top < viewportPadding) {
      top = rect.bottom + gap;
    }

    setPanelPosition({
      top: clamp(top, viewportPadding, Math.max(viewportPadding, window.innerHeight - viewportPadding)),
      left,
      width,
    });
  }, []);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') {
      return undefined;
    }

    updatePanelPosition();
    window.addEventListener('resize', updatePanelPosition);
    window.addEventListener('scroll', updatePanelPosition, true);

    return () => {
      window.removeEventListener('resize', updatePanelPosition);
      window.removeEventListener('scroll', updatePanelPosition, true);
    };
  }, [isOpen, updatePanelPosition]);

  const panelStyle: CSSProperties = {
    position: 'fixed',
    top: `${panelPosition.top}px`,
    left: `${panelPosition.left}px`,
    width: `${panelPosition.width}px`,
    maxHeight: `min(70vh, calc(100vh - ${panelPosition.top + 12}px))`,
    zIndex: 9999,
  };

  const detailPanel = (
    <div
      className="overflow-y-auto rounded-lg border border-border/70 bg-popover p-3 text-popover-foreground shadow-xl"
      style={panelStyle}
    >
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-muted-foreground">Context window</span>
        <span className="font-mono text-muted-foreground">
          {formatCompactTokens(detail.usedTokens)} / {formatCompactTokens(detail.totalTokens)} ({Math.round(detail.percentage)}%)
        </span>
      </div>

      <div className="mb-2 flex h-1.5 overflow-hidden rounded-full bg-muted">
        {detail.categories.map((category) => (
          <span
            key={`${category.name}-${category.tokens}`}
            className="h-full"
            style={{
              width: `${Math.max(0, Math.min(100, category.percentage))}%`,
              backgroundColor: category.color,
            }}
          />
        ))}
      </div>

      <div className="space-y-1">
        {detail.categories.map((category) => {
          const subRows = buildSubcategoryRows(category.name, resolvedContextUsage, detail.totalTokens);
          return (
            <Fragment key={`${category.name}-${category.tokens}-group`}>
              <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-sm"
                    style={{ backgroundColor: category.color }}
                  />
                  <span className="truncate">{category.name}</span>
                  {category.isDeferred && <span className="text-muted-foreground/70">deferred</span>}
                  {typeof category.count === 'number' && <span className="text-muted-foreground/70">{category.count}</span>}
                </span>
                <span className="font-mono text-muted-foreground">{formatCompactTokens(category.tokens)}</span>
                <span className="w-12 text-right font-mono">{category.percentage.toFixed(1)}%</span>
              </div>
              {subRows.map((row) => (
                <div
                  key={`${category.name}-${row.name}-${row.tokens}`}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-[11px] text-muted-foreground"
                >
                  <span className="flex min-w-0 items-center gap-2 pl-4">
                    <span aria-hidden="true" className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-muted-foreground/30" />
                    <span className="truncate">{row.name}</span>
                    {row.meta && <span className="text-muted-foreground/70">{row.meta}</span>}
                    {row.isDeferred && <span className="text-muted-foreground/70">deferred</span>}
                  </span>
                  <span className="font-mono">{formatCompactTokens(row.tokens)}</span>
                  <span className="w-12 text-right font-mono">{row.percentage.toFixed(1)}%</span>
                </div>
              ))}
            </Fragment>
          );
        })}
      </div>

      {(isLoadingDetails || detailError) && (
        <div className="mt-2 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
          {isLoadingDetails ? 'Loading live context details...' : detailError}
        </div>
      )}

      {resolvedContextUsage?.apiUsage && (
        <div className="mt-2 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
          API usage: input {formatCompactTokens(resolvedContextUsage.apiUsage.input_tokens || 0)}
          {' / '}
          cache read {formatCompactTokens(resolvedContextUsage.apiUsage.cache_read_input_tokens || 0)}
          {' / '}
          cache write {formatCompactTokens(resolvedContextUsage.apiUsage.cache_creation_input_tokens || 0)}
        </div>
      )}
    </div>
  );

  if (used == null || total == null || total <= 0) return null;

  return (
    <details
      ref={detailsRef}
      className="group relative text-xs text-gray-600 dark:text-gray-400"
      onToggle={(event) => {
        if (event.currentTarget.open) {
          setIsOpen(true);
          if (typeof window !== 'undefined') {
            window.requestAnimationFrame(updatePanelPosition);
          }
          void loadLiveDetails();
        } else {
          setIsOpen(false);
        }
      }}
    >
      <summary
        aria-label="Context window details"
        className="flex cursor-pointer list-none items-center gap-2 rounded-md px-1 py-0.5 transition-colors hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/30 [&::-webkit-details-marker]:hidden"
        title={`${used.toLocaleString()} / ${total.toLocaleString()} tokens`}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" className="-rotate-90 transform">
          <circle
            cx="12"
            cy="12"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-gray-300 dark:text-gray-600"
          />
          <circle
            cx="12"
            cy="12"
            r={radius}
            fill="none"
            stroke={getColor()}
            strokeWidth="2"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <span>{percentage.toFixed(1)}%</span>
      </summary>

      {typeof document === 'undefined' ? detailPanel : isOpen ? createPortal(detailPanel, document.body) : null}
    </details>
  );
}
