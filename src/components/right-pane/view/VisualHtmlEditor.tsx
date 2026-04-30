import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType, SVGProps } from 'react';
import {
  Check,
  Code2,
  Eye,
  LayoutTemplate,
  Maximize2,
  Minimize2,
  Monitor,
  Redo2,
  RotateCcw,
  Save,
  Smartphone,
  Tablet,
  Undo2,
  X,
} from 'lucide-react';
import type grapesjs from 'grapesjs';
import { api } from '../../../utils/api';
import { broadcastFileSyncEvent, subscribeToFileSyncEvents } from '../../../utils/fileSyncEvents';
import { isHtmlEligibleForVisualEditing } from '../utils/htmlVisualEligibility';
import type { RightPaneVisualHtmlTarget } from '../types';
import { buildSavedHtml, createWorkspaceDocument } from './visual-html/htmlDocumentTransforms';
import { formatHtmlDocument } from './visual-html/formatHtmlDocument';
import GrapesLikeInspectorPane from './visual-html/grapes-like/GrapesLikeInspectorPane';
import { createGrapesLikeInspectorBridge } from './visual-html/grapes-like/createGrapesLikeInspectorBridge';
import SpacingOverlay from './visual-html/grapes-like/SpacingOverlay';
import HtmlSourceEditorSurface, { type HtmlSourceCursorPosition } from './visual-html/HtmlSourceEditorSurface';
import {
  buildSourceLocationDomPathFromElement,
  buildSourceLocationFingerprint,
  buildSourceLocationMap,
  findNearestSourceLocationEntry,
  type SourceLocationEntry,
  type SourceLocationMap,
} from './visual-html/sourceLocationMapping';
import { useHtmlDocumentController } from './visual-html/useHtmlDocumentController';
import VisualCanvasPane from './visual-html/VisualCanvasPane';

type VisualHtmlEditorProps = {
  target: RightPaneVisualHtmlTarget;
  onClosePane: () => void;
  onAppendToChatInput?: ((text: string) => void) | null;
};

const SAVE_SUCCESS_TIMEOUT_MS = 2000;
const AUTO_FLUSH_DELAY_MS = 500;

type ToolbarIcon = ComponentType<SVGProps<SVGSVGElement>>;

type ToolbarAction = {
  id: string;
  title: string;
  icon: ToolbarIcon;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  tone?: 'default' | 'primary' | 'success';
  dataAttribute?: Record<string, string>;
};

type CanvasDevice = 'desktop' | 'tablet' | 'mobile';
type PreviewRuntimeElementStyles = Record<string, string>;

function OutlineIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="5" y="5" width="14" height="14" rx="1.5" strokeDasharray="2.5 2.5" />
    </svg>
  );
}

