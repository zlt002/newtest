const FAILED_MCP_STATUSES = new Set(['failed', 'error']);

function normalizeStatus(value = {}) {
  return String(value?.status || value?.state || value?.connectionState || value?.health || '')
    .trim()
    .toLowerCase();
}

export function createDisabledMcpRegistry() {
  return new Map();
}

export function extractFailedMcpServerNamesFromInitEvent(event = {}) {
  if (event?.type !== 'system' || event?.subtype !== 'init' || !event?.mcp_servers || typeof event.mcp_servers !== 'object') {
    return [];
  }

  const names = Array.isArray(event.mcp_servers)
    ? event.mcp_servers
        .filter((value) => FAILED_MCP_STATUSES.has(normalizeStatus(value)))
        .map((value, index) => {
          const name = typeof value?.name === 'string' ? value.name.trim() : '';
          return name || `server-${index}`;
        })
    : Object.entries(event.mcp_servers)
        .filter(([, value]) => FAILED_MCP_STATUSES.has(normalizeStatus(value)))
        .map(([name]) => name);

  return [...new Set(names)].sort();
}

export function markFailedMcpServersFromInitEvent(registry, event = {}, options = {}) {
  if (!registry) {
    return [];
  }

  const { now = Date.now(), ttlMs = 15 * 60 * 1000 } = options;
  const names = extractFailedMcpServerNamesFromInitEvent(event);
  for (const name of names) {
    registry.set(name, now + ttlMs);
  }
  return names;
}

export function filterDisabledMcpServers(mcpServers = {}, registry, options = {}) {
  if (!mcpServers || typeof mcpServers !== 'object') {
    return { filtered: mcpServers, skipped: [] };
  }

  if (!registry) {
    return { filtered: { ...mcpServers }, skipped: [] };
  }

  const { now = Date.now() } = options;
  const filtered = {};
  const skipped = [];

  for (const [name, config] of Object.entries(mcpServers)) {
    const expiresAt = registry.get(name);
    if (typeof expiresAt === 'number' && expiresAt > now) {
      skipped.push(name);
      continue;
    }

    if (typeof expiresAt === 'number' && expiresAt <= now) {
      registry.delete(name);
    }

    filtered[name] = config;
  }

  skipped.sort();
  return { filtered, skipped };
}
