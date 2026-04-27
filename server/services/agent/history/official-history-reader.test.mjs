import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createOfficialHistoryReader } from './official-history-reader.js';

test('official history reader returns canonical messages for a session', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ccui-history-'));
  const projectDir = path.join(tempRoot, '-Users-demo-project');
  await fs.mkdir(projectDir, { recursive: true });

  await fs.writeFile(
    path.join(projectDir, 'sess-1.jsonl'),
    [
      JSON.stringify({ sessionId: 'sess-1', type: 'user', uuid: 'u1', timestamp: '2026-04-22T10:00:00.000Z', message: { content: [{ type: 'text', text: 'hello' }] } }),
      'not-json',
      JSON.stringify({ sessionId: 'sess-1', type: 'assistant', uuid: 'a1', timestamp: '2026-04-22T10:00:01.000Z', message: { content: [{ type: 'text', text: 'hi' }] } }),
    ].join('\n'),
  );

  const reader = createOfficialHistoryReader({ claudeProjectsRoot: tempRoot });
  const history = await reader.readSession({ sessionId: 'sess-1' });

  assert.equal(history.sessionId, 'sess-1');
  assert.equal(history.messages.map((message) => message.role).join(','), 'user,assistant');
  assert.equal(history.messages[0].kind, 'text');
  assert.equal(typeof history.messages[0].id, 'string');
  assert.equal(history.messages[1].text, 'hi');
  assert.equal(history.summary, 'hello');
  assert.equal(history.diagnostics.ignoredLineCount, 1);
});

test('official history reader counts raw parsed entries for officialMessageCount', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ccui-history-'));
  const projectDir = path.join(tempRoot, '-Users-demo-project');
  await fs.mkdir(projectDir, { recursive: true });

  await fs.writeFile(
    path.join(projectDir, 'sess-2.jsonl'),
    [
      JSON.stringify({ sessionId: 'sess-2', type: 'summary', summary: 'Session summary' }),
      JSON.stringify({ sessionId: 'sess-2', type: 'user', uuid: 'u2', timestamp: '2026-04-22T10:00:02.000Z', message: { content: [{ type: 'text', text: 'hello again' }] } }),
    ].join('\n'),
  );

  const reader = createOfficialHistoryReader({ claudeProjectsRoot: tempRoot });
  const history = await reader.readSession({ sessionId: 'sess-2' });

  assert.equal(history.messages.map((message) => message.role).join(','), 'user');
  assert.equal(history.diagnostics.officialMessageCount, 2);
  assert.equal(history.diagnostics.ignoredLineCount, 0);
});

test('official history reader preserves exact cwd from official entries when project dir contains hyphens', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ccui-history-'));
  const projectDir = path.join(tempRoot, '-Users-demo-my-project');
  await fs.mkdir(projectDir, { recursive: true });

  await fs.writeFile(
    path.join(projectDir, 'sess-3.jsonl'),
    [
      JSON.stringify({ sessionId: 'sess-3', cwd: '/Users/demo/my-project', type: 'user', uuid: 'u3', timestamp: '2026-04-22T10:00:03.000Z', message: { content: [{ type: 'text', text: 'hello exact cwd' }] } }),
    ].join('\n'),
  );

  const reader = createOfficialHistoryReader({ claudeProjectsRoot: tempRoot });
  const history = await reader.readSession({ sessionId: 'sess-3' });

  assert.equal(history.cwd, '/Users/demo/my-project');
});

