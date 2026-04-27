import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const tsxLoaderUrl = new URL('../../code-editor/view/subcomponents/tsx-loader.mjs', import.meta.url).href;
const todoListContentUrl = new URL('./components/ContentRenderers/TodoListContent.tsx', import.meta.url).href;
const badgeStubUrl = `data:text/javascript,${encodeURIComponent(`
import { createRequire } from 'node:module';
const require = createRequire(${JSON.stringify(todoListContentUrl)});
const React = require('react');

export function Badge({ children, className = '' }) {
  return React.createElement('span', { className, 'data-badge': 'true' }, children);
}
`)}`;

const loaderSource = `
import * as base from ${JSON.stringify(tsxLoaderUrl)};

export async function resolve(specifier, context, nextResolve) {
  if (specifier === '../../../../../shared/view/ui') {
    return {
      url: ${JSON.stringify(badgeStubUrl)},
      shortCircuit: true,
    };
  }

  return base.resolve(specifier, context, nextResolve);
}

export async function load(url, context, nextLoad) {
  return base.load(url, context, nextLoad);
}
`;

register(`data:text/javascript,${encodeURIComponent(loaderSource)}`, import.meta.url);

const { TodoListContent } = await import('./components/ContentRenderers/TodoListContent.tsx');

test('TodoListContent renders todo items for TodoWrite cards', () => {
  const markup = renderToStaticMarkup(
    React.createElement(TodoListContent, {
      todos: [
        { content: 'Write spec', status: 'pending', activeForm: 'Write spec' },
        { content: 'Review draft', status: 'in_progress', activeForm: 'Review draft' },
      ],
      isResult: false,
    }),
  );

  assert.match(markup, /Write spec/);
  assert.match(markup, /Review draft/);
  assert.match(markup, /pending/);
  assert.match(markup, /in progress/);
});
