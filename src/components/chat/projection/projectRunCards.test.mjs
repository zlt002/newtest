import test from 'node:test';
import assert from 'node:assert/strict';

import {
  projectHistoricalRunCards,
  projectLiveRunCards,
} from './projectRunCards.ts';

test('projectHistoricalRunCards 将 official history 投影成已完成且默认折叠过程的 Run Card', () => {
  const cards = projectHistoricalRunCards([
    {
      id: 'user-1',
      sessionId: 'sess-1',
      role: 'user',
      text: '请帮我总结需求',
      timestamp: '2026-04-23T05:00:00.000Z',
      kind: 'message',
      type: 'message',
    },
    {
      id: 'think-1',
      sessionId: 'sess-1',
      role: 'assistant',
      text: '我先梳理需求范围',
      timestamp: '2026-04-23T05:00:01.000Z',
      kind: 'thinking',
      type: 'thinking',
    },
    {
      id: 'assistant-1',
      sessionId: 'sess-1',
      role: 'assistant',
      text: '这是最终回答',
      timestamp: '2026-04-23T05:00:02.000Z',
      kind: 'message',
      type: 'message',
    },
  ]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0].sessionId, 'sess-1');
  assert.equal(cards[0].cardStatus, 'completed');
  assert.equal(cards[0].finalResponse, '这是最终回答');
  assert.equal(cards[0].defaultExpanded, false);
  assert.deepEqual(cards[0].processItems.map((item) => item.kind), ['thinking']);
});

test('projectHistoricalRunCards restores near-realtime process layers from enhanced canonical history', () => {
  const cards = projectHistoricalRunCards([
    {
      id: 'user-1',
      sessionId: 'sess-near-live',
      role: 'user',
      text: '请调研佛山',
      timestamp: '2026-04-23T05:00:00.000Z',
      kind: 'text',
      type: 'message',
    },
    {
      id: 'think-1',
      sessionId: 'sess-near-live',
      role: 'assistant',
      text: '先拆成两个子任务',
      timestamp: '2026-04-23T05:00:01.000Z',
      kind: 'thinking',
      type: 'thinking',
    },
    {
      id: 'tool-1',
      sessionId: 'sess-near-live',
      role: 'assistant',
      text: null,
      content: [{ type: 'tool_use', name: 'Task', input: { description: '经济调研' } }],
      timestamp: '2026-04-23T05:00:02.000Z',
      kind: 'tool_use',
      type: 'tool_use',
      toolName: 'Task',
    },
    {
      id: 'result-1',
      sessionId: 'sess-near-live',
      role: 'tool',
      text: '子代理已完成',
      timestamp: '2026-04-23T05:00:03.000Z',
      kind: 'tool_result',
      type: 'tool_result',
    },
    {
      id: 'assistant-1',
      sessionId: 'sess-near-live',
      role: 'assistant',
      text: '最终汇总',
      timestamp: '2026-04-23T05:00:04.000Z',
      kind: 'message',
      type: 'message',
    },
  ]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0].finalResponse, '最终汇总');
  assert.deepEqual(cards[0].processItems.map((item) => item.kind), ['thinking', 'tool_use', 'tool_result']);
  assert.deepEqual(
    cards[0].processItems.map((item) => item.title),
    ['思考', '工具调用 · Task', '工具结果'],
  );
});

test('projectHistoricalRunCards keeps historical file paths in process payloads so related files remain visible after refresh', () => {
  const cards = projectHistoricalRunCards([
    {
      id: 'user-1',
      sessionId: 'sess-related-files',
      role: 'user',
      text: '这个文件是啥呢',
      timestamp: '2026-04-26T15:39:30.000Z',
      kind: 'text',
      type: 'message',
    },
    {
      id: 'tool-1',
      sessionId: 'sess-related-files',
      role: 'assistant',
      text: null,
      content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/Users/demo/PRD_CodeReview_AI.md' } }],
      timestamp: '2026-04-26T15:39:41.000Z',
      kind: 'tool_use',
      type: 'tool_use',
      toolName: 'Read',
      toolInput: {
        file_path: '/Users/demo/PRD_CodeReview_AI.md',
      },
    },
    {
      id: 'result-1',
      sessionId: 'sess-related-files',
      role: 'tool',
      text: '# PRD: 智能代码审查助手',
      timestamp: '2026-04-26T15:39:41.500Z',
      kind: 'tool_result',
      type: 'tool_result',
    },
    {
      id: 'assistant-1',
      sessionId: 'sess-related-files',
      role: 'assistant',
      text: '让我读取这个文件看看内容。',
      timestamp: '2026-04-26T15:39:47.000Z',
      kind: 'message',
      type: 'message',
    },
  ]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0].processItems[0].kind, 'tool_use');
  assert.deepEqual(cards[0].processItems[0].payload, {
    content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/Users/demo/PRD_CodeReview_AI.md' } }],
    toolInput: {
      file_path: '/Users/demo/PRD_CodeReview_AI.md',
    },
    toolName: 'Read',
  });
});

