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
import { resolveHtmlPreviewTarget } from '../utils/htmlPreviewTarget';
import { isHtmlEligibleForVisualEditing } from '../utils/htmlVisualEligibility';
import type { RightPaneVisualHtmlTarget } from '../types';
import { buildSavedHtml, buildSavedHtmlPreservingHead, createWorkspaceDocument } from './visual-html/htmlDocumentTransforms';
import { formatHtmlDocument } from './visual-html/formatHtmlDocument';
import GrapesLikeInspectorPane from './visual-html/grapes-like/GrapesLikeInspectorPane';
import { createGrapesLikeInspectorBridge } from './visual-html/grapes-like/createGrapesLikeInspectorBridge';
import SpacingOverlay from './visual-html/grapes-like/SpacingOverlay';
import HtmlSourceEditorSurface, { type HtmlSourceCursorPosition } from './visual-html/HtmlSourceEditorSurface';
import { resolveCanvasDocument } from './visual-html/canvasHeadMarkup';
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
const DESIGN_SYNC_DEBOUNCE_MS = 1000;
const AUTO_FLUSH_DELAY_MS = 2000;
const EMPTY_HTML_DOCUMENT = '<!doctype html><html><head></head><body></body></html>';

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
type PreviewMode = 'srcdoc' | 'route';
type HiddenLayerReason = 'display-none' | 'visibility-hidden' | 'opacity-zero' | 'zero-size' | 'offscreen' | 'ancestor-hidden';
type HiddenLayerFilter = {
  reasons: HiddenLayerReason[];
  includeInternal: boolean;
  includeDescendants: boolean;
  textQuery: string;
};

const ALL_HIDDEN_LAYER_REASONS: HiddenLayerReason[] = [
  'display-none',
  'visibility-hidden',
  'opacity-zero',
  'zero-size',
  'offscreen',
  'ancestor-hidden',
];

const HIDDEN_LAYER_REASON_LABELS: Record<HiddenLayerReason, string> = {
  'display-none': 'display:none',
  'visibility-hidden': 'visibility:hidden',
  'opacity-zero': 'opacity:0',
  'zero-size': '零尺寸',
  'offscreen': '屏幕外',
  'ancestor-hidden': '祖先隐藏',
};

function stripStyleMarkupFromHtml(markup: string): string {
  return markup.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').trim();
}

function extractLastBodyInnerHtml(markup: string): string {
  let bodyHtml = markup.trim();

  for (let depth = 0; depth < 5; depth += 1) {
    const bodyMatch = bodyHtml.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
    if (!bodyMatch?.[1]) {
      break;
    }

    bodyHtml = bodyMatch[1].trim();
  }

  return bodyHtml;
}

