import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

register('./tsx-loader.mjs', import.meta.url);

const [{ default: CodeEditorHeader }, visualHtmlEditor] = await Promise.all([
  import('./CodeEditorHeader.tsx'),
  import('../../utils/visualHtmlEditor.ts'),
]);

const {
  openVisualHtmlEditor,
  shouldShowVisualHtmlAction,
  VISUAL_HTML_OPEN_REQUEST_EVENT_NAME,
} = visualHtmlEditor;

const baseProps = {
  isSidebar: true,
  isFullscreen: false,
  isMarkdownFile: false,
  markdownPreview: false,
  saving: false,
  saveSuccess: false,
  markdownAnnotationCount: 0,
  canAddAnnotationsToChatInput: false,
  markdownToolbarItems: [],
  onToggleMarkdownPreview: () => {},
  onAddAnnotationsToChatInput: null,
  onRequestEditAnnotation: null,
  onDeleteAnnotation: null,
  onSendAnnotationToChatInput: null,
  onOpenSettings: () => {},
  showVisualHtmlAction: false,
  onOpenVisualHtmlEditor: null,
  onPopOut: null,
  onDownload: () => {},
  onDownloadAsMarkdown: null,
  onDownloadAsDoc: null,
  onSave: () => {},
  onToggleFullscreen: () => {},
  onClose: () => {},
  labels: {
    showingChanges: '显示变更',
    editMarkdown: '编辑 Markdown',
    previewMarkdown: '预览 Markdown',
    settings: '设置',
    download: '下载',
    downloadMarkdown: '下载 Markdown',
    downloadDoc: '下载 Word 文档',
    save: '保存',
    saving: '保存中',
    saved: '已保存',
    addAnnotationsToChatInput: '添加标注到聊天输入框',
    addAnnotationsUnavailable: '请先保存标注，再添加到聊天输入框',
    fullscreen: '全屏',
    exitFullscreen: '退出全屏',
    close: '关闭',
  },
};

test('CodeEditorHeader renders the visual html entry for html source files', () => {
  const markup = renderToStaticMarkup(
    React.createElement(CodeEditorHeader, {
      ...baseProps,
      file: {
        name: 'index.html',
        path: '/demo/index.html',
      },
      showVisualHtmlAction: true,
      onOpenVisualHtmlEditor: () => {},
    }),
  );

  assert.match(markup, /可视化编辑/);
  assert.doesNotMatch(markup, /title="可视预览"/);
});

test('CodeEditorHeader does not render the visual html entry for html diff files', () => {
  const markup = renderToStaticMarkup(
    React.createElement(CodeEditorHeader, {
      ...baseProps,
      file: {
        name: 'index.html',
        path: '/demo/index.html',
        diffInfo: {
          old_string: '<html>',
          new_string: '<html>',
        },
      },
      showVisualHtmlAction: false,
      onOpenVisualHtmlEditor: () => {},
    }),
  );

  assert.doesNotMatch(markup, /可视化编辑/);
  assert.doesNotMatch(markup, /title="可视预览"/);
});

test('CodeEditorHeader 在 Markdown 预览模式下隐藏设置和保存，并展示全屏按钮', () => {
  const markup = renderToStaticMarkup(
    React.createElement(CodeEditorHeader, {
      ...baseProps,
      file: {
        name: 'README.md',
        path: '/demo/README.md',
      },
      isMarkdownFile: true,
      markdownPreview: true,
      onPopOut: () => {},
    }),
  );

  assert.doesNotMatch(markup, /title="设置"/);
  assert.doesNotMatch(markup, /title="保存"/);
  assert.match(markup, /title="下载"/);
  assert.match(markup, /title="全屏"/);
});

test('shouldShowVisualHtmlAction only returns true for html files without diffs', () => {
  assert.equal(shouldShowVisualHtmlAction({ name: 'index.html', diffInfo: null }), true);
  assert.equal(shouldShowVisualHtmlAction({ name: 'index.html', diffInfo: { old_string: '<html>' } }), false);
  assert.equal(shouldShowVisualHtmlAction({ name: 'notes.md', diffInfo: null }), false);
});

test('openVisualHtmlEditor confirms before discarding unsaved source edits and then dispatches the open request', () => {
  const calls = [];

  const result = openVisualHtmlEditor({
    hasUnsavedChanges: true,
    persistedContent: '<html>persisted</html>',
    filePath: '/demo/index.html',
    projectName: 'demo-project',
    confirm: (message) => {
      calls.push(['confirm', message]);
      return true;
    },
    setContent: (content) => {
      calls.push(['setContent', content]);
    },
    dispatchEvent: (event) => {
      calls.push(['dispatch', event.type, event.detail]);
    },
  });

  assert.equal(result, true);
  assert.deepEqual(calls, [
    ['confirm', '当前源码存在未保存修改，是否放弃这些改动并进入可视化编辑？'],
    ['setContent', '<html>persisted</html>'],
    [
      'dispatch',
      VISUAL_HTML_OPEN_REQUEST_EVENT_NAME,
      {
        filePath: '/demo/index.html',
        projectName: 'demo-project',
      },
    ],
  ]);
});
