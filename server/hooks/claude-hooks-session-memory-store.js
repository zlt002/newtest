function normalizeSessionId(sessionId) {
  return typeof sessionId === 'string' ? sessionId.trim() : '';
}

export function createClaudeHooksSessionMemoryStore() {
  const store = new Map();

  return {
    get(sessionId) {
      const normalizedSessionId = normalizeSessionId(sessionId);
      if (!normalizedSessionId) {
        return undefined;
      }

      return store.get(normalizedSessionId);
    },
    set(sessionId, hooks) {
      const normalizedSessionId = normalizeSessionId(sessionId);
      if (!normalizedSessionId) {
        throw new TypeError('sessionId is required');
      }

      store.set(normalizedSessionId, hooks);
      return hooks;
    },
    delete(sessionId) {
      const normalizedSessionId = normalizeSessionId(sessionId);
      if (!normalizedSessionId) {
        return false;
      }

      return store.delete(normalizedSessionId);
    },
  };
}
