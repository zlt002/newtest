function normalizeTitle(title) {
  return typeof title === 'string' && title.trim() ? title.trim() : null;
}

const DEFAULT_HISTORY_PAGE_SIZE = 40;

function parsePageSize(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value !== 'string') {
    throw new Error('limit must be a positive integer');
  }

  if (!/^(?:[1-9]\d*)$/.test(value)) {
    throw new Error('limit must be a positive integer');
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error('limit is too large');
  }

  return parsed;
}

function parsePageOffset(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value !== 'string') {
    throw new Error('offset must be a non-negative integer');
  }

  if (!/^(?:0|[1-9]\d*)$/.test(value)) {
    throw new Error('offset must be a non-negative integer');
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error('offset is too large');
  }

  return parsed;
}

async function resolveDebugLogAvailability({ sessionId, debugLog, hasSessionLogs }) {
  try {
    if (typeof debugLog?.hasSessionLogs === 'function') {
      return Boolean(await debugLog.hasSessionLogs(sessionId));
    }

    if (typeof hasSessionLogs === 'function') {
      return Boolean(await hasSessionLogs(sessionId));
    }
  } catch {
    return false;
  }

  return false;
}

function normalizeDiagnosticCount(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function resolveHistorySourceCoverage({ agentMessageCount, debugAugmentedCount }) {
  if (debugAugmentedCount > 0) {
    return 'official+agent+debug';
  }

  if (agentMessageCount > 0) {
    return 'official+agent';
  }

  return 'official-only';
}

export function createSessionHistoryService({
  officialHistoryReader,
  sessionNamesDb = null,
  debugLog = null,
  hasSessionLogs = null,
  provider = 'claude',
} = {}) {
  return {
    async getSessionHistory({ sessionId, limit = null, offset = null, full = false } = {}) {
      const normalizedSessionId = String(sessionId || '').trim();
      const parsedLimit = parsePageSize(limit);
      const parsedOffset = parsePageOffset(offset);
      const officialHistory = typeof officialHistoryReader?.readSession === 'function'
        ? await officialHistoryReader.readSession({ sessionId: normalizedSessionId })
        : null;
      const messages = Array.isArray(officialHistory?.messages) ? officialHistory.messages : [];
      const total = messages.length;
      const effectiveLimit = Boolean(full)
        ? null
        : (parsedLimit ?? DEFAULT_HISTORY_PAGE_SIZE);
      const shouldReturnFull = Boolean(full);
      let page = null;
      let pagedMessages = messages;

      if (!shouldReturnFull) {
        const effectiveOffset = parsedOffset === null
          ? Math.max(0, total - effectiveLimit)
          : Math.min(parsedOffset, total);
        const endIndex = Math.min(total, effectiveOffset + effectiveLimit);
        pagedMessages = messages.slice(effectiveOffset, endIndex);
        // hasMore means there are still earlier messages before this page.
        page = {
          offset: effectiveOffset,
          limit: effectiveLimit,
          returned: pagedMessages.length,
          total,
          hasMore: effectiveOffset > 0 && effectiveOffset < total,
        };
      } else {
        page = {
          offset: 0,
          limit: null,
          returned: total,
          total,
          hasMore: false,
        };
      }

      const title = typeof sessionNamesDb?.getName === 'function'
        ? normalizeTitle(sessionNamesDb.getName(normalizedSessionId, provider))
        : null;
      const diagnostics = officialHistory?.diagnostics && typeof officialHistory.diagnostics === 'object'
        ? officialHistory.diagnostics
        : {};
      const agentMessageCount = normalizeDiagnosticCount(diagnostics.agentMessageCount);
      const debugAugmentedCount = normalizeDiagnosticCount(diagnostics.debugAugmentedCount);

      const history = {
        sessionId: normalizedSessionId,
        cwd: officialHistory?.cwd ?? null,
        metadata: {
          title,
          pinned: false,
          starred: false,
          lastViewedAt: null,
        },
        messages: pagedMessages,
        diagnosticsSummary: {
          officialMessageCount: total,
          debugLogAvailable: await resolveDebugLogAvailability({
            sessionId: normalizedSessionId,
            debugLog,
            hasSessionLogs,
          }),
          agentMessageCount,
          debugAugmentedCount,
          historySourceCoverage: resolveHistorySourceCoverage({
            agentMessageCount,
            debugAugmentedCount,
          }),
        },
      };

      if (page) {
        history.page = page;
      }

      return history;
    },
  };
}
