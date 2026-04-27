import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizedToChatMessages } from './useChatMessages.ts';

test('normalizedToChatMessages renders result success content when no assistant text was shown earlier', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'result-1',
      kind: 'result',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:00.000Z',
      content: '最终答案',
      isError: false,
    },
  ]);

  assert.equal(chatMessages.length, 1);
  assert.equal(chatMessages[0].type, 'assistant');
  assert.equal(chatMessages[0].content, '最终答案');
});

test('normalizedToChatMessages renders in-progress assistant text and tool call as separate messages', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'assistant-1',
      kind: 'text',
      role: 'assistant',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-19T10:00:00.000Z',
      content: '我先检查一下。',
    },
    {
      id: 'tool-use-1',
      kind: 'tool_use',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-19T10:00:01.000Z',
      toolName: 'Read',
      toolId: 'tool-1',
      toolInput: {
        file_path: '/workspace/a.md',
      },
    },
  ]);

  assert.equal(chatMessages.length, 2);
  assert.equal(chatMessages[0].type, 'assistant');
  assert.equal(chatMessages[0].content, '我先检查一下。');
  assert.equal(chatMessages[1].type, 'assistant');
  assert.equal(chatMessages[1].isToolUse, true);
  assert.equal(chatMessages[1].toolName, 'Read');
});

test('normalizedToChatMessages does not render roleless text records as assistant bubbles', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'user-1',
      kind: 'text',
      role: 'user',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-26T17:30:20.000Z',
      content: '321',
    },
    {
      id: 'roleless-text-1',
      kind: 'text',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-26T17:30:20.100Z',
      content: '321',
    },
  ]);

  assert.deepEqual(
    chatMessages.map((message) => [message.type, message.content]),
    [['user', '321']],
  );
});

test('normalizedToChatMessages attaches result usage summary to a matching assistant summary instead of duplicating it', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'assistant-1',
      kind: 'text',
      role: 'assistant',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:00.000Z',
      content: '最终答案',
    },
    {
      id: 'result-1',
      kind: 'result',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:01.000Z',
      content: '最终答案',
      isError: false,
      totalCostUsd: 0.0123,
      modelUsage: {
        sonnet: {
          inputTokens: 1000,
          outputTokens: 500,
        },
      },
    },
  ]);

  assert.equal(chatMessages.length, 1);
  assert.equal(chatMessages[0].type, 'assistant');
  assert.equal(chatMessages[0].content, '最终答案');
  assert.equal(chatMessages[0].usageSummary?.totalCostUsd, 0.0123);
  assert.deepEqual(chatMessages[0].usageSummary?.modelUsage, {
    sonnet: {
      inputTokens: 1000,
      outputTokens: 500,
    },
  });
});

test('normalizedToChatMessages includes structured output from result messages', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'result-1',
      kind: 'result',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:00.000Z',
      content: '整理完成',
      isError: false,
      structuredOutput: {
        title: '登录页',
        changed: true,
      },
    },
  ]);

  assert.equal(chatMessages.length, 1);
  assert.equal(chatMessages[0].type, 'assistant');
  assert.equal(chatMessages[0].content, '整理完成');
  assert.deepEqual(chatMessages[0].structuredOutput, {
    title: '登录页',
    changed: true,
  });
  assert.equal(chatMessages[0].usageSummary?.totalCostUsd, null);
});

test('normalizedToChatMessages renders compact boundary and task progress as compact notifications', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'compact-1',
      kind: 'compact_boundary',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:00.000Z',
      status: 'auto',
      tokens: 24000,
    },
    {
      id: 'task-progress-1',
      kind: 'task_progress',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:01.000Z',
      content: '正在整理文件修改',
      status: 'in_progress',
    },
  ]);

  assert.equal(chatMessages.length, 2);
  assert.equal(chatMessages[0].isTaskNotification, true);
  assert.match(chatMessages[0].content, /会话上下文已自动压缩/);
  assert.equal(chatMessages[1].isTaskNotification, true);
  assert.equal(chatMessages[1].content, '正在整理文件修改');
});

test('normalizedToChatMessages renders permission requests as waiting notifications in the message list', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'permission-1',
      kind: 'permission_request',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-18T10:00:00.000Z',
      requestId: 'req-1',
      toolName: 'Bash',
    },
  ]);

  assert.equal(chatMessages.length, 1);
  assert.equal(chatMessages[0].isTaskNotification, true);
  assert.equal(chatMessages[0].taskStatus, 'waiting');
  assert.match(chatMessages[0].content || '', /等待权限/);
  assert.match(chatMessages[0].content || '', /Bash/);
});

