import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSubagentProgressView, buildSubagentToolHistoryEntries } from './subagentProgressView.ts';

test('buildSubagentProgressView returns running state with active tool and output file', () => {
  const view = buildSubagentProgressView({
    currentToolName: 'Read',
    lastToolName: 'WebSearch',
    status: 'in_progress',
    elapsedTimeSeconds: 12,
    outputFile: '/workspace/foshan/weather_report.md',
    timeline: [
      {
        kind: 'task_progress',
        label: '正在调研佛山天气',
        timestamp: '2026-04-17T15:00:00.000Z',
        status: 'in_progress',
      },
      {
        kind: 'tool_progress',
        label: 'Read 运行中 (12s)',
        timestamp: '2026-04-17T15:00:01.000Z',
        status: 'in_progress',
      },
    ],
  }, false, false);

  assert.equal(view.status.label, '运行中');
  assert.equal(view.status.tone, 'running');
  assert.equal(view.activeToolLabel, 'Read');
  assert.equal(view.outputFileName, 'weather_report.md');
  assert.equal(view.latestEvent?.label, 'Read 运行中 (12s)');
  assert.deepEqual(view.headlineStats, ['12s']);
  assert.equal(view.primaryTimelineEvents.length, 2);
  assert.equal(view.debugTimelineEvents.length, 0);
});

test('buildSubagentProgressView returns completed state when task finished successfully', () => {
  const view = buildSubagentProgressView({
    status: 'completed',
    timeline: [
      {
        kind: 'tool_use_summary',
        label: '已生成最终报告',
        timestamp: '2026-04-17T15:00:05.000Z',
        status: 'completed',
      },
    ],
  }, true, false);

  assert.equal(view.status.label, '已完成');
  assert.equal(view.status.tone, 'completed');
  assert.equal(view.latestEvent?.label, '已生成最终报告');
});

test('buildSubagentProgressView returns failed state when tool result is error', () => {
  const view = buildSubagentProgressView({
    status: 'in_progress',
    timeline: [],
  }, true, true);

  assert.equal(view.status.label, '失败');
  assert.equal(view.status.tone, 'failed');
});

test('buildSubagentProgressView marks successful fallback tasks as partially degraded and truncates warnings', () => {
  const view = buildSubagentProgressView({
    status: 'completed',
    currentToolName: 'Bash',
    usage: { totalTokens: 22043, toolUses: 23, durationMs: 336399 },
    warnings: [
      { kind: 'recoverable_error', message: '部分外部站点抓取失败，已切换备用方式' },
      { kind: 'recoverable_error', message: '另一个来源也被网络策略拦住了' },
      { kind: 'recoverable_error', message: '还有一条补充 warning' },
    ],
    resultPreview: '佛山是广东省 GDP 第三的城市，家电、陶瓷和装备制造发达。',
    timeline: [
      {
        kind: 'tool_progress',
        label: '切换到命令行兜底',
        timestamp: '2026-04-17T15:00:06.000Z',
        status: 'completed',
      },
    ],
  }, true, false);

  assert.equal(view.status.label, '部分降级完成');
  assert.equal(view.status.tone, 'degraded');
  assert.equal(view.latestEvent?.label, '切换到命令行兜底');
  assert.equal(view.warningItems.length, 2);
  assert.equal(view.warningItems[0].message, '部分外部站点抓取失败，已切换备用方式');
  assert.equal(view.warningItems[1].message, '另一个来源也被网络策略拦住了');
  assert.equal(view.warningOverflowCount, 1);
  assert.equal(view.resultDisplayMode, 'preview');
  assert.equal(view.resultPreview, '佛山是广东省 GDP 第三的城市，家电、陶瓷和装备制造发达。');
  assert.deepEqual(view.headlineStats, ['23 个工具', '22,043 tokens', '336s']);
});

