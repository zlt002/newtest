import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const chatInputControlsUrl = new URL('./ChatInputControls.tsx', import.meta.url).href;
const tsxLoaderUrl = new URL('../../../code-editor/view/subcomponents/tsx-loader.mjs', import.meta.url).href;

const reactI18nextStubUrl = `data:text/javascript,${encodeURIComponent(`
export function useTranslation() {
  return {
    t(key, options) {
      return options && typeof options.defaultValue === 'string' ? options.defaultValue : key;
    },
  };
}
`)}`;

const thinkingModeSelectorStubUrl = `data:text/javascript,${encodeURIComponent(`
import { createRequire } from 'node:module';

const require = createRequire(${JSON.stringify(chatInputControlsUrl)});
const React = require('react');

export default function ThinkingModeSelector() {
  return React.createElement('div', { 'data-thinking-mode-selector': 'true' }, 'thinking');
}
`)}`;

const claudeModelSelectorStubUrl = `data:text/javascript,${encodeURIComponent(`
import { createRequire } from 'node:module';

const require = createRequire(${JSON.stringify(chatInputControlsUrl)});
const React = require('react');

export default function ClaudeModelSelector({ value, title }) {
  return React.createElement(
    'div',
    {
      'data-claude-model-selector': 'true',
      'data-claude-model-selector-value': String(value || ''),
      'data-claude-model-selector-title': String(title || ''),
    },
    'AI ' + String(value || '')
  );
}
`)}`;

const loaderSource = `
import * as base from ${JSON.stringify(tsxLoaderUrl)};

const stubs = new Map([
  ['react-i18next', ${JSON.stringify(reactI18nextStubUrl)}],
  ['${chatInputControlsUrl}::./ThinkingModeSelector', ${JSON.stringify(thinkingModeSelectorStubUrl)}],
  ['${chatInputControlsUrl}::./ClaudeModelSelector', ${JSON.stringify(claudeModelSelectorStubUrl)}],
]);

export async function resolve(specifier, context, nextResolve) {
  const direct = stubs.get(specifier);
  if (direct) {
    return {
      url: direct,
      shortCircuit: true,
    };
  }

  const contextual = stubs.get(String(context.parentURL || '') + '::' + specifier);
  if (contextual) {
    return {
      url: contextual,
      shortCircuit: true,
    };
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

const { default: ChatInputControls } = await import('./ChatInputControls.tsx');

function renderControls(permissionMode = 'default') {
  return renderToStaticMarkup(
    React.createElement(ChatInputControls, {
      menuPosition: { top: 0, left: 0 },
      onOpenImagePicker: () => {},
      permissionMode,
      onModeSwitch: () => {},
      provider: 'claude',
      claudeModel: 'opus',
      setClaudeModel: () => {},
      thinkingMode: 'high',
      setThinkingMode: () => {},
      tokenBudget: null,
      slashCommandsCount: 0,
      onToggleCommandMenu: () => {},
      hasInput: false,
      onClearInput: () => {},
    }),
  );
}

test('ChatInputControls renders the Claude SDK dontAsk permission mode label', () => {
  const markup = renderControls('dontAsk');

  assert.match(markup, /input\.permissionModes\.dontAsk/);
});

test('ChatInputControls renders a Claude model selector for Claude provider', () => {
  const markup = renderControls();

  assert.match(markup, /data-claude-model-selector="true"/);
  assert.match(markup, /data-claude-model-selector-value="opus"/);
  assert.match(markup, /input\.modelSelector/);
  assert.doesNotMatch(markup, /<select/);
});