test('normalizedToChatMessages no longer upgrades AskUserQuestion permission requests into interactive prompts', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'question-1',
      kind: 'permission_request',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-18T10:00:00.000Z',
      requestId: 'req-ask-1',
      toolName: 'AskUserQuestion',
      input: {
        questions: [
          {
            question: '你希望怎么处理这个问题？',
          },
        ],
      },
    },
  ]);

  assert.equal(chatMessages.length, 1);
  assert.equal(chatMessages[0].normalizedKind, 'permission_request');
  assert.equal(chatMessages[0].isTaskNotification, true);
  assert.equal(chatMessages[0].isInteractivePrompt, undefined);
  assert.match(chatMessages[0].content || '', /等待权限/);
  assert.match(chatMessages[0].content || '', /AskUserQuestion/);
});

test('normalizedToChatMessages renders interactive_prompt messages directly as prompts', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'interactive-1',
      kind: 'interactive_prompt',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-18T10:00:00.000Z',
      requestId: 'req-interactive-1',
      toolName: 'AskUserQuestion',
      content: '请选择一个继续方式',
    },
  ]);

  assert.equal(chatMessages.length, 1);
  assert.equal(chatMessages[0].normalizedKind, 'interactive_prompt');
  assert.equal(chatMessages[0].isInteractivePrompt, true);
  assert.equal(chatMessages[0].content, '请选择一个继续方式');
});

test('normalizedToChatMessages renders agent_sdk_message stream deltas as streaming assistant messages', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'sdk-stream-1',
      kind: 'agent_sdk_message',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-18T10:00:00.000Z',
      sdkMessage: {
        sdkType: 'stream_event',
        payload: {
          event: {
            type: 'content_block_delta',
            delta: {
              text: '实时输出',
            },
          },
        },
      },
    },
  ]);

  assert.equal(chatMessages.length, 1);
  assert.equal(chatMessages[0].type, 'assistant');
  assert.equal(chatMessages[0].normalizedKind, 'stream_delta');
  assert.equal(chatMessages[0].isStreaming, true);
  assert.equal(chatMessages[0].content, '实时输出');
});

test('normalizedToChatMessages renders agent_sdk_message results as final assistant messages', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'sdk-result-1',
      kind: 'agent_sdk_message',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-18T10:00:01.000Z',
      sdkMessage: {
        sdkType: 'result',
        payload: {
          result: '最终结果',
          subtype: 'success',
          structured_output: {
            done: true,
          },
        },
      },
    },
  ]);

  assert.equal(chatMessages.length, 1);
  assert.equal(chatMessages[0].type, 'assistant');
  assert.equal(chatMessages[0].normalizedKind, 'result');
  assert.equal(chatMessages[0].content, '最终结果');
  assert.deepEqual(chatMessages[0].structuredOutput, {
    done: true,
  });
});

test('normalizedToChatMessages renders question_request as interactive prompts', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'question-request-1',
      kind: 'question_request',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-18T10:00:02.000Z',
      requestId: 'req-1',
      questions: [
        {
          question: '选择执行方式',
          options: [{ label: '继续' }, { label: '停止' }],
        },
      ],
    },
  ]);

  assert.equal(chatMessages.length, 1);
  assert.equal(chatMessages[0].normalizedKind, 'interactive_prompt');
  assert.equal(chatMessages[0].isInteractivePrompt, true);
  assert.match(chatMessages[0].content || '', /选择执行方式/);
});

test('normalizedToChatMessages renders tool_approval_request as waiting notifications', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'approval-request-1',
      kind: 'tool_approval_request',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-18T10:00:03.000Z',
      requestId: 'req-2',
      toolName: 'Bash',
      input: { command: 'npm test' },
    },
  ]);

  assert.equal(chatMessages.length, 1);
  assert.equal(chatMessages[0].isTaskNotification, true);
  assert.equal(chatMessages[0].taskStatus, 'waiting');
  assert.match(chatMessages[0].content || '', /等待权限/);
  assert.match(chatMessages[0].content || '', /Bash/);
});