test('buildSubagentProgressView humanizes raw command-like timeline labels', () => {
  const view = buildSubagentProgressView({
    status: 'in_progress',
    timeline: [
      {
        kind: 'subagent_text',
        label: 'curl -s "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&titles=Foshan&explaintext=1&format=json" 2>/dev/null | python3 -c "print(123)"',
        timestamp: '2026-04-18T09:00:00.000Z',
        status: 'in_progress',
      },
    ],
  }, false, false);

  assert.equal(view.latestEvent?.label, '抓取维基百科佛山资料');
  assert.equal(view.timelineEvents[0]?.label, '抓取维基百科佛山资料');
});

test('buildSubagentProgressView keeps only the latest three timeline items in the primary panel', () => {
  const view = buildSubagentProgressView({
    status: 'in_progress',
    timeline: [
      { kind: 'tool_progress', label: '步骤 1', timestamp: '2026-04-18T09:00:00.000Z', status: 'in_progress' },
      { kind: 'tool_progress', label: '步骤 2', timestamp: '2026-04-18T09:00:01.000Z', status: 'in_progress' },
      { kind: 'tool_progress', label: '步骤 3', timestamp: '2026-04-18T09:00:02.000Z', status: 'in_progress' },
      { kind: 'tool_progress', label: '步骤 4', timestamp: '2026-04-18T09:00:03.000Z', status: 'in_progress' },
    ],
  }, false, false);

  assert.deepEqual(view.primaryTimelineEvents.map(event => event.label), ['步骤 2', '步骤 3', '步骤 4']);
  assert.deepEqual(view.debugTimelineEvents.map(event => event.label), ['步骤 1']);
});

test('buildSubagentProgressView exposes recent steps, warnings, and result summary together', () => {
  const view = buildSubagentProgressView({
    status: 'completed',
    warnings: [
      { kind: 'recoverable_error', message: '外部源限流，已切换备用方案' },
    ],
    resultPreview: '已整理出佛山主要产业分布与代表企业。',
    timeline: [
      { kind: 'tool_progress', label: '读取统计年鉴', timestamp: '2026-04-18T09:00:00.000Z', status: 'completed' },
      { kind: 'tool_progress', label: '提炼产业结论', timestamp: '2026-04-18T09:00:01.000Z', status: 'completed' },
      { kind: 'tool_progress', label: '生成摘要', timestamp: '2026-04-18T09:00:02.000Z', status: 'completed' },
      { kind: 'tool_progress', label: '补充代表企业', timestamp: '2026-04-18T09:00:03.000Z', status: 'completed' },
    ],
  }, true, false);

  assert.deepEqual(view.recentSteps.map(event => event.label), ['提炼产业结论', '生成摘要', '补充代表企业']);
  assert.equal(view.warningItems[0].message, '外部源限流，已切换备用方案');
  assert.equal(view.resultPreview, '已整理出佛山主要产业分布与代表企业。');
  assert.equal(view.resultDisplayMode, 'preview');
});

test('buildSubagentToolHistoryEntries marks the current child tool without result as running', () => {
  const entries = buildSubagentToolHistoryEntries(
    [
      {
        toolId: 'tool-1',
        toolName: 'Read',
        toolInput: { file_path: '/tmp/a.md' },
        toolResult: { content: 'done' },
        timestamp: new Date('2026-04-18T09:00:00.000Z'),
      },
      {
        toolId: 'tool-2',
        toolName: 'Bash',
        toolInput: { command: 'echo running' },
        toolResult: null,
        timestamp: new Date('2026-04-18T09:00:01.000Z'),
      },
      {
        toolId: 'tool-3',
        toolName: 'Write',
        toolInput: { file_path: '/tmp/b.md' },
        toolResult: null,
        timestamp: new Date('2026-04-18T09:00:02.000Z'),
      },
    ],
    1,
  );

  assert.equal(entries[0].status, 'completed');
  assert.equal(entries[1].status, 'running');
  assert.equal(entries[2].status, 'queued');
});