test('official history reader prefers explicit summary records over later text and noise', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ccui-history-'));
  const projectDir = path.join(tempRoot, '-Users-demo-project');
  await fs.mkdir(projectDir, { recursive: true });

  await fs.writeFile(
    path.join(projectDir, 'sess-4.jsonl'),
    [
      JSON.stringify({ sessionId: 'sess-4', type: 'summary', summary: 'Explicit summary' }),
      JSON.stringify({ sessionId: 'sess-4', type: 'user', uuid: 'u4', timestamp: '2026-04-22T10:00:04.000Z', message: { content: [{ type: 'text', text: 'Warmup' }] } }),
      JSON.stringify({ sessionId: 'sess-4', type: 'assistant', isApiErrorMessage: true, uuid: 'a4', timestamp: '2026-04-22T10:00:05.000Z', message: { content: [{ type: 'text', text: 'Invalid API key' }] } }),
      JSON.stringify({ sessionId: 'sess-4', type: 'user', uuid: 'u5', timestamp: '2026-04-22T10:00:06.000Z', message: { content: [{ type: 'text', text: 'later user text' }] } }),
    ].join('\n'),
  );

  const reader = createOfficialHistoryReader({ claudeProjectsRoot: tempRoot });
  const history = await reader.readSession({ sessionId: 'sess-4' });

  assert.equal(history.summary, 'Explicit summary');
  assert.equal(history.messages.map((message) => message.role).join(','), 'user');
});

test('official history reader skips noisy user and api-error assistant messages when deriving fallback summary', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ccui-history-'));
  const projectDir = path.join(tempRoot, '-Users-demo-project');
  await fs.mkdir(projectDir, { recursive: true });

  await fs.writeFile(
    path.join(projectDir, 'sess-5.jsonl'),
    [
      JSON.stringify({ sessionId: 'sess-5', type: 'user', uuid: 'u6', timestamp: '2026-04-22T10:00:07.000Z', message: { content: [{ type: 'text', text: 'Warmup' }] } }),
      JSON.stringify({ sessionId: 'sess-5', type: 'assistant', isApiErrorMessage: true, uuid: 'a6', timestamp: '2026-04-22T10:00:08.000Z', message: { content: [{ type: 'text', text: 'Invalid API key' }] } }),
      JSON.stringify({ sessionId: 'sess-5', type: 'assistant', uuid: 'a7', timestamp: '2026-04-22T10:00:09.000Z', message: { content: [{ type: 'text', text: 'real assistant answer' }] } }),
    ].join('\n'),
  );

  const reader = createOfficialHistoryReader({ claudeProjectsRoot: tempRoot });
  const history = await reader.readSession({ sessionId: 'sess-5' });

  assert.equal(history.summary, 'real assistant answer');
});

test('official history reader filters local command protocol messages from canonical history', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ccui-history-'));
  const projectDir = path.join(tempRoot, '-Users-demo-project');
  await fs.mkdir(projectDir, { recursive: true });

  await fs.writeFile(
    path.join(projectDir, 'sess-protocol.jsonl'),
    [
      JSON.stringify({
        sessionId: 'sess-protocol',
        type: 'user',
        uuid: 'u1',
        timestamp: '2026-04-22T10:00:07.000Z',
        message: { content: [{ type: 'text', text: '<command-name>/clear</command-name>' }] },
      }),
      JSON.stringify({
        sessionId: 'sess-protocol',
        type: 'user',
        uuid: 'u2',
        timestamp: '2026-04-22T10:00:08.000Z',
        message: { content: [{ type: 'text', text: '<local-command-caveat>Caveat: hidden</local-command-caveat>' }] },
      }),
      JSON.stringify({
        sessionId: 'sess-protocol',
        type: 'user',
        uuid: 'u3',
        timestamp: '2026-04-22T10:00:09.000Z',
        message: { content: [{ type: 'text', text: 'real user prompt' }] },
      }),
      JSON.stringify({
        sessionId: 'sess-protocol',
        type: 'assistant',
        uuid: 'a1',
        timestamp: '2026-04-22T10:00:10.000Z',
        message: { content: [{ type: 'text', text: 'real assistant answer' }] },
      }),
    ].join('\n'),
  );

  const reader = createOfficialHistoryReader({ claudeProjectsRoot: tempRoot });
  const history = await reader.readSession({ sessionId: 'sess-protocol' });

  assert.deepEqual(
    history.messages.map((message) => [message.id, message.role, message.text]),
    [
      ['u1_0', 'user', '/clear'],
      ['u3_0', 'user', 'real user prompt'],
      ['a1_0', 'assistant', 'real assistant answer'],
    ],
  );
});

