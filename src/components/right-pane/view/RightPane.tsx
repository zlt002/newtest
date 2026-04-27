import { ChevronDown, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, MutableRefObject, ReactNode } from 'react';
import { getEditorContainerClassName, getEditorSidebarPaneClassName } from '../../code-editor/utils/editorSidebarLayout';
import type { BrowserDependencySnapshot, CodeFollowAlongState, DraftPreviewState } from '../../code-editor/hooks/useEditorSidebar';
import type { RightPaneTab, RightPaneTarget } from '../types';
import { getRightPaneTabLabel } from '../utils/rightPaneTabs';
import { computeVisibleRightPaneTabs } from '../utils/rightPaneVisibleTabs';
import RightPaneContentRouter from './RightPaneContentRouter';

type RightPaneProps = {
  tabs: RightPaneTab[];
  activeTabId: string | null;
  target: RightPaneTarget | null;
  isMobile: boolean;
  editorExpanded: boolean;
  editorWidth: number;
  hasManualWidth: boolean;
  isResizing: boolean;
  resizeHandleRef: MutableRefObject<HTMLDivElement | null>;
  onResizeStart: (event: ReactMouseEvent<HTMLDivElement>) => void;
  browserRefreshVersion?: number;
  codeFollowAlongState?: CodeFollowAlongState | null;
  draftPreviewState?: DraftPreviewState;
  onClosePane: () => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onTogglePaneExpand: () => void;
  projectPath?: string;
  fillSpace?: boolean;
  onAppendToChatInput?: ((text: string) => void) | null;
  onBrowserDependenciesChange?: ((snapshot: BrowserDependencySnapshot) => void) | null;
};

const MIN_LEFT_CONTENT_WIDTH = 200;
const MIN_RIGHT_PANE_WIDTH = 280;
function getDraftPreviewOperationsForTarget(
  target: RightPaneTarget,
  draftPreviewState: DraftPreviewState,
) {
  if (!('filePath' in target) || typeof target.filePath !== 'string') {
    return [];
  }

  return draftPreviewState[target.filePath] ?? [];
}

