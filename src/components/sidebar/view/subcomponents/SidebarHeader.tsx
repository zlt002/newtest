import * as React from 'react';
import { FolderPlus, PanelLeftClose, RefreshCw, Search, Settings, Webhook, X } from 'lucide-react';
import type { TFunction } from 'i18next';
import { Button, Input, Select } from '../../../../shared/view/ui';
import { IS_PLATFORM } from '@constants/keys';
import { getSidebarSearchPlaceholderKey, type SidebarSearchMode } from './SidebarSearchMode.shared';
import { getDesktopSidebarActionSlots } from './sidebarDesktopActions';
import SidebarWorkspaceTabs from './SidebarWorkspaceTabs';
import type { WorkspaceView } from './sidebarWorkspace.shared';

type SidebarHeaderProps = {
  isPWA: boolean;
  isMobile: boolean;
  isLoading: boolean;
  workspaceView: WorkspaceView;
  projectsCount: number;
  searchFilter: string;
  onSearchFilterChange: (value: string) => void;
  onClearSearchFilter: () => void;
  searchMode: SidebarSearchMode;
  onSearchModeChange: (mode: SidebarSearchMode) => void;
  onWorkspaceViewChange: (view: WorkspaceView) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onCreateProject: () => void;
  onOpenHooksOverview: () => void;
  onCollapseSidebar: () => void;
  onShowSettings: () => void;
  t: TFunction;
};