test('projectHistoricalRunCards 保留同一轮全部 assistant 文本到 responseMessages，并只把最后一条记为 finalResponse', () => {
  const cards = projectHistoricalRunCards([
    {
      id: 'user-1',
      sessionId: 'sess-interim-assistant',
      role: 'user',
      text: '请分析并生成文档',
      timestamp: '2026-04-23T05:00:00.000Z',
      kind: 'text',
      type: 'message',
    },
    {
      id: 'think-1',
      sessionId: 'sess-interim-assistant',
      role: 'assistant',
      text: '先分析代码',
      timestamp: '2026-04-23T05:00:01.000Z',
      kind: 'thinking',
      type: 'thinking',
    },
    {
      id: 'assistant-progress-1',
      sessionId: 'sess-interim-assistant',
      role: 'assistant',
      text: '现在我已经完成了代码分析，接下来生成 MD 文档。',
      timestamp: '2026-04-23T05:00:02.000Z',
      kind: 'message',
      type: 'message',
    },
    {
      id: 'assistant-final-1',
      sessionId: 'sess-interim-assistant',
      role: 'assistant',
      text: '文档已生成。以下是核心结论：',
      timestamp: '2026-04-23T05:00:03.000Z',
      kind: 'message',
      type: 'message',
    },
  ]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0].finalResponse, '文档已生成。以下是核心结论：');
  assert.deepEqual(
    cards[0].responseMessages?.map((item) => [item.kind, item.body]),
    [
      ['phase', '现在我已经完成了代码分析，接下来生成 MD 文档。'],
      ['final', '文档已生成。以下是核心结论：'],
    ],
  );
  assert.deepEqual(
    cards[0].processItems.map((item) => [item.kind, item.body]),
    [
      ['thinking', '先分析代码'],
      ['notice', '现在我已经完成了代码分析，接下来生成 MD 文档。'],
    ],
  );
  assert.equal(cards[0].processItems[1].title, '阶段更新');
});

test('projectHistoricalRunCards 会跳过 expanded skill prompt，并把历史卡锚到原始 slash 用户消息', () => {
  const cards = projectHistoricalRunCards([
    {
      id: 'user-raw-slash',
      sessionId: 'sess-skill-prompt',
      role: 'user',
      text: "/graphify query 'IT资产报废'",
      timestamp: '2026-04-23T03:59:00.000Z',
      kind: 'text',
      type: 'message',
    },
    {
      id: 'user-expanded-skill',
      sessionId: 'sess-skill-prompt',
      role: 'user',
      text: 'Base directory for this skill: /Users/demo/.codex/skills/example\nFull expanded instructions...',
      timestamp: '2026-04-23T03:59:01.000Z',
      kind: 'text',
      type: 'message',
    },
    {
      id: 'assistant-phase',
      sessionId: 'sess-skill-prompt',
      role: 'assistant',
      text: '我来帮你查询 IT 资产报废申请的设备类型限制问题。',
      timestamp: '2026-04-23T03:59:05.000Z',
      kind: 'message',
      type: 'message',
    },
    {
      id: 'assistant-final',
      sessionId: 'sess-skill-prompt',
      role: 'assistant',
      text: '文档已生成。以下是核心结论：',
      timestamp: '2026-04-23T03:59:10.000Z',
      kind: 'message',
      type: 'message',
    },
  ]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0].anchorMessageId, 'user-raw-slash');
  assert.deepEqual(
    cards[0].responseMessages?.map((item) => [item.kind, item.body]),
    [
      ['phase', '我来帮你查询 IT 资产报废申请的设备类型限制问题。'],
      ['final', '文档已生成。以下是核心结论：'],
    ],
  );
});

test('projectHistoricalRunCards 不会把孤立 expanded skill prompt 当作用户锚点', () => {
  const cards = projectHistoricalRunCards([
    {
      id: 'user-expanded-skill',
      sessionId: 'sess-skill-prompt',
      role: 'user',
      text: 'Base directory for this skill: /Users/demo/.claude/skills/gen-image\nFull expanded instructions...',
      timestamp: '2026-04-23T03:59:01.000Z',
      kind: 'text',
      type: 'message',
    },
    {
      id: 'assistant-final',
      sessionId: 'sess-skill-prompt',
      role: 'assistant',
      text: '图片提示词已整理。',
      timestamp: '2026-04-23T03:59:10.000Z',
      kind: 'message',
      type: 'message',
    },
  ]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0].anchorMessageId, '');
  assert.equal(cards[0].responseMessages?.at(-1)?.body, '图片提示词已整理。');
});

test('projectHistoricalRunCards 在分页从半截 run 开始时仍会产出无锚点历史卡片', () => {
  const cards = projectHistoricalRunCards([
    {
      id: 'tool-1',
      sessionId: 'sess-mid-page',
      role: 'assistant',
      text: null,
      content: [{ type: 'tool_use', name: 'WebSearch', input: { query: 'foshan economy' } }],
      timestamp: '2026-04-23T05:00:02.000Z',
      kind: 'tool_use',
      type: 'tool_use',
      toolName: 'WebSearch',
    },
    {
      id: 'result-1',
      sessionId: 'sess-mid-page',
      role: 'user',
      text: 'api error',
      timestamp: '2026-04-23T05:00:03.000Z',
      kind: 'tool_result',
      type: 'tool_result',
    },
    {
      id: 'assistant-1',
      sessionId: 'sess-mid-page',
      role: 'assistant',
      text: '最终汇总',
      timestamp: '2026-04-23T05:00:04.000Z',
      kind: 'message',
      type: 'message',
    },
  ]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0].anchorMessageId, '');
  assert.equal(cards[0].startedAt, '2026-04-23T05:00:02.000Z');
  assert.equal(cards[0].finalResponse, '最终汇总');
  assert.deepEqual(cards[0].processItems.map((item) => item.kind), ['tool_use', 'tool_result']);
});