test('normalizedToChatMessages does not render canonical session_status or debug_ref as plain chat bubbles', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'status-1',
      kind: 'session_status',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-26T10:00:00.000Z',
      content: { status: 'running', detail: 'still active' },
      text: 'still active',
    },
    {
      id: 'debug-1',
      kind: 'debug_ref',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-26T10:00:01.000Z',
      content: { label: 'sdk_debug_log#1', path: '/tmp/debug.log' },
    },
  ]);

  assert.equal(chatMessages.length, 0);
});

test('normalizedToChatMessages drops stale waiting permission notifications once the request is cancelled', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'permission-1',
      kind: 'permission_request',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-18T10:00:00.000Z',
      requestId: 'req-1',
      toolName: 'Bash',
    },
    {
      id: 'permission-cancelled-1',
      kind: 'permission_cancelled',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-18T10:00:01.000Z',
      requestId: 'req-1',
    },
  ]);

  assert.equal(chatMessages.length, 1);
  assert.equal(chatMessages[0].isTaskNotification, true);
  assert.doesNotMatch(chatMessages[0].content || '', /等待权限/);
  assert.match(chatMessages[0].content || '', /权限请求已取消/);
});

test('normalizedToChatMessages can suppress decision messages when in-stream rendering is enabled', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'permission-1',
      kind: 'permission_request',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-18T10:00:00.000Z',
      requestId: 'req-1',
      toolName: 'Bash',
    },
    {
      id: 'interactive-1',
      kind: 'interactive_prompt',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-18T10:00:01.000Z',
      requestId: 'req-2',
      toolName: 'AskUserQuestion',
      content: '请选择一个继续方式',
    },
  ], {
    suppressInStreamDecisions: true,
  });

  assert.equal(chatMessages.length, 0);
});

test('normalizedToChatMessages renders status notifications and ignores legacy complete events', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'status-1',
      kind: 'status',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-18T10:00:00.000Z',
      text: '正在检查工作区',
      canInterrupt: true,
    },
    {
      id: 'complete-1',
      kind: 'complete',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-18T10:00:01.000Z',
      aborted: true,
    },
  ]);

  assert.equal(chatMessages.length, 1);
  assert.equal(chatMessages[0].isTaskNotification, true);
  assert.equal(chatMessages[0].content, '正在检查工作区');
});

test('normalizedToChatMessages ignores legacy complete for V2-owned execution state', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'complete-1',
      kind: 'complete',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-20T12:00:00.000Z',
    },
  ]);

  assert.equal(chatMessages.length, 0);
});

test('normalizedToChatMessages renders result errors as error messages', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'result-error-1',
      kind: 'result',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:00.000Z',
      isError: true,
      errors: ['超出最大轮数', '请缩小任务范围'],
    },
  ]);

  assert.equal(chatMessages.length, 1);
  assert.equal(chatMessages[0].type, 'error');
  assert.match(chatMessages[0].content || '', /超出最大轮数/);
  assert.match(chatMessages[0].content || '', /请缩小任务范围/);
});

test('normalizedToChatMessages marks ambiguous edit errors as hidden when a later edit on the same file succeeds', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'tool-use-error',
      kind: 'tool_use',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:00.000Z',
      toolName: 'Edit',
      toolId: 'tool-1',
      toolInput: {
        file_path: '/workspace/login.html',
        old_string: 'text-align: center;',
        new_string: 'text-align: left;',
      },
      toolResult: {
        isError: true,
        content: '<tool_use_error>Found 2 matches of the string to replace, but replace_all is false. String: text-align: center;</tool_use_error>',
      },
    },
    {
      id: 'tool-use-success',
      kind: 'tool_use',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:01.000Z',
      toolName: 'Edit',
      toolId: 'tool-2',
      toolInput: {
        file_path: '/workspace/login.html',
        old_string: 'text-align: center;',
        new_string: 'text-align: left;',
      },
      toolResult: {
        isError: false,
        content: '修改成功',
      },
    },
  ]);

  assert.equal(chatMessages.length, 2);
  assert.equal(chatMessages[0].isToolUse, true);
  assert.equal(chatMessages[0].toolResult?.hideInUi, true);
  assert.equal(chatMessages[1].isToolUse, true);
  assert.equal(chatMessages[1].toolResult?.isError, false);
});

