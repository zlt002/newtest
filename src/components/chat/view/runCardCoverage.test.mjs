import test from 'node:test';
import assert from 'node:assert/strict';

import { historicalRunCardsCoverLiveRunCards } from './runCardCoverage.ts';

function createRunCard(overrides = {}) {
  return {
    sessionId: 'sess-1',
    anchorMessageId: 'user-1',
    cardStatus: 'completed',
    headline: '已完成',
    finalResponse: '总结',
    responseMessages: [{
      id: 'resp-1',
      timestamp: '2026-04-26T13:00:01.000Z',
      kind: 'final',
      body: '总结',
    }],
    processItems: [{
      id: 'proc-1',
      timestamp: '2026-04-26T13:00:00.500Z',
      kind: 'thinking',
      title: '思考',
      body: '先分析问题',
    }],
    activeInteraction: null,
    startedAt: '2026-04-26T13:00:00.000Z',
    updatedAt: '2026-04-26T13:00:01.000Z',
    completedAt: '2026-04-26T13:00:01.000Z',
    defaultExpanded: false,
    source: 'sdk-live',
    ...overrides,
  };
}

test('historicalRunCardsCoverLiveRunCards returns false when historical card is missing live process items', () => {
  const liveRunCards = [
    createRunCard({
      processItems: [
        {
          id: 'proc-1',
          timestamp: '2026-04-26T13:00:00.500Z',
          kind: 'thinking',
          title: '思考',
          body: '先分析问题',
        },
        {
          id: 'proc-2',
          timestamp: '2026-04-26T13:00:00.800Z',
          kind: 'tool_use',
          title: '工具调用',
          body: 'context7 查询',
        },
      ],
    }),
  ];
  const historicalRunCards = [
    createRunCard({
      source: 'official-history',
      processItems: [
        {
          id: 'proc-1',
          timestamp: '2026-04-26T13:00:00.500Z',
          kind: 'thinking',
          title: '思考',
          body: '先分析问题',
        },
      ],
    }),
  ];

  assert.equal(historicalRunCardsCoverLiveRunCards(historicalRunCards, liveRunCards), false);
});

test('historicalRunCardsCoverLiveRunCards returns true when history preserves the same anchor, response, and process depth', () => {
  const liveRunCards = [createRunCard()];
  const historicalRunCards = [
    createRunCard({
      source: 'official-history',
      processItems: [
        {
          id: 'proc-1',
          timestamp: '2026-04-26T13:00:00.500Z',
          kind: 'thinking',
          title: '思考',
          body: '先分析问题',
        },
        {
          id: 'proc-2',
          timestamp: '2026-04-26T13:00:00.900Z',
          kind: 'notice',
          title: '阶段更新',
          body: '已整理完成',
        },
      ],
    }),
  ];

  assert.equal(historicalRunCardsCoverLiveRunCards(historicalRunCards, liveRunCards), true);
});
