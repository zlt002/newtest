import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getDefaultMarkdownPreview } from '../../code-editor/utils/markdownPreviewState.ts';
import { createEditorPaneProps } from './editorPaneProps.ts';
import MarkdownPane from './MarkdownPane.tsx';
import MarkdownDraftPane from './MarkdownDraftPane.tsx';
import RightPaneContentRouter from './RightPaneContentRouter.tsx';

const markdownTarget = {
  type: 'markdown',
  filePath: '/demo/README.md',
  fileName: 'README.md',
  projectName: 'demo-project',
};

test('MarkdownPane renders a dedicated markdown pane wrapper for markdown targets', () => {
  const markup = renderToStaticMarkup(
    React.createElement(MarkdownPane, {
      target: markdownTarget,
      refreshPulse: 2,
      onClosePane: () => {},
      projectPath: '/demo',
      isSidebar: true,
    }),
  );

  assert.match(markup, /data-right-pane-view="markdown"/);
  assert.match(markup, /data-markdown-pane="true"/);
  assert.match(markup, /data-right-pane-file-path="\/demo\/README\.md"/);
  assert.match(markup, /data-markdown-file-name="README\.md"/);
  assert.match(markup, /data-editor-refresh-pulse="2"/);
});

test('RightPaneContentRouter routes markdown targets to MarkdownPane instead of placeholder chrome', () => {
  const markup = renderToStaticMarkup(
    React.createElement(RightPaneContentRouter, {
      target: markdownTarget,
      codeFollowAlongState: {
        filePath: '/demo/README.md',
        lineRange: null,
        pulse: 3,
      },
      onClosePane: () => {},
      projectPath: '/demo',
      isSidebar: true,
    }),
  );

  assert.match(markup, /data-right-pane-view="markdown"/);
  assert.match(markup, /data-markdown-pane="true"/);
  assert.match(markup, /data-editor-refresh-pulse="3"/);
  assert.doesNotMatch(markup, /Markdown Preview/);
});

test('MarkdownDraftPane renders immediate draft placeholder content for pending markdown work', () => {
  const markup = renderToStaticMarkup(
    React.createElement(MarkdownDraftPane, {
      target: {
        type: 'markdown-draft',
        filePath: '/demo/PRD.md',
        fileName: 'PRD.md',
        projectName: 'demo-project',
        content: '',
        statusText: '正在起草...',
      },
      onClosePane: () => {},
    }),
  );

  assert.match(markup, /data-right-pane-view="markdown-draft"/);
  assert.match(markup, /data-markdown-draft-pane="true"/);
  assert.match(markup, /正在起草/);
});

test('RightPaneContentRouter routes markdown-draft targets to MarkdownDraftPane', () => {
  const markup = renderToStaticMarkup(
    React.createElement(RightPaneContentRouter, {
      target: {
        type: 'markdown-draft',
        filePath: '/demo/PRD.md',
        fileName: 'PRD.md',
        projectName: 'demo-project',
        content: '# 草稿',
        statusText: '正在接收回复',
      },
      onClosePane: () => {},
      isSidebar: true,
    }),
  );

  assert.match(markup, /data-right-pane-view="markdown-draft"/);
  assert.match(markup, /data-markdown-draft-pane="true"/);
  assert.match(markup, /PRD\.md/);
});

test('Markdown files keep the existing default preview-on behavior', () => {
  const markup = renderToStaticMarkup(
    React.createElement(MarkdownPane, {
      target: markdownTarget,
      onClosePane: () => {},
      projectPath: '/demo',
      isSidebar: true,
    }),
  );

  assert.equal(getDefaultMarkdownPreview(markdownTarget.fileName), true);
  assert.match(markup, /data-markdown-default-preview="true"/);
});

test('createEditorPaneProps forwards the real client CodeEditor props for markdown targets', () => {
  const onClosePane = () => {};
  const onTogglePaneExpand = () => {};
  const onPopOut = () => {};
  const onAppendToChatInput = () => {};

  const result = createEditorPaneProps({
    target: markdownTarget,
    projectPath: '/demo',
    onClosePane,
    onTogglePaneExpand,
    onAppendToChatInput,
    onPopOut,
    isExpanded: true,
    isSidebar: false,
  });

  assert.deepEqual(result.file, {
    name: 'README.md',
    path: '/demo/README.md',
    projectName: 'demo-project',
  });
  assert.equal(result.onClose, onClosePane);
  assert.equal(result.projectPath, '/demo');
  assert.equal(result.isSidebar, false);
  assert.equal(result.isExpanded, true);
  assert.equal(result.onToggleExpand, onTogglePaneExpand);
  assert.equal(result.onPopOut, onPopOut);
  assert.equal(result.onAppendToChatInput, onAppendToChatInput);
});
