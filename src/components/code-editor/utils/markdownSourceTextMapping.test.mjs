import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMarkdownRenderedSourceMap,
  mapRenderedOffsetToSourceOffset,
  mapSourceOffsetToRenderedOffset,
  doesAnnotationMatchContent,
  resolveRenderedSelectionToSourceRange,
  resolveAnnotationRenderedOffsets,
  sliceMarkdownSourceByRange,
} from './markdownSourceTextMapping.ts';

test('将带 Markdown 行内语法的可见文本偏移映射回源码偏移', () => {
  const markdownSource = '## 1.1 `canDirectOrder()` **bold** [link](x)\n';
  const renderedSourceMap = buildMarkdownRenderedSourceMap(markdownSource);

  assert.equal(renderedSourceMap.renderedText, '1.1 canDirectOrder() bold link');

  const renderedStart = renderedSourceMap.renderedText.indexOf('canDirectOrder()');
  const renderedEnd = renderedStart + 'canDirectOrder()'.length;

  const sourceStart = mapRenderedOffsetToSourceOffset(renderedSourceMap, renderedStart, 'start');
  const sourceEnd = mapRenderedOffsetToSourceOffset(renderedSourceMap, renderedEnd, 'end');

  assert.equal(markdownSource.slice(sourceStart, sourceEnd), 'canDirectOrder()');
  assert.equal(mapSourceOffsetToRenderedOffset(renderedSourceMap, sourceStart, 'start'), renderedStart);
  assert.equal(mapSourceOffsetToRenderedOffset(renderedSourceMap, sourceEnd, 'end'), renderedEnd);
});

test('按源码行列切出块级 Markdown 片段', () => {
  const content = '# 标题\n\n## 1.1 `canDirectOrder()` **bold** [link](x)\n';

  assert.equal(
    sliceMarkdownSourceByRange({
      sourceText: content,
      startLine: 3,
      startColumn: 1,
      endLine: 3,
      endColumn: 45,
    }),
    '## 1.1 `canDirectOrder()` **bold** [link](x)',
  );
});

test('把标注的源码行列映射回当前块的可见文本偏移', () => {
  const markdownSource = '## 1.1 `canDirectOrder()` **bold** [link](x)\n';

  assert.deepEqual(
    resolveAnnotationRenderedOffsets({
      annotation: {
        id: 'annotation-1',
        startLine: 1,
        startColumn: 9,
        endLine: 1,
        endColumn: 25,
        selectedText: 'canDirectOrder()',
        note: 'test',
        quoteHash: 'hash',
        createdAt: '2026-04-15T00:00:00.000Z',
        updatedAt: '2026-04-15T00:00:00.000Z',
      },
      markdownSource,
      sourceStartLine: 1,
      sourceStartColumn: 1,
    }),
    {
      renderedStartOffset: 4,
      renderedEndOffset: 20,
      renderedText: '1.1 canDirectOrder() bold link',
    },
  );
});

test('可以把跨多个 Markdown 块节点的可见选区映射回源码范围', () => {
  const content = '# Title\n\nParagraph\n';

  assert.deepEqual(
    resolveRenderedSelectionToSourceRange({
      content,
      selectedText: 'itle\n\nPar',
      startAnchor: {
        markdownSource: '# Title',
        sourceStartLine: 1,
        sourceStartColumn: 1,
        renderedOffset: 1,
      },
      endAnchor: {
        markdownSource: 'Paragraph',
        sourceStartLine: 3,
        sourceStartColumn: 1,
        renderedOffset: 3,
      },
    }),
    {
      startLine: 1,
      startColumn: 4,
      endLine: 3,
      endColumn: 4,
    },
  );
});

test('可以校验跨多个 Markdown 块节点的标注仍然匹配当前内容', () => {
  const content = '# Title\n\nParagraph\n';

  assert.equal(
    doesAnnotationMatchContent({
      content,
      annotation: {
        id: 'annotation-cross-block',
        startLine: 1,
        startColumn: 4,
        endLine: 3,
        endColumn: 4,
        selectedText: 'itle\n\nPar',
        note: 'cross block',
        quoteHash: 'hash',
        createdAt: '2026-04-19T00:00:00.000Z',
        updatedAt: '2026-04-19T00:00:00.000Z',
      },
    }),
    true,
  );
});

test('表格单元格源码片段的可见文本偏移可以映射回真实单元格内容', () => {
  const markdownSource = '| 字段';
  const renderedSourceMap = buildMarkdownRenderedSourceMap(markdownSource);

  assert.equal(renderedSourceMap.renderedText, '字段');
  assert.equal(mapRenderedOffsetToSourceOffset(renderedSourceMap, 0, 'start'), 2);
  assert.equal(mapRenderedOffsetToSourceOffset(renderedSourceMap, 2, 'end'), 4);
});

