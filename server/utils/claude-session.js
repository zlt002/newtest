const UUID_V4ISH_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isClaudeSessionIdResumable(sessionId) {
  return typeof sessionId === 'string' && UUID_V4ISH_PATTERN.test(sessionId.trim());
}

function resolveResumeCandidate(options = {}) {
  const candidates = [
    options.sessionId,
    options.conversationId,
    options.agentConversationId,
  ];

  for (const candidate of candidates) {
    const normalized = typeof candidate === 'string' ? candidate.trim() : '';
    if (normalized && isClaudeSessionIdResumable(normalized)) {
      return normalized;
    }
  }

  return null;
}

export function resolveClaudeResumeSessionId(options = {}) {
  const sessionId = resolveResumeCandidate(options);
  if (!sessionId) {
    return null;
  }

  if (options.resume === false) {
    return null;
  }

  if (options.resume === true || options.resume === undefined) {
    return isClaudeSessionIdResumable(sessionId) ? sessionId : null;
  }

  return null;
}

export function shouldResumeClaudeSession(options = {}) {
  return Boolean(resolveClaudeResumeSessionId(options));
}