function decodeTemporaryHiddenLayerStyle(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function resolveCanvasAssetBaseUrl(previewRouteUrl: string | null): string | null {
  const normalizedUrl = previewRouteUrl?.trim();
  if (!normalizedUrl) {
    return null;
  }

  try {
    const url = new URL(normalizedUrl);
    const pathname = url.pathname;
    const lastSlashIndex = pathname.lastIndexOf('/');
    url.pathname = lastSlashIndex >= 0 ? pathname.slice(0, lastSlashIndex + 1) : '/';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function stripCanvasRuntimeArtifacts(markup: string): string {
  if (typeof DOMParser === 'undefined') {
    return stripStyleMarkupFromHtml(markup)
      .replace(/<plasmo-csui\b[^>]*>[\s\S]*?<\/plasmo-csui>/gi, '')
      .replace(/<plasmo-csui\b[^>]*\/?>/gi, '')
      .replace(/<(script|meta|link|base|title)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<(script|meta|link|base|title)\b[^>]*\/?>/gi, '')
      .trim();
  }

  const parsed = new DOMParser().parseFromString(`<body>${markup}</body>`, 'text/html');
  parsed.body
    .querySelectorAll('plasmo-csui, script, style, meta, link, base, title, [data-ccui-raw-canvas-style], [data-ccui-canvas-head-node], [data-ccui-hidden-layer-edit-style]')
    .forEach((node) => {
      node.remove();
    });
  parsed.body.querySelectorAll('[data-ccui-hidden-layer-preview]').forEach((node) => {
    node.removeAttribute('data-ccui-hidden-layer-preview');
  });
  parsed.body.querySelectorAll<HTMLElement>('[data-ccui-hidden-layer-original-style]').forEach((node) => {
    const originalStyle = decodeTemporaryHiddenLayerStyle(node.getAttribute('data-ccui-hidden-layer-original-style') ?? '');
    node.removeAttribute('data-ccui-hidden-layer-original-style');
    if (originalStyle.trim()) {
      node.setAttribute('style', originalStyle);
    } else {
      node.removeAttribute('style');
    }
  });

  return parsed.body.innerHTML.trim();
}

function extractCanvasBodyHtmlForSave(markup: string): string {
  return stripCanvasRuntimeArtifacts(extractLastBodyInnerHtml(markup));
}

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

function isVisualHtmlPerfDebugEnabled() {
  return (globalThis as typeof globalThis & { CCUI_DEBUG_VISUAL_CANVAS_PERF?: boolean }).CCUI_DEBUG_VISUAL_CANVAS_PERF === true;
}

function getVisualHtmlPerfNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }

  return Date.now();
}

function logVisualHtmlPerf(stage: string, payload: Record<string, unknown> = {}) {
  if (!isVisualHtmlPerfDebugEnabled()) {
    return;
  }

  console.info('[VisualHtmlPerf]', {
    stage,
    at: new Date().toISOString(),
    ...payload,
  });
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
  const canvasDocument = resolveCanvasDocument(editor);
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
    const canvasElement = resolveCanvasDocument(editor)?.getElementById(elementId);

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
    createWorkspaceDocument(EMPTY_HTML_DOCUMENT),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [eligibilityError, setEligibilityError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPreviewActive, setIsPreviewActive] = useState(false);
  const [previewRouteUrl, setPreviewRouteUrl] = useState<string | null>(null);
  const [previewRouteVersion, setPreviewRouteVersion] = useState(0);
  const [isOutlineVisible, setIsOutlineVisible] = useState(true);
  const [isHiddenLayerEditing, setIsHiddenLayerEditing] = useState(false);
  const [hiddenLayerFilter, setHiddenLayerFilter] = useState<HiddenLayerFilter>({
    reasons: ALL_HIDDEN_LAYER_REASONS,
    includeInternal: false,
    includeDescendants: true,
    textQuery: '',
  });
  const [canvasDevice, setCanvasDevice] = useState<CanvasDevice>('desktop');
  const [canvasEditor, setCanvasEditor] = useState<ReturnType<typeof grapesjs.init> | null>(null);
  const canvasEditorRef = useRef<ReturnType<typeof grapesjs.init> | null>(null);
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const pendingPreviewRuntimeStylesRef = useRef<PreviewRuntimeElementStyles | null>(null);
  const sourceLocationMapRef = useRef(buildSourceLocationMap('', 0));
  const persistedSourceLocationMapRef = useRef(buildSourceLocationMap('', 0));
  const pendingSourceCursorEntryRef = useRef<SourceLocationEntry | null>(null);
  const pendingDesignSyncTimeoutRef = useRef<number | null>(null);
  const pendingFileFlushTimeoutRef = useRef<number | null>(null);
  const previewModeRef = useRef<PreviewMode>('route');
  const loadRequestSequenceRef = useRef(0);
  const canvasDocumentSourceRef = useRef(EMPTY_HTML_DOCUMENT);
  const syncSourceIdRef = useRef(`visual-html-editor-${Math.random().toString(36).slice(2)}`);
  const saveSuccessTimeoutRef = useRef<number | null>(null);
  const targetProjectName = target.projectName ?? null;

  controllerRef.current = controller;
  const hasUnsavedChanges = controller.dirtySource || controller.dirtyDesign;
  const sourceLocationParseWarning = sourceLocationMapRef.current.parseErrors?.[0] ?? null;
  const persistedSourceLocationMap = persistedSourceLocationMapRef.current;
  const grapesLikeBridge = useMemo(() => createGrapesLikeInspectorBridge(canvasEditor), [canvasEditor]);
  const canvasAssetBaseUrl = useMemo(() => resolveCanvasAssetBaseUrl(previewRouteUrl), [previewRouteUrl]);

  useEffect(() => {
    logVisualHtmlPerf('design-canvas-context', {
      activeMode,
      isPreviewActive,
      previewRouteUrlLength: previewRouteUrl?.length ?? 0,
      assetBaseUrlLength: canvasAssetBaseUrl?.length ?? 0,
      hasPreviewRouteUrl: Boolean(previewRouteUrl),
      hasCanvasAssetBaseUrl: Boolean(canvasAssetBaseUrl),
      targetFilePath: target.filePath,
    });
  }, [activeMode, canvasAssetBaseUrl, isPreviewActive, previewRouteUrl, target.filePath]);

  const syncCanvasDocumentFromHtml = useCallback((nextHtml: string) => {
    if (canvasDocumentSourceRef.current === nextHtml) {
      return;
    }

    const startedAt = getVisualHtmlPerfNow();
    const nextCanvasDocument = createWorkspaceDocument(nextHtml);
    canvasDocumentSourceRef.current = nextHtml;
    logVisualHtmlPerf('create-workspace-document', {
      durationMs: Math.round(getVisualHtmlPerfNow() - startedAt),
      htmlLength: nextHtml.length,
      bodyHtmlLength: nextCanvasDocument.bodyHtml.length,
      stylesLength: nextCanvasDocument.styles.length,
    });
    setCanvasDocument(nextCanvasDocument);
  }, []);

  const collectCanvasHtml = useCallback(() => {
    if (!canvasEditorRef.current) {
      return controller.documentText;
    }

    return buildSavedHtmlPreservingHead({
      sourceHtml: controllerRef.current.documentText,
      bodyHtml: extractCanvasBodyHtmlForSave(canvasEditorRef.current.getHtml()),
      canvasCss: canvasEditorRef.current.getCss(),
    });
  }, [controller.documentText]);

  const applyPreviewRuntimeStateToDesign = useCallback(() => {
    if (previewModeRef.current !== 'srcdoc') {
      return;
    }

    const previewDocument = previewFrameRef.current?.contentDocument;
    if (!previewDocument?.body) {
      return;
    }

    const previewBodyHtml = previewDocument.body.innerHTML;
    pendingPreviewRuntimeStylesRef.current = collectPreviewRuntimeElementStyles(previewDocument);
    const nextHtml = buildSavedHtmlPreservingHead({
      sourceHtml: controllerRef.current.documentText,
      bodyHtml: previewBodyHtml,
    });
    syncCanvasDocumentFromHtml(nextHtml);
  }, [syncCanvasDocumentFromHtml]);

  const clearPendingSourceCursorEntry = useCallback(() => {
    pendingSourceCursorEntryRef.current = null;
  }, []);

  const rebuildSourceLocationMap = useCallback((nextHtml: string, revision: number) => {
    const startedAt = getVisualHtmlPerfNow();
    const mapping = buildSourceLocationMap(nextHtml, revision);
    logVisualHtmlPerf('source-location-map', {
      durationMs: Math.round(getVisualHtmlPerfNow() - startedAt),
      htmlLength: nextHtml.length,
      revision,
      status: mapping.status,
      entries: mapping.entries.length,
    });
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
    if (pendingDesignSyncTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(pendingDesignSyncTimeoutRef.current);
    pendingDesignSyncTimeoutRef.current = null;
  }, []);

  const cancelPendingFileFlush = useCallback(() => {
    if (pendingFileFlushTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(pendingFileFlushTimeoutRef.current);
    pendingFileFlushTimeoutRef.current = null;
  }, []);

  const flushDesignDocumentSync = useCallback(() => {
    pendingDesignSyncTimeoutRef.current = null;
    if (!canvasEditorRef.current) {
      return;
    }

    const nextHtml = collectCanvasHtml();
    applyCurrentEditorDocument(nextHtml, 'design');
  }, [applyCurrentEditorDocument, collectCanvasHtml]);

  const requestDesignDocumentSync = useCallback(() => {
    if (pendingDesignSyncTimeoutRef.current !== null) {
      window.clearTimeout(pendingDesignSyncTimeoutRef.current);
    }

    pendingDesignSyncTimeoutRef.current = window.setTimeout(() => {
      flushDesignDocumentSync();
    }, DESIGN_SYNC_DEBOUNCE_MS);
  }, [flushDesignDocumentSync]);

  const ensureFreshSourceLocationMap = useCallback(() => {
    if (pendingDesignSyncTimeoutRef.current !== null) {
      window.clearTimeout(pendingDesignSyncTimeoutRef.current);
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

    const canFlushDesignDocument = activeMode === 'design' && Boolean(canvasEditorRef.current);
    const hasDirtyDocument = controllerRef.current.dirtyDesign || controllerRef.current.dirtySource;
    if (!hasDirtyDocument) {
      let discoveredDesignChange = false;
      if (canFlushDesignDocument) {
        cancelPendingDesignDocumentSync();
        const nextHtml = collectCanvasHtml();
        if (nextHtml !== (controllerRef.current.persistedText || controllerRef.current.documentText)) {
          applyCurrentEditorDocument(nextHtml, 'design');
          controllerRef.current.setDirtyDesign(false);
          controllerRef.current.setDirtySource(true);
          discoveredDesignChange = true;
        }
      }

      if (!discoveredDesignChange && indicateSuccess) {
        setSaveSuccess(true);
        if (saveSuccessTimeoutRef.current !== null) {
          window.clearTimeout(saveSuccessTimeoutRef.current);
        }
        saveSuccessTimeoutRef.current = window.setTimeout(() => {
          setSaveSuccess(false);
        }, SAVE_SUCCESS_TIMEOUT_MS);
      }

      if (!discoveredDesignChange) {
        return {
          html: controllerRef.current.persistedText || controllerRef.current.documentText,
          mapping: sourceLocationMapRef.current,
          version: controllerRef.current.version,
        };
      }
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
        syncCanvasDocumentFromHtml(nextHtml);
      }
      const mapping = rebuildSourceLocationMap(nextHtml, revision);
      persistedSourceLocationMapRef.current = mapping;
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
    const sourceText = controllerRef.current.documentText;
    const mapping = sourceLocationMapRef.current;

    return {
      sourceText,
      sourceLocationMap: mapping,
      persistedSourceText: controllerRef.current.persistedText,
      persistedSourceLocationMap: persistedSourceLocationMap,
      preferPersistedLocation: false,
    };
  }, [persistedSourceLocationMap]);

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
      syncCanvasDocumentFromHtml(nextHtml);
      controllerRef.current.setDirtyDesign(false);
      controllerRef.current.setDirtySource(false);
    } else {
      syncCanvasDocumentFromHtml(controllerRef.current.documentText);
    }

    setActiveMode('source');
  }, [applyCurrentEditorDocument, cancelPendingDesignDocumentSync, collectCanvasHtml, syncCanvasDocumentFromHtml]);

  const handleSwitchToDesign = useCallback(() => {
    if (controllerRef.current.dirtySource) {
      syncCanvasDocumentFromHtml(controllerRef.current.documentText);
      controllerRef.current.setDirtyDesign(false);
      controllerRef.current.setDirtySource(false);
    }

    setActiveMode('design');
  }, [syncCanvasDocumentFromHtml]);

  const togglePreview = useCallback(() => {
    if (isPreviewActive) {
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
    syncCanvasDocumentFromHtml(nextHtml);
    editor.stopCommand('preview');
    previewModeRef.current = previewRouteUrl ? 'route' : 'srcdoc';
    setPreviewRouteVersion((value) => value + 1);
    setIsPreviewActive(true);
  }, [
    applyCurrentEditorDocument,
    cancelPendingDesignDocumentSync,
    collectCanvasHtml,
    isPreviewActive,
    previewRouteUrl,
    syncCanvasDocumentFromHtml,
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

  const toggleHiddenLayerEditing = useCallback(() => {
    setIsHiddenLayerEditing((value) => !value);
  }, []);

  const toggleHiddenLayerReason = useCallback((reason: HiddenLayerReason) => {
    setHiddenLayerFilter((current) => {
      const hasReason = current.reasons.includes(reason);
      const nextReasons = hasReason
        ? current.reasons.filter((item) => item !== reason)
        : [...current.reasons, reason];

      return {
        ...current,
        reasons: nextReasons.length > 0 ? nextReasons : [reason],
      };
    });
  }, []);

  const toggleHiddenLayerFilterFlag = useCallback((flag: 'includeInternal' | 'includeDescendants') => {
    setHiddenLayerFilter((current) => ({
      ...current,
      [flag]: !current[flag],
    }));
  }, []);

  const updateHiddenLayerTextQuery = useCallback((textQuery: string) => {
    setHiddenLayerFilter((current) => ({
      ...current,
      textQuery,
    }));
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
    const loadStartedAt = getVisualHtmlPerfNow();
    const requestId = loadRequestSequenceRef.current + 1;
    loadRequestSequenceRef.current = requestId;
    logVisualHtmlPerf('load-start', {
      requestId,
      filePath: target.filePath,
      markLoading,
    });
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

      const readStartedAt = getVisualHtmlPerfNow();
      const response = await api.readFile(targetProjectName, target.filePath);
      if (!response.ok) {
        throw new Error(`Failed to load file: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      logVisualHtmlPerf('read-file', {
        requestId,
        durationMs: Math.round(getVisualHtmlPerfNow() - readStartedAt),
        ok: response.ok,
        status: response.status,
        contentLength: String(data.content ?? '').length,
      });
      if (requestId !== loadRequestSequenceRef.current) {
        return;
      }
      const fileContent = String(data.content ?? '');
      const revision = controllerRef.current.editorRevision + 1;
      clearPendingSourceCursorEntry();
      controllerRef.current.setPersistedDocument({ content: fileContent, version: data.version ?? null });
      syncCanvasDocumentFromHtml(fileContent);
      const mapping = rebuildSourceLocationMap(fileContent, revision);
      persistedSourceLocationMapRef.current = mapping;

      if (!isHtmlEligibleForVisualEditing(fileContent)) {
        setEligibilityError('当前文件暂不支持可视化编辑，已切换到源码模式。');
        setActiveMode('source');
        return;
      }

      setActiveMode('design');
      logVisualHtmlPerf('load-complete', {
        requestId,
        durationMs: Math.round(getVisualHtmlPerfNow() - loadStartedAt),
        htmlLength: fileContent.length,
        mappingStatus: mapping.status,
        mappingEntries: mapping.entries.length,
      });
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
  }, [
    cancelPendingDesignDocumentSync,
    clearPendingSourceCursorEntry,
    rebuildSourceLocationMap,
    syncCanvasDocumentFromHtml,
    target.filePath,
    targetProjectName,
  ]);

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
    if (!targetProjectName) {
      setPreviewRouteUrl(null);
      return undefined;
    }

    let cancelled = false;
    const resolvePreviewRoute = async () => {
      try {
        const response = await api.projects();
        if (!response.ok) {
          throw new Error(`Failed to load projects: ${response.status} ${response.statusText}`);
        }

        const projects = await response.json() as Array<{ name: string; fullPath?: string; path?: string }>;
        if (cancelled) {
          return;
        }

        const currentProject = projects.find((project) => project.name === targetProjectName);
        const nextPreviewUrl = resolveHtmlPreviewTarget(target.filePath, {
          projectRoot: currentProject?.fullPath ?? currentProject?.path ?? null,
          projectName: targetProjectName,
        });
        logVisualHtmlPerf('preview-route-resolved', {
          targetFilePath: target.filePath,
          targetProjectName,
          projectRoot: currentProject?.fullPath ?? currentProject?.path ?? null,
          hasPreviewRouteUrl: Boolean(nextPreviewUrl),
          previewRouteUrlLength: nextPreviewUrl?.length ?? 0,
        });
        setPreviewRouteUrl(nextPreviewUrl);
      } catch {
        if (!cancelled) {
          logVisualHtmlPerf('preview-route-resolved', {
            targetFilePath: target.filePath,
            targetProjectName,
            projectRoot: null,
            hasPreviewRouteUrl: false,
            previewRouteUrlLength: 0,
          });
          setPreviewRouteUrl(null);
        }
      }
    };

    void resolvePreviewRoute();
    return () => {
      cancelled = true;
    };
  }, [target.filePath, targetProjectName]);

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
      disabled: Boolean(eligibilityError) || !previewRouteUrl,
    },
    {
      id: 'outline',
      title: isOutlineVisible ? '隐藏组件轮廓' : '显示组件轮廓',
      icon: OutlineIcon,
      onClick: toggleComponentOutline,
      active: isOutlineVisible,
      disabled: Boolean(eligibilityError) || isPreviewActive,
    },
    {
      id: 'hidden-layers',
      title: isHiddenLayerEditing ? '隐藏隐藏层' : '显示隐藏层',
      icon: Eye,
      onClick: toggleHiddenLayerEditing,
      active: isHiddenLayerEditing,
      disabled: Boolean(eligibilityError) || isPreviewActive,
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
  const designCanvasDocument = buildSavedHtml({
    snapshot: canvasDocument.snapshot,
    bodyHtml: canvasDocument.bodyHtml,
    css: canvasDocument.styles,
  });
  const previewViewportWidth = canvasDevice === 'desktop' ? '100%' : canvasDevice === 'tablet' ? '770px' : '320px';
  const activePreviewUrl = previewRouteUrl
    ? `${previewRouteUrl}${previewRouteUrl.includes('?') ? '&' : '?'}ccui-preview=${previewRouteVersion}`
    : 'about:blank';
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

          {activeMode === 'design' && isHiddenLayerEditing && !isPreviewActive ? (
            <div
              className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/70 bg-amber-50/70 px-3 py-2 text-xs dark:bg-amber-950/20"
              data-visual-html-hidden-layer-filters="true"
            >
              <span className="font-medium text-amber-900 dark:text-amber-100">隐藏层过滤</span>
              <input
                className="h-8 w-52 rounded-md border border-amber-200 bg-white px-2 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-amber-400 dark:border-amber-800 dark:bg-background"
                value={hiddenLayerFilter.textQuery}
                onChange={(event) => {
                  updateHiddenLayerTextQuery(event.target.value);
                }}
                placeholder="按文本过滤，如 123888"
                type="text"
                data-visual-html-hidden-layer-text-filter="true"
              />
              {ALL_HIDDEN_LAYER_REASONS.map((reason) => {
                const active = hiddenLayerFilter.reasons.includes(reason);
                return (
                  <button
                    key={reason}
                    className={`rounded-full border px-2 py-1 transition-colors ${
                      active
                        ? 'border-amber-400 bg-amber-100 text-amber-900 dark:border-amber-600 dark:bg-amber-900/40 dark:text-amber-100'
                        : 'border-border bg-background text-muted-foreground'
                    }`}
                    onClick={() => {
                      toggleHiddenLayerReason(reason);
                    }}
                    type="button"
                  >
                    {HIDDEN_LAYER_REASON_LABELS[reason]}
                  </button>
                );
              })}
              <button
                className={`rounded-full border px-2 py-1 transition-colors ${
                  hiddenLayerFilter.includeDescendants
                    ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-200'
                    : 'border-border bg-background text-muted-foreground'
                }`}
                onClick={() => {
                  toggleHiddenLayerFilterFlag('includeDescendants');
                }}
                type="button"
              >
                递归显示子隐藏层
              </button>
              <button
                className={`rounded-full border px-2 py-1 transition-colors ${
                  hiddenLayerFilter.includeInternal
                    ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-200'
                    : 'border-border bg-background text-muted-foreground'
                }`}
                onClick={() => {
                  toggleHiddenLayerFilterFlag('includeInternal');
                }}
                type="button"
              >
                包含编辑器内部节点
              </button>
            </div>
          ) : null}

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
                        src={activePreviewUrl}
                        className="block h-full min-h-0 w-full border-0 bg-white"
                        data-visual-html-preview-frame="true"
                      />
                    </div>
                  </div>
                ) : (
                  <VisualCanvasPane
                    fullHtml={designCanvasDocument}
                    assetBaseUrl={canvasAssetBaseUrl}
                    showHiddenLayers={isHiddenLayerEditing}
                    hiddenLayerFilter={hiddenLayerFilter}
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
                      setIsHiddenLayerEditing(false);
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
