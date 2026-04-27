import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const tsxLoaderUrl = new URL('../../../code-editor/view/subcomponents/tsx-loader.mjs', import.meta.url).href;
register(tsxLoaderUrl, { parentURL: import.meta.url });

const { default: CommandMenu } = await import('./CommandMenu.tsx');

test('command menu renders skills when there are no executable commands', () => {
  const markup = renderToStaticMarkup(
    React.createElement(CommandMenu, {
      isOpen: true,
      commands: [{
        name: '/analysis',
        description: 'Analyze code',
        type: 'claude-runtime',
        sourceType: 'claude-runtime',
        metadata: { type: 'skill', group: 'skills', skillName: 'analysis' },
      }],
      onClose() {},
      onSelect() {},
    }),
  );

  assert.match(markup, /Skill/);
  assert.match(markup, /\/analysis/);
  assert.match(markup, /Analyze code/);
  assert.equal((markup.match(/role="option"/g) || []).length, 1);
});

test('command menu anchors to the composer bottom edge on desktop so short menus grow upward from the input', () => {
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    value: { innerWidth: 1280, innerHeight: 900 },
    configurable: true,
  });

  try {
    const markup = renderToStaticMarkup(
      React.createElement(CommandMenu, {
        isOpen: true,
        commands: [{
          name: '/cost',
          description: 'Show current session cost',
          metadata: { type: 'local-ui' },
        }],
        position: {
          top: 120,
          left: 80,
          bottom: 96,
        },
        onClose() {},
        onSelect() {},
      }),
    );

    assert.match(markup, /position:fixed/);
    assert.match(markup, /bottom:96px/);
    assert.match(markup, /left:80px/);
    assert.doesNotMatch(markup, /top:120px/);
  } finally {
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      configurable: true,
    });
  }
});
