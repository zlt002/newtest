import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const messageComponentUrl = new URL('./MessageComponent.tsx', import.meta.url).href;
const markdownComponentUrl = new URL('./Markdown.tsx', import.meta.url).href;
const tsxLoaderUrl = new URL('../../../code-editor/view/subcomponents/tsx-loader.mjs', import.meta.url).href;
const structuredOutputCardUrl = new URL('../../components/StructuredOutputCard.tsx', import.meta.url).href;

const reactI18nextStubUrl = `data:text/javascript,${encodeURIComponent(`
export function useTranslation() {
  return {
    t(key) {
      return key;
    },
  };
}
`)}`;

const sessionProviderLogoStubUrl = `data:text/javascript,${encodeURIComponent(`
import { createRequire } from 'node:module';
const require = createRequire(${JSON.stringify(messageComponentUrl)});
const React = require('react');

export default function SessionProviderLogo() {
  return React.createElement('span', { 'data-logo': 'true' }, 'LOGO');
}
`)}`;

const markdownStubUrl = `data:text/javascript,${encodeURIComponent(`
import { createRequire } from 'node:module';
const require = createRequire(${JSON.stringify(messageComponentUrl)});
const React = require('react');

export function Markdown({ children }) {
  return React.createElement('div', { 'data-markdown': 'true' }, children);
}
`)}`;

const copyControlStubUrl = `data:text/javascript,${encodeURIComponent(`
import { createRequire } from 'node:module';
const require = createRequire(${JSON.stringify(messageComponentUrl)});
const React = require('react');

export default function MessageCopyControl() {
  return React.createElement('button', { type: 'button' }, 'copy');
}
`)}`;

const structuredOutputCardStubUrl = `data:text/javascript,${encodeURIComponent(`
import { createRequire } from 'node:module';
const require = createRequire(${JSON.stringify(messageComponentUrl)});
const React = require('react');

export function StructuredOutputCard({ value }) {
  return React.createElement(
    'div',
    {
      'data-structured-output-card': 'true',
    },
    JSON.stringify(value)
  );
}

export default StructuredOutputCard;
`)}`;

const toolModuleStubUrl = `data:text/javascript,${encodeURIComponent(`
import { createRequire } from 'node:module';
const require = createRequire(${JSON.stringify(messageComponentUrl)});
const React = require('react');

export function ToolRenderer({ mode, toolName, toolResult }) {
  return React.createElement(
    'div',
    {
      'data-tool-renderer': 'true',
      'data-tool-renderer-mode': String(mode || ''),
      'data-tool-name': String(toolName || ''),
      'data-tool-result-error': String(Boolean(toolResult?.isError)),
    },
    String(toolResult?.content || '')
  );
}

export function shouldHideToolResult() {
  return false;
}
`)}`;

const chatFormattingStubUrl = `data:text/javascript,${encodeURIComponent(`
export function formatUsageLimitText(text) {
  return text;
}
`)}`;

const chatPermissionsStubUrl = `data:text/javascript,${encodeURIComponent(`
export function getClaudePermissionSuggestion() {
  return null;
}
`)}`;

const messageCollapseStubUrl = `data:text/javascript,${encodeURIComponent(`
export function getUserMessageCollapseState() {
  return {
    shouldClamp: false,
    shouldShowToggle: false,
    toggleLabel: '',
  };
}

export function shouldCollapseUserMessage() {
  return false;
}
`)}`;

const presentationStubUrl = `data:text/javascript,${encodeURIComponent(`
export function getToolUseLeadText() {
  return '';
}
`)}`;

