export type DesktopSidebarAction = 'refresh' | 'create' | 'collapse' | 'settings';

export function getDesktopSidebarActionSlots(): {
  header: DesktopSidebarAction[];
  searchBar: DesktopSidebarAction[];
  footer: DesktopSidebarAction[];
} {
  return {
    header: ['settings', 'collapse'],
    searchBar: ['refresh', 'create'],
    footer: [],
  };
}