function ToolbarIconButton({
  title,
  icon: Icon,
  onClick,
  disabled = false,
  active = false,
  tone = 'default',
  dataAttribute,
}: Omit<ToolbarAction, 'id'>) {
  const toneClassName = tone === 'success'
    ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/40'
    : tone === 'primary'
      ? 'bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/40'
      : active
        ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white';

  return (
    <button
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent transition-colors ${toneClassName} disabled:cursor-not-allowed disabled:opacity-40`}
      onClick={onClick}
      title={title}
      type="button"
      disabled={disabled}
      {...dataAttribute}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

const CANVAS_OUTLINE_STYLE_ID = 'ccui-visual-outline-override';
const COMPONENT_OUTLINE_COMMAND_ID = 'core:component-outline';
const CCUI_PREVIEW_RUNTIME_STYLE_ID = 'ccui-preview-runtime-style-override';

function ensureCanvasOutlineOverrideStyle(editor: ReturnType<typeof grapesjs.init>) {
  const body = editor.Canvas.getBody();
  const document = body?.ownerDocument;
  if (!document) {
    return;
  }

  if (document.getElementById(CANVAS_OUTLINE_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = CANVAS_OUTLINE_STYLE_ID;
  style.textContent = `
    html.ccui-hide-component-outlines .gjs-com-dashed,
    html.ccui-hide-component-outlines .gjs-com-dashed *,
    body.ccui-hide-component-outlines .gjs-com-dashed,
    body.ccui-hide-component-outlines .gjs-com-dashed *,
    .ccui-hide-component-outlines .gjs-com-dashed,
    .ccui-hide-component-outlines .gjs-com-dashed * {
      outline: none !important;
    }
  `;
  document.head.appendChild(style);
}

function applyCanvasOutlineVisibility(editor: ReturnType<typeof grapesjs.init>, visible: boolean) {
  const body = editor.Canvas.getBody();
  const docEl = body?.ownerDocument?.documentElement;
  const roots = [body, docEl].filter(Boolean) as HTMLElement[];
  const dashedClassName = `${editor.getConfig().stylePrefix}dashed`;

  ensureCanvasOutlineOverrideStyle(editor);

  roots.forEach((root) => {
    root.classList.toggle(dashedClassName, visible);
    root.classList.toggle('ccui-hide-component-outlines', !visible);
    root.querySelectorAll<HTMLElement>(`.${dashedClassName}`).forEach((element) => {
      element.classList.toggle(dashedClassName, visible);
    });
  });
}

function readCanvasComponentIdentity(component: any) {
  const attributes = component?.getAttributes?.() ?? {};
  const element = component?.getEl?.() ?? null;
  const tagName = String(component?.get?.('tagName') ?? component?.getName?.() ?? element?.tagName ?? '').toLowerCase().trim();

  return {
    componentId: String(
      component?.getId?.()
      ?? component?.get?.('id')
      ?? attributes['data-ccui-component-id']
      ?? attributes['data-gjs-id']
      ?? '',
    ).trim(),
    fingerprint: String(
      attributes['data-ccui-fingerprint']
      ?? (tagName ? buildSourceLocationFingerprint(tagName, attributes) : '')
      ?? '',
    ).trim(),
    domPath: String(
      attributes['data-ccui-dom-path']
      ?? buildSourceLocationDomPathFromElement(element)
      ?? '',
    ).trim(),
    tagName,
  };
}

function scoreCanvasComponentForSourceEntry(component: any, entry: SourceLocationEntry): number {
  const identity = readCanvasComponentIdentity(component);
  let score = 0;

  if (entry.componentId && identity.componentId === entry.componentId) {
    score += 8;
  }

  if (entry.domPath && identity.domPath === entry.domPath) {
    score += 4;
  }

  if (entry.fingerprint && identity.fingerprint === entry.fingerprint) {
    score += 2;
  }

  if (entry.tagName && identity.tagName === entry.tagName) {
    score += 1;
  }

  return score;
}

function findCanvasComponentForSourceEntry(
  editor: ReturnType<typeof grapesjs.init> | null,
  entry: SourceLocationEntry | null,
) {
  if (!editor || !entry) {
    return null;
  }

  if (!entry.componentId && !entry.domPath && !entry.fingerprint) {
    return null;
  }

  const wrapper = editor.DomComponents?.getWrapper?.() as any;
  if (!wrapper) {
    return null;
  }

  const queue = [wrapper];
  let bestComponent: any = null;
  let bestScore = 0;

  while (queue.length > 0) {
    const nextComponent = queue.shift();
    if (!nextComponent) {
      continue;
    }

    const nextScore = scoreCanvasComponentForSourceEntry(nextComponent, entry);
    if (nextScore > bestScore) {
      bestScore = nextScore;
      bestComponent = nextComponent;
    }

    const children = nextComponent.components?.();
    if (Array.isArray(children)) {
      queue.push(...children);
      continue;
    }

    if (typeof children?.forEach === 'function') {
      children.forEach((child: any) => {
        queue.push(child);
      });
    }
  }

  return bestScore >= 2 ? bestComponent : null;
}

function selectCanvasComponentForSourceEntry(
  editor: ReturnType<typeof grapesjs.init> | null,
  entry: SourceLocationEntry | null,
) {
  if (!editor || !entry) {
    return null;
  }

  const nextComponent = findCanvasComponentForSourceEntry(editor, entry);
  if (!nextComponent) {
    return null;
  }

  editor.select?.(nextComponent);
  (editor as { scrollTo?: (component: unknown) => void }).scrollTo?.(nextComponent);
  return nextComponent;
}

function collectPreviewRuntimeElementStyles(document: Document): PreviewRuntimeElementStyles {
  const elementStyles: PreviewRuntimeElementStyles = {};

  document.body.querySelectorAll<HTMLElement>('[id]').forEach((element) => {
    const styleText = element.getAttribute('style')?.trim();
    if (element.id && styleText) {
      elementStyles[element.id] = styleText;
    }
  });

  return elementStyles;
}

function escapeCssIdentifier(identifier: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(identifier);
  }

  return identifier.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character.charCodeAt(0).toString(16)} `);
}

function addImportantToStyleDeclaration(styleText: string): string {
  return styleText
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      if (/!important\s*$/i.test(declaration)) {
        return declaration;
      }

      return `${declaration} !important`;
    })
    .join('; ');
}

function buildPreviewRuntimeStyleOverride(elementStyles: PreviewRuntimeElementStyles): string {
  return Object.entries(elementStyles)
    .filter(([, styleText]) => styleText.trim())
    .map(([elementId, styleText]) => `#${escapeCssIdentifier(elementId)} { ${addImportantToStyleDeclaration(styleText)}; }`)
    .join('\n');
}

function findCanvasComponentByElementId(editor: ReturnType<typeof grapesjs.init>, elementId: string) {
  const wrapper = editor.DomComponents?.getWrapper?.() as any;
  const queue = wrapper ? [wrapper] : [];

  while (queue.length > 0) {
    const nextComponent = queue.shift();
    if (!nextComponent) {
      continue;
    }

    const attributes = nextComponent.getAttributes?.({ skipResolve: true }) ?? {};
    if (attributes.id === elementId) {
      return nextComponent;
    }

    const children = nextComponent.components?.();
    if (Array.isArray(children)) {
      queue.push(...children);
    } else if (typeof children?.forEach === 'function') {
      children.forEach((child: any) => {
        queue.push(child);
      });
    }
  }

  return null;
}

function applyPreviewRuntimeElementStylesToCanvas(
  editor: ReturnType<typeof grapesjs.init>,
  elementStyles: PreviewRuntimeElementStyles,
) {
  const canvasDocument = editor.Canvas.getDocument?.();
  if (canvasDocument) {
    let style = canvasDocument.getElementById(CCUI_PREVIEW_RUNTIME_STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = canvasDocument.createElement('style');
      style.id = CCUI_PREVIEW_RUNTIME_STYLE_ID;
      canvasDocument.head.appendChild(style);
    }
    style.textContent = buildPreviewRuntimeStyleOverride(elementStyles);
  }

  Object.entries(elementStyles).forEach(([elementId, styleText]) => {
    const component = findCanvasComponentByElementId(editor, elementId);
    const element = component?.getEl?.() as HTMLElement | null;
    const canvasElement = editor.Canvas.getDocument?.()?.getElementById(elementId);

    component?.addAttributes?.({ style: styleText }, { silent: true });
    canvasElement?.setAttribute('style', styleText);
    element?.setAttribute('style', styleText);
  });
}

