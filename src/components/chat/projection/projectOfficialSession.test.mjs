import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { projectOfficialSession } from './projectOfficialSession.ts';

test('projectOfficialSession no longer imports legacy event-backed assistant turn projection types', async () => {
  const source = await readFile(new URL('./projectOfficialSession.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /projectAssistantTurnsForSession/);
});

test('projectOfficialSession converts canonical assistant messages into assistant turns', () => {
  const turns = projectOfficialSession([
    {
      id: 'u1',
      sessionId: 'sess-1',
      role: 'user',
      text: 'hello',
      timestamp: '2026-04-22T10:00:00.000Z',
    },
    {
      id: 'a1',
      sessionId: 'sess-1',
      role: 'assistant',
      text: 'hi',
      timestamp: '2026-04-22T10:00:01.000Z',
    },
  ]);

  assert.equal(turns.length, 1);
  assert.equal(turns[0].runId, 'history-a1');
  assert.equal(turns[0].anchorUserMessageIndex, 0);
  assert.equal(turns[0].summary.assistantText, 'hi');
  assert.equal(turns[0].summary.presentationMode, 'history');
});

test('projectOfficialSession keeps multiple assistant turns anchored to the same user message', () => {
  const turns = projectOfficialSession([
    {
      id: 'u1',
      sessionId: 'sess-1',
      role: 'user',
      text: 'hello',
      timestamp: '2026-04-22T10:00:00.000Z',
    },
    {
      id: 'a1',
      sessionId: 'sess-1',
      role: 'assistant',
      text: 'first reply',
      timestamp: '2026-04-22T10:00:01.000Z',
    },
    {
      id: 'a2',
      sessionId: 'sess-1',
      role: 'assistant',
      text: 'second reply',
      timestamp: '2026-04-22T10:00:02.000Z',
    },
  ]);

  assert.deepEqual(
    turns.map((turn) => [turn.runId, turn.anchorUserMessageIndex, turn.summary.assistantText]),
    [
      ['history-a1', 0, 'first reply'],
      ['history-a2', 0, 'second reply'],
    ],
  );
});

test('projectOfficialSession keeps compact boundaries and tool history visible on the assistant turn', () => {
  const turns = projectOfficialSession([
    {
      id: 'u1',
      sessionId: 'sess-1',
      role: 'user',
      text: '请帮我看文件',
      timestamp: '2026-04-22T10:00:00.000Z',
      kind: 'text',
    },
    {
      id: 'b1',
      sessionId: 'sess-1',
      role: 'tool',
      text: null,
      timestamp: '2026-04-22T10:00:01.000Z',
      kind: 'compact_boundary',
    },
    {
      id: 'a1',
      sessionId: 'sess-1',
      role: 'assistant',
      text: '处理完成',
      timestamp: '2026-04-22T10:00:02.000Z',
      content: [
        { type: 'tool_use', name: 'Read', input: { file_path: 'src/app.ts' } },
        { type: 'tool_result', tool_name: 'Read', content: 'file loaded' },
        { type: 'text', text: '处理完成' },
      ],
    },
  ]);

  assert.equal(turns.length, 1);
  assert.deepEqual(
    turns[0].activity.map((line) => line.kind),
    ['system', 'tool', 'result', 'assistant'],
  );
  assert.match(turns[0].activity[0].summary, /压缩/);
  assert.match(turns[0].activity[1].summary, /Read/);
  assert.match(turns[0].activity[2].summary, /file loaded/);
});

test('projectOfficialSession emits a tail turn when canonical history ends with tool or boundary activity only', () => {
  const turns = projectOfficialSession([
    {
      id: 'u1',
      sessionId: 'sess-1',
      role: 'user',
      text: '继续执行',
      timestamp: '2026-04-22T10:00:00.000Z',
      kind: 'text',
    },
    {
      id: 'a1',
      sessionId: 'sess-1',
      role: 'assistant',
      text: null,
      timestamp: '2026-04-22T10:00:01.000Z',
      content: [
        { type: 'tool_use', name: 'Bash' },
        { type: 'tool_result', tool_name: 'Bash', content: 'done' },
      ],
    },
  ]);

  assert.equal(turns.length, 1);
  assert.equal(turns[0].summary.assistantText, '');
  assert.deepEqual(
    turns[0].activity.map((line) => line.kind),
    ['tool', 'result'],
  );
});