test('official history reader hides compact continuation summaries but keeps the slash command that triggered compaction', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ccui-history-'));
  const projectDir = path.join(tempRoot, '-Users-demo-project');
  await fs.mkdir(projectDir, { recursive: true });

  await fs.writeFile(
    path.join(projectDir, 'sess-compact.jsonl'),
    [
      JSON.stringify({
        sessionId: 'sess-compact',
        type: 'user',
        uuid: 'u1',
        timestamp: '2026-04-22T10:00:00.000Z',
        message: { role: 'user', content: '<command-name>/compact</command-name>\n<command-message>compact</command-message>\n<command-args></command-args>' },
      }),
      JSON.stringify({
        sessionId: 'sess-compact',
        type: 'system',
        subtype: 'compact_boundary',
        uuid: 'c1',
        timestamp: '2026-04-22T10:00:01.000Z',
        content: 'Conversation compacted',
      }),
      JSON.stringify({
        sessionId: 'sess-compact',
        type: 'user',
        uuid: 'u2',
        timestamp: '2026-04-22T10:00:01.000Z',
        isVisibleInTranscriptOnly: true,
        isCompactSummary: true,
        message: {
          role: 'user',
          content: 'This session is being continued from a previous conversation that ran out of context.\n\nSummary:\n...',
        },
      }),
      JSON.stringify({
        sessionId: 'sess-compact',
        type: 'assistant',
        uuid: 'a1',
        timestamp: '2026-04-22T10:00:02.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: '继续吧' }] },
      }),
    ].join('\n'),
  );

  const reader = createOfficialHistoryReader({ claudeProjectsRoot: tempRoot });
  const history = await reader.readSession({ sessionId: 'sess-compact' });

  assert.deepEqual(
    history.messages.map((message) => [message.kind, message.role, message.text]),
    [
      ['text', 'user', '/compact'],
      ['compact_boundary', 'tool', null],
      ['text', 'assistant', '继续吧'],
    ],
  );
});

test('official history reader ignores expanded skill prompt text when deriving fallback summary', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ccui-history-'));
  const projectDir = path.join(tempRoot, '-Users-demo-project');
  await fs.mkdir(projectDir, { recursive: true });

  await fs.writeFile(
    path.join(projectDir, 'sess-skill-summary.jsonl'),
    [
      JSON.stringify({
        sessionId: 'sess-skill-summary',
        type: 'user',
        uuid: 'u1',
        timestamp: '2026-04-22T10:00:00.000Z',
        message: { content: [{ type: 'text', text: '<command-name>/graphify</command-name>\n<command-args>query test</command-args>' }] },
      }),
      JSON.stringify({
        sessionId: 'sess-skill-summary',
        type: 'user',
        uuid: 'u2',
        timestamp: '2026-04-22T10:00:01.000Z',
        message: {
          content: [{
            type: 'text',
            text: 'Base directory for this skill: /Users/demo/.claude/skills/graphify\n\n# graphify\n\nTurn any folder into a graph.',
          }],
        },
      }),
      JSON.stringify({
        sessionId: 'sess-skill-summary',
        type: 'assistant',
        uuid: 'a1',
        timestamp: '2026-04-22T10:00:02.000Z',
        message: { content: [{ type: 'text', text: '文档已生成。以下是核心结论：' }] },
      }),
    ].join('\n'),
  );

  const reader = createOfficialHistoryReader({ claudeProjectsRoot: tempRoot });
  const history = await reader.readSession({ sessionId: 'sess-skill-summary' });

  assert.equal(history.summary, '文档已生成。以下是核心结论：');
  assert.deepEqual(
    history.messages.map((message) => [message.role, message.text]),
    [
      ['user', '/graphify query test'],
      ['user', 'Base directory for this skill: /Users/demo/.claude/skills/graphify\n\n# graphify\n\nTurn any folder into a graph.'],
      ['assistant', '文档已生成。以下是核心结论：'],
    ],
  );
});

