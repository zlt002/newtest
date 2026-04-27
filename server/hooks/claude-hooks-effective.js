export function buildEffectiveHooksView({ sources = [], entries = [] } = {}) {
  const sourceById = new Map(
    Array.isArray(sources)
      ? sources
          .filter((source) => source && typeof source === 'object')
          .map((source) => [source.id, source])
      : [],
  );

  const normalizedEntries = Array.isArray(entries)
    ? entries.map((entry) => normalizeEffectiveHookEntry(entry, sourceById.get(entry?.sourceId)))
    : [];

  const groupedByEvent = normalizedEntries.reduce((groups, entry) => {
    const event = entry?.event ?? 'unknown';
    const list = groups[event] || [];
    list.push(entry);
    groups[event] = list;
    return groups;
  }, {});

  return {
    sources: Array.isArray(sources) ? sources : [],
    entries: normalizedEntries,
    groupedByEvent,
    writableSources: Array.isArray(sources) ? sources.filter((source) => Boolean(source?.writable)) : [],
    readonlySources: Array.isArray(sources) ? sources.filter((source) => !source?.writable) : [],
    sessionHooks: normalizedEntries.filter((entry) => {
      const source = sourceById.get(entry?.sourceId);
      return source?.kind === 'session-memory' || entry?.origin === 'session-memory';
    }),
    diagnostics: [],
  };
}

function normalizeEffectiveHookEntry(entry, source) {
  if (!entry || typeof entry !== 'object') {
    return entry;
  }

  if (source?.kind === 'session-memory' && entry.origin !== 'session-memory') {
    return {
      ...entry,
      origin: 'session-memory',
    };
  }

  return entry;
}
