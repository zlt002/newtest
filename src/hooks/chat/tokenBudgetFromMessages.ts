import type { NormalizedMessage } from '@stores/useSessionStore';

export interface DerivedTokenBudget {
  used: number;
  total: number;
  percentage: number;
  source: 'result_usage' | 'compact_boundary';
  compacted: boolean;
  lastCompactionPreTokens?: number;
}

const DEFAULT_CONTEXT_WINDOW = 160000;
const MIN_COMPACT_BASELINE_TOKENS = 1200;
const COMPACT_BASELINE_RATIO = 0.18;
const COMPACT_BASELINE_PREVIOUS_RATIO = 0.35;

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readContextTokensFromModelUsage(modelUsage: unknown): number | null {
  if (!modelUsage || typeof modelUsage !== 'object') {
    return null;
  }

  const usageEntries = Object.values(modelUsage as Record<string, unknown>);
  if (usageEntries.length === 0) {
    return null;
  }

  let totalContextTokens = 0;
  let hasDetailedContextTokens = false;

  for (const entry of usageEntries) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const usageData = entry as {
      inputTokens?: unknown;
      cacheCreationInputTokens?: unknown;
      cacheReadInputTokens?: unknown;
      totalTokens?: unknown;
    };

    const inputTokens = toFiniteNumber(usageData.inputTokens) ?? 0;
    const cacheCreationTokens = toFiniteNumber(usageData.cacheCreationInputTokens) ?? 0;
    const cacheReadTokens = toFiniteNumber(usageData.cacheReadInputTokens) ?? 0;
    const contextTokens = inputTokens + cacheCreationTokens + cacheReadTokens;

    if (contextTokens > 0) {
      totalContextTokens += contextTokens;
      hasDetailedContextTokens = true;
      continue;
    }

    const totalTokens = toFiniteNumber(usageData.totalTokens);
    if (totalTokens && totalTokens > 0) {
      totalContextTokens += totalTokens;
    }
  }

  if (hasDetailedContextTokens && totalContextTokens > 0) {
    return totalContextTokens;
  }

  return totalContextTokens > 0 ? totalContextTokens : null;
}

function readContextTokensFromUsage(usage: unknown, modelUsage?: unknown): number | null {
  if (!usage || typeof usage !== 'object') {
    return readContextTokensFromModelUsage(modelUsage);
  }

  const usageData = usage as {
    input_tokens?: unknown;
    cache_creation_input_tokens?: unknown;
    cache_read_input_tokens?: unknown;
    total_tokens?: unknown;
  };

  const inputTokens = toFiniteNumber(usageData.input_tokens) ?? 0;
  const cacheCreationTokens = toFiniteNumber(usageData.cache_creation_input_tokens) ?? 0;
  const cacheReadTokens = toFiniteNumber(usageData.cache_read_input_tokens) ?? 0;
  const contextTokens = inputTokens + cacheCreationTokens + cacheReadTokens;

  if (contextTokens > 0) {
    return contextTokens;
  }

  const totalTokens = toFiniteNumber(usageData.total_tokens);
  if (totalTokens && totalTokens > 0) {
    return totalTokens;
  }

  return readContextTokensFromModelUsage(modelUsage);
}

function estimateCompactedUsage(preCompactTokens: number, previousUsed: number | null): number {
  const ratioBaseline = Math.round(preCompactTokens * COMPACT_BASELINE_RATIO);
  const previousBaseline =
    previousUsed && previousUsed > 0
      ? Math.round(previousUsed * COMPACT_BASELINE_PREVIOUS_RATIO)
      : ratioBaseline;

  const estimated = Math.min(ratioBaseline, previousBaseline);
  return Math.max(MIN_COMPACT_BASELINE_TOKENS, estimated);
}

function resolveContextWindow(explicitTotal?: number): number {
  if (Number.isFinite(explicitTotal) && explicitTotal && explicitTotal > 0) {
    return explicitTotal;
  }

  if (typeof process !== 'undefined' && process?.env?.CONTEXT_WINDOW) {
    const parsed = Number.parseInt(process.env.CONTEXT_WINDOW, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return DEFAULT_CONTEXT_WINDOW;
}

export function deriveTokenBudgetFromMessages(
  messages: NormalizedMessage[],
  {
    total = DEFAULT_CONTEXT_WINDOW,
  }: {
    total?: number;
  } = {},
): DerivedTokenBudget | null {
  if (!Array.isArray(messages) || messages.length === 0) {
    return null;
  }

  let currentUsed: number | null = null;
  let source: DerivedTokenBudget['source'] | null = null;
  let compacted = false;
  let lastCompactionPreTokens: number | undefined;

  for (const message of messages) {
    if (message.kind === 'result') {
      // Skip compaction runs — they report the operation's own token cost, not the post-compact context size
      if (message.isCompactOperation) {
        continue;
      }
      const usageTokens = readContextTokensFromUsage(message.usage, message.modelUsage);
      if (usageTokens && usageTokens > 0) {
        currentUsed = usageTokens;
        source = 'result_usage';
        compacted = false;
      }
      continue;
    }

    if (message.kind === 'compact_boundary') {
      const preCompactTokens = toFiniteNumber(message.tokens);
      if (preCompactTokens && preCompactTokens > 0) {
        currentUsed = estimateCompactedUsage(preCompactTokens, currentUsed);
        source = 'compact_boundary';
        compacted = true;
        lastCompactionPreTokens = preCompactTokens;
      }
    }
  }

  if (!currentUsed || currentUsed <= 0 || !source) {
    return null;
  }

  const resolvedTotal = resolveContextWindow(total);
  const percentage = resolvedTotal > 0 ? Number(((currentUsed / resolvedTotal) * 100).toFixed(1)) : 0;

  return {
    used: currentUsed,
    total: resolvedTotal,
    percentage,
    source,
    compacted,
    ...(lastCompactionPreTokens ? { lastCompactionPreTokens } : {}),
  };
}