test('projectHistoricalRunCards 不会把分页切片里的 process-only 半截 run 伪造成 standalone 历史卡', () => {
  const cards = projectHistoricalRunCards([
    {
      id: 'think-1',
      sessionId: 'sess-mid-page-process-only',
      role: 'assistant',
      text: '思考中...',
      timestamp: '2026-04-23T05:00:02.000Z',
      kind: 'thinking',
      type: 'thinking',
    },
    {
      id: 'tool-1',
      sessionId: 'sess-mid-page-process-only',
      role: 'assistant',
      text: null,
      content: [{ type: 'tool_use', name: 'Write', input: { path: '/tmp/report.md' } }],
      timestamp: '2026-04-23T05:00:03.000Z',
      kind: 'tool_use',
      type: 'tool_use',
      toolName: 'Write',
    },
    {
      id: 'result-1',
      sessionId: 'sess-mid-page-process-only',
      role: 'tool',
      text: 'MD',
      timestamp: '2026-04-23T05:00:04.000Z',
      kind: 'tool_result',
      type: 'tool_result',
    },
  ]);

  assert.deepEqual(cards, []);
});

test('projectHistoricalRunCards 保留 tool 和 boundary 类历史过程项供 Run Card 投影使用', () => {
  const cards = projectHistoricalRunCards([
    {
      id: 'user-1',
      sessionId: 'sess-1',
      role: 'user',
      text: '请执行',
      timestamp: '2026-04-23T05:00:00.000Z',
      kind: 'text',
      type: 'message',
    },
    {
      id: 'tool-use-1',
      sessionId: 'sess-1',
      role: 'tool',
      text: null,
      content: [{ type: 'tool_use', name: 'Read' }],
      timestamp: '2026-04-23T05:00:01.000Z',
      kind: 'tool_use',
      type: 'tool_use',
      toolName: 'Read',
    },
    {
      id: 'tool-result-1',
      sessionId: 'sess-1',
      role: 'tool',
      text: '已读取文件',
      content: [{ type: 'tool_result', tool_name: 'Read', content: '已读取文件' }],
      timestamp: '2026-04-23T05:00:02.000Z',
      kind: 'tool_result',
      type: 'tool_result',
      toolName: 'Read',
    },
    {
      id: 'interactive-1',
      sessionId: 'sess-1',
      role: 'tool',
      text: '需要确认',
      timestamp: '2026-04-23T05:00:03.000Z',
      kind: 'interactive_prompt',
      type: 'interactive_prompt',
      toolName: 'AskUserQuestion',
    },
    {
      id: 'permission-1',
      sessionId: 'sess-1',
      role: 'tool',
      text: '需要授权',
      timestamp: '2026-04-23T05:00:04.000Z',
      kind: 'permission_request',
      type: 'permission_request',
      toolName: 'Bash',
    },
    {
      id: 'compact-1',
      sessionId: 'sess-1',
      role: 'assistant',
      text: null,
      timestamp: '2026-04-23T05:00:05.000Z',
      kind: 'compact_boundary',
      type: 'compact_boundary',
    },
    {
      id: 'assistant-1',
      sessionId: 'sess-1',
      role: 'assistant',
      text: '这是最终回答',
      timestamp: '2026-04-23T05:00:06.000Z',
      kind: 'message',
      type: 'message',
    },
  ]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0].defaultExpanded, false);
  assert.deepEqual(
    cards[0].processItems.map((item) => [item.kind, item.title]),
    [
      ['tool_use', '工具调用 · Read'],
      ['tool_result', '工具结果 · Read'],
      ['interactive_prompt', '交互提问'],
      ['permission_request', '权限请求'],
      ['compact_boundary', '压缩边界'],
    ],
  );
  assert.match(cards[0].processItems[1].body, /已读取文件/);
});

test('projectHistoricalRunCards 在历史以 tool_result 或 compact_boundary 结尾时仍然产出 card', () => {
  const scenarios = [
    {
      label: 'tool_result',
      messages: [
        {
          id: 'user-1',
          sessionId: 'sess-1',
          role: 'user',
          text: '请执行',
          timestamp: '2026-04-23T05:00:00.000Z',
          kind: 'text',
          type: 'message',
        },
        {
          id: 'tool-result-1',
          sessionId: 'sess-1',
          role: 'tool',
          text: '已完成读取',
          content: [{ type: 'tool_result', tool_name: 'Read', content: '已完成读取' }],
          timestamp: '2026-04-23T05:00:02.000Z',
          kind: 'tool_result',
          type: 'tool_result',
          toolName: 'Read',
        },
      ],
    },
    {
      label: 'compact_boundary',
      messages: [
        {
          id: 'user-2',
          sessionId: 'sess-2',
          role: 'user',
          text: '请继续',
          timestamp: '2026-04-23T05:10:00.000Z',
          kind: 'text',
          type: 'message',
        },
        {
          id: 'boundary-1',
          sessionId: 'sess-2',
          role: 'assistant',
          text: null,
          timestamp: '2026-04-23T05:10:03.000Z',
          kind: 'compact_boundary',
          type: 'compact_boundary',
        },
      ],
    },
  ];

  for (const scenario of scenarios) {
    const cards = projectHistoricalRunCards(scenario.messages);

    assert.equal(cards.length, 1, scenario.label);
    assert.equal(cards[0].defaultExpanded, false, scenario.label);
    assert.equal(cards[0].completedAt, scenario.messages[scenario.messages.length - 1].timestamp, scenario.label);
    assert.equal(cards[0].updatedAt, scenario.messages[scenario.messages.length - 1].timestamp, scenario.label);
    assert.ok(cards[0].processItems.length > 0, scenario.label);
  }
});