test('normalizedToChatMessages renders tool_use messages as standalone tool entries', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'tool-use-1',
      kind: 'tool_use',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:00.000Z',
      toolName: 'Read',
      toolId: 'tool-1',
      toolInput: {
        file_path: '/workspace/README.md',
      },
      toolResult: {
        isError: false,
        content: '文件内容',
      },
    },
  ]);

  assert.equal(chatMessages.length, 1);
  assert.equal(chatMessages[0].type, 'assistant');
  assert.equal(chatMessages[0].isToolUse, true);
  assert.equal(chatMessages[0].toolName, 'Read');
  assert.equal(chatMessages[0].toolResult?.content, '文件内容');
});

test('normalizedToChatMessages keeps TodoWrite todo arrays available for tool rendering', () => {
  const todos = [
    { content: 'Write spec', status: 'pending', activeForm: 'Write spec' },
    { content: 'Review draft', status: 'in_progress', activeForm: 'Review draft' },
  ];

  const chatMessages = normalizedToChatMessages([
    {
      id: 'tool-use-todo-1',
      kind: 'tool_use',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-27T10:00:00.000Z',
      toolName: 'TodoWrite',
      toolId: 'tool-todo-1',
      toolInput: { todos },
      toolResult: {
        isError: false,
        content: 'Todo list updated',
      },
    },
  ]);

  assert.equal(chatMessages.length, 1);
  assert.equal(chatMessages[0].isToolUse, true);
  assert.equal(chatMessages[0].toolName, 'TodoWrite');
  assert.deepEqual(JSON.parse(String(chatMessages[0].toolInput)), { todos });
});

test('normalizedToChatMessages renders orchestration summaries as orchestration cards with task titles', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'assistant-1',
      kind: 'text',
      role: 'assistant',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:00.000Z',
      content: '我会先让两个子代理分别收集信息，再进行汇总。',
    },
    {
      id: 'task-1',
      kind: 'tool_use',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:01.000Z',
      toolName: 'Task',
      toolId: 'task-1',
      toolInput: {
        description: '收集用户现状',
      },
      toolResult: {
        isError: false,
        content: '任务一完成',
      },
    },
    {
      id: 'task-2',
      kind: 'tool_use',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:02.000Z',
      toolName: 'Task',
      toolId: 'task-2',
      toolInput: {
        description: '整理风险点',
      },
      toolResult: {
        isError: false,
        content: '任务二完成',
      },
    },
  ]);

  assert.equal(chatMessages.length, 4);
  assert.equal(chatMessages[0].isOrchestrationCard, true);
  assert.deepEqual(chatMessages[0].orchestrationState?.taskTitles, ['收集用户现状', '整理风险点']);
  assert.equal(chatMessages[1].isToolUse, true);
  assert.equal(chatMessages[2].isToolUse, true);
  assert.match(chatMessages[3].content || '', /2\/2 子代理已完成/);
});

test('normalizedToChatMessages renders final orchestration answer as a regular assistant message', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'task-1',
      kind: 'tool_use',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:00.000Z',
      toolName: 'Task',
      toolId: 'task-1',
      toolInput: {
        description: '收集用户现状',
      },
      toolResult: {
        isError: false,
        content: '任务一完成',
      },
    },
    {
      id: 'assistant-1',
      kind: 'text',
      role: 'assistant',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:01.000Z',
      content: '两个子代理都已完成，下面是汇总结果。',
    },
  ]);

  assert.equal(chatMessages.length, 2);
  assert.equal(chatMessages[1].type, 'assistant');
  assert.equal(chatMessages[1].content, '两个子代理都已完成，下面是汇总结果。');
});

test('normalizedToChatMessages suppresses duplicate adjacent assistant text', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'assistant-1',
      kind: 'text',
      role: 'assistant',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:00.000Z',
      content: '重复内容',
    },
    {
      id: 'assistant-2',
      kind: 'text',
      role: 'assistant',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:01.000Z',
      content: '重复内容',
    },
  ]);

  assert.equal(chatMessages.length, 1);
  assert.equal(chatMessages[0].content, '重复内容');
});

test('normalizedToChatMessages suppresses protocol-only assistant text from chat bubbles', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'assistant-protocol-1',
      kind: 'text',
      role: 'assistant',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-20T10:00:00.000Z',
      content: '<task-notification><task-id>task-1</task-id><output-file>/tmp/out.txt</output-file><status>completed</status><summary>done</summary></task-notification>',
    },
  ]);

  assert.equal(chatMessages.length, 0);
});