test('可以把表格单元格选区映射回源码范围', () => {
  const content = '| 字段 | 内容 |\n| --- | --- |\n';

  assert.deepEqual(
    resolveRenderedSelectionToSourceRange({
      content,
      selectedText: '字段',
      startAnchor: {
        markdownSource: '| 字段',
        sourceStartLine: 1,
        sourceStartColumn: 1,
        renderedOffset: 0,
      },
      endAnchor: {
        markdownSource: '| 字段',
        sourceStartLine: 1,
        sourceStartColumn: 1,
        renderedOffset: 2,
      },
    }),
    {
      startLine: 1,
      startColumn: 3,
      endLine: 1,
      endColumn: 5,
    },
  );
});

test('fenced code block 的可见文本偏移可以映射回代码内容', () => {
  const markdownSource = '```text\nhello\nworld\n```';
  const renderedSourceMap = buildMarkdownRenderedSourceMap(markdownSource);

  assert.equal(renderedSourceMap.renderedText, 'hello\nworld');
  assert.equal(mapRenderedOffsetToSourceOffset(renderedSourceMap, 0, 'start'), 8);
  assert.equal(mapRenderedOffsetToSourceOffset(renderedSourceMap, 'hello\nworld'.length, 'end'), 19);
});

test('可以把 fenced code block 选区映射回源码范围', () => {
  const content = '```text\nhello\nworld\n```\n';

  assert.deepEqual(
    resolveRenderedSelectionToSourceRange({
      content,
      selectedText: 'hello\nworld',
      startAnchor: {
        markdownSource: '```text\nhello\nworld\n```',
        sourceStartLine: 1,
        sourceStartColumn: 1,
        renderedOffset: 0,
      },
      endAnchor: {
        markdownSource: '```text\nhello\nworld\n```',
        sourceStartLine: 1,
        sourceStartColumn: 1,
        renderedOffset: 'hello\nworld'.length,
      },
    }),
    {
      startLine: 2,
      startColumn: 1,
      endLine: 3,
      endColumn: 6,
    },
  );
});

test('可以校验包含行内粗体标签的段落选区仍然匹配当前内容', () => {
  const content = '# PRD: SkillTree - 游戏化个人技能发展平台\n\n## 1. 产品概述\n\n**产品名称**: SkillTree（技能树） **产品定位**: 游戏化的个人技能学习与成长追踪平台 **一句话介绍**: 把你的学习之旅变成一棵不断生长的技能树 **产品形态**: Web 应用 + 移动端 H5\n';

  assert.equal(
    doesAnnotationMatchContent({
      content,
      annotation: {
        id: 'annotation-inline-strong',
        startLine: 5,
        startColumn: 1,
        endLine: 5,
        endColumn: 110,
        selectedText: '产品名称: SkillTree（技能树） 产品定位: 游戏化的个人技能学习与成长追踪平台 一句话介绍: 把你的学习之旅变成一棵不断生长的技能树 产品形态: Web 应用 + 移动端 H5',
        note: 'inline strong paragraph',
        quoteHash: 'hash',
        createdAt: '2026-04-19T00:00:00.000Z',
        updatedAt: '2026-04-19T00:00:00.000Z',
      },
    }),
    true,
  );
});

test('可以校验跨多个 fenced code block 和标题的标注仍然匹配当前内容', () => {
  const content = '### 5.1 新用户首次体验（Onboarding）\n\n```text\n1. 注册/登录\n2. 选择目标领域（多选） → 推荐对应技能树模板\n```\n\n### 5.2 日常使用\n\n```text\n1. 打开 Dashboard → 查看今日学习任务\n2. 点击"开始学习" → 计时器启动\n```\n';

  assert.equal(
    doesAnnotationMatchContent({
      content,
      annotation: {
        id: 'annotation-cross-code-blocks',
        startLine: 4,
        startColumn: 1,
        endLine: 12,
        endColumn: 20,
        selectedText: '1. 注册/登录\n2. 选择目标领域（多选） → 推荐对应技能树模板\n5.2 日常使用\n1. 打开 Dashboard → 查看今日学习任务\n2. 点击"开始学习" → 计时器启动',
        note: 'cross code blocks',
        quoteHash: 'hash',
        createdAt: '2026-04-19T00:00:00.000Z',
        updatedAt: '2026-04-19T00:00:00.000Z',
      },
    }),
    true,
  );
});
