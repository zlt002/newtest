const READONLY_KINDS = new Set(['plugin', 'cli', 'external', 'unknown']);

const READONLY_REASONS = {
  plugin: '插件来源为只读',
  cli: 'CLI 管理的缓存目录不会由 CC UI 删除',
};

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getDefaultWritable(kind) {
  return !READONLY_KINDS.has(kind);
}

function getReadonlyReason(kind) {
  return READONLY_REASONS[kind] || '来源不可写';
}

export function createManagedSource({
  kind,
  path,
  writable,
  reason,
} = {}) {
  const normalizedKind = normalizeText(kind) || 'unknown';
  const normalizedPath = normalizeText(path);
  const normalizedWritable = typeof writable === 'boolean'
    ? writable
    : getDefaultWritable(normalizedKind);

  const source = {
    kind: normalizedKind,
    path: normalizedPath,
    writable: normalizedWritable,
  };

  if (!normalizedWritable) {
    source.reason = normalizeText(reason) || getReadonlyReason(normalizedKind);
  }

  return source;
}

export function isWritableSource(source) {
  return Boolean(source && source.writable === true);
}