function schedulePreviewRuntimeElementStyleRestore(
  editor: ReturnType<typeof grapesjs.init>,
  elementStyles: PreviewRuntimeElementStyles,
) {
  const delays = [0, 50, 150, 350, 700];
  delays.forEach((delay) => {
    window.setTimeout(() => {
      applyPreviewRuntimeElementStylesToCanvas(editor, elementStyles);
    }, delay);
  });
}

export default function VisualHtmlEditor({ target, onClosePane, onAppendToChatInput = null }: VisualHtmlEditorProps) {
  const controller = useHtmlDocumentController({
    filePath: target.filePath,
    projectName: target.projectName ?? null,
  });
  const controllerRef = useRef(controller);
  const [activeMode, setActiveMode] = useState<'design' | 'source'>('design');
  const [canvasDocument, setCanvasDocument] = useState(() =>
    createWorkspaceDocument('<!doctype html><html><head></head><body></body></html>'),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [eligibilityError, setEligibilityError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPreviewActive, setIsPreviewActive] = useState(false);
  const [isOutlineVisible, setIsOutlineVisible] = useState(true);
  const [canvasDevice, setCanvasDevice] = useState<CanvasDevice>('desktop');
  const [canvasEditor, setCanvasEditor] = useState<ReturnType<typeof grapesjs.init> | null>(null);
  const canvasEditorRef = useRef<ReturnType<typeof grapesjs.init> | null>(null);
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const pendingPreviewRuntimeStylesRef = useRef<PreviewRuntimeElementStyles | null>(null);
  const sourceLocationMapRef = useRef(buildSourceLocationMap('', 0));
  const pendingSourceCursorEntryRef = useRef<SourceLocationEntry | null>(null);
  const pendingDesignSyncFrameRef = useRef<number | null>(null);
  const pendingFileFlushTimeoutRef = useRef<number | null>(null);
  const loadRequestSequenceRef = useRef(0);
  const syncSourceIdRef = useRef(`visual-html-editor-${Math.random().toString(36).slice(2)}`);
  const saveSuccessTimeoutRef = useRef<number | null>(null);
  const targetProjectName = target.projectName ?? null;

  controllerRef.current = controller;
  const hasUnsavedChanges = controller.dirtySource || controller.dirtyDesign;
  const sourceLocationParseWarning = sourceLocationMapRef.current.parseErrors?.[0] ?? null;
  const persistedSourceLocationMap = useMemo(
    () => buildSourceLocationMap(controller.persistedText, 0),
    [controller.persistedText],
  );
  const grapesLikeBridge = useMemo(() => createGrapesLikeInspectorBridge(canvasEditor), [canvasEditor]);

  const collectCanvasHtml = useCallback(() => {
    if (!canvasEditorRef.current) {
      return controller.documentText;
    }

    return buildSavedHtml({
      snapshot: canvasDocument.snapshot,
      bodyHtml: canvasEditorRef.current.getHtml(),
      css: canvasEditorRef.current.getCss() ?? '',
    });
  }, [canvasDocument.snapshot, controller.documentText]);

  const applyPreviewRuntimeStateToDesign = useCallback(() => {
    const previewDocument = previewFrameRef.current?.contentDocument;
    if (!previewDocument?.body) {
      return;
    }

    const previewBodyHtml = previewDocument.body.innerHTML;
    pendingPreviewRuntimeStylesRef.current = collectPreviewRuntimeElementStyles(previewDocument);
    const nextHtml = buildSavedHtml({
      snapshot: canvasDocument.snapshot,
      bodyHtml: previewBodyHtml,
      css: canvasDocument.styles,
    });
    setCanvasDocument(createWorkspaceDocument(nextHtml));
  }, [canvasDocument.snapshot, canvasDocument.styles]);

  const clearPendingSourceCursorEntry = useCallback(() => {
    pendingSourceCursorEntryRef.current = null;
  }, []);

  const rebuildSourceLocationMap = useCallback((nextHtml: string, revision: number) => {
    const mapping = buildSourceLocationMap(nextHtml, revision);
    sourceLocationMapRef.current = mapping;
    controllerRef.current.setSourceLocationResult({
      revision,
      status: mapping.status,
      reason: mapping.status === 'unavailable' ? mapping.reason : null,
    });
    return mapping;
  }, []);

  const applyCurrentEditorDocument = useCallback((nextHtml: string, origin: 'design' | 'source' | 'ai') => {
    const revision = controllerRef.current.updateCurrentDocument(nextHtml, origin);
    rebuildSourceLocationMap(nextHtml, revision);
    return revision;
  }, [rebuildSourceLocationMap]);

  const cancelPendingDesignDocumentSync = useCallback(() => {
    if (pendingDesignSyncFrameRef.current === null) {
      return;
    }

    window.cancelAnimationFrame(pendingDesignSyncFrameRef.current);
    pendingDesignSyncFrameRef.current = null;
  }, []);

  const cancelPendingFileFlush = useCallback(() => {
    if (pendingFileFlushTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(pendingFileFlushTimeoutRef.current);
    pendingFileFlushTimeoutRef.current = null;
  }, []);

  const flushDesignDocumentSync = useCallback(() => {
    pendingDesignSyncFrameRef.current = null;
    if (!canvasEditorRef.current) {
      return;
    }

    const nextHtml = collectCanvasHtml();
    applyCurrentEditorDocument(nextHtml, 'design');
  }, [applyCurrentEditorDocument, collectCanvasHtml]);

  const requestDesignDocumentSync = useCallback(() => {
    if (pendingDesignSyncFrameRef.current !== null) {
      return;
    }

    pendingDesignSyncFrameRef.current = window.requestAnimationFrame(() => {
      flushDesignDocumentSync();
    });
  }, [flushDesignDocumentSync]);

  const ensureFreshSourceLocationMap = useCallback(() => {
    if (pendingDesignSyncFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingDesignSyncFrameRef.current);
      flushDesignDocumentSync();
      return sourceLocationMapRef.current;
    }

    if (!controllerRef.current.sourceLocationState.isStale) {
      return sourceLocationMapRef.current;
    }

    const nextHtml = activeMode === 'design' && canvasEditorRef.current
      ? collectCanvasHtml()
      : controllerRef.current.documentText;

    if (nextHtml !== controllerRef.current.documentText) {
      const revision = controllerRef.current.updateCurrentDocument(nextHtml, 'design');
      return rebuildSourceLocationMap(nextHtml, revision);
    }
    return rebuildSourceLocationMap(nextHtml, controllerRef.current.editorRevision);
  }, [activeMode, collectCanvasHtml, flushDesignDocumentSync, rebuildSourceLocationMap]);

  const flushDocumentToFile = useCallback(async ({
    reason,
    indicateSaving = false,
    indicateSuccess = false,
  }: {
    reason: 'manual-save' | 'auto-save' | 'send-to-ai';
    indicateSaving?: boolean;
    indicateSuccess?: boolean;
  }): Promise<{
    html: string;
    mapping: SourceLocationMap;
    version: string | null;
  }> => {
    cancelPendingFileFlush();

    if (!targetProjectName) {
      const message = '缺少项目标识，无法保存该 HTML 文件。';
      setSaveError(message);
      throw new Error(message);
    }

    if (controllerRef.current.syncConflictError) {
      const message = '文件已在磁盘上变化，请先重新加载后再保存。';
      setSaveError(message);
      throw new Error(message);
    }

    const hasDirtyDocument = controllerRef.current.dirtyDesign || controllerRef.current.dirtySource;
    if (!hasDirtyDocument) {
      if (indicateSuccess) {
        setSaveSuccess(true);
        if (saveSuccessTimeoutRef.current !== null) {
          window.clearTimeout(saveSuccessTimeoutRef.current);
        }
        saveSuccessTimeoutRef.current = window.setTimeout(() => {
          setSaveSuccess(false);
        }, SAVE_SUCCESS_TIMEOUT_MS);
      }
      return {
        html: controllerRef.current.persistedText || controllerRef.current.documentText,
        mapping: sourceLocationMapRef.current,
        version: controllerRef.current.version,
      };
    }

    if (indicateSaving) {
      setSaving(true);
    }
    setSaveError(null);

    let nextHtml = controllerRef.current.documentText;
    let flushedFromDesign = false;

    try {
      if (activeMode === 'design' && canvasEditorRef.current) {
        cancelPendingDesignDocumentSync();
        nextHtml = collectCanvasHtml();
        flushedFromDesign = true;
        applyCurrentEditorDocument(nextHtml, 'design');
        controllerRef.current.setDirtyDesign(false);
        controllerRef.current.setDirtySource(nextHtml !== controllerRef.current.persistedText);
      }

      const response = await api.saveFile(
        targetProjectName,
        target.filePath,
        nextHtml,
        controllerRef.current.version ?? undefined,
      );

      if (!response.ok) {
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          const errorData = await response.json();
          if (response.status === 409 && Object.prototype.hasOwnProperty.call(errorData, 'currentVersion')) {
            controllerRef.current.markSyncConflict('文件已在磁盘上变化，请先重新加载后再保存。');
            throw new Error('文件已在磁盘上变化，请重新加载后再保存。');
          }

          throw new Error(errorData.error || `Save failed: ${response.status}`);
        }

        throw new Error(`Save failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const revision = controllerRef.current.editorRevision + 1;
      clearPendingSourceCursorEntry();
      controllerRef.current.setPersistedDocument({ content: nextHtml, version: data.version ?? null });
      if (!flushedFromDesign || activeMode !== 'design') {
        setCanvasDocument(createWorkspaceDocument(nextHtml));
      }
      const mapping = rebuildSourceLocationMap(nextHtml, revision);
      canvasEditorRef.current?.clearDirtyCount();
      broadcastFileSyncEvent({
        projectName: targetProjectName,
        filePath: target.filePath,
        sourceId: syncSourceIdRef.current,
        version: data.version ?? null,
      });

      if (indicateSuccess) {
        setSaveSuccess(true);
        if (saveSuccessTimeoutRef.current !== null) {
          window.clearTimeout(saveSuccessTimeoutRef.current);
        }
        saveSuccessTimeoutRef.current = window.setTimeout(() => {
          setSaveSuccess(false);
        }, SAVE_SUCCESS_TIMEOUT_MS);
      }

      return {
        html: nextHtml,
        mapping,
        version: data.version ?? null,
      };
    } catch (error) {
      if (flushedFromDesign) {
        controllerRef.current.setDirtyDesign(true);
      }
      controllerRef.current.setDirtySource(nextHtml !== controllerRef.current.persistedText);
      setSaveError(getErrorMessage(error));
      throw error;
    } finally {
      if (indicateSaving) {
        setSaving(false);
      }
      if (reason === 'manual-save') {
        cancelPendingFileFlush();
      }
    }
  }, [
    activeMode,
    applyCurrentEditorDocument,
    cancelPendingDesignDocumentSync,
    cancelPendingFileFlush,
    clearPendingSourceCursorEntry,
    collectCanvasHtml,
    rebuildSourceLocationMap,
    target.filePath,
    targetProjectName,
  ]);

  const scheduleDocumentFlush = useCallback(() => {
    if (!targetProjectName || controllerRef.current.syncConflictError) {
      return;
    }

    cancelPendingFileFlush();
    pendingFileFlushTimeoutRef.current = window.setTimeout(() => {
      pendingFileFlushTimeoutRef.current = null;
      void flushDocumentToFile({
        reason: 'auto-save',
        indicateSaving: false,
        indicateSuccess: false,
      }).catch(() => {});
    }, AUTO_FLUSH_DELAY_MS);
  }, [cancelPendingFileFlush, flushDocumentToFile, targetProjectName]);

  const ensureLatestSourceContextForChat = useCallback(async () => {
    const result = await flushDocumentToFile({
      reason: 'send-to-ai',
      indicateSaving: false,
      indicateSuccess: false,
    });

    return {
      sourceText: result.html,
      sourceLocationMap: result.mapping,
      persistedSourceText: result.html,
      persistedSourceLocationMap: result.mapping,
      preferPersistedLocation: false,
    };
  }, [flushDocumentToFile]);

  const handleSourceCursorChange = useCallback((position: HtmlSourceCursorPosition) => {
    const mapping = ensureFreshSourceLocationMap();
    const nextEntry = findNearestSourceLocationEntry(mapping, position);

    if (mapping.status !== 'ready' || !nextEntry) {
      clearPendingSourceCursorEntry();
      return;
    }

    pendingSourceCursorEntryRef.current = nextEntry;
    if (!selectCanvasComponentForSourceEntry(canvasEditorRef.current, nextEntry)) {
      clearPendingSourceCursorEntry();
    }
  }, [clearPendingSourceCursorEntry, ensureFreshSourceLocationMap]);

  const handleSwitchToSource = useCallback(() => {
    if (controllerRef.current.dirtyDesign && canvasEditorRef.current) {
      cancelPendingDesignDocumentSync();
      const nextHtml = collectCanvasHtml();
      applyCurrentEditorDocument(nextHtml, 'design');
      controllerRef.current.setDirtyDesign(false);
      controllerRef.current.setDirtySource(false);
    }

    setActiveMode('source');
  }, [applyCurrentEditorDocument, cancelPendingDesignDocumentSync, collectCanvasHtml]);

  const handleSwitchToDesign = useCallback(() => {
    if (controllerRef.current.dirtySource) {
      setCanvasDocument(createWorkspaceDocument(controllerRef.current.documentText));
      controllerRef.current.setDirtyDesign(false);
      controllerRef.current.setDirtySource(false);
    }

    setActiveMode('design');
  }, []);

  const togglePreview = useCallback(() => {
    if (isPreviewActive) {
      applyPreviewRuntimeStateToDesign();
      setIsPreviewActive(false);
      return;
    }

    const editor = canvasEditorRef.current;
    if (!editor) {
      return;
    }

    cancelPendingDesignDocumentSync();
    const nextHtml = collectCanvasHtml();
    applyCurrentEditorDocument(nextHtml, 'design');
    setCanvasDocument(createWorkspaceDocument(nextHtml));
    editor.stopCommand('preview');
    editor.select?.();
    setIsPreviewActive(true);
  }, [
    applyCurrentEditorDocument,
    applyPreviewRuntimeStateToDesign,
    cancelPendingDesignDocumentSync,
    collectCanvasHtml,
    isPreviewActive,
  ]);

  const handleCanvasUndo = useCallback(() => {
    canvasEditorRef.current?.runCommand('core:undo');
  }, []);

  const handleCanvasRedo = useCallback(() => {
    canvasEditorRef.current?.runCommand('core:redo');
  }, []);

  const toggleCanvasFullscreen = useCallback(() => {
    setIsFullscreen((previous) => !previous);
  }, []);

  const toggleComponentOutline = useCallback(() => {
    const editor = canvasEditorRef.current;
    if (!editor) {
      return;
    }

    const isActive = editor.Commands.isActive(COMPONENT_OUTLINE_COMMAND_ID);
    setIsOutlineVisible((previous) => {
      const nextVisible = !previous;
      if (isActive) {
        editor.stopCommand(COMPONENT_OUTLINE_COMMAND_ID);
      } else {
        editor.runCommand(COMPONENT_OUTLINE_COMMAND_ID);
      }
      applyCanvasOutlineVisibility(editor, nextVisible);
      return nextVisible;
    });
  }, []);

  useEffect(() => {
    if (!canvasEditor) {
      return undefined;
    }

    const syncCanvasOutlineVisibility = () => {
      applyCanvasOutlineVisibility(canvasEditor, isOutlineVisible);
    };

    syncCanvasOutlineVisibility();
    canvasEditor.on?.('canvas:frame:load', syncCanvasOutlineVisibility);
    return () => {
      canvasEditor.off?.('canvas:frame:load', syncCanvasOutlineVisibility);
    };
  }, [canvasEditor, isOutlineVisible]);

  const handleCanvasDeviceChange = useCallback((device: CanvasDevice) => {
    setCanvasDevice(device);

    const editor = canvasEditorRef.current;
    if (!editor) {
      return;
    }

    const nextDevice = device === 'desktop'
      ? 'Desktop'
      : device === 'tablet'
        ? 'Tablet'
        : 'Mobile portrait';

    editor.setDevice(nextDevice);
  }, []);

  const loadFileContent = useCallback(async ({ markLoading = true }: { markLoading?: boolean } = {}) => {
    const requestId = loadRequestSequenceRef.current + 1;
    loadRequestSequenceRef.current = requestId;
    cancelPendingDesignDocumentSync();
    cancelPendingFileFlush();

    if (!targetProjectName) {
      setLoadError('缺少项目标识，无法加载可视化 HTML 编辑器。');
      setEligibilityError(null);
      if (markLoading && requestId === loadRequestSequenceRef.current) {
        setLoading(false);
      }
      return;
    }

    try {
      if (markLoading) {
        setLoading(true);
      }

      setLoadError(null);
      setSaveError(null);
      setEligibilityError(null);
      controllerRef.current.markSyncConflict('');

      const response = await api.readFile(targetProjectName, target.filePath);
      if (!response.ok) {
        throw new Error(`Failed to load file: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (requestId !== loadRequestSequenceRef.current) {
        return;
      }
      const fileContent = String(data.content ?? '');
      const revision = controllerRef.current.editorRevision + 1;
      clearPendingSourceCursorEntry();
      controllerRef.current.setPersistedDocument({ content: fileContent, version: data.version ?? null });
      setCanvasDocument(createWorkspaceDocument(fileContent));
      rebuildSourceLocationMap(fileContent, revision);

      if (!isHtmlEligibleForVisualEditing(fileContent)) {
        setEligibilityError('当前文件暂不支持可视化编辑，已切换到源码模式。');
        setActiveMode('source');
        return;
      }

      setActiveMode('design');
    } catch (error) {
      if (requestId !== loadRequestSequenceRef.current) {
        return;
      }
      const message = getErrorMessage(error);
      setLoadError(message);
    } finally {
      if (markLoading && requestId === loadRequestSequenceRef.current) {
        setLoading(false);
      }
    }
  }, [cancelPendingDesignDocumentSync, clearPendingSourceCursorEntry, rebuildSourceLocationMap, target.filePath, targetProjectName]);

  useEffect(() => {
    void loadFileContent();
    return () => {
      cancelPendingDesignDocumentSync();
      cancelPendingFileFlush();
      if (saveSuccessTimeoutRef.current !== null) {
        window.clearTimeout(saveSuccessTimeoutRef.current);
      }
    };
  }, [cancelPendingDesignDocumentSync, cancelPendingFileFlush, loadFileContent]);

  useEffect(() => {
    if (!isFullscreen) {
      return undefined;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsFullscreen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (!targetProjectName) {
      return undefined;
    }

    return subscribeToFileSyncEvents({
      projectName: targetProjectName,
      filePath: target.filePath,
      sourceId: syncSourceIdRef.current,
      onFileSync: () => {
        if (hasUnsavedChanges) {
          controllerRef.current.markSyncConflict('文件已在磁盘上变化，当前工作台还有未保存修改。请先重新加载，再决定如何继续。');
          return;
        }

        void loadFileContent({ markLoading: false });
      },
    });
  }, [hasUnsavedChanges, loadFileContent, target.filePath, targetProjectName]);

  useEffect(() => {
    if (activeMode !== 'design') {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      if (canvasEditorRef.current?.Canvas?.refresh) {
        canvasEditorRef.current.refresh({ tools: true });
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [activeMode, isFullscreen]);

  useEffect(() => {
    if (activeMode !== 'design' || !canvasEditor) {
      return;
    }

    if (!selectCanvasComponentForSourceEntry(canvasEditor, pendingSourceCursorEntryRef.current)) {
      clearPendingSourceCursorEntry();
    }
  }, [activeMode, canvasEditor, clearPendingSourceCursorEntry]);

  const handleSave = useCallback(async () => {
    try {
      await flushDocumentToFile({
        reason: 'manual-save',
        indicateSaving: true,
        indicateSuccess: true,
      });
    } catch {
      return;
    }
  }, [flushDocumentToFile]);

  const saveTitle = saveSuccess ? '已保存' : saving ? '保存中...' : '保存';
  const handleFormatSource = useCallback(() => {
    const currentSource = controllerRef.current.documentText;
    const formattedSource = formatHtmlDocument(currentSource);

    if (formattedSource === currentSource) {
      return;
    }

    applyCurrentEditorDocument(formattedSource, 'source');
    controllerRef.current.setDirtySource(formattedSource !== controllerRef.current.persistedText);
  }, [applyCurrentEditorDocument]);

  useEffect(() => {
    if (activeMode !== 'source') {
      return undefined;
    }

    const handleFormatShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey) {
        return;
      }

      if (event.key.toLowerCase() !== 'f') {
        return;
      }

      event.preventDefault();
      handleFormatSource();
    };

    document.addEventListener('keydown', handleFormatShortcut);
    return () => {
      document.removeEventListener('keydown', handleFormatShortcut);
    };
  }, [activeMode, handleFormatSource]);

  const designActions: ToolbarAction[] = [
    {
      id: 'preview',
      title: isPreviewActive ? '退出预览' : '预览画布',
      icon: Eye,
      onClick: togglePreview,
      active: isPreviewActive,
      disabled: Boolean(eligibilityError),
    },
    {
      id: 'outline',
      title: isOutlineVisible ? '隐藏组件轮廓' : '显示组件轮廓',
      icon: OutlineIcon,
      onClick: toggleComponentOutline,
      active: isOutlineVisible,
      disabled: Boolean(eligibilityError),
    },
    {
      id: 'undo',
      title: '撤销',
      icon: Undo2,
      onClick: handleCanvasUndo,
      disabled: Boolean(eligibilityError) || isPreviewActive,
    },
    {
      id: 'redo',
      title: '重做',
      icon: Redo2,
      onClick: handleCanvasRedo,
      disabled: Boolean(eligibilityError) || isPreviewActive,
    },
    {
      id: 'save',
      title: saveTitle,
      icon: saveSuccess ? Check : Save,
      onClick: () => {
        void handleSave();
      },
      disabled: saving || loading || Boolean(loadError) || isPreviewActive,
      tone: saveSuccess ? 'success' : 'primary',
    },
    {
      id: 'close',
      title: '关闭',
      icon: X,
      onClick: onClosePane,
      dataAttribute: { 'data-right-pane-close': 'true' },
    },
  ];

  const sourceActions: ToolbarAction[] = [
    {
      id: 'format',
      title: '格式化 HTML (Ctrl/Cmd+Shift+F)',
      icon: Code2,
      onClick: handleFormatSource,
      disabled: saving || loading || Boolean(loadError),
      dataAttribute: { 'data-visual-html-format': 'true' },
    },
    {
      id: 'reload',
      title: '重新加载',
      icon: RotateCcw,
      onClick: () => {
        void loadFileContent();
      },
      disabled: saving || loading,
    },
    {
      id: 'save',
      title: saveTitle,
      icon: saveSuccess ? Check : Save,
      onClick: () => {
        void handleSave();
      },
      disabled: saving || loading || Boolean(loadError),
      tone: saveSuccess ? 'success' : 'primary',
    },
    {
      id: 'close',
      title: '关闭',
      icon: X,
      onClick: onClosePane,
      dataAttribute: { 'data-right-pane-close': 'true' },
    },
  ];

  const modeActions = activeMode === 'design' ? designActions : sourceActions;
  const previewDocument = buildSavedHtml({
    snapshot: canvasDocument.snapshot,
    bodyHtml: canvasDocument.bodyHtml,
    css: canvasDocument.styles,
  });
  const previewViewportWidth = canvasDevice === 'desktop' ? '100%' : canvasDevice === 'tablet' ? '770px' : '320px';
  const showSpacingOverlay = !isPreviewActive && !eligibilityError && activeMode === 'design' && canvasEditor && grapesLikeBridge;
  const showInspectorPane = !isPreviewActive && grapesLikeBridge;

  return (
    <div
      className={isFullscreen
        ? 'fixed inset-0 z-[10010] flex min-h-0 flex-col bg-background'
        : 'flex h-full min-h-0 flex-col bg-background'}
      data-right-pane-view="visual-html"
      data-visual-html-editor="true"
      data-visual-html-workspace="true"
      data-right-pane-file-path={target.filePath}
    >
      {loadError ? (
        <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          加载失败：{loadError}
        </div>
      ) : null}

      {eligibilityError ? (
        <div className="m-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
          {eligibilityError}
        </div>
      ) : null}

      {saveError ? (
        <div className="mx-4 mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          保存失败：{saveError}
        </div>
      ) : null}

      {controller.sourceLocationState.status === 'unavailable' ? (
        <div className="mx-4 mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
          <span>源码位置映射当前不可用。</span>
          {controller.sourceLocationState.reason ? (
            <span className="ml-1">{controller.sourceLocationState.reason}</span>
          ) : null}
        </div>
      ) : null}

      {controller.sourceLocationState.status !== 'unavailable' && sourceLocationParseWarning ? (
        <div className="mx-4 mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
          <span>源码存在不完整或无效结构，位置映射可能不准确。</span>
          <span className="ml-1">{sourceLocationParseWarning}</span>
        </div>
      ) : null}

      {controller.syncConflictError ? (
        <div className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
          <span>{controller.syncConflictError}</span>
          <button
            className="rounded-md border border-current px-3 py-1 text-xs font-medium transition-opacity hover:opacity-80"
            onClick={() => {
              void loadFileContent();
            }}
            type="button"
          >
            重新加载
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-white shadow-sm">
          <div
            className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3 py-1.5"
            data-visual-html-toolbar="true"
          >
            <div className="flex min-w-0 items-center gap-2">
              <div
                className="flex items-center gap-1 rounded-md border border-border/70 bg-muted/40 p-0.5"
                data-visual-html-mode-switcher="true"
              >
                <button
                  className={`inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-sm font-medium transition-colors ${
                    activeMode === 'design'
                      ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                  }`}
                  onClick={handleSwitchToDesign}
                  type="button"
                >
                  <LayoutTemplate className="h-4 w-4" />
                  设计模式
                </button>
                <button
                  className={`inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-sm font-medium transition-colors ${
                    activeMode === 'source'
                      ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                  }`}
                  onClick={handleSwitchToSource}
                  type="button"
                  disabled={Boolean(eligibilityError)}
                >
                  <Code2 className="h-4 w-4" />
                  源码模式
                </button>
              </div>

              {controller.dirtyDesign || controller.dirtySource ? (
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  未保存修改
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-1.5">
              {!eligibilityError && activeMode === 'design' ? (
                <div
                  className="flex items-center gap-0.5 rounded-md border border-border/70 bg-muted/40 p-0.5"
                  data-visual-html-device-switcher="true"
                >
                  <button
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                      canvasDevice === 'desktop'
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                    }`}
                    onClick={() => {
                      handleCanvasDeviceChange('desktop');
                    }}
                    title="桌面"
                    type="button"
                  >
                    <Monitor className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                      canvasDevice === 'tablet'
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                    }`}
                    onClick={() => {
                      handleCanvasDeviceChange('tablet');
                    }}
                    title="平板"
                    type="button"
                  >
                    <Tablet className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                      canvasDevice === 'mobile'
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                    }`}
                    onClick={() => {
                      handleCanvasDeviceChange('mobile');
                    }}
                    title="手机"
                    type="button"
                  >
                    <Smartphone className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}

              <div className="flex items-center gap-1.5" data-visual-html-toolbar-actions="true">
                {modeActions.map((action) => (
                  <ToolbarIconButton key={action.id} {...action} />
                ))}
              </div>

              <div className="h-5 w-px bg-border" />

              <div className="flex items-center gap-1.5" data-visual-html-toolbar-common="true">
                <ToolbarIconButton
                  key="fullscreen"
                  title={isFullscreen ? '退出全屏' : '全屏'}
                  icon={isFullscreen ? Minimize2 : Maximize2}
                  onClick={toggleCanvasFullscreen}
                  active={isFullscreen}
                />
              </div>
            </div>
          </div>

          {!eligibilityError && activeMode === 'design' ? (
            <div className="flex min-h-0 flex-1" data-visual-html-design-workspace="true">
              <div className="min-h-0 flex-1">
                {isPreviewActive ? (
                  <div
                    className="flex h-full min-h-0 w-full items-start justify-center overflow-auto bg-[#f5f5f5]"
                    data-visual-html-preview="true"
                  >
                    <div
                      className="h-full min-h-0 max-w-full overflow-hidden bg-white"
                      style={{ width: previewViewportWidth }}
                    >
                      <iframe
                        ref={previewFrameRef}
                        title="HTML 预览"
                        srcDoc={previewDocument}
                        className="block h-full min-h-0 w-full border-0 bg-white"
                        data-visual-html-preview-frame="true"
                      />
                    </div>
                  </div>
                ) : (
                  <VisualCanvasPane
                    bodyHtml={canvasDocument.bodyHtml}
                    styles={canvasDocument.styles}
                    onDirtyChange={(isDirty, editor) => {
                      canvasEditorRef.current = editor;
                      if (isDirty) {
                        requestDesignDocumentSync();
                        scheduleDocumentFlush();
                      }
                      controller.setDirtyDesign(isDirty);
                    }}
                    onEditorReady={(editor) => {
                      canvasEditorRef.current = editor;
                      cancelPendingDesignDocumentSync();
                      setCanvasEditor(editor);
                      if (!editor) {
                        return;
                      }
                      setIsPreviewActive(false);
                      setIsOutlineVisible(false);
                      setCanvasDevice('desktop');
                      editor.setDevice('Desktop');
                      applyCanvasOutlineVisibility(editor, false);
                      const pendingPreviewRuntimeStyles = pendingPreviewRuntimeStylesRef.current;
                      if (pendingPreviewRuntimeStyles) {
                        schedulePreviewRuntimeElementStyleRestore(editor, pendingPreviewRuntimeStyles);
                        window.setTimeout(() => {
                          pendingPreviewRuntimeStylesRef.current = null;
                        }, 750);
                      }
                      editor.clearDirtyCount();
                      controller.setDirtyDesign(false);
                    }}
                  />
                )}
                {showSpacingOverlay ? (
                  <SpacingOverlay
                    editor={canvasEditor}
                    onUpdateStyle={grapesLikeBridge.actions.style.updateStyle}
                    showComponentOutlines={isOutlineVisible}
                    filePath={target.filePath}
                    sourceText={collectCanvasHtml()}
                    sourceLocationMap={sourceLocationMapRef.current}
                    ensureFreshSourceLocationMap={ensureFreshSourceLocationMap}
                    ensureLatestSourceContextForChat={ensureLatestSourceContextForChat}
                    persistedSourceText={controller.persistedText}
                    persistedSourceLocationMap={persistedSourceLocationMap}
                    preferPersistedLocation={controller.dirtyDesign && !controller.dirtySource}
                    onAppendToChatInput={onAppendToChatInput}
                  />
                ) : null}
              </div>
              {showInspectorPane ? (
                <GrapesLikeInspectorPane
                  adapter={grapesLikeBridge.adapter}
                  actions={grapesLikeBridge.actions}
                />
              ) : null}
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <HtmlSourceEditorSurface
                value={controller.documentText}
                onChange={(value) => {
                  applyCurrentEditorDocument(value, 'source');
                  controller.setDirtySource(value !== controller.persistedText);
                  scheduleDocumentFlush();
                }}
                onCursorChange={handleSourceCursorChange}
              />
              <div
                className="flex flex-shrink-0 items-center justify-between border-t border-border bg-muted px-3 py-1.5 text-xs text-muted-foreground"
                data-visual-html-shortcuts="true"
              >
                <span>Ctrl/Cmd+S 保存</span>
                <span>Esc 关闭</span>
                <span>Ctrl/Cmd+Shift+F 格式化 HTML</span>
              </div>
            </div>
          )}

          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/90 text-sm text-muted-foreground">
              正在加载 HTML 文件...
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
