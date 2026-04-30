import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const timelineUrl = new URL('./RunCardProcessTimeline.tsx', import.meta.url).href;
const todoListUrl = new URL('../tools/components/ContentRenderers/TodoList.tsx', import.meta.url).href;
const tsxLoaderUrl = new URL('../../code-editor/view/subcomponents/tsx-loader.mjs', import.meta.url).href;
const badgeStubUrl = `data:text/javascript,${encodeURIComponent(`
import { createRequire } from 'node:module';
const require = createRequire(${JSON.stringify(timelineUrl)});
const React = require('react');

export function Badge({ children, className = '' }) {
  return React.createElement('span', { className, 'data-badge': 'true' }, children);
}
`)}`;
const runtimeMarkdownStubUrl = `data:text/javascript,${encodeURIComponent(`
import { createRequire } from 'node:module';
const require = createRequire(${JSON.stringify(timelineUrl)});
const React = require('react');

export function RuntimeMarkdown({ children }) {
  return React.createElement('div', { 'data-runtime-markdown': 'true' }, children);
}
`)}`;

const loaderSource = `
import * as base from ${JSON.stringify(tsxLoaderUrl)};

const stubs = new Map([
  ['${timelineUrl}::./RuntimeMarkdown', ${JSON.stringify(runtimeMarkdownStubUrl)}],
  ['${todoListUrl}::../../../../../shared/view/ui', ${JSON.stringify(badgeStubUrl)}],
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

const { RunCardProcessTimeline } = await import('./RunCardProcessTimeline.tsx');

test('RunCardProcessTimeline renders TodoWrite tool input as a todo list instead of raw JSON only', () => {
  const markup = renderToStaticMarkup(
    React.createElement(RunCardProcessTimeline, {
      items: [
        {
          id: 'todo-use-1',
          timestamp: '2026-04-27T12:00:00.000Z',
          kind: 'tool_use',
          title: '工具调用 · TodoWrite',
          body: '{ "todos": [{ "content": "检查项目是否已接入 Claude Agent SDK 的 todo tracking", "status": "completed" }] }',
          tone: 'neutral',
          payload: {
            toolName: 'TodoWrite',
            input: {
              todos: [
                {
                  content: '检查项目是否已接入 Claude Agent SDK 的 todo tracking',
                  status: 'completed',
                  activeForm: '检查项目是否已接入 Claude Agent SDK 的 todo tracking',
                },
              ],
            },
          },
        },
      ],
    }),
  );

  assert.match(markup, /检查项目是否已接入 Claude Agent SDK 的 todo tracking/);
  assert.match(markup, /completed|已完成/);
  assert.match(markup, /data-badge="true"/);
});

test('RuntimeMarkdown source defines dark theme classes for inline code, quotes, and tables used by run cards', async () => {
  const source = await readFile(new URL('./RuntimeMarkdown.ts', import.meta.url), 'utf8');

  assert.match(source, /dark:border-neutral-700/);
  assert.match(source, /dark:bg-neutral-800/);
  assert.match(source, /dark:text-neutral-100/);
  assert.match(source, /dark:bg-neutral-900/);
});
