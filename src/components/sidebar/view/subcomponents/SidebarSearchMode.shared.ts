export type SidebarSearchMode = 'projects' | 'conversations';

export function getSidebarSearchPlaceholderKey(mode: SidebarSearchMode): string {
  return mode === 'conversations'
    ? 'search.conversationsPlaceholder'
    : 'projects.searchPlaceholder';
}
