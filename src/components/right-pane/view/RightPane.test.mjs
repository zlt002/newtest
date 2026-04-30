import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import RightPane from './RightPane.tsx';
import RightPaneContentRouter from './RightPaneContentRouter.tsx';
import { createEditorPaneProps } from './editorPaneProps.ts';

const baseProps = {
  tabs: [],
  activeTabId: null,
  isMobile: false,
  editorExpanded: false,
  editorWidth: 420,
  hasManualWidth: false,
  isResizing: false,
  resizeHandleRef: { current: null },
  onResizeStart: () => {},
  onClosePane: () => {},
  onSelectTab: () => {},
  onCloseTab: () => {},
  onTogglePaneExpand: () => {},
  projectPath: '/demo',
  fillSpace: false,
  onAppendToChatInput: null,
};

test('RightPane uses dynamic tab overflow calculation instead of a fixed visible-tab cap', () => {
  const source = readFileSync(new URL('./RightPane.tsx', import.meta.url), 'utf8');

  assert.match(source, /computeVisibleRightPaneTabs/);
  assert.doesNotMatch(source, /MAX_VISIBLE_TABS\s*=\s*3/);
});

test('RightPane returns empty markup when target is null', () => {
  const markup = renderToStaticMarkup(React.createElement(RightPane, { ...baseProps, target: null }));

  assert.equal(markup, '');
});

test('RightPane renders browser branch marker when target type is browser', () => {
  const markup = renderToStaticMarkup(
    React.createElement(RightPane, {
      ...baseProps,
      tabs: [
        {
          id: 'browser:http://localhost:5173',
          target: {
            type: 'browser',
            url: 'http://localhost:5173',
            source: 'address-bar',
          },
        },
      ],
      activeTabId: 'browser:http://localhost:5173',
      target: {
        type: 'browser',
        url: 'http://localhost:5173',
        source: 'address-bar',
      },
    }),
  );

  assert.match(markup, /data-right-pane-type="browser"/);
  assert.match(markup, /data-right-pane-view="browser"/);
  assert.match(markup, /data-right-pane-tab="browser:http:\/\/localhost:5173"/);
  assert.match(markup, /data-right-pane-close="true"/);
});

test('RightPane renders code branch marker when target type is code', () => {
  const markup = renderToStaticMarkup(
    React.createElement(RightPane, {
      ...baseProps,
      tabs: [
        {
          id: 'code:/demo/src/main.ts',
          target: {
            type: 'code',
            filePath: '/demo/src/main.ts',
            fileName: 'main.ts',
            projectName: 'demo-project',
            diffInfo: null,
          },
        },
      ],
      activeTabId: 'code:/demo/src/main.ts',
      target: {
        type: 'code',
        filePath: '/demo/src/main.ts',
        fileName: 'main.ts',
        projectName: 'demo-project',
        diffInfo: null,
      },
    }),
  );

  assert.match(markup, /data-right-pane-type="code"/);
  assert.match(markup, /data-right-pane-view="code"/);
  assert.match(markup, /main\.ts/);
});

test('RightPane marks markdown tabs as follow-along active when the current markdown file changes', () => {
  const markup = renderToStaticMarkup(
    React.createElement(RightPane, {
      ...baseProps,
      tabs: [
        {
          id: 'markdown:/demo/README.md',
          target: {
            type: 'markdown',
            filePath: '/demo/README.md',
            fileName: 'README.md',
            projectName: 'demo-project',
          },
        },
      ],
      activeTabId: 'markdown:/demo/README.md',
      target: {
        type: 'markdown',
        filePath: '/demo/README.md',
        fileName: 'README.md',
        projectName: 'demo-project',
      },
      codeFollowAlongState: {
        filePath: '/demo/README.md',
        lineRange: null,
        pulse: 1,
      },
    }),
  );

  assert.match(markup, /data-right-pane-follow-along-active="true"/);
  assert.match(markup, /data-editor-refresh-pulse="1"/);
});