test('projectHistoricalRunCards 在下一条 user 到来前结束的 process-only 轮次也会 flush 成 card', () => {
  const cards = projectHistoricalRunCards([
    {
      id: 'user-1',
      sessionId: 'sess-1',
      role: 'user',
      text: '请执行',
      timestamp: '2026-04-23T05:00:00.000Z',
      kind: 'text',
      type: 'message',
    },
    {
      id: 'tool-result-1',
      sessionId: 'sess-1',
      role: 'tool',
      text: '已完成读取',
      content: [{ type: 'tool_result', tool_name: 'Read', content: '已完成读取' }],
      timestamp: '2026-04-23T05:00:02.000Z',
      kind: 'tool_result',
      type: 'tool_result',
      toolName: 'Read',
    },
    {
      id: 'user-2',
      sessionId: 'sess-1',
      role: 'user',
      text: '继续下一步',
      timestamp: '2026-04-23T05:00:03.000Z',
      kind: 'text',
      type: 'message',
    },
    {
      id: 'assistant-2',
      sessionId: 'sess-1',
      role: 'assistant',
      text: '第二轮回答',
      timestamp: '2026-04-23T05:00:04.000Z',
      kind: 'message',
      type: 'message',
    },
  ]);

  assert.equal(cards.length, 2);
  assert.equal(cards[0].anchorMessageId, 'user-1');
  assert.equal(cards[0].finalResponse, '');
  assert.deepEqual(cards[0].processItems.map((item) => item.kind), ['tool_result']);
});

test('projectHistoricalRunCards 在 assistant 后面还有 activity 时 completedAt 会取最后 activity 时间', () => {
  const cards = projectHistoricalRunCards([
    {
      id: 'user-1',
      sessionId: 'sess-1',
      role: 'user',
      text: '请执行',
      timestamp: '2026-04-23T05:00:00.000Z',
      kind: 'text',
      type: 'message',
    },
    {
      id: 'assistant-1',
      sessionId: 'sess-1',
      role: 'assistant',
      text: '先给出初步结果',
      timestamp: '2026-04-23T05:00:02.000Z',
      kind: 'message',
      type: 'message',
    },
    {
      id: 'debug-1',
      sessionId: 'sess-1',
      role: 'tool',
      text: null,
      content: { label: 'sdk_debug_log#42', path: '/tmp/debug.log' },
      timestamp: '2026-04-23T05:00:05.000Z',
      kind: 'debug_ref',
      type: 'debug_ref',
    },
    {
      id: 'user-2',
      sessionId: 'sess-1',
      role: 'user',
      text: '下一轮',
      timestamp: '2026-04-23T05:00:06.000Z',
      kind: 'text',
      type: 'message',
    },
  ]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0].completedAt, '2026-04-23T05:00:05.000Z');
  assert.equal(cards[0].updatedAt, '2026-04-23T05:00:05.000Z');
  assert.equal(cards[0].processItems[cards[0].processItems.length - 1].kind, 'debug_ref');
});

test('projectHistoricalRunCards 在文件末尾直接 flush 时也会让 completedAt 取最后 activity 时间', () => {
  const cards = projectHistoricalRunCards([
    {
      id: 'user-1',
      sessionId: 'sess-1',
      role: 'user',
      text: '请执行',
      timestamp: '2026-04-23T05:00:00.000Z',
      kind: 'text',
      type: 'message',
    },
    {
      id: 'assistant-1',
      sessionId: 'sess-1',
      role: 'assistant',
      text: '先给出初步结果',
      timestamp: '2026-04-23T05:00:02.000Z',
      kind: 'message',
      type: 'message',
    },
    {
      id: 'status-1',
      sessionId: 'sess-1',
      role: 'tool',
      text: 'still active',
      content: { status: 'running', detail: 'still active' },
      timestamp: '2026-04-23T05:00:05.000Z',
      kind: 'session_status',
      type: 'session_status',
    },
  ]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0].completedAt, '2026-04-23T05:00:05.000Z');
  assert.equal(cards[0].updatedAt, '2026-04-23T05:00:05.000Z');
  assert.equal(cards[0].processItems[cards[0].processItems.length - 1].kind, 'session_status');
});

test('projectHistoricalRunCards 把 session_status 和 debug_ref 归入 processItems', () => {
  const cards = projectHistoricalRunCards([
    {
      id: 'user-1',
      sessionId: 'sess-1',
      role: 'user',
      text: '请继续',
      timestamp: '2026-04-23T05:20:00.000Z',
      kind: 'text',
      type: 'message',
    },
    {
      id: 'status-1',
      sessionId: 'sess-1',
      role: 'tool',
      text: 'still active',
      content: { status: 'running', detail: 'still active' },
      timestamp: '2026-04-23T05:20:01.000Z',
      kind: 'session_status',
      type: 'session_status',
    },
    {
      id: 'debug-1',
      sessionId: 'sess-1',
      role: 'tool',
      text: null,
      content: { label: 'sdk_debug_log#42', path: '/tmp/debug.log', payload: { trace: 42 } },
      timestamp: '2026-04-23T05:20:02.000Z',
      kind: 'debug_ref',
      type: 'debug_ref',
    },
  ]);

  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0].processItems.map((item) => item.kind), ['session_status', 'debug_ref']);
  assert.equal(cards[0].processItems[0].title, '会话状态');
  assert.match(cards[0].processItems[0].body, /running/);
  assert.equal(cards[0].processItems[0].tone, 'neutral');
  assert.equal(cards[0].processItems[1].title, '调试引用');
  assert.match(cards[0].processItems[1].body, /sdk_debug_log#42/);
  assert.match(cards[0].processItems[1].body, /\/tmp\/debug\.log/);
});