test('official history reader exposes raw metadata for lookup when the last raw entry is a summary', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ccui-history-'));
  const projectDir = path.join(tempRoot, '-Users-demo-project');
  await fs.mkdir(projectDir, { recursive: true });

  await fs.writeFile(
    path.join(projectDir, 'sess-6.jsonl'),
    [
      JSON.stringify({ sessionId: 'sess-6', type: 'user', uuid: 'u7', timestamp: '2026-04-22T10:00:10.000Z', message: { content: [{ type: 'text', text: 'first message' }] } }),
      JSON.stringify({ sessionId: 'sess-6', type: 'summary', summary: 'Trailing summary', timestamp: '2026-04-22T10:00:11.000Z' }),
    ].join('\n'),
  );

  const reader = createOfficialHistoryReader({ claudeProjectsRoot: tempRoot });
  const history = await reader.readSession({ sessionId: 'sess-6' });

  assert.equal(history.messages.map((message) => message.role).join(','), 'user');
  assert.equal(history.metadata.messageCount, 2);
  assert.equal(history.metadata.firstActivity, '2026-04-22T10:00:10.000Z');
  assert.equal(history.metadata.lastActivity, '2026-04-22T10:00:11.000Z');
  assert.equal(history.summary, 'Trailing summary');
});

test('official history reader applies pending summary from leafUuid to parentUuid', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ccui-history-'));
  const projectDir = path.join(tempRoot, '-Users-demo-project');
  await fs.mkdir(projectDir, { recursive: true });

  await fs.writeFile(
    path.join(projectDir, 'sess-7.jsonl'),
    [
      JSON.stringify({ type: 'summary', leafUuid: 'leaf-1', summary: 'Pending summary' }),
      JSON.stringify({ sessionId: 'sess-7', parentUuid: 'leaf-1', type: 'user', uuid: 'u8', timestamp: '2026-04-22T10:00:12.000Z', message: { content: [{ type: 'text', text: 'hello pending' }] } }),
    ].join('\n'),
  );

  const reader = createOfficialHistoryReader({ claudeProjectsRoot: tempRoot });
  const history = await reader.readSession({ sessionId: 'sess-7' });

  assert.equal(history.summary, 'Pending summary');
  assert.equal(history.diagnostics.officialMessageCount, 2);
  assert.equal(history.metadata.messageCount, 1);
});

test('official history reader merges matching agent jsonl tool records into canonical time order', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ccui-history-'));
  const projectDir = path.join(tempRoot, '-Users-demo-project');
  await fs.mkdir(projectDir, { recursive: true });

  await fs.writeFile(
    path.join(projectDir, 'sess-agent.jsonl'),
    [
      JSON.stringify({
        sessionId: 'sess-agent',
        type: 'assistant',
        uuid: 'task-msg',
        timestamp: '2026-04-22T10:00:01.000Z',
        toolUseResult: { agentId: 'sub-1' },
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'tool-task', name: 'Task', input: { description: 'run sub-agent' } },
          ],
        },
      }),
      JSON.stringify({
        sessionId: 'sess-agent',
        type: 'assistant',
        uuid: 'assistant-msg',
        timestamp: '2026-04-22T10:00:05.000Z',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'done' }],
        },
      }),
    ].join('\n'),
  );
  await fs.writeFile(
    path.join(projectDir, 'agent-sub-1.jsonl'),
    [
      JSON.stringify({
        type: 'response_item',
        timestamp: '2026-04-22T10:00:02.000Z',
        payload: {
          type: 'function_call',
          name: 'shell_command',
          arguments: JSON.stringify({ command: 'pwd' }),
          call_id: 'call-1',
        },
      }),
      JSON.stringify({
        type: 'response_item',
        timestamp: '2026-04-22T10:00:03.000Z',
        payload: {
          type: 'function_call_output',
          call_id: 'call-1',
          output: '/tmp/project',
        },
      }),
    ].join('\n'),
  );

  const reader = createOfficialHistoryReader({ claudeProjectsRoot: tempRoot });
  const history = await reader.readSession({ sessionId: 'sess-agent' });

  assert.deepEqual(
    history.messages.map((message) => `${message.timestamp}:${message.kind}`),
    [
      '2026-04-22T10:00:01.000Z:tool_use',
      '2026-04-22T10:00:02.000Z:tool_use',
      '2026-04-22T10:00:03.000Z:tool_result',
      '2026-04-22T10:00:05.000Z:text',
    ],
  );
  assert.equal(history.messages[1].source, 'agent');
  assert.equal(history.messages[1].toolName, 'Bash');
  assert.equal(history.messages[2].toolId, 'call-1');
  assert.equal(history.diagnostics.officialMessageCount, 4);
});