const loaderSource = `
import * as base from ${JSON.stringify(tsxLoaderUrl)};

const stubs = new Map([
  ['react-i18next', ${JSON.stringify(reactI18nextStubUrl)}],
  ['${messageComponentUrl}::../../../llm-logo-provider/SessionProviderLogo', ${JSON.stringify(sessionProviderLogoStubUrl)}],
  ['${messageComponentUrl}::./Markdown', ${JSON.stringify(markdownStubUrl)}],
  ['${messageComponentUrl}::./Markdown.tsx', ${JSON.stringify(markdownStubUrl)}],
  ['${markdownComponentUrl}', ${JSON.stringify(markdownStubUrl)}],
  ['${messageComponentUrl}::./MessageCopyControl', ${JSON.stringify(copyControlStubUrl)}],
  ['${messageComponentUrl}::../../components/StructuredOutputCard.tsx', ${JSON.stringify(structuredOutputCardStubUrl)}],
  ['${structuredOutputCardUrl}', ${JSON.stringify(structuredOutputCardStubUrl)}],
  ['${messageComponentUrl}::../../tools', ${JSON.stringify(toolModuleStubUrl)}],
  ['${messageComponentUrl}::../../utils/chatFormatting', ${JSON.stringify(chatFormattingStubUrl)}],
  ['${messageComponentUrl}::../../utils/chatPermissions', ${JSON.stringify(chatPermissionsStubUrl)}],
  ['${messageComponentUrl}::./messageCollapse', ${JSON.stringify(messageCollapseStubUrl)}],
  ['${messageComponentUrl}::@hooks/chat/chatMessagePresentation.js', ${JSON.stringify(presentationStubUrl)}],
]);

export async function resolve(specifier, context, nextResolve) {
  const direct = stubs.get(specifier);
  if (direct) {
    return { url: direct, shortCircuit: true };
  }

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

const { default: MessageComponent } = await import('./MessageComponent.tsx');

test('MessageComponent renders assistant text directly without legacy execution containers', () => {
  const message = {
    type: 'assistant',
    content: '佛山家电与制造业优势明显',
    timestamp: '2026-04-18T11:00:00.000Z',
  };

  const markup = renderToStaticMarkup(
    React.createElement(MessageComponent, {
      messageKey: 'job-tree-1',
      message,
      prevMessage: null,
      createDiff: () => [],
      provider: 'claude',
    }),
  );

  assert.match(markup, /佛山家电与制造业优势明显/);
  assert.doesNotMatch(markup, /data-run-container/);
  assert.doesNotMatch(markup, /job-tree/);
});

test('MessageComponent routes tool errors through ToolRenderer instead of the legacy red markdown error box', () => {
  const message = {
    type: 'assistant',
    content: '',
    timestamp: '2026-04-18T11:05:00.000Z',
    isToolUse: true,
    toolName: 'WebFetch',
    toolInput: '{"url":"https://code.claude.com"}',
    toolId: 'tool-webfetch-1',
    toolResult: {
      isError: true,
      content: 'Unable to verify if domain code.claude.com is safe to fetch.',
    },
  };

  const markup = renderToStaticMarkup(
    React.createElement(MessageComponent, {
      messageKey: 'job-tree-2',
      message,
      prevMessage: null,
      createDiff: () => [],
      provider: 'claude',
    }),
  );

  assert.match(markup, /data-tool-renderer="true"/);
  assert.match(markup, /data-tool-renderer-mode="result"/);
  assert.match(markup, /data-tool-name="WebFetch"/);
  assert.doesNotMatch(markup, /prose-red/);
});

test('MessageComponent renders structured output through StructuredOutputCard instead of inlining JSON markdown', () => {
  const message = {
    type: 'assistant',
    content: '整理完成',
    timestamp: '2026-04-18T11:10:00.000Z',
    structuredOutput: {
      title: '登录页',
      changed: true,
    },
  };

  const markup = renderToStaticMarkup(
    React.createElement(MessageComponent, {
      messageKey: 'job-tree-3',
      message,
      prevMessage: null,
      createDiff: () => [],
      provider: 'claude',
    }),
  );

  assert.match(markup, /整理完成/);
  assert.match(markup, /data-structured-output-card="true"/);
  assert.match(markup, /&quot;title&quot;:&quot;登录页&quot;/);
  assert.doesNotMatch(markup, /```json/);
});

test('MessageComponent renders user image attachments as real images when data is available', () => {
  const message = {
    type: 'user',
    content: '请看图片',
    timestamp: '2026-04-18T11:12:00.000Z',
    images: [
      {
        data: 'data:image/png;base64,ZmFrZS1pbWFnZQ==',
        name: 'image-1.png',
      },
    ],
  };

  const markup = renderToStaticMarkup(
    React.createElement(MessageComponent, {
      messageKey: 'job-tree-4',
      message,
      prevMessage: null,
      createDiff: () => [],
      provider: 'claude',
    }),
  );

  assert.match(markup, /<img/);
  assert.match(markup, /src="data:image\/png;base64,ZmFrZS1pbWFnZQ=="/);
  assert.match(markup, /alt="image-1.png"/);
  assert.match(markup, /class="h-20 w-20 overflow-hidden rounded-lg border border-blue-300\/40 bg-blue-500\/30 transition-opacity hover:opacity-90"/);
  assert.match(markup, /class="h-full w-full object-cover"/);
});

test('MessageComponent renders user image placeholders when image data is unavailable', () => {
  const message = {
    type: 'user',
    content: '',
    timestamp: '2026-04-18T11:13:00.000Z',
    images: [
      {
        data: null,
        name: 'image-1.png',
        isPlaceholder: true,
        placeholderLabel: '已发送图片',
      },
    ],
  };

  const markup = renderToStaticMarkup(
    React.createElement(MessageComponent, {
      messageKey: 'job-tree-5',
      message,
      prevMessage: null,
      createDiff: () => [],
      provider: 'claude',
    }),
  );

  assert.match(markup, /已发送图片/);
  assert.doesNotMatch(markup, /<img/);
});
