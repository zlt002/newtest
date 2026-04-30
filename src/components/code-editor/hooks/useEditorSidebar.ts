import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { Project } from '../../../types/app';
import type { GitCommitSummary } from '../../git-panel/types/types';
import type { CodeEditorDiffInfo, FileDraftPreviewOperation } from '../types/types';
import { DEFAULT_EDITOR_WIDTH, readEditorSidebarPreference, writeEditorSidebarPreference } from '../utils/editorSidebarPersistence';
import type { RightPaneBrowserSource, RightPaneTab, RightPaneTarget } from '../../right-pane/types';
import { createClosedRightPaneState } from '../../right-pane/types';
import { createVisualHtmlTarget, resolveRightPaneTargetForFile } from '../../right-pane/utils/rightPaneRouting';
import { closeRightPaneTab, upsertRightPaneTab } from '../../right-pane/utils/rightPaneTabs';
import { subscribeToFileSyncEvents } from '../../../utils/fileSyncEvents';
import type { FileChangeLineRange } from '@hooks/chat/chatFileChangeEvents';
import type { DraftPreviewEvent } from '@hooks/chat/chatDraftPreviewEvents';
import { createUrlOpenState } from './editorSidebarUrlOpenState';

const VISUAL_HTML_OPEN_REQUEST_EVENT_NAME = 'ccui:visual-html-open-request';
const shouldLogPrdStreamingDebug = Boolean(import.meta.env?.DEV);

export type BrowserDependencySnapshot = {
  previewFilePath: string;
  previewUrl: string;
  dependencyPaths: string[];
};

export type CodeFollowAlongState = {
  filePath: string | null;
  lineRange: FileChangeLineRange | null;
  pulse: number;
};

export type DraftPreviewState = Record<string, FileDraftPreviewOperation[]>;

type OpenTargetOptions = {
  activate?: boolean;
  markAsFresh?: boolean;
};

type UseEditorSidebarOptions = {
  selectedProject: Project | null;
  isMobile: boolean;
  initialWidth?: number;
};