test('projectHistoricalRunCards preserves structured payloads on tool process items so related files can be extracted in the card', () => {
  const cards = projectHistoricalRunCards([
    {
      id: 'user-1',
      sessionId: 'sess-related-files',
      role: 'user',
      text: '修改文档',
      timestamp: '2026-04-26T10:00:00.000Z',
      kind: 'message',
      type: 'message',
    },
    {
      id: 'tool-use-1',
      sessionId: 'sess-related-files',
      role: 'tool',
      text: null,
      content: {
        tool_name: 'Write',
        input: {
          file_path: '/demo/docs/PRD-CodeReview-AI.md',
        },
      },
      timestamp: '2026-04-26T10:00:01.000Z',
      kind: 'tool_use',
      type: 'tool_use',
    },
    {
      id: 'assistant-1',
      sessionId: 'sess-related-files',
      role: 'assistant',
      text: '已修改文档。',
      timestamp: '2026-04-26T10:00:03.000Z',
      kind: 'message',
      type: 'message',
    },
  ]);

  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0].processItems[0].payload, {
    tool_name: 'Write',
    input: {
      file_path: '/demo/docs/PRD-CodeReview-AI.md',
    },
  });
});

test('projectHistoricalRunCards 不会把 completed session_status 额外投影成历史过程项', () => {
  const cards = projectHistoricalRunCards([
    {
      id: 'user-1',
      sessionId: 'sess-terminal-status',
      role: 'user',
      text: '请执行',
      timestamp: '2026-04-23T05:30:00.000Z',
      kind: 'message',
      type: 'message',
    },
    {
      id: 'assistant-1',
      sessionId: 'sess-terminal-status',
      role: 'assistant',
      text: '执行完成',
      timestamp: '2026-04-23T05:30:02.000Z',
      kind: 'message',
      type: 'message',
    },
    {
      id: 'status-1',
      sessionId: 'sess-terminal-status',
      role: 'tool',
      text: 'run finished',
      content: { status: 'completed', detail: 'run finished' },
      timestamp: '2026-04-23T05:30:03.000Z',
      kind: 'session_status',
      type: 'session_status',
    },
  ]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0].completedAt, '2026-04-23T05:30:03.000Z');
  assert.equal(cards[0].updatedAt, '2026-04-23T05:30:03.000Z');
  assert.deepEqual(cards[0].processItems, []);
});

test('projectLiveRunCards 将 sdk live 事件投影成进行中 Run Card，并携带 processItems 与 activeInteraction', () => {
  const cards = projectLiveRunCards({
    sessionId: 'sess-1',
    anchoredUserMessages: [
      {
        messageId: 'user-1',
        content: '帮我规划一个需求',
        timestamp: '2026-04-23T05:00:00.000Z',
      },
    ],
    events: [
      {
        id: 'evt-1',
        sessionId: 'sess-1',
        timestamp: '2026-04-23T05:00:01.000Z',
        type: 'sdk.message',
        message: { kind: 'thinking', text: '先分析一下' },
      },
      {
        id: 'evt-2',
        sessionId: 'sess-1',
        timestamp: '2026-04-23T05:00:02.000Z',
        type: 'interaction.required',
        requestId: 'req-1',
        interaction: {
          kind: 'interactive_prompt',
          toolName: 'AskUserQuestion',
          message: '请确认背景描述',
          input: { question: '背景描述准确吗？' },
        },
      },
    ],
  });

  assert.equal(cards.length, 1);
  assert.equal(cards[0].cardStatus, 'waiting_for_input');
  assert.equal(cards[0].defaultExpanded, true);
  assert.equal(cards[0].activeInteraction?.requestId, 'req-1');
  assert.deepEqual(cards[0].processItems.map((item) => item.kind), ['thinking', 'interactive_prompt']);
  assert.equal(cards[0].processItems[0].title, '思考');
  assert.equal(cards[0].processItems[1].title, '交互提问');
});

test('projectLiveRunCards 只把 assistant.message.delta 累加成完整 finalResponse', () => {
  const cards = projectLiveRunCards({
    sessionId: 'sess-1',
    anchoredUserMessages: [
      {
        messageId: 'user-1',
        content: '帮我续写一句话',
        timestamp: '2026-04-23T05:00:00.000Z',
      },
    ],
    events: [
      {
        id: 'evt-1',
        sessionId: 'sess-1',
        timestamp: '2026-04-23T05:00:01.000Z',
        type: 'sdk.message',
        message: { kind: 'assistant.message.delta', text: '你好，' },
      },
      {
        id: 'evt-2',
        sessionId: 'sess-1',
        timestamp: '2026-04-23T05:00:02.000Z',
        type: 'sdk.message',
        message: { kind: 'assistant.message.delta', text: '世界！' },
      },
    ],
  });

  assert.equal(cards[0].finalResponse, '你好，世界！');
  assert.deepEqual(cards[0].processItems.map((item) => item.kind), []);
});

test('projectLiveRunCards no longer folds legacy stream_delta into the final assistant response', () => {
  const cards = projectLiveRunCards({
    sessionId: 'sess-1',
    anchoredUserMessages: [
      {
        messageId: 'user-1',
        content: '帮我续写一句话',
        timestamp: '2026-04-23T05:00:00.000Z',
      },
    ],
    events: [
      {
        id: 'evt-1',
        sessionId: 'sess-1',
        timestamp: '2026-04-23T05:00:01.000Z',
        type: 'sdk.message',
        message: { kind: 'assistant.message.delta', text: '你好，' },
      },
      {
        id: 'evt-2',
        sessionId: 'sess-1',
        timestamp: '2026-04-23T05:00:02.000Z',
        type: 'sdk.message',
        message: { kind: 'stream_delta', text: '世界！' },
      },
    ],
  });

  assert.equal(cards[0].finalResponse, '你好，');
  assert.deepEqual(cards[0].processItems.map((item) => item.kind), ['notice']);
  assert.equal(cards[0].processItems[0].title, 'stream_delta');
});