function PlaceholderOverlayFrame({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[9999] bg-background md:flex md:items-center md:justify-center md:bg-black/50 md:p-4">
      <div className="flex h-full w-full flex-col bg-background shadow-2xl md:h-[80vh] md:max-h-[80vh] md:max-w-5xl md:rounded-lg">
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

export default function RightPane({
  tabs,
  activeTabId,
  target,
  isMobile,
  editorExpanded,
  editorWidth,
  hasManualWidth,
  isResizing,
  resizeHandleRef,
  onResizeStart,
  browserRefreshVersion = 0,
  codeFollowAlongState = null,
  draftPreviewState = {},
  onClosePane,
  onSelectTab,
  onCloseTab,
  onTogglePaneExpand,
  projectPath,
  fillSpace,
  onAppendToChatInput,
  onBrowserDependenciesChange = null,
}: RightPaneProps) {
  const [poppedOut, setPoppedOut] = useState(false);
  const [effectiveWidth, setEffectiveWidth] = useState(editorWidth);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [tabsViewportWidth, setTabsViewportWidth] = useState(Number.POSITIVE_INFINITY);
  const [measuredTabWidths, setMeasuredTabWidths] = useState<Record<string, number>>({});
  const [measuredMoreButtonWidth, setMeasuredMoreButtonWidth] = useState(72);
  const containerRef = useRef<HTMLDivElement>(null);
  const tabsViewportRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const targetIdentity = target ? activeTabId : null;
  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs],
  );
  const tabWidths = useMemo(() => new Map(Object.entries(measuredTabWidths)), [measuredTabWidths]);
  const { visibleTabs, overflowTabs } = useMemo(() => {
    return computeVisibleRightPaneTabs({
      tabs,
      activeTabId,
      availableWidth: tabsViewportWidth,
      tabWidths,
      moreButtonWidth: measuredMoreButtonWidth,
    });
  }, [activeTabId, measuredMoreButtonWidth, tabWidths, tabs, tabsViewportWidth]);

  useEffect(() => {
    if (!tabsViewportRef.current) {
      return;
    }

    const updateWidth = () => {
      const width = tabsViewportRef.current?.clientWidth;
      if (typeof width === 'number' && Number.isFinite(width) && width > 0) {
        setTabsViewportWidth(width);
      }
    };

    updateWidth();

    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(tabsViewportRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [tabs.length]);

  const measureTabWidth = (tabId: string, element: HTMLDivElement | null) => {
    if (!element) {
      return;
    }

    const width = Math.ceil(element.getBoundingClientRect().width);
    if (!Number.isFinite(width) || width <= 0) {
      return;
    }

    setMeasuredTabWidths((previous) => (previous[tabId] === width ? previous : {
      ...previous,
      [tabId]: width,
    }));
  };

  const measureMoreButtonWidth = (element: HTMLButtonElement | null) => {
    if (!element) {
      return;
    }

    const width = Math.ceil(element.getBoundingClientRect().width);
    if (!Number.isFinite(width) || width <= 0) {
      return;
    }

    setMeasuredMoreButtonWidth((previous) => (previous === width ? previous : width));
  };

  useEffect(() => {
    setPoppedOut(false);
  }, [targetIdentity]);

  useEffect(() => {
    setIsMoreMenuOpen(false);
  }, [activeTabId, poppedOut, tabs.length]);

  useEffect(() => {
    if (!isMoreMenuOpen) {
      return;
    }

    const handlePointerDown = (event: globalThis.MouseEvent) => {
      const menuElement = moreMenuRef.current;
      if (menuElement && !menuElement.contains(event.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMoreMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isMoreMenuOpen]);

  useEffect(() => {
    if (!target || isMobile || poppedOut) {
      return;
    }

    const updateWidth = () => {
      if (!containerRef.current) {
        return;
      }

      const parentElement = containerRef.current.parentElement;
      if (!parentElement) {
        return;
      }

      const containerWidth = parentElement.clientWidth;
      const maxPaneWidth = containerWidth - MIN_LEFT_CONTENT_WIDTH;

      if (maxPaneWidth < MIN_RIGHT_PANE_WIDTH) {
        setPoppedOut(true);
      } else if (editorWidth > maxPaneWidth) {
        setEffectiveWidth(maxPaneWidth);
      } else {
        setEffectiveWidth(editorWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);

    const resizeObserver = new ResizeObserver(updateWidth);
    const parentEl = containerRef.current?.parentElement;
    if (parentEl) {
      resizeObserver.observe(parentEl);
    }

    return () => {
      window.removeEventListener('resize', updateWidth);
      resizeObserver.disconnect();
    };
  }, [editorWidth, isMobile, poppedOut, target]);

  if (!target || !activeTab) {
    return null;
  }

  const renderTabs = () => (
    <div className="flex h-10 flex-shrink-0 items-center gap-1 overflow-hidden border-b border-border/60 bg-background px-2">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden" ref={tabsViewportRef}>
        {visibleTabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isFollowAlongActive = Boolean(
            codeFollowAlongState &&
            codeFollowAlongState.pulse > 0 &&
            (tab.target.type === 'code' || tab.target.type === 'markdown') &&
            tab.target.filePath === codeFollowAlongState.filePath,
          );

          return (
            <div
              key={tab.id}
              className={`group flex h-8 min-w-0 max-w-[220px] flex-shrink-0 items-center gap-1 rounded-md border px-2 text-sm transition-colors ${
                isFollowAlongActive
                  ? 'border-blue-400 bg-blue-50 text-blue-700'
                  : isActive
                  ? 'border-border bg-accent/60 text-foreground'
                  : 'border-transparent bg-muted/40 text-muted-foreground hover:bg-accent/40 hover:text-foreground'
              }`}
              data-right-pane-tab={tab.id}
              data-right-pane-tab-active={String(isActive)}
              data-right-pane-follow-along-active={String(isFollowAlongActive)}
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left"
                onClick={() => onSelectTab(tab.id)}
                title={getRightPaneTabLabel(tab.target)}
              >
                {getRightPaneTabLabel(tab.target)}
              </button>
              <button
                type="button"
                className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
                aria-label={`关闭 ${getRightPaneTabLabel(tab.target)}`}
                onClick={() => onCloseTab(tab.id)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
      {overflowTabs.length > 0 && (
        <div className="relative flex-shrink-0" ref={moreMenuRef}>
          <button
            type="button"
            className="flex h-8 items-center gap-1 rounded-md border border-border/70 bg-background px-2 text-sm text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
            data-right-pane-tab-more="true"
            aria-expanded={isMoreMenuOpen}
            aria-haspopup="menu"
            onClick={() => setIsMoreMenuOpen((previous) => !previous)}
          >
            更多
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isMoreMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {isMoreMenuOpen && (
            <div
              className="absolute right-0 top-full z-30 mt-1 flex w-72 flex-col rounded-lg border border-border bg-popover p-1 shadow-xl"
              data-right-pane-tab-more-menu="true"
              role="menu"
            >
              {overflowTabs.map((tab) => {
                const isActive = tab.id === activeTabId;

                return (
                  <div
                    key={tab.id}
                    className={`flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                      isActive ? 'bg-accent/60 text-foreground' : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                    }`}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left"
                      data-right-pane-overflow-tab={tab.id}
                      onClick={() => {
                        onSelectTab(tab.id);
                        setIsMoreMenuOpen(false);
                      }}
                      role="menuitem"
                      title={getRightPaneTabLabel(tab.target)}
                    >
                      {getRightPaneTabLabel(tab.target)}
                    </button>
                    <button
                      type="button"
                      className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
                      aria-label={`关闭 ${getRightPaneTabLabel(tab.target)}`}
                      onClick={() => {
                        onCloseTab(tab.id);
                        setIsMoreMenuOpen(false);
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 -z-10 h-0 overflow-hidden opacity-0"
      >
        <div className="flex items-center gap-1 px-2">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const isFollowAlongActive = Boolean(
              codeFollowAlongState
              && ('filePath' in tab.target)
              && tab.target.type === 'markdown'
              && codeFollowAlongState.filePath === tab.target.filePath,
            );

            return (
              <div
                key={`measure-${tab.id}`}
                ref={(element) => measureTabWidth(tab.id, element)}
                className={`group flex h-8 min-w-0 max-w-[220px] flex-shrink-0 items-center gap-1 rounded-md border px-2 text-sm transition-colors ${
                  isFollowAlongActive
                    ? 'border-blue-400 bg-blue-50 text-blue-700'
                    : isActive
                    ? 'border-border bg-accent/60 text-foreground'
                    : 'border-transparent bg-muted/40 text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                }`}
              >
                <span className="min-w-0 flex-1 truncate text-left">{getRightPaneTabLabel(tab.target)}</span>
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-muted-foreground transition-colors">
                  <X className="h-3.5 w-3.5" />
                </span>
              </div>
            );
          })}
          <button
            ref={measureMoreButtonWidth}
            type="button"
            className="flex h-8 items-center gap-1 rounded-md border border-border/70 bg-background px-2 text-sm text-muted-foreground transition-colors"
          >
            更多
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  const renderPaneBody = () => (
    <>
      {renderTabs()}
      <div className="min-h-0 flex-1">
        <RightPaneContentRouter
          target={target}
          projectPath={projectPath}
          browserRefreshVersion={browserRefreshVersion}
          codeFollowAlongState={codeFollowAlongState}
          draftPreviewOperations={getDraftPreviewOperationsForTarget(target, draftPreviewState)}
          onBrowserDependenciesChange={onBrowserDependenciesChange}
          onClosePane={onClosePane}
          onTogglePaneExpand={onTogglePaneExpand}
          onAppendToChatInput={onAppendToChatInput}
          onPopOut={() => setPoppedOut(true)}
          isExpanded={editorExpanded}
        />
      </div>
    </>
  );

  const isOverlay = isMobile || poppedOut;
  if (isOverlay) {
    return (
      <PlaceholderOverlayFrame>
        <div className="flex h-full min-h-0 flex-col">
          {renderTabs()}
          <div className="min-h-0 flex-1">
            <RightPaneContentRouter
              target={target}
              projectPath={projectPath}
              browserRefreshVersion={browserRefreshVersion}
              codeFollowAlongState={codeFollowAlongState}
              draftPreviewOperations={getDraftPreviewOperationsForTarget(target, draftPreviewState)}
              onBrowserDependenciesChange={onBrowserDependenciesChange}
              onClosePane={() => {
                setPoppedOut(false);
                onClosePane();
              }}
              onTogglePaneExpand={onTogglePaneExpand}
              onAppendToChatInput={onAppendToChatInput}
              onPopOut={null}
              isExpanded={editorExpanded}
              isSidebar={false}
            />
          </div>
        </div>
      </PlaceholderOverlayFrame>
    );
  }

  const useFlexLayout = editorExpanded || Boolean(fillSpace && !hasManualWidth);
  const paneClassName = getEditorSidebarPaneClassName({
    useFlexLayout,
    minEditorWidth: MIN_RIGHT_PANE_WIDTH,
  });
  const containerClassName = getEditorContainerClassName({
    editorExpanded,
    useFlexLayout,
  });

  return (
    <div ref={containerRef} className={containerClassName}>
      {!editorExpanded && (
        <div
          ref={resizeHandleRef}
          onMouseDown={onResizeStart}
          className="group relative w-1 flex-shrink-0 cursor-col-resize bg-gray-200 transition-colors hover:bg-blue-500 dark:bg-gray-700 dark:hover:bg-blue-600"
          title="Drag to resize"
        >
          <div className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 bg-blue-500 opacity-0 transition-opacity group-hover:opacity-100 dark:bg-blue-600" />
        </div>
      )}

      <div
        className={paneClassName}
        data-right-pane-type={target.type}
        style={useFlexLayout ? undefined : { width: `${effectiveWidth}px`, minWidth: `${MIN_RIGHT_PANE_WIDTH}px` }}
      >
        <div className="relative flex h-full min-h-0 flex-col">
          {renderPaneBody()}
          {isResizing && (
            <div
              className="absolute inset-0 z-20 cursor-col-resize"
              data-right-pane-drag-shield="true"
            />
          )}
        </div>
      </div>
    </div>
  );
}
