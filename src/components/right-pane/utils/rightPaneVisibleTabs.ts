import type { RightPaneTab } from '../types';

type VisibleTabsResult = {
  visibleTabs: RightPaneTab[];
  overflowTabs: RightPaneTab[];
};

type ComputeVisibleRightPaneTabsOptions = {
  tabs: RightPaneTab[];
  activeTabId: string | null;
  availableWidth: number;
  tabWidths: Map<string, number>;
  moreButtonWidth: number;
  tabGap?: number;
};

function getMeasuredWidth(width: number | undefined) {
  return typeof width === 'number' && Number.isFinite(width) && width > 0 ? width : 220;
}

function sumWidths(tabIds: string[], tabWidths: Map<string, number>, gap: number) {
  return tabIds.reduce((total, tabId, index) => total + getMeasuredWidth(tabWidths.get(tabId)) + (index > 0 ? gap : 0), 0);
}

export function computeVisibleRightPaneTabs({
  tabs,
  activeTabId,
  availableWidth,
  tabWidths,
  moreButtonWidth,
  tabGap = 4,
}: ComputeVisibleRightPaneTabsOptions): VisibleTabsResult {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0 || tabs.length === 0) {
    return {
      visibleTabs: tabs.slice(0, 1),
      overflowTabs: tabs.slice(1),
    };
  }

  const allTabIds = tabs.map((tab) => tab.id);
  const fullWidth = sumWidths(allTabIds, tabWidths, tabGap);
  if (fullWidth <= availableWidth) {
    return {
      visibleTabs: tabs,
      overflowTabs: [],
    };
  }

  const reservedWidth = availableWidth - Math.max(moreButtonWidth, 0) - tabGap;
  const nextVisibleTabs: RightPaneTab[] = [];

  for (const tab of tabs) {
    const candidateIds = [...nextVisibleTabs.map((item) => item.id), tab.id];
    if (sumWidths(candidateIds, tabWidths, tabGap) <= reservedWidth) {
      nextVisibleTabs.push(tab);
      continue;
    }
    break;
  }

  if (nextVisibleTabs.length === 0) {
    nextVisibleTabs.push(tabs[0]);
  }

  if (activeTabId && !nextVisibleTabs.some((tab) => tab.id === activeTabId)) {
    const activeTab = tabs.find((tab) => tab.id === activeTabId);
    if (activeTab) {
      const keepCount = Math.max(0, nextVisibleTabs.length - 1);
      const candidateTabs = [...nextVisibleTabs.slice(0, keepCount), activeTab];

      while (candidateTabs.length > 1 && sumWidths(candidateTabs.map((tab) => tab.id), tabWidths, tabGap) > reservedWidth) {
        candidateTabs.shift();
      }

      nextVisibleTabs.splice(0, nextVisibleTabs.length, ...candidateTabs);
    }
  }

  return {
    visibleTabs: nextVisibleTabs,
    overflowTabs: tabs.filter((tab) => !nextVisibleTabs.some((visibleTab) => visibleTab.id === tab.id)),
  };
}
