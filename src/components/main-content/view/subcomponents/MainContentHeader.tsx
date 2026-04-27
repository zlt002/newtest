import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import type { MainContentHeaderProps } from '../../types/types';
import MobileMenuButton from './MobileMenuButton';
import MainContentSessionSwitcher from './MainContentSessionSwitcher';

export default function MainContentHeader({
  activeTab: _activeTab,
  selectedProject,
  selectedSession,
  isMobile,
  onMenuClick,
  onNavigateToSession,
  onStartNewSession,
  hasRightPaneContent,
  isRightPaneVisible,
  onToggleRightPaneVisibility,
}: MainContentHeaderProps) {
  const paneActionLabel = hasRightPaneContent
    ? (isRightPaneVisible ? '收起右侧面板' : '展开右侧面板')
    : '打开右侧面板';

  return (
    <div className="pwa-header-safe h-14 flex-shrink-0 border-b border-border/60 bg-background px-3 py-2">
      <div className="flex h-full min-w-0 items-center gap-2">
        {isMobile && <MobileMenuButton onMenuClick={onMenuClick} />}
        <div className="flex h-full min-w-0 flex-1 items-center">
          <MainContentSessionSwitcher
            selectedProject={selectedProject}
            selectedSession={selectedSession}
            onNavigateToSession={onNavigateToSession}
            onStartNewSession={onStartNewSession}
          />
        </div>
        <button
          type="button"
          onClick={onToggleRightPaneVisibility}
          className="flex h-full w-10 flex-shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent/50 hover:text-foreground"
          title={paneActionLabel}
          aria-label={paneActionLabel}
        >
          {hasRightPaneContent && isRightPaneVisible ? (
            <PanelRightClose className="h-4 w-4" />
          ) : (
            <PanelRightOpen className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
