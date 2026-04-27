import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldRouteLinkToRightPane,
  getMarkdownLinkAttributes,
} from './markdownLinkRouting.ts';

test('shouldRouteLinkToRightPane 识别应接管到右侧浏览器的网页链接', () => {
  assert.equal(shouldRouteLinkToRightPane('https://example.com/docs'), true);
  assert.equal(shouldRouteLinkToRightPane('http://example.com/docs'), true);
  assert.equal(shouldRouteLinkToRightPane('localhost:5173'), true);
  assert.equal(shouldRouteLinkToRightPane('127.0.0.1:3000/demo'), true);
});

test('shouldRouteLinkToRightPane 不接管文件锚点和非网页协议', () => {
  assert.equal(shouldRouteLinkToRightPane('/docs/README.md'), false);
  assert.equal(shouldRouteLinkToRightPane('#section-1'), false);
  assert.equal(shouldRouteLinkToRightPane('mailto:test@example.com'), false);
  assert.equal(shouldRouteLinkToRightPane('javascript:void(0)'), false);
  assert.equal(shouldRouteLinkToRightPane(undefined), false);
});

test('getMarkdownLinkAttributes 在存在 onOpenUrl 且链接可接管时不再要求 _blank', () => {
  assert.deepEqual(
    getMarkdownLinkAttributes({
      href: 'https://example.com/docs',
      onOpenUrl: () => {},
    }),
    {
      shouldRouteToRightPane: true,
      target: undefined,
      rel: undefined,
    },
  );
});

test('getMarkdownLinkAttributes 在未接管时保留新窗口行为', () => {
  assert.deepEqual(
    getMarkdownLinkAttributes({
      href: 'https://example.com/docs',
    }),
    {
      shouldRouteToRightPane: false,
      target: '_blank',
      rel: 'noopener noreferrer',
    },
  );
});
