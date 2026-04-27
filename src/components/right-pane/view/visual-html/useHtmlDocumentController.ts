import { useCallback, useRef, useState } from 'react';
import { createWorkspaceDocument } from './htmlDocumentTransforms.js';

export type HtmlDocumentChangeOrigin = 'load' | 'design' | 'source' | 'ai';
export type HtmlDocumentSourceLocationStatus = 'idle' | 'ready' | 'unavailable';

export type HtmlDocumentSourceLocationState = {
  isStale: boolean;
  revision: number;
  status: HtmlDocumentSourceLocationStatus;
  reason: string | null;
};

export type HtmlDocumentControllerState = {
  documentText: string;
  persistedText: string;
  version: string | null;
  dirtyDesign: boolean;
  dirtySource: boolean;
  syncConflictError: string | null;
  editorRevision: number;
  lastChangeOrigin: HtmlDocumentChangeOrigin;
  sourceLocationState: HtmlDocumentSourceLocationState;
};

export type HtmlDocumentPersistedDocument = {
  content: string;
  version: string | null;
};

export type HtmlDocumentSourceLocationResult = {
  revision: number;
  status: 'ready' | 'unavailable';
  reason?: string | null;
};

function createSourceLocationState(
  revision: number,
  isStale: boolean,
  status: HtmlDocumentSourceLocationStatus,
  reason: string | null,
): HtmlDocumentSourceLocationState {
  return {
    isStale,
    revision,
    status,
    reason,
  };
}

export function reserveNextHtmlDocumentRevision(revisionRef: { current: number }): number {
  const nextRevision = revisionRef.current + 1;
  revisionRef.current = nextRevision;
  return nextRevision;
}

export function createHtmlDocumentControllerState(): HtmlDocumentControllerState {
  return {
    documentText: '',
    persistedText: '',
    version: null,
    dirtyDesign: false,
    dirtySource: false,
    syncConflictError: null,
    editorRevision: 0,
    lastChangeOrigin: 'load',
    sourceLocationState: createSourceLocationState(0, false, 'idle', null),
  };
}

export function setPersistedDocumentState(
  state: HtmlDocumentControllerState,
  next: HtmlDocumentPersistedDocument,
  nextRevision = state.editorRevision + 1,
): HtmlDocumentControllerState {
  return {
    ...state,
    documentText: next.content,
    persistedText: next.content,
    version: next.version,
    dirtyDesign: false,
    dirtySource: false,
    syncConflictError: null,
    editorRevision: nextRevision,
    lastChangeOrigin: 'load',
    sourceLocationState: createSourceLocationState(nextRevision, false, 'idle', null),
  };
}

export function updateCurrentDocumentState(
  state: HtmlDocumentControllerState,
  nextContent: string,
  origin: Exclude<HtmlDocumentChangeOrigin, 'load'>,
): HtmlDocumentControllerState {
  const nextRevision = state.editorRevision + 1;

  return {
    ...state,
    documentText: nextContent,
    editorRevision: nextRevision,
    lastChangeOrigin: origin,
    sourceLocationState: createSourceLocationState(nextRevision, true, 'idle', null),
  };
}

export function setDocumentTextState(
  state: HtmlDocumentControllerState,
  nextContent: string,
  origin: Exclude<HtmlDocumentChangeOrigin, 'load'> = 'source',
): HtmlDocumentControllerState {
  return updateCurrentDocumentState(state, nextContent, origin);
}

export function applyDesignToSourceState(
  state: HtmlDocumentControllerState,
  nextHtml: string,
): HtmlDocumentControllerState {
  return {
    ...updateCurrentDocumentState(state, nextHtml, 'design'),
    dirtyDesign: false,
    dirtySource: false,
  };
}

export function applySourceToDesignState(
  state: HtmlDocumentControllerState,
  nextSource: string,
): HtmlDocumentControllerState {
  return {
    ...updateCurrentDocumentState(state, nextSource, 'source'),
    dirtyDesign: false,
    dirtySource: false,
  };
}

export function setSourceLocationResultState(
  state: HtmlDocumentControllerState,
  input: HtmlDocumentSourceLocationResult,
): HtmlDocumentControllerState {
  if (input.revision !== state.editorRevision) {
    return state;
  }

  return {
    ...state,
    sourceLocationState: createSourceLocationState(
      input.revision,
      false,
      input.status,
      input.reason ?? null,
    ),
  };
}

export function useHtmlDocumentController({
  filePath,
  projectName,
}: {
  filePath: string;
  projectName: string | null;
}) {
  const [state, setState] = useState<HtmlDocumentControllerState>(() => createHtmlDocumentControllerState());
  const editorRevisionRef = useRef(state.editorRevision);

  const applyDesignToSource = useCallback((nextHtml: string) => {
    reserveNextHtmlDocumentRevision(editorRevisionRef);
    setState((previous) => applyDesignToSourceState(previous, nextHtml));
  }, []);

  const applySourceToDesign = useCallback((nextSource: string) => {
    reserveNextHtmlDocumentRevision(editorRevisionRef);
    setState((previous) => applySourceToDesignState(previous, nextSource));
    return createWorkspaceDocument(nextSource);
  }, []);

  const setDocumentText = useCallback((nextDocumentText: string, origin: Exclude<HtmlDocumentChangeOrigin, 'load'> = 'source') => {
    reserveNextHtmlDocumentRevision(editorRevisionRef);
    setState((previous) => setDocumentTextState(previous, nextDocumentText, origin));
  }, []);

  const setDirtyDesign = useCallback((nextDirtyDesign: boolean) => {
    setState((previous) => ({
      ...previous,
      dirtyDesign: nextDirtyDesign,
    }));
  }, []);

  const setDirtySource = useCallback((nextDirtySource: boolean) => {
    setState((previous) => ({
      ...previous,
      dirtySource: nextDirtySource,
    }));
  }, []);

  const setPersistedDocument = useCallback((next: HtmlDocumentPersistedDocument) => {
    const nextRevision = reserveNextHtmlDocumentRevision(editorRevisionRef);
    setState((previous) => setPersistedDocumentState(previous, next, nextRevision));
  }, []);

  const updateCurrentDocument = useCallback(
    (nextContent: string, origin: Exclude<HtmlDocumentChangeOrigin, 'load'>) => {
      const nextRevision = reserveNextHtmlDocumentRevision(editorRevisionRef);

      setState((previous) => updateCurrentDocumentState(previous, nextContent, origin));

      return nextRevision;
    },
    [],
  );

  const setSourceLocationResult = useCallback((input: HtmlDocumentSourceLocationResult) => {
    setState((previous) => setSourceLocationResultState(previous, input));
  }, []);

  const markSyncConflict = useCallback((message: string) => {
    setState((previous) => ({
      ...previous,
      syncConflictError: message,
    }));
  }, []);

  void filePath;
  void projectName;

  return {
    documentText: state.documentText,
    persistedText: state.persistedText,
    version: state.version,
    dirtyDesign: state.dirtyDesign,
    dirtySource: state.dirtySource,
    syncConflictError: state.syncConflictError,
    editorRevision: state.editorRevision,
    lastChangeOrigin: state.lastChangeOrigin,
    sourceLocationState: state.sourceLocationState,
    setDocumentText,
    setDirtyDesign,
    setDirtySource,
    updateCurrentDocument,
    setSourceLocationResult,
    applyDesignToSource,
    applySourceToDesign,
    setPersistedDocument,
    markSyncConflict,
  };
}
