export function createHookSource(input) {
  const id = normalizeId(input?.id);
  if (!id) {
    throw new TypeError('Hook source id must be a non-empty string.');
  }

  return {
    id,
    kind: input.kind,
    label: input.label || input.kind,
    path: input.path || null,
    writable: Boolean(input.writable),
    priority: Number.isFinite(input.priority) ? input.priority : 0,
    pluginName: input.pluginName || null,
    skillName: input.skillName || null,
    subagentName: input.subagentName || null,
    description: input.description || null,
  };
}

function normalizeId(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : '';
}
