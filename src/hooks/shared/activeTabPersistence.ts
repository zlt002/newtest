import type { AppTab } from '../../types/app';

const VALID_TABS: Set<string> = new Set(['chat', 'preview']);

const isValidTab = (tab: string): tab is AppTab => VALID_TABS.has(tab);

export function normalizePersistedAppTab(tab: string | null): AppTab {
  if (!tab) {
    return 'chat';
  }

  if (tab === 'files' || tab === 'git' || tab === 'tasks') {
    return 'chat';
  }

  return isValidTab(tab) ? tab : 'chat';
}