test('projectLiveRunCards 会把 tool.call.started 与 tool.call.completed 归入 processItems', () => {
  const cards = projectLiveRunCards({
    sessionId: 'sess-1',
    anchoredUserMessages: [
      {
        messageId: 'user-1',
        content: '读取并总结文件',
        timestamp: '2026-04-23T05:00:00.000Z',
      },
    ],
    events: [
      {
        id: 'evt-tool-1',
        sessionId: 'sess-1',
        timestamp: '2026-04-23T05:00:01.000Z',
        type: 'sdk.message',
        message: {
          kind: 'tool.call.started',
          toolName: 'Read',
          input: { file_path: '/workspace/demo/app.ts' },
        },
      },
      {
        id: 'evt-tool-2',
        sessionId: 'sess-1',
        timestamp: '2026-04-23T05:00:02.000Z',
        type: 'sdk.message',
        message: {
          kind: 'tool.call.completed',
          toolName: 'Read',
          output: 'done',
        },
      },
    ],
  });

  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0].processItems.map((item) => item.kind), ['tool_use', 'tool_result']);
  assert.equal(cards[0].processItems[0].title, '工具调用 · Read');
  assert.equal(cards[0].processItems[1].title, '工具结果 · Read');
});

test('projectLiveRunCards 会把子代理 task_progress 与 tool_progress 投影进当前 Run Card 过程', () => {
  const cards = projectLiveRunCards({
    sessionId: 'sess-subagent',
    anchoredUserMessages: [
      {
        messageId: 'user-1',
        content: '帮我派两个子代理去调研佛山的经济和天气',
        timestamp: '2026-04-26T09:27:35.000Z',
      },
    ],
    events: [
      {
        id: 'evt-task-started',
        runId: 'run-subagent',
        sessionId: 'sess-subagent',
        timestamp: '2026-04-26T09:27:41.000Z',
        type: 'sdk.message',
        message: {
          kind: 'task_started',
          text: '调研佛山经济概况',
          payload: {
            taskId: 'task-economy',
            toolId: 'parent-tool-1',
          },
        },
      },
      {
        id: 'evt-task-progress',
        runId: 'run-subagent',
        sessionId: 'sess-subagent',
        timestamp: '2026-04-26T09:28:20.000Z',
        type: 'sdk.message',
        message: {
          kind: 'task_progress',
          text: '已抓取 GDP 与产业结构资料',
          payload: {
            taskId: 'task-economy',
            toolId: 'parent-tool-1',
            lastToolName: 'WebSearch',
          },
        },
      },
      {
        id: 'evt-tool-progress',
        runId: 'run-subagent',
        sessionId: 'sess-subagent',
        timestamp: '2026-04-26T09:29:10.000Z',
        type: 'sdk.message',
        message: {
          kind: 'tool_progress',
          text: 'WebSearch 运行中',
          toolName: 'WebSearch',
          payload: {
            taskId: 'task-economy',
            parentToolUseId: 'parent-tool-1',
            elapsedTimeSeconds: 89,
          },
        },
      },
    ],
  });

  assert.equal(cards.length, 1);
  assert.deepEqual(
    cards[0].processItems.map((item) => item.kind),
    ['subagent_progress', 'subagent_progress', 'subagent_progress'],
  );
  assert.deepEqual(
    cards[0].processItems.map((item) => item.title),
    ['子代理任务', '子代理进度', '子代理工具进度'],
  );
  assert.match(cards[0].processItems[0].body, /调研佛山经济概况/);
  assert.match(cards[0].processItems[1].body, /已抓取 GDP 与产业结构资料/);
  assert.match(cards[0].processItems[2].body, /WebSearch 运行中/);
});

test('projectLiveRunCards no longer treats legacy tool_use_partial and tool_result as primary live process items', () => {
  const cards = projectLiveRunCards({
    sessionId: 'sess-1',
    anchoredUserMessages: [
      {
        messageId: 'user-1',
        content: '读取并总结文件',
        timestamp: '2026-04-23T05:00:00.000Z',
      },
    ],
    events: [
      {
        id: 'evt-tool-legacy-1',
        sessionId: 'sess-1',
        timestamp: '2026-04-23T05:00:01.000Z',
        type: 'sdk.message',
        message: {
          kind: 'tool_use_partial',
          toolName: 'Read',
          input: { file_path: '/workspace/demo/app.ts' },
        },
      },
      {
        id: 'evt-tool-legacy-2',
        sessionId: 'sess-1',
        timestamp: '2026-04-23T05:00:02.000Z',
        type: 'sdk.message',
        message: {
          kind: 'tool_result',
          toolName: 'Read',
          output: 'done',
        },
      },
    ],
  });

  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0].processItems.map((item) => item.kind), ['notice', 'notice']);
  assert.deepEqual(cards[0].processItems.map((item) => item.title), ['tool_use_partial', 'tool_result']);
});

