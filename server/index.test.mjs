import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { normalizeAgentRunTransportOptions } from './index.js';

test('normalizeAgentRunTransportOptions omits mcpEnabled from websocket chat_run_start payloads', () => {
  const normalized = normalizeAgentRunTransportOptions({
    type: 'chat_run_start',
    projectPath: '/tmp/project',
    sessionId: '550e8400-e29b-41d4-a716-446655440001',
    toolsSettings: {
      allowedTools: ['Read'],
    },
    permissionMode: 'default',
    model: 'claude-opus-4-7',
    effort: 'medium',
    traceId: 'trace-1',
    message: {
      role: 'user',
      content: [
        { type: 'text', text: 'hello' },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: 'Zm9v',
          },
        },
      ],
    },
    contextFilePaths: [' /tmp/project/src/App.tsx ', '/tmp/project/src/App.tsx'],
    mcpEnabled: true,
  });

  assert.equal('mcpEnabled' in normalized, false);
  assert.equal(normalized.projectPath, '/tmp/project');
  assert.equal(normalized.cwd, '/tmp/project');
  assert.equal(normalized.sessionId, '550e8400-e29b-41d4-a716-446655440001');
  assert.equal(normalized.conversationId, null);
  assert.equal(normalized.agentConversationId, null);
  assert.equal(normalized.resume, true);
  assert.equal(normalized.permissionMode, 'default');
  assert.equal(normalized.model, 'claude-opus-4-7');
  assert.equal(normalized.effort, 'medium');
  assert.equal(normalized.prompt, 'hello');
  assert.deepEqual(normalized.images, [{
    data: 'data:image/png;base64,Zm9v',
    mimeType: 'image/png',
  }]);
  assert.deepEqual(normalized.contextFilePaths, ['/tmp/project/src/App.tsx', '/tmp/project/src/App.tsx']);
  assert.equal(normalized.traceId, 'trace-1');
});

test('normalizeAgentRunTransportOptions preserves alias session ids for resume selection', () => {
  const normalized = normalizeAgentRunTransportOptions({
    projectPath: '/tmp/project',
    conversationId: '550e8400-e29b-41d4-a716-446655440002',
    agentConversationId: '550e8400-e29b-41d4-a716-446655440003',
  });

  assert.equal(normalized.sessionId, null);
  assert.equal(normalized.conversationId, '550e8400-e29b-41d4-a716-446655440002');
  assert.equal(normalized.agentConversationId, '550e8400-e29b-41d4-a716-446655440003');
  assert.equal(normalized.resume, true);
});

test('server index mounts the agent v2 router under /api/agent-v2', async () => {
  const source = await readFile(path.join(process.cwd(), 'server/index.js'), 'utf8');

  assert.match(source, /import \{ createAgentV2Router \} from '\.\/routes\/agent-v2\.js';/);
  assert.match(source, /app\.use\('\/api\/agent-v2', authenticateToken, createAgentV2Router\(\{/);
  assert.match(source, /services: defaultAgentV2Services,/);
});