test('official history reader merges agent reasoning and tool outputs into canonical time order', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ccui-history-'));
  const projectDir = path.join(tempRoot, '-Users-demo-project');
  await fs.mkdir(projectDir, { recursive: true });

  await fs.writeFile(
    path.join(projectDir, 'sess-near-live.jsonl'),
    [
      JSON.stringify({
        sessionId: 'sess-near-live',
        type: 'user',
        uuid: 'u1',
        timestamp: '2026-04-22T10:00:00.000Z',
        message: { content: [{ type: 'text', text: 'research foshan' }] },
      }),
      JSON.stringify({
        sessionId: 'sess-near-live',
        type: 'assistant',
        uuid: 'task-msg',
        timestamp: '2026-04-22T10:00:01.000Z',
        toolUseResult: { agentId: 'sub-2' },
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'task-call', name: 'Task', input: { description: 'run sub-agent' } }],
        },
      }),
      JSON.stringify({
        sessionId: 'sess-near-live',
        type: 'assistant',
        uuid: 'final-msg',
        timestamp: '2026-04-22T10:00:05.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'final summary' }] },
      }),
    ].join('\n'),
  );

  await fs.writeFile(
    path.join(projectDir, 'agent-sub-2.jsonl'),
    [
      JSON.stringify({
        type: 'response_item',
        timestamp: '2026-04-22T10:00:02.000Z',
        payload: {
          type: 'reasoning',
          summary: [{ text: '先分析佛山经济结构' }],
        },
      }),
      JSON.stringify({
        type: 'response_item',
        timestamp: '2026-04-22T10:00:03.000Z',
        payload: {
          type: 'function_call',
          name: 'shell_command',
          arguments: JSON.stringify({ command: 'pwd' }),
          call_id: 'call-2',
        },
      }),
      JSON.stringify({
        type: 'response_item',
        timestamp: '2026-04-22T10:00:04.000Z',
        payload: {
          type: 'function_call_output',
          call_id: 'call-2',
          output: '/tmp/project',
        },
      }),
    ].join('\n'),
  );

  const reader = createOfficialHistoryReader({ claudeProjectsRoot: tempRoot });
  const history = await reader.readSession({ sessionId: 'sess-near-live' });

  assert.deepEqual(
    history.messages.map((message) => `${message.timestamp}:${message.kind}`),
    [
      '2026-04-22T10:00:00.000Z:text',
      '2026-04-22T10:00:01.000Z:tool_use',
      '2026-04-22T10:00:02.000Z:thinking',
      '2026-04-22T10:00:03.000Z:tool_use',
      '2026-04-22T10:00:04.000Z:tool_result',
      '2026-04-22T10:00:05.000Z:text',
    ],
  );
  assert.equal(history.messages[2].source, 'agent');
  assert.equal(history.messages[3].toolName, 'Bash');
  assert.equal(history.messages[4].toolId, 'call-2');
});