test('normalizedToChatMessages suppresses protocol-only user text from chat bubbles', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'user-protocol-1',
      kind: 'text',
      role: 'user',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-20T10:00:00.000Z',
      content: '<task-notification><task-id>task-1</task-id><tool-use-id>tool-1</tool-use-id><output-file>/tmp/out.txt</output-file><status>completed</status><summary>done</summary></task-notification>',
    },
  ]);

  assert.equal(chatMessages.length, 0);
});

test('normalizedToChatMessages suppresses SDK image attachment placeholder text from user chat bubbles', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'user-image-placeholder-1',
      kind: 'text',
      role: 'user',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-21T12:39:03.000Z',
      content: '[Image: original 2286x1914, displayed at 2000x1675. Multiply coordinates by 1.14 to map to original image.]',
    },
  ]);

  assert.equal(chatMessages.length, 0);
});

test('normalizedToChatMessages suppresses expanded skill prompt echoes', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'user-slash-1',
      kind: 'text',
      role: 'user',
      content: '/graphify query "IT资产报废"',
      timestamp: '2026-04-23T14:00:00.000Z',
      provider: 'claude',
      sessionId: 'sess-1',
    },
    {
      id: 'user-expanded-1',
      kind: 'text',
      role: 'user',
      content: `Base directory for this skill: /Users/demo/.claude/skills/graphify

# graphify

Turn any folder into a graph.`,
      timestamp: '2026-04-23T14:00:01.000Z',
      provider: 'claude',
      sessionId: 'sess-1',
    },
  ]);

  assert.equal(chatMessages.length, 1);
  assert.equal(chatMessages[0].type, 'user');
  assert.equal(chatMessages[0].content, '/graphify query "IT资产报废"');
});

test('normalizedToChatMessages suppresses expanded skill prompts without requiring a nearby raw slash command', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'user-expanded-1',
      kind: 'text',
      role: 'user',
      content: `Base directory for this skill: /Users/demo/.claude/skills/gen-image

# gen-image

Internal skill prompt body.`,
      timestamp: '2026-04-23T14:00:01.000Z',
      provider: 'claude',
      sessionId: 'sess-1',
    },
  ]);

  assert.equal(chatMessages.length, 0);
});

test('normalizedToChatMessages preserves user image attachments for rendering', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'user-image-1',
      kind: 'text',
      role: 'user',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-21T12:39:03.000Z',
      content: '图片内容是啥呢',
      images: [
        {
          name: 'capture.png',
          data: 'data:image/png;base64,QUJD',
        },
      ],
    },
  ]);

  assert.equal(chatMessages.length, 1);
  assert.equal(chatMessages[0].type, 'user');
  assert.deepEqual(chatMessages[0].images, [
    {
      name: 'capture.png',
      data: 'data:image/png;base64,QUJD',
    },
  ]);
});

test('normalizedToChatMessages strips protocol fragments from assistant text while keeping readable summary', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'assistant-protocol-mixed-1',
      kind: 'text',
      role: 'assistant',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-20T10:00:00.000Z',
      content: '天气调研已完成。<task-notification><task-id>task-1</task-id><output-file>/tmp/out.txt</output-file><status>completed</status><summary>done</summary></task-notification>',
    },
  ]);

  assert.equal(chatMessages.length, 1);
  assert.equal(chatMessages[0].content, '天气调研已完成。');
});

test('normalizedToChatMessages suppresses protocol-only result payloads from chat bubbles', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'result-protocol-1',
      kind: 'result',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-20T10:00:00.000Z',
      content: '<tool-use-id>tool-1</tool-use-id><output-file>/tmp/out.txt</output-file>',
      isError: false,
    },
  ]);

  assert.equal(chatMessages.length, 0);
});

test('normalizedToChatMessages suppresses markdown document prefaces before a Write tool call', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'assistant-1',
      kind: 'text',
      role: 'assistant',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:00.000Z',
      content: '我来生成文档',
    },
    {
      id: 'tool-use-1',
      kind: 'tool_use',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:01.000Z',
      toolName: 'Write',
      toolId: 'tool-1',
      toolInput: {
        file_path: '/workspace/summary.md',
      },
    },
  ]);

  assert.equal(chatMessages.length, 1);
  assert.equal(chatMessages[0].isToolUse, true);
  assert.equal(chatMessages[0].toolName, 'Write');
});