test('RightPane renders a new badge for background-opened tabs without activating them', () => {
  const markup = renderToStaticMarkup(
    React.createElement(RightPane, {
      ...baseProps,
      tabs: [
        {
          id: 'markdown:/demo/current.md',
          target: {
            type: 'markdown',
            filePath: '/demo/current.md',
            fileName: 'current.md',
            projectName: 'demo-project',
          },
        },
        {
          id: 'markdown:/demo/new.md',
          target: {
            type: 'markdown',
            filePath: '/demo/new.md',
            fileName: 'new.md',
            projectName: 'demo-project',
          },
          isFresh: true,
        },
      ],
      activeTabId: 'markdown:/demo/current.md',
      target: {
        type: 'markdown',
        filePath: '/demo/current.md',
        fileName: 'current.md',
        projectName: 'demo-project',
      },
    }),
  );

  assert.match(markup, /data-right-pane-tab="markdown:\/demo\/new\.md"/);
  assert.match(markup, /data-right-pane-tab-fresh="true"/);
  assert.match(markup, />new</);
});

test('RightPane renders git commit branch marker when target type is git-commit', () => {
  const markup = renderToStaticMarkup(
    React.createElement(RightPane, {
      ...baseProps,
      tabs: [
        {
          id: 'git-commit:a8d7a898062b04918f3368189a3e3b2300000000',
          target: {
            type: 'git-commit',
            commitHash: 'a8d7a898062b04918f3368189a3e3b2300000000',
            shortHash: 'a8d7a89',
            message: 'fix: preview local html file',
            author: 'zhanglt21',
            date: '2026-04-16T09:00:14+08:00',
            diff: 'diff --git a/index.html b/index.html',
            projectName: 'demo-project',
          },
        },
      ],
      activeTabId: 'git-commit:a8d7a898062b04918f3368189a3e3b2300000000',
      target: {
        type: 'git-commit',
        commitHash: 'a8d7a898062b04918f3368189a3e3b2300000000',
        shortHash: 'a8d7a89',
        message: 'fix: preview local html file',
        author: 'zhanglt21',
        date: '2026-04-16T09:00:14+08:00',
        diff: 'diff --git a/index.html b/index.html',
        projectName: 'demo-project',
      },
    }),
  );

  assert.match(markup, /data-right-pane-type="git-commit"/);
  assert.match(markup, /data-right-pane-view="git-commit"/);
  assert.match(markup, /fix: preview local html file/);
});

test('RightPaneContentRouter renders a close affordance for browser sidebar placeholder content', () => {
  const markup = renderToStaticMarkup(
    React.createElement(RightPaneContentRouter, {
      target: {
        type: 'browser',
        url: 'http://localhost:5173/preview',
        source: 'address-bar',
      },
      onClosePane: () => {},
      isSidebar: true,
    }),
  );

  assert.match(markup, /data-right-pane-view="browser"/);
  assert.match(markup, /data-right-pane-close="true"/);
});

test('RightPaneContentRouter renders a close affordance for markdown sidebar placeholder content', () => {
  const markup = renderToStaticMarkup(
    React.createElement(RightPaneContentRouter, {
      target: {
        type: 'markdown',
        filePath: '/demo/README.md',
        fileName: 'README.md',
        projectName: 'demo-project',
      },
      onClosePane: () => {},
      isSidebar: true,
    }),
  );

  assert.match(markup, /data-right-pane-view="markdown"/);
  assert.match(markup, /data-right-pane-close="true"/);
});

test('RightPaneContentRouter placeholder roots include full-height container classes', () => {
  const browserMarkup = renderToStaticMarkup(
    React.createElement(RightPaneContentRouter, {
      target: {
        type: 'browser',
        url: 'http://localhost:5173/layout',
        source: 'address-bar',
      },
      onClosePane: () => {},
      isSidebar: true,
    }),
  );

  const markdownMarkup = renderToStaticMarkup(
    React.createElement(RightPaneContentRouter, {
      target: {
        type: 'markdown',
        filePath: '/demo/README.md',
        fileName: 'README.md',
        projectName: 'demo-project',
      },
      onClosePane: () => {},
      isSidebar: true,
    }),
  );

  assert.match(browserMarkup, /data-right-pane-view="browser"/);
  assert.match(browserMarkup, /class="h-full min-h-0"/);
  assert.match(markdownMarkup, /data-right-pane-view="markdown"/);
  assert.match(markdownMarkup, /class="h-full min-h-0"/);
});

