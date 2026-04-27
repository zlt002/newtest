import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDisabledMcpRegistry,
  extractFailedMcpServerNamesFromInitEvent,
  filterDisabledMcpServers,
  markFailedMcpServersFromInitEvent,
} from './claude-mcp-runtime.js';

test('extractFailedMcpServerNamesFromInitEvent returns only failed MCP servers from system init events', () => {
  assert.deepEqual(
    extractFailedMcpServerNamesFromInitEvent({
      type: 'system',
      subtype: 'init',
      mcp_servers: {
        context7: { status: 'failed' },
        'web-reader': { status: 'connected' },
        zread: { state: 'error' },
      },
    }),
    ['context7', 'zread'],
  );
});

test('extractFailedMcpServerNamesFromInitEvent uses server names when SDK reports mcp_servers as an array', () => {
  assert.deepEqual(
    extractFailedMcpServerNamesFromInitEvent({
      type: 'system',
      subtype: 'init',
      mcp_servers: [
        { name: 'context7', status: 'failed' },
        { name: 'web-reader', status: 'connected' },
        { name: 'zread', state: 'error' },
      ],
    }),
    ['context7', 'zread'],
  );
});

test('markFailedMcpServersFromInitEvent stores failed servers with expiry and filterDisabledMcpServers skips them', () => {
  const registry = createDisabledMcpRegistry();
  markFailedMcpServersFromInitEvent(
    registry,
    {
      type: 'system',
      subtype: 'init',
      mcp_servers: {
        context7: { status: 'failed' },
      },
    },
    { now: 1000, ttlMs: 5000 },
  );

  assert.deepEqual(
    filterDisabledMcpServers(
      {
        context7: { type: 'stdio', command: 'npx' },
        'web-reader': { type: 'http', url: 'https://example.com' },
      },
      registry,
      { now: 4000 },
    ),
    {
      filtered: {
        'web-reader': { type: 'http', url: 'https://example.com' },
      },
      skipped: ['context7'],
    },
  );
});

test('filterDisabledMcpServers lets expired disabled servers back in', () => {
  const registry = createDisabledMcpRegistry();
  markFailedMcpServersFromInitEvent(
    registry,
    {
      type: 'system',
      subtype: 'init',
      mcp_servers: {
        context7: { status: 'failed' },
      },
    },
    { now: 1000, ttlMs: 5000 },
  );

  assert.deepEqual(
    filterDisabledMcpServers(
      {
        context7: { type: 'stdio', command: 'npx' },
      },
      registry,
      { now: 7001 },
    ),
    {
      filtered: {
        context7: { type: 'stdio', command: 'npx' },
      },
      skipped: [],
    },
  );
});