test('projectLiveRunCards 会在 interaction.resolved 后清空 activeInteraction 并恢复状态', () => {
  const cards = projectLiveRunCards({
    sessionId: 'sess-1',
    anchoredUserMessages: [
      {
        messageId: 'user-1',
        content: '请先等我确认',
        timestamp: '2026-04-23T05:00:00.000Z',
      },
    ],
    events: [
      {
        id: 'evt-1',
        sessionId: 'sess-1',
        timestamp: '2026-04-23T05:00:01.000Z',
        type: 'interaction.required',
        requestId: 'req-1',
        interaction: {
          kind: 'permission',
          toolName: 'Bash',
          message: '是否允许执行命令？',
        },
      },
      {
        id: 'evt-2',
        sessionId: 'sess-1',
        timestamp: '2026-04-23T05:00:02.000Z',
        type: 'interaction.resolved',
        requestId: 'req-1',
        outcome: 'accepted',
        message: '用户已允许',
      },
    ],
  });

  assert.equal(cards[0].cardStatus, 'running');
  assert.equal(cards[0].headline, '执行中');
  assert.equal(cards[0].activeInteraction, null);
  assert.deepEqual(cards[0].processItems.map((item) => item.kind), ['permission_request', 'notice']);
});

test('projectLiveRunCards 在 interaction.required 后遇到 session.status(running) 时仍保持 waiting_for_input', () => {
  const cards = projectLiveRunCards({
    sessionId: 'sess-1',
    anchoredUserMessages: [
      {
        messageId: 'user-1',
        content: '请等我确认',
        timestamp: '2026-04-23T05:00:00.000Z',
      },
    ],
    events: [
      {
        id: 'evt-1',
        sessionId: 'sess-1',
        timestamp: '2026-04-23T05:00:01.000Z',
        type: 'interaction.required',
        requestId: 'req-1',
        interaction: {
          kind: 'interactive_prompt',
          toolName: 'AskUserQuestion',
          message: '请确认背景描述',
        },
      },
      {
        id: 'evt-2',
        sessionId: 'sess-1',
        timestamp: '2026-04-23T05:00:02.000Z',
        type: 'session.status',
        status: 'running',
        detail: 'still active',
      },
    ],
  });

  assert.equal(cards[0].cardStatus, 'waiting_for_input');
  assert.equal(cards[0].headline, '等待你的回答');
  assert.ok(cards[0].activeInteraction);
  assert.equal(cards[0].processItems[1].tone, 'neutral');
});

test('projectLiveRunCards 会在 resolved requestId 不匹配时保留当前 activeInteraction', () => {
  const cards = projectLiveRunCards({
    sessionId: 'sess-1',
    anchoredUserMessages: [
      {
        messageId: 'user-1',
        content: '请等我确认',
        timestamp: '2026-04-23T05:00:00.000Z',
      },
    ],
    events: [
      {
        id: 'evt-1',
        sessionId: 'sess-1',
        timestamp: '2026-04-23T05:00:01.000Z',
        type: 'interaction.required',
        requestId: 'req-1',
        interaction: {
          kind: 'permission',
          toolName: 'Bash',
          message: '是否允许执行命令？',
        },
      },
      {
        id: 'evt-2',
        sessionId: 'sess-1',
        timestamp: '2026-04-23T05:00:02.000Z',
        type: 'interaction.resolved',
        requestId: 'req-2',
        outcome: 'accepted',
        message: '别的请求已处理',
      },
    ],
  });

  assert.equal(cards[0].cardStatus, 'waiting_for_input');
  assert.equal(cards[0].activeInteraction?.requestId, 'req-1');
  assert.deepEqual(cards[0].processItems.map((item) => item.kind), ['permission_request', 'notice']);
});

test('projectLiveRunCards 会在 interaction.required 后收到 session.status 终态时清空 activeInteraction', () => {
  const scenarios = ['completed', 'failed', 'aborted'];

  for (const status of scenarios) {
    const cards = projectLiveRunCards({
      sessionId: 'sess-1',
      anchoredUserMessages: [
        {
          messageId: 'user-1',
          content: '请执行',
          timestamp: '2026-04-23T05:00:00.000Z',
        },
      ],
      events: [
        {
          id: 'evt-1',
          sessionId: 'sess-1',
          timestamp: '2026-04-23T05:00:01.000Z',
          type: 'interaction.required',
          requestId: 'req-1',
          interaction: {
            kind: 'permission',
            toolName: 'Bash',
            message: '是否允许执行命令？',
          },
        },
        {
          id: `evt-${status}`,
          sessionId: 'sess-1',
          timestamp: '2026-04-23T05:00:03.000Z',
          type: 'session.status',
          status,
          detail: 'run finished',
        },
      ],
    });

    assert.equal(cards[0].cardStatus, status);
    assert.equal(cards[0].activeInteraction, null);
    assert.equal(cards[0].completedAt, '2026-04-23T05:00:03.000Z');
  }
});

test('projectLiveRunCards 会把 session.status 终态投影成正确的 cardStatus 与 completedAt', () => {
  const scenarios = [
    { status: 'running', expectedHeadline: '执行中', expectedTone: 'neutral' },
    { status: 'completed', expectedHeadline: '已完成', expectedTone: 'neutral' },
    { status: 'failed', expectedHeadline: '执行失败', expectedTone: 'danger' },
    { status: 'aborted', expectedHeadline: '已中止', expectedTone: 'danger' },
  ];

  for (const scenario of scenarios) {
    const cards = projectLiveRunCards({
      sessionId: 'sess-1',
      anchoredUserMessages: [
        {
          messageId: 'user-1',
          content: '请执行',
          timestamp: '2026-04-23T05:00:00.000Z',
        },
      ],
      events: [
        {
          id: `evt-${scenario.status}`,
          sessionId: 'sess-1',
          timestamp: '2026-04-23T05:00:03.000Z',
          type: 'session.status',
          status: scenario.status,
          detail: 'run finished',
        },
      ],
    });

    assert.equal(cards[0].headline, scenario.expectedHeadline);
    if (scenario.status === 'running') {
      assert.equal(cards[0].cardStatus, 'running');
      assert.equal(cards[0].completedAt, null);
      assert.equal(cards[0].processItems[0].kind, 'session_status');
      assert.equal(cards[0].processItems[0].title, '会话状态');
      assert.equal(cards[0].processItems[0].tone, scenario.expectedTone);
      assert.match(cards[0].processItems[0].body, /running/);
      assert.match(cards[0].processItems[0].body, /run finished/);
    } else {
      assert.equal(cards[0].cardStatus, scenario.status);
      assert.equal(cards[0].completedAt, '2026-04-23T05:00:03.000Z');
      assert.deepEqual(cards[0].processItems, []);
    }
  }
});