test('createEditorPaneProps forwards manual pop-out capability for code targets', () => {
  const onClosePane = () => {};
  const onTogglePaneExpand = () => {};
  const onPopOut = () => {};
  const onAppendToChatInput = () => {};

  const result = createEditorPaneProps({
    target: {
      type: 'code',
      filePath: '/demo/src/app.ts',
      fileName: 'app.ts',
      projectName: 'demo-project',
      diffInfo: null,
    },
    projectPath: '/demo',
    onClosePane,
    onTogglePaneExpand,
    onAppendToChatInput,
    onPopOut,
    isExpanded: false,
    isSidebar: true,
  });

  assert.equal(result.onClose, onClosePane);
  assert.equal(result.onToggleExpand, onTogglePaneExpand);
  assert.equal(result.onAppendToChatInput, onAppendToChatInput);
  assert.equal(result.onPopOut, onPopOut);
});

test('createEditorPaneProps preserves code diff metadata while sharing the same editor prop shape', () => {
  const diffInfo = {
    old_string: 'before',
    new_string: 'after',
  };

  const result = createEditorPaneProps({
    target: {
      type: 'code',
      filePath: '/demo/src/app.ts',
      fileName: 'app.ts',
      projectName: 'demo-project',
      diffInfo,
    },
    projectPath: '/demo',
    onClosePane: () => {},
    isSidebar: true,
  });

  assert.deepEqual(result.file, {
    name: 'app.ts',
    path: '/demo/src/app.ts',
    projectName: 'demo-project',
    diffInfo,
  });
  assert.equal(result.projectPath, '/demo');
  assert.equal(result.isSidebar, true);
  assert.equal(result.isExpanded, false);
});

test('RightPane overlay browser placeholder renders a single close affordance', () => {
  const markup = renderToStaticMarkup(
    React.createElement(RightPane, {
      ...baseProps,
      isMobile: true,
      tabs: [
        {
          id: 'browser:http://localhost:5173/mobile-preview',
          target: {
            type: 'browser',
            url: 'http://localhost:5173/mobile-preview',
            source: 'address-bar',
          },
        },
      ],
      activeTabId: 'browser:http://localhost:5173/mobile-preview',
      target: {
        type: 'browser',
        url: 'http://localhost:5173/mobile-preview',
        source: 'address-bar',
      },
    }),
  );

  const closeMatches = markup.match(/>Close<\/button>/g) ?? [];
  assert.equal(closeMatches.length, 1);
});

test('RightPane renders multiple tabs and marks the active tab', () => {
  const markup = renderToStaticMarkup(
    React.createElement(RightPane, {
      ...baseProps,
      tabs: [
        {
          id: 'code:/demo/a.ts',
          target: {
            type: 'code',
            filePath: '/demo/a.ts',
            fileName: 'a.ts',
            projectName: 'demo-project',
            diffInfo: null,
          },
        },
        {
          id: 'browser:http://localhost:5173/docs',
          target: {
            type: 'browser',
            url: 'http://localhost:5173/docs',
            source: 'address-bar',
            title: 'Docs',
          },
        },
      ],
      activeTabId: 'browser:http://localhost:5173/docs',
      target: {
        type: 'browser',
        url: 'http://localhost:5173/docs',
        source: 'address-bar',
        title: 'Docs',
      },
    }),
  );

  assert.match(markup, /data-right-pane-tab="code:\/demo\/a\.ts"/);
  assert.match(markup, /data-right-pane-tab="browser:http:\/\/localhost:5173\/docs"/);
  assert.match(markup, /data-right-pane-tab-active="true"/);
});

test('RightPane renders a drag shield while resizing a browser pane', () => {
  const markup = renderToStaticMarkup(
    React.createElement(RightPane, {
      ...baseProps,
      isResizing: true,
      tabs: [
        {
          id: 'browser:http://localhost:5173/preview',
          target: {
            type: 'browser',
            url: 'http://localhost:5173/preview',
            source: 'address-bar',
          },
        },
      ],
      activeTabId: 'browser:http://localhost:5173/preview',
      target: {
        type: 'browser',
        url: 'http://localhost:5173/preview',
        source: 'address-bar',
      },
    }),
  );

  assert.match(markup, /data-right-pane-drag-shield="true"/);
});
