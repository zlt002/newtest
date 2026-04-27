type DesktopSidebarLayoutArgs = {
  isMobile: boolean;
  isRightPaneVisible: boolean;
  isPeekOpen: boolean;
  isSidebarVisible: boolean;
};

export type DesktopSidebarPresentation = {
  shouldAutoCollapse: boolean;
  dockWidthClassName: string;
  shouldRenderOverlay: boolean;
};

export function getDesktopSidebarPresentation({
  isMobile,
  isRightPaneVisible,
  isPeekOpen,
  isSidebarVisible,
}: DesktopSidebarLayoutArgs): DesktopSidebarPresentation {
  const shouldAutoCollapse = !isMobile && isRightPaneVisible;
  const shouldShowRailWidth = !isMobile && (!isSidebarVisible || shouldAutoCollapse);

  if (!shouldShowRailWidth) {
    return {
      shouldAutoCollapse: false,
      dockWidthClassName: 'w-72',
      shouldRenderOverlay: false,
    };
  }

  return {
    shouldAutoCollapse,
    dockWidthClassName: 'w-12',
    shouldRenderOverlay: shouldAutoCollapse && isPeekOpen,
  };
}
