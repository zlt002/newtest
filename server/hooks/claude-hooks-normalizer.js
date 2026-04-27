export function normalizeHookEntries({ source, hooks }) {
  if (!isPlainObject(hooks)) {
    return [];
  }

  return Object.entries(hooks).flatMap(([event, matchers]) =>
    Array.isArray(matchers)
      ? matchers.flatMap((matcherEntry, matcherIndex) => {
          if (!isPlainObject(matcherEntry)) {
            return [];
          }

          return [
            {
              id: `${source.id}:${event}:${matcherIndex}`,
              sourceId: source.id,
              event,
              matcher: typeof matcherEntry.matcher === 'string' ? matcherEntry.matcher : '',
              hooks: Array.isArray(matcherEntry.hooks) ? matcherEntry.hooks : [],
              timeout: matcherEntry.timeout ?? null,
              enabled: matcherEntry.enabled !== false,
              readonly: !source.writable,
              origin: source.kind,
              raw: matcherEntry,
            },
          ];
        })
      : [],
  );
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