test('projectLiveRunCards 会把 debug.ref 事件放进 processItems', () => {
  const cards = projectLiveRunCards({
    sessionId: 'sess-1',
    anchoredUserMessages: [
      {
        messageId: 'user-1',
        content: '请输出调试信息',
        timestamp: '2026-04-23T05:00:00.000Z',
      },
    ],
    events: [
      {
        id: 'evt-1',
        sessionId: 'sess-1',
        timestamp: '2026-04-23T05:00:04.000Z',
        type: 'debug.ref',
        ref: {
          label: 'sdk_debug_log#42',
          path: '/tmp/debug.log',
        },
      },
    ],
  });

  assert.deepEqual(cards[0].processItems.map((item) => item.kind), ['debug_ref']);
  assert.equal(cards[0].processItems[0].title, '调试引用');
  assert.equal(cards[0].processItems[0].tone, 'neutral');
  assert.match(cards[0].processItems[0].body, /sdk_debug_log#42/);
  assert.match(cards[0].processItems[0].body, /\/tmp\/debug\.log/);
});

test('projectLiveRunCards 会为同一 session 中的多个 run 保留各自的 live 卡片，并锚定到对应用户消息', () => {
  const cards = projectLiveRunCards({
    sessionId: 'sess-1',
    anchoredUserMessages: [
      {
        messageId: 'user-older',
        content: '先回答上一个问题',
        timestamp: '2026-04-23T05:00:00.000Z',
      },
      {
        messageId: 'user-compact',
        content: '/compact',
        timestamp: '2026-04-23T05:00:05.000Z',
      },
    ],
    events: [
      {
        id: 'evt-old-thinking',
        runId: 'run-older',
        sessionId: 'sess-1',
        timestamp: '2026-04-23T05:00:01.000Z',
        type: 'sdk.message',
        message: { kind: 'thinking', text: '旧 run 正在思考' },
      },
      {
        id: 'evt-new-starting',
        runId: 'run-compact',
        sessionId: 'sess-1',
        timestamp: '2026-04-23T05:00:05.100Z',
        type: 'session.status',
        status: 'starting',
        detail: 'compact run started',
      },
      {
        id: 'evt-old-completed',
        runId: 'run-older',
        sessionId: 'sess-1',
        timestamp: '2026-04-23T05:00:05.200Z',
        type: 'session.status',
        status: 'completed',
        detail: 'older run finished late',
      },
      {
        id: 'evt-new-boundary',
        runId: 'run-compact',
        sessionId: 'sess-1',
        timestamp: '2026-04-23T05:00:05.300Z',
        type: 'sdk.message',
        message: { kind: 'compact_boundary', text: '上下文已压缩' },
      },
    ],
  });

  assert.equal(cards.length, 2);
  assert.equal(cards[0].anchorMessageId, 'user-older');
  assert.equal(cards[0].cardStatus, 'completed');
  assert.equal(cards[1].anchorMessageId, 'user-compact');
  assert.equal(cards[1].cardStatus, 'running');
  assert.deepEqual(
    cards[1].processItems.map((item) => item.body),
    ['starting\n\ncompact run started', '上下文已压缩'],
  );
  assert.deepEqual(
    cards[0].processItems.map((item) => item.body),
    ['旧 run 正在思考'],
  );
});

test('projectLiveRunCards tolerates slight event timestamp skew and still anchors to the latest nearby user message', () => {
  const cards = projectLiveRunCards({
    sessionId: 'sess-skew',
    anchoredUserMessages: [
      {
        messageId: 'user-first',
        content: '/pm-brainstorming',
        timestamp: '2026-04-24T08:36:14.000Z',
      },
      {
        messageId: 'user-second',
        content: '111',
        timestamp: '2026-04-24T08:42:14.000Z',
      },
    ],
    events: [
      {
        id: 'evt-skew-starting',
        runId: 'run-second',
        sessionId: 'sess-skew',
        timestamp: '2026-04-24T08:42:13.400Z',
        type: 'session.status',
        status: 'starting',
        detail: 'second run started',
      },
      {
        id: 'evt-skew-completed',
        runId: 'run-second',
        sessionId: 'sess-skew',
        timestamp: '2026-04-24T08:42:20.000Z',
        type: 'session.status',
        status: 'completed',
        detail: 'second run completed',
      },
      {
        id: 'evt-skew-assistant',
        runId: 'run-second',
        sessionId: 'sess-skew',
        timestamp: '2026-04-24T08:42:20.100Z',
        type: 'sdk.message',
        message: { kind: 'assistant.message.delta', text: '收到，请问有什么我可以帮您的？' },
      },
    ],
  });

  assert.equal(cards.length, 1);
  assert.equal(cards[0].anchorMessageId, 'user-second');
  assert.equal(cards[0].finalResponse, '收到，请问有什么我可以帮您的？');
});