test('official history reader loads subagent jsonl files from session subdirectories', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ccui-history-'));
  const projectDir = path.join(tempRoot, '-Users-demo-project');
  const sessionDir = path.join(projectDir, 'sess-subdir');
  const subagentsDir = path.join(sessionDir, 'subagents');
  await fs.mkdir(subagentsDir, { recursive: true });

  await fs.writeFile(
    path.join(projectDir, 'sess-subdir.jsonl'),
    [
      JSON.stringify({
        sessionId: 'sess-subdir',
        type: 'user',
        uuid: 'u1',
        timestamp: '2026-04-22T10:00:00.000Z',
        message: { content: [{ type: 'text', text: 'run nested subagent' }] },
      }),
      JSON.stringify({
        sessionId: 'sess-subdir',
        type: 'assistant',
        uuid: 'task-msg',
        timestamp: '2026-04-22T10:00:01.000Z',
        toolUseResult: { agentId: 'nested-1' },
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'task-call', name: 'Agent', input: { description: 'run nested subagent' } }],
        },
      }),
      JSON.stringify({
        sessionId: 'sess-subdir',
        type: 'assistant',
        uuid: 'final-msg',
        timestamp: '2026-04-22T10:00:05.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'final summary' }] },
      }),
    ].join('\n'),
  );

  await fs.writeFile(
    path.join(subagentsDir, 'agent-nested-1.jsonl'),
    [
      JSON.stringify({
        parentUuid: null,
        isSidechain: true,
        agentId: 'nested-1',
        type: 'user',
        message: {
          role: 'user',
          content: 'subagent task',
        },
        timestamp: '2026-04-22T10:00:01.500Z',
      }),
      JSON.stringify({
        agentId: 'nested-1',
        type: 'assistant',
        timestamp: '2026-04-22T10:00:02.000Z',
        message: {
          role: 'assistant',
          type: 'message',
          content: [{ type: 'thinking', thinking: '先尝试搜索' }],
        },
      }),
      JSON.stringify({
        agentId: 'nested-1',
        type: 'assistant',
        timestamp: '2026-04-22T10:00:03.000Z',
        message: {
          role: 'assistant',
          type: 'message',
          content: [{ type: 'tool_use', id: 'call-3', name: 'WebSearch', input: { query: 'foshan economy' } }],
        },
      }),
      JSON.stringify({
        agentId: 'nested-1',
        type: 'user',
        timestamp: '2026-04-22T10:00:04.000Z',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'call-3', content: 'api error', is_error: true }],
        },
      }),
    ].join('\n'),
  );

  const reader = createOfficialHistoryReader({ claudeProjectsRoot: tempRoot });
  const history = await reader.readSession({ sessionId: 'sess-subdir' });

  assert.deepEqual(
    history.messages.map((message) => `${message.timestamp}:${message.kind}`),
    [
      '2026-04-22T10:00:00.000Z:text',
      '2026-04-22T10:00:01.000Z:tool_use',
      '2026-04-22T10:00:02.000Z:thinking',
      '2026-04-22T10:00:03.000Z:tool_use',
      '2026-04-22T10:00:04.000Z:tool_result',
      '2026-04-22T10:00:05.000Z:text',
    ],
  );
  assert.equal(history.messages[2].source, 'agent');
  assert.equal(history.messages[3].toolName, 'WebSearch');
  assert.equal(history.messages[4].toolId, 'call-3');
  assert.equal(history.diagnostics.officialMessageCount, 6);
  assert.equal(history.diagnostics.agentMessageCount, 3);
});

