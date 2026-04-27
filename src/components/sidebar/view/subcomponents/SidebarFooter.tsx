import { PanelLeftClose, RefreshCw, Settings } from 'lucide-react';
import type { TFunction } from 'i18next';
import SidebarWorkspaceTabs from './SidebarWorkspaceTabs';
import type { WorkspaceView } from './sidebarWorkspace.shared';

type SidebarFooterProps = {
  onRefresh: () => void;
  isRefreshing: boolean;
  onCollapseSidebar: () => void;
  onShowSettings: () => void;
  workspaceView: WorkspaceView;
  onWorkspaceViewChange: (view: WorkspaceView) => void;
  t: TFunction;
};

export default function SidebarFooter({
  onRefresh,
  isRefreshing,
  onCollapseSidebar,
  onShowSettings,
  workspaceView,
  onWorkspaceViewChange,
  t,
}: SidebarFooterProps) {
  return (
    <div className="flex-shrink-0" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}>
      {/* Desktop workspace tabs */}
      <div className="hidden px-2 py-1.5 md:block">
        <div className="flex items-center px-0.5">
          <SidebarWorkspaceTabs
            value={workspaceView}
            onValueChange={onWorkspaceViewChange}
            t={t}
            showLabels={true}
            stretch={true}
          />
        </div>
      </div>

      {/* Mobile public actions */}
      <div className="px-3 pb-mobile-nav pt-3 md:hidden">
        <div className="grid grid-cols-3 gap-2">
          <button
            className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl bg-muted/40 px-2 py-3 text-center transition-all hover:bg-muted/60 active:scale-[0.98]"
            onClick={onShowSettings}
          >
            <Settings className="h-4.5 w-4.5 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">{t('actions.settings')}</span>
          </button>

          <button
            className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl bg-muted/40 px-2 py-3 text-center transition-all hover:bg-muted/60 active:scale-[0.98]"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4.5 w-4.5 text-muted-foreground ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="text-sm font-medium text-foreground">{t('actions.refresh')}</span>
          </button>

          <button
            className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl bg-muted/40 px-2 py-3 text-center transition-all hover:bg-muted/60 active:scale-[0.98]"
            onClick={onCollapseSidebar}
            aria-label={t('tooltips.hideSidebar')}
            title={t('tooltips.hideSidebar')}
          >
            <PanelLeftClose className="h-4.5 w-4.5 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">收起</span>
          </button>
        </div>
      </div>
    </div>
  );
}
