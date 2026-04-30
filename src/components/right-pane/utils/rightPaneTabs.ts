import type { RightPaneTab, RightPaneTarget } from '../types';
import { getRightPaneTargetIdentity } from './rightPaneTargetIdentity.js';

type UpsertResult = {
  tabs: RightPaneTab[];
  activeTabId: string | null;
};

type CloseResult = {
  tabs: RightPaneTab[];
  activeTabId: string | null;
};

type UpsertOptions = {
  activate?: boolean;
  markAsFresh?: boolean;
  currentActiveTabId?: string | null;
};

export function upsertRightPaneTab(
  tabs: RightPaneTab[],
  target: RightPaneTarget,
  options: UpsertOptions = {},
): UpsertResult {
  const nextId = getRightPaneTargetIdentity(target);
  const existingIndex = tabs.findIndex((tab) => tab.id === nextId);
  const shouldActivate = options.activate !== false;
  const nextActiveTabId = shouldActivate
    ? nextId
    : (options.currentActiveTabId && tabs.some((tab) => tab.id === options.currentActiveTabId)
      ? options.currentActiveTabId
      : nextId);

  if (existingIndex >= 0) {
    const nextTabs = tabs.slice();
    const previousTab = nextTabs[existingIndex];
    nextTabs[existingIndex] = {
      id: nextId,
      target,
      isFresh: options.markAsFresh ? true : (shouldActivate ? false : previousTab.isFresh),
    };
    return {
      tabs: nextTabs,
      activeTabId: nextActiveTabId,
    };
  }

  return {
    tabs: [
      ...tabs,
      {
        id: nextId,
        target,
        isFresh: options.markAsFresh ? true : false,
      },
    ],
    activeTabId: nextActiveTabId,
  };
}

export function closeRightPaneTab(tabs: RightPaneTab[], activeTabId: string | null, tabId: string): CloseResult {
  const removedIndex = tabs.findIndex((tab) => tab.id === tabId);
  if (removedIndex < 0) {
    return {
      tabs,
      activeTabId,
    };
  }

  const nextTabs = tabs.filter((tab) => tab.id !== tabId);
  if (nextTabs.length === 0) {
    return {
      tabs: [],
      activeTabId: null,
    };
  }

  if (activeTabId !== tabId) {
    return {
      tabs: nextTabs,
      activeTabId,
    };
  }

  const fallbackIndex = Math.min(removedIndex, nextTabs.length - 1);
  return {
    tabs: nextTabs,
    activeTabId: nextTabs[fallbackIndex]?.id ?? null,
  };
}

export function getRightPaneTabLabel(target: RightPaneTarget): string {
  if (target.type === 'browser') {
    return target.title?.trim() || target.url;
  }

  if (target.type === 'git-commit') {
    return target.message.trim() || target.shortHash;
  }

  if (target.type === 'visual-html') {
    return target.fileName;
  }

  return target.fileName;
}
