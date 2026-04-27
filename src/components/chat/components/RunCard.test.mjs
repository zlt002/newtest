import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const runCardUrl = new URL('./RunCard.tsx', import.meta.url).href;
const tsxLoaderUrl = new URL('../../code-editor/view/subcomponents/tsx-loader.mjs', import.meta.url).href;

const runtimeMarkdownStubUrl = `data:text/javascript,${encodeURIComponent(`
import { createRequire } from 'node:module';
const require = createRequire(${JSON.stringify(runCardUrl)});
const React = require('react');

export function RuntimeMarkdown({ children }) {
  return React.createElement('div', { 'data-runtime-markdown': 'true' }, children);
}
`)}`;

const processTimelineStubUrl = `data:text/javascript,${encodeURIComponent(`
import { createRequire } from 'node:module';
const require = createRequire(${JSON.stringify(runCardUrl)});
const React = require('react');

export function RunCardProcessTimeline() {
  return React.createElement('div', { 'data-run-card-process-timeline': 'true' }, 'timeline');
}
`)}`;

const loaderSource = `
import * as base from ${JSON.stringify(tsxLoaderUrl)};

const stubs = new Map([
  ['${runCardUrl}::./RuntimeMarkdown', ${JSON.stringify(runtimeMarkdownStubUrl)}],
  ['${runCardUrl}::./RunCardProcessTimeline', ${JSON.stringify(processTimelineStubUrl)}],
]);

export async function resolve(specifier, context, nextResolve) {
  const contextual = stubs.get(String(context.parentURL || '') + '::' + specifier);
  if (contextual) {
    return { url: contextual, shortCircuit: true };
  }
  return base.resolve(specifier, context, nextResolve);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('data:text/javascript,')) {
    return {
      format: 'module',
      source: decodeURIComponent(url.slice('data:text/javascript,'.length)),
      shortCircuit: true,
    };
  }
  return base.load(url, context, nextLoad);
}
`;

register(`data:text/javascript,${encodeURIComponent(loaderSource)}`, import.meta.url);

const { RunCard } = await import('./RunCard.tsx');

test('RunCard renders related files extracted from structured process payloads and dedupes duplicates', () => {
  const markup = renderToStaticMarkup(
    React.createElement(RunCard, {
      card: {
        sessionId: 'sess-1',
        anchorMessageId: 'user-1',
        cardStatus: 'completed',
        headline: '已完成',
        finalResponse: 'done',
        responseMessages: [{
          id: 'final-1',
          timestamp: '2026-04-26T10:00:05.000Z',
          kind: 'final',
          body: 'done',
        }],
        processItems: [
          {
            id: 'tool-1',
            timestamp: '2026-04-26T10:00:02.000Z',
            kind: 'tool_use',
            title: '工具调用',
            body: 'Write',
            payload: {
              file_path: '/demo/docs/PRD-CodeReview-AI.md',
            },
          },
          {
            id: 'tool-2',
            timestamp: '2026-04-26T10:00:03.000Z',
            kind: 'tool_result',
            title: '工具结果',
            body: 'ok',
            payload: {
              result: {
                filePath: '/demo/docs/PRD-CodeReview-AI.md',
              },
            },
          },
        ],
        activeInteraction: null,
        startedAt: '2026-04-26T10:00:00.000Z',
        updatedAt: '2026-04-26T10:00:05.000Z',
        completedAt: '2026-04-26T10:00:05.000Z',
        defaultExpanded: false,
        source: 'official-history',
      },
    }),
  );

  assert.match(markup, /data-chat-v2-run-card-related-files="true"/);
  assert.match(markup, /PRD-CodeReview-AI\.md/);
  assert.equal((markup.match(/data-chat-v2-run-card-related-file=/g) || []).length, 1);
});

test('RunCard process modal uses a layer above the right pane editor overlay', async () => {
  const source = await readFile(new URL('./RunCard.tsx', import.meta.url), 'utf8');

  assert.match(source, /data-chat-v2-run-card-process-modal="true"/);
  assert.match(source, /className="fixed inset-0 z-\[10000\] flex items-center justify-center p-4"/);
});

test('RunCard process preview renders TodoWrite items as a compact todo list', () => {
  const markup = renderToStaticMarkup(
    React.createElement(RunCard, {
      card: {
        sessionId: 'sess-todo-1',
        anchorMessageId: 'user-todo-1',
        cardStatus: 'running',
        headline: '执行中',
        finalResponse: '',
        responseMessages: [],
        processItems: [
          {
            id: 'todo-use-1',
            timestamp: '2026-04-27T19:55:08.000Z',
            kind: 'tool_use',
            title: '工具调用 · TodoWrite',
            body: '{ "todos": [{ "content": "检查项目文件结构和主要文件内容", "status": "in_progress" }] }',
            payload: {
              toolName: 'TodoWrite',
              input: {
                todos: [
                  {
                    content: '检查项目文件结构和主要文件内容',
                    status: 'in_progress',
                    activeForm: '检查项目文件结构和主要文件内容',
                  },
                  {
                    content: '确认是否存在 Claude Agent SDK 依赖',
                    status: 'pending',
                    activeForm: '确认是否存在 Claude Agent SDK 依赖',
                  },
                ],
              },
            },
          },
        ],
        activeInteraction: null,
        startedAt: '2026-04-27T19:55:00.000Z',
        updatedAt: '2026-04-27T19:55:08.000Z',
        completedAt: null,
        defaultExpanded: false,
        source: 'sdk-live',
      },
    }),
  );

  assert.match(markup, /data-chat-v2-run-card-process-preview-todo="true"/);
  assert.match(markup, /检查项目文件结构和主要文件内容/);
  assert.match(markup, /确认是否存在 Claude Agent SDK 依赖/);
  assert.match(markup, /in progress/);
  assert.match(markup, /pending/);
  assert.doesNotMatch(markup, /&quot;todos&quot;/);
  assert.doesNotMatch(markup, /\s\|\s/);
});