test('official history reader dedupes duplicated tool_result across session and agent files', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ccui-history-'));
  const projectDir = path.join(tempRoot, '-Users-demo-project');
  await fs.mkdir(projectDir, { recursive: true });

  await fs.writeFile(
    path.join(projectDir, 'sess-dedupe.jsonl'),
    [
      JSON.stringify({
        sessionId: 'sess-dedupe',
        type: 'assistant',
        uuid: 'task-msg',
        timestamp: '2026-04-22T10:00:01.000Z',
        toolUseResult: { agentId: 'sub-3' },
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'task-call', name: 'Task', input: { description: 'run sub-agent' } }],
        },
      }),
      JSON.stringify({
        sessionId: 'sess-dedupe',
        type: 'user',
        uuid: 'user-tool-result',
        timestamp: '2026-04-22T10:00:03.000Z',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'call-3', content: '/tmp/project' }],
        },
      }),
    ].join('\n'),
  );

  await fs.writeFile(
    path.join(projectDir, 'agent-sub-3.jsonl'),
    [
      JSON.stringify({
        type: 'response_item',
        timestamp: '2026-04-22T10:00:02.000Z',
        payload: {
          type: 'function_call',
          name: 'shell_command',
          arguments: JSON.stringify({ command: 'pwd' }),
          call_id: 'call-3',
        },
      }),
      JSON.stringify({
        type: 'response_item',
        timestamp: '2026-04-22T10:00:03.000Z',
        payload: {
          type: 'function_call_output',
          call_id: 'call-3',
          output: '/tmp/project',
        },
      }),
    ].join('\n'),
  );

  const reader = createOfficialHistoryReader({ claudeProjectsRoot: tempRoot });
  const history = await reader.readSession({ sessionId: 'sess-dedupe' });

  assert.equal(history.messages.filter((message) => message.kind === 'tool_result').length, 1);
  assert.equal(history.messages.find((message) => message.kind === 'tool_result')?.toolId, 'call-3');
});

test('official history reader rejects when a located file is removed before read', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ccui-history-'));
  const projectDir = path.join(tempRoot, '-Users-demo-project');
  const sessionPath = path.join(projectDir, 'sess-8.jsonl');
  await fs.mkdir(projectDir, { recursive: true });

  await fs.writeFile(
    sessionPath,
    JSON.stringify({
      sessionId: 'sess-8',
      type: 'user',
      uuid: 'u9',
      timestamp: '2026-04-22T10:00:13.000Z',
      message: { content: [{ type: 'text', text: 'hello delete' }] },
    }),
  );

  const reader = createOfficialHistoryReader({ claudeProjectsRoot: tempRoot });
  const located = await reader.locateSessionFile('sess-8');
  await fs.rm(sessionPath);

  await assert.rejects(
    () => reader.readSession({ sessionId: 'sess-8', projectDir: located.projectDir }),
    (error) => {
      assert.equal(error?.code, 'ENOENT');
      return true;
    },
  );
});

test('official history reader preserves user image content blocks in canonical history', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ccui-history-'));
  const projectDir = path.join(tempRoot, '-Users-demo-project');
  await fs.mkdir(projectDir, { recursive: true });

  await fs.writeFile(
    path.join(projectDir, 'sess-image.jsonl'),
    JSON.stringify({
      sessionId: 'sess-image',
      type: 'user',
      uuid: 'u-image',
      timestamp: '2026-04-22T10:00:00.000Z',
      message: {
        role: 'user',
        content: [
          { type: 'text', text: '帮我看下这张图' },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: 'ZmFrZS1wbmctZGF0YQ==',
            },
          },
        ],
      },
    }),
  );

  const reader = createOfficialHistoryReader({ claudeProjectsRoot: tempRoot });
  const history = await reader.readSession({ sessionId: 'sess-image' });

  assert.equal(history.messages.length, 1);
  assert.equal(history.messages[0].role, 'user');
  assert.equal(history.messages[0].kind, 'text');
  assert.equal(history.messages[0].text, '帮我看下这张图');
  assert.deepEqual(history.messages[0].content, [
    { type: 'text', text: '帮我看下这张图' },
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: 'ZmFrZS1wbmctZGF0YQ==',
      },
    },
  ]);
});
