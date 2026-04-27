import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MainContentHeader from './MainContentHeader.tsx';

const selectedProject = {
  id: 'project-1',
  name: 'demo-project',
  displayName: 'Demo Project',
  path: '/demo',
  fullPath: '/demo',
  sessions: [
    {
      id: 'session-1',
      summary: 'Session Summary',
    },
    {
      id: 'session-2',
      summary: '另一个会话',
    },
  ],
};

const selectedSession = {
  id: 'session-1',
  summary: 'Session Summary',
};

test('桌面端 MainContentHeader 渲染会话切换按钮和新建会话按钮', () => {
  const markup = renderToStaticMarkup(
    React.createElement(MainContentHeader, {
      activeTab: 'chat',
      selectedProject,
      selectedSession,
      isMobile: false,
      onMenuClick: () => {},
      onNavigateToSession: () => {},
      onStartNewSession: () => {},
      hasRightPaneContent: false,
      isRightPaneVisible: false,
      onToggleRightPaneVisibility: () => {},
    }),
  );

  const buttonMatches = markup.match(/<button/g) ?? [];
  assert.equal(buttonMatches.length, 3);
  assert.match(markup, /Session Summary/);
  assert.match(markup, /Demo Project/);
  assert.match(markup, /新建会话/);
  assert.doesNotMatch(markup, /聊天/);
});