export const useEditorSidebar = ({
  selectedProject,
  isMobile,
  initialWidth = DEFAULT_EDITOR_WIDTH,
}: UseEditorSidebarOptions) => {
  const persistedPreferenceRef = useRef(readEditorSidebarPreference());
  const [tabs, setTabs] = useState<RightPaneTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [isRightPaneVisible, setIsRightPaneVisible] = useState(false);
  const [editorWidth, setEditorWidth] = useState(() =>
    persistedPreferenceRef.current.hasManualWidth ? persistedPreferenceRef.current.width : initialWidth,
  );
  const [editorExpanded, setEditorExpanded] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [hasManualWidth, setHasManualWidth] = useState(persistedPreferenceRef.current.hasManualWidth);
  const [browserRefreshVersion, setBrowserRefreshVersion] = useState(0);
  const [browserDependencySnapshot, setBrowserDependencySnapshot] = useState<BrowserDependencySnapshot | null>(null);
  const [codeFollowAlongState, setCodeFollowAlongState] = useState<CodeFollowAlongState>({
    filePath: null,
    lineRange: null,
    pulse: 0,
  });
  const [draftPreviewState, setDraftPreviewState] = useState<DraftPreviewState>({});
  const resizeHandleRef = useRef<HTMLDivElement | null>(null);
  const draftCleanupTimersRef = useRef<Map<string, number>>(new Map());
  const rightPaneTarget = tabs.find((tab) => tab.id === activeTabId)?.target ?? null;

  const openTarget = useCallback((target: RightPaneTarget, options: OpenTargetOptions = {}) => {
    if (shouldLogPrdStreamingDebug) {
      console.info('[PRD debug][useEditorSidebar] openTarget', {
        target,
        options,
        activeTabId,
      });
    }

    setTabs((previousTabs) => {
      const result = upsertRightPaneTab(previousTabs, target, {
        activate: options.activate,
        markAsFresh: options.markAsFresh,
        currentActiveTabId: activeTabId,
      });
      setActiveTabId(result.activeTabId);
      return result.tabs;
    });
    setIsRightPaneVisible(true);
  }, [activeTabId]);

  const handleFileOpen = useCallback(
    (
      filePath: string,
      diffInfo: CodeEditorDiffInfo | null = null,
      options: OpenTargetOptions = {},
    ) => {
      const nextTarget = resolveRightPaneTargetForFile(filePath, {
        projectName: selectedProject?.name,
        diffInfo,
      });

      if (shouldLogPrdStreamingDebug) {
        console.info('[PRD debug][useEditorSidebar] handleFileOpen', {
          filePath,
          diffInfo,
          options,
          resolvedTarget: nextTarget,
          projectName: selectedProject?.name,
        });
      }

      openTarget(nextTarget, options);
    },
    [openTarget, selectedProject?.name],
  );

  const handleCloseEditor = useCallback(() => {
    setTabs((previousTabs) => {
      if (!activeTabId) {
        return previousTabs;
      }

      const result = closeRightPaneTab(previousTabs, activeTabId, activeTabId);
      setActiveTabId(result.activeTabId);
      setIsRightPaneVisible(result.tabs.length > 0);
      if (result.tabs.length === 0) {
        const closedState = createClosedRightPaneState();
        setEditorExpanded(closedState.editorExpanded);
      }
      return result.tabs;
    });
  }, [activeTabId]);

  const handleUrlOpen = useCallback((url: string, source: RightPaneBrowserSource = 'external-link') => {
    const nextState = createUrlOpenState({
      url,
      source,
      editorExpanded,
    });

    openTarget(nextState.rightPaneTarget);
  }, [editorExpanded, openTarget]);

  const handleVisualHtmlOpen = useCallback((filePath: string, projectName?: string) => {
    openTarget(createVisualHtmlTarget({
      filePath,
      projectName: projectName ?? selectedProject?.name,
    }));
  }, [openTarget, selectedProject?.name]);

  const handleCommitPreviewOpen = useCallback(
    (commit: GitCommitSummary, diff: string) => {
      const nextTarget = {
        type: 'git-commit',
        commitHash: commit.hash,
        shortHash: commit.hash.slice(0, 7),
        message: commit.message,
        author: commit.author,
        date: commit.date,
        diff,
        projectName: selectedProject?.name,
      } as const;

      openTarget(nextTarget);
    },
    [openTarget, selectedProject?.name],
  );

  const handleToggleRightPaneVisibility = useCallback(() => {
    if (tabs.length === 0) {
      return false;
    }

    setIsRightPaneVisible((previous) => !previous);
    return true;
  }, [tabs.length]);

  const handleOpenExistingTab = useCallback((tabId: string) => {
    setTabs((previousTabs) => previousTabs.map((tab) => (
      tab.id === tabId ? { ...tab, isFresh: false } : tab
    )));
    setActiveTabId(tabId);
    setIsRightPaneVisible(true);
  }, []);

  const handleCloseTab = useCallback((tabId: string) => {
    setTabs((previousTabs) => {
      const result = closeRightPaneTab(previousTabs, activeTabId, tabId);
      setActiveTabId(result.activeTabId);
      setIsRightPaneVisible(result.tabs.length > 0);
      if (result.tabs.length === 0) {
        const closedState = createClosedRightPaneState();
        setEditorExpanded(closedState.editorExpanded);
      }
      return result.tabs;
    });
  }, [activeTabId]);

  const handleToggleEditorExpand = useCallback(() => {
    setEditorExpanded((previous) => !previous);
  }, []);

  const handleBrowserDependenciesChange = useCallback((nextSnapshot: BrowserDependencySnapshot) => {
    setBrowserDependencySnapshot(nextSnapshot);
  }, []);

  const requestBrowserRefresh = useCallback(() => {
    setBrowserRefreshVersion((previous) => previous + 1);
  }, []);

  const focusCurrentCodeFile = useCallback((filePath: string, lineRange: FileChangeLineRange | null = null) => {
    setCodeFollowAlongState((previous) => ({
      filePath,
      lineRange,
      pulse: previous.pulse + 1,
    }));
  }, []);

  const applyDraftPreviewEvent = useCallback((event: DraftPreviewEvent) => {
    const cleanupKey = `${event.filePath}:${event.toolId}`;

    setDraftPreviewState((previousState) => {
      const currentOperations = previousState[event.filePath] ?? [];

      if (event.type === 'file_change_preview_delta') {
        const nextOperations = [
          ...currentOperations.filter((operation) => operation.toolId !== event.toolId),
          event.operation,
        ];

        return {
          ...previousState,
          [event.filePath]: nextOperations,
        };
      }

      if (event.type === 'file_change_preview_committed') {
        const nextOperations = currentOperations.map((operation) => (
          operation.toolId === event.toolId
            ? { ...operation, status: 'committed' as const }
            : operation
        ));

        const existingTimer = draftCleanupTimersRef.current.get(cleanupKey);
        if (existingTimer) {
          window.clearTimeout(existingTimer);
        }

        const timeoutId = window.setTimeout(() => {
          setDraftPreviewState((latestState) => {
            const latestOperations = latestState[event.filePath] ?? [];
            const filteredOperations = latestOperations.filter((operation) => operation.toolId !== event.toolId);

            if (filteredOperations.length === 0) {
              const { [event.filePath]: _removed, ...rest } = latestState;
              return rest;
            }

            return {
              ...latestState,
              [event.filePath]: filteredOperations,
            };
          });
          draftCleanupTimersRef.current.delete(cleanupKey);
        }, 1500);

        draftCleanupTimersRef.current.set(cleanupKey, timeoutId);

        return {
          ...previousState,
          [event.filePath]: nextOperations,
        };
      }

      const existingTimer = draftCleanupTimersRef.current.get(cleanupKey);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
        draftCleanupTimersRef.current.delete(cleanupKey);
      }

      const filteredOperations = currentOperations.filter((operation) => operation.toolId !== event.toolId);

      if (filteredOperations.length === 0) {
        const { [event.filePath]: _removed, ...rest } = previousState;
        return rest;
      }

      return {
        ...previousState,
        [event.filePath]: filteredOperations,
      };
    });
  }, []);

  const handleResizeStart = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (isMobile) {
        return;
      }

      setIsResizing(true);
      event.preventDefault();
    },
    [isMobile],
  );

  useEffect(() => {
    if (!hasManualWidth) {
      return;
    }

    writeEditorSidebarPreference(editorWidth);
  }, [editorWidth, hasManualWidth]);

  useEffect(() => {
    const handleMouseMove = (event: globalThis.MouseEvent) => {
      if (!isResizing) {
        return;
      }

      // Get the main container (parent of EditorSidebar's parent) that contains both left content and editor
      const editorContainer = resizeHandleRef.current?.parentElement;
      const mainContainer = editorContainer?.parentElement;
      if (!mainContainer) {
        return;
      }

      const containerRect = mainContainer.getBoundingClientRect();
      // Calculate new editor width: distance from mouse to right edge of main container
      const newWidth = containerRect.right - event.clientX;

      const minWidth = 300;
      const maxWidth = containerRect.width * 0.8;

      if (newWidth >= minWidth && newWidth <= maxWidth) {
        if (!hasManualWidth) {
          setHasManualWidth(true);
        }
        setEditorWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [hasManualWidth, isResizing]);

  useEffect(() => {
    setBrowserDependencySnapshot(null);
  }, [rightPaneTarget]);

  useEffect(() => {
    return subscribeToFileSyncEvents({
      onFileSync: () => {
        if (rightPaneTarget?.type === 'browser') {
          setBrowserDependencySnapshot(null);
        }
      },
    });
  }, [rightPaneTarget]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleVisualHtmlOpenRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ filePath?: string; projectName?: string }>).detail;
      const filePath = detail?.filePath?.trim();

      if (!filePath) {
        return;
      }

      handleVisualHtmlOpen(filePath, detail?.projectName);
    };

    window.addEventListener(VISUAL_HTML_OPEN_REQUEST_EVENT_NAME, handleVisualHtmlOpenRequest as EventListener);

    return () => {
      window.removeEventListener(VISUAL_HTML_OPEN_REQUEST_EVENT_NAME, handleVisualHtmlOpenRequest as EventListener);
    };
  }, [handleVisualHtmlOpen]);

  useEffect(() => () => {
    for (const timeoutId of draftCleanupTimersRef.current.values()) {
      window.clearTimeout(timeoutId);
    }
    draftCleanupTimersRef.current.clear();
  }, []);

  return {
    tabs,
    activeTabId,
    rightPaneTarget,
    isRightPaneVisible,
    editorWidth,
    editorExpanded,
    isResizing,
    hasManualWidth,
    browserRefreshVersion,
    browserDependencySnapshot,
    codeFollowAlongState,
    draftPreviewState,
    resizeHandleRef,
    handleFileOpen,
    handleCommitPreviewOpen,
    handleUrlOpen,
    handleVisualHtmlOpen,
    handleCloseEditor,
    handleOpenExistingTab,
    handleCloseTab,
    handleToggleRightPaneVisibility,
    handleToggleEditorExpand,
    handleResizeStart,
    handleBrowserDependenciesChange,
    requestBrowserRefresh,
    focusCurrentCodeFile,
    applyDraftPreviewEvent,
  };
};
