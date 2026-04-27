import type { AppTab } from '../../../types/app';

type BalancedLayoutArgs = {
  activeTab: AppTab;
  editorExpanded: boolean;
  hasManualWidth: boolean;
};

type PaneClassArgs = {
  useFlexLayout: boolean;
  minEditorWidth: number;
};

type MainContentPaneClassArgs = {
  editorExpanded: boolean;
  useBalancedLayout: boolean;
};

type EditorContainerClassArgs = {
  editorExpanded: boolean;
  useFlexLayout: boolean;
};

export function shouldUseBalancedEditorLayout({
  activeTab,
  editorExpanded,
  hasManualWidth,
}: BalancedLayoutArgs): boolean {
  if (editorExpanded) {
    return true;
  }

  if (hasManualWidth) {
    return false;
  }

  return activeTab === 'chat';
}

export function getEditorSidebarPaneClassName({
  useFlexLayout,
  minEditorWidth,
}: PaneClassArgs): string {
  const baseClassName = 'h-full overflow-hidden border-l border-gray-200 dark:border-gray-700';

  if (useFlexLayout) {
    return `${baseClassName} min-w-0 flex-1`;
  }

  return `${baseClassName} min-w-[${minEditorWidth}px] flex-shrink-0`;
}

export function getMainContentPaneClassName({
  editorExpanded,
  useBalancedLayout,
}: MainContentPaneClassArgs): string {
  const classNames = ['flex', 'min-h-0', 'min-w-[200px]', 'flex-col', 'overflow-hidden'];

  if (editorExpanded) {
    classNames.push('hidden');
  } else {
    classNames.push('flex-1');
  }

  if (useBalancedLayout) {
    classNames.push('basis-0');
  }

  return classNames.join(' ');
}

export function getEditorContainerClassName({
  editorExpanded,
  useFlexLayout,
}: EditorContainerClassArgs): string {
  const classNames = ['flex', 'h-full', 'min-w-0'];

  if (useFlexLayout || editorExpanded) {
    classNames.push('basis-0', 'flex-1');
  } else {
    classNames.push('flex-shrink-0');
  }

  return classNames.join(' ');
}