export default function SidebarHeader({
  isPWA,
  isMobile,
  isLoading,
  workspaceView,
  projectsCount,
  searchFilter,
  onSearchFilterChange,
  onClearSearchFilter,
  searchMode,
  onSearchModeChange,
  onWorkspaceViewChange,
  onRefresh,
  isRefreshing,
  onCreateProject,
  onOpenHooksOverview,
  onCollapseSidebar,
  onShowSettings,
  t,
}: SidebarHeaderProps) {
  const desktopActionSlots = getDesktopSidebarActionSlots();
  const [isDesktopSearchFocused, setIsDesktopSearchFocused] = React.useState(false);
  const desktopSearchInputRef = React.useRef<HTMLInputElement | null>(null);
  const isFilesWorkspace = workspaceView === 'files';
  const searchModeOptions = React.useMemo(
    () => [
      { value: 'projects', label: t('search.modeProjects') },
      { value: 'conversations', label: t('search.modeConversations') },
    ],
    [t],
  );
  const LogoBlock = () => (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-primary/90 shadow-sm">
        <svg className="h-3.5 w-3.5 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <h1 className="truncate text-sm font-semibold tracking-tight text-foreground">{t('app.title')}</h1>
    </div>
  );

  const searchPlaceholder = t(getSidebarSearchPlaceholderKey(searchMode));
  const searchModeLabel = searchMode === 'conversations' ? t('search.modeConversations') : t('search.modeProjects');
  const showProjectToolbar = workspaceView === 'projects';

  return (
    <div className="flex-shrink-0">
      {/* Desktop header */}
      <div
        className="hidden h-14 px-3 py-2 md:block"
        style={{}}
      >
        <div className="flex h-full items-center justify-between gap-3">
          {IS_PLATFORM ? (
            <a
              href="https://github.com/siteboon/claudecodeui"
              className="flex h-full min-w-0 items-center gap-2.5 transition-opacity hover:opacity-80"
              title={t('tooltips.viewEnvironments')}
            >
              <LogoBlock />
            </a>
          ) : (
            <LogoBlock />
          )}
          <div className="flex h-full items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 rounded-xl p-0 text-muted-foreground hover:bg-accent/80 hover:text-foreground"
              onClick={onOpenHooksOverview}
              title="Hooks"
              aria-label="Hooks"
            >
              <Webhook className="h-4 w-4" />
            </Button>
            {desktopActionSlots.header.includes('settings') && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 rounded-xl px-3 text-muted-foreground hover:bg-accent/80 hover:text-foreground"
                onClick={onShowSettings}
                title={t('actions.settings')}
              >
                <Settings className="h-4 w-4" />
              </Button>
            )}
            {desktopActionSlots.header.includes('collapse') && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 rounded-xl px-3 text-muted-foreground hover:bg-accent/80 hover:text-foreground"
                onClick={onCollapseSidebar}
                title={t('tooltips.hideSidebar')}
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Desktop search bar */}
      {showProjectToolbar && projectsCount > 0 && !isLoading && (
        <div className="hidden px-3 pb-2 pt-2 md:block">
          <div className="flex items-center gap-2">
            <div className="nav-search-combo flex min-w-0 flex-1 items-center rounded-xl px-1">
              <Select
                className="w-[74px] flex-shrink-0"
                value={searchMode}
                options={searchModeOptions}
                onValueChange={(value) => onSearchModeChange(value as SidebarSearchMode)}
                ariaLabel={t('tooltips.search')}
                triggerClassName="h-9 rounded-l-[10px] rounded-r-none border-0 bg-transparent px-3 text-foreground shadow-none focus-visible:ring-0"
                contentClassName="rounded-xl"
                size="sm"
              />
              <div className="nav-search-combo-divider h-5 w-px flex-shrink-0" />
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
                <Input
                  ref={desktopSearchInputRef}
                  type="text"
                  placeholder={searchPlaceholder}
                  value={searchFilter}
                  onChange={(event) => onSearchFilterChange(event.target.value)}
                  onFocus={() => setIsDesktopSearchFocused(true)}
                  onBlur={() => setIsDesktopSearchFocused(false)}
                  aria-label={`${searchModeLabel}${t('tooltips.search')}`}
                  className="h-9 rounded-l-none rounded-r-[10px] border-0 bg-transparent pl-9 pr-8 text-sm shadow-none transition-all duration-200 placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                {searchFilter && (
                  <button
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onClick={() => {
                      onClearSearchFilter();
                      desktopSearchInputRef.current?.focus();
                    }}
                    aria-label={t('tooltips.clearSearch')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 hover:bg-accent"
                  >
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isDesktopSearchFocused && desktopActionSlots.searchBar.includes('refresh') && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 rounded-xl p-0 text-muted-foreground hover:bg-accent/80 hover:text-foreground"
                  onClick={onRefresh}
                  disabled={isRefreshing}
                  title={t('tooltips.refresh')}
                >
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
              )}
              {!isDesktopSearchFocused && desktopActionSlots.searchBar.includes('create') && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 rounded-xl p-0 text-muted-foreground hover:bg-accent/80 hover:text-foreground"
                  onClick={onCreateProject}
                  title={t('tooltips.createProject')}
                >
                  <FolderPlus className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Desktop divider */}
      <div className="nav-divider hidden md:block" />

      {/* Mobile header */}
      <div
        className={`p-3 ${isFilesWorkspace ? 'pb-1.5' : 'pb-2'} md:hidden`}
        style={isPWA && isMobile ? { paddingTop: '16px' } : {}}
      >
        <div className="flex items-center justify-between gap-2">
          {IS_PLATFORM ? (
            <a
              href="https://github.com/siteboon/claudecodeui"
              className="flex min-w-0 flex-1 items-center gap-2.5 transition-opacity active:opacity-70"
              title={t('tooltips.viewEnvironments')}
            >
              <LogoBlock />
            </a>
          ) : (
            <div className="min-w-0 flex-1">
              <LogoBlock />
            </div>
          )}

          <SidebarWorkspaceTabs
            value={workspaceView}
            onValueChange={onWorkspaceViewChange}
            t={t}
            className="shrink-0"
          />
        </div>

        {showProjectToolbar && (
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-end gap-2">
              <button
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 transition-all active:scale-95"
                onClick={onRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw className={`h-4 w-4 text-muted-foreground ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/90 text-primary-foreground transition-all active:scale-95"
                onClick={onCreateProject}
              >
                <FolderPlus className="h-4 w-4" />
              </button>
            </div>
            {projectsCount > 0 && !isLoading && (
              <div className="flex items-center gap-2">
                <Select
                  className="w-[96px] flex-shrink-0"
                  value={searchMode}
                  options={searchModeOptions}
                  onValueChange={(value) => onSearchModeChange(value as SidebarSearchMode)}
                  ariaLabel={t('tooltips.search')}
                  triggerClassName="rounded-xl border-0 bg-muted/60 shadow-none"
                  contentClassName="rounded-xl"
                />
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                  <Input
                    type="text"
                    placeholder={searchPlaceholder}
                    value={searchFilter}
                    onChange={(event) => onSearchFilterChange(event.target.value)}
                    aria-label={`${searchModeLabel}${t('tooltips.search')}`}
                    className="nav-search-input h-10 rounded-xl border-0 pl-10 pr-9 text-sm transition-all duration-200 placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                  {searchFilter && (
                    <button
                      onClick={onClearSearchFilter}
                      aria-label={t('tooltips.clearSearch')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 hover:bg-accent"
                    >
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile divider */}
      <div className="nav-divider md:hidden" />
    </div>
  );
}
