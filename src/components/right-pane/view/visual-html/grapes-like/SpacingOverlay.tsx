import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type grapesjs from 'grapesjs';
import {
  buildSourceLocationDomPathFromElement,
  buildSourceLocationFingerprint,
  findSourceLocationByIdentity,
  type SourceLocationIdentity,
  type SourceLocationMap,
} from '../sourceLocationMapping';
import type { BoxValue } from './types';
// @ts-ignore - Node's strip-types runtime resolves the .ts specifier; tsc flags it without allowImportingTsExtensions.
import {
  buildMarqueeSelectionBox,
  collectMarqueeSelectionComponents,
  isMarqueeSelectionDistanceMet,
  MARQUEE_SELECTION_MAX_COMPONENTS,
  type MarqueeSelectionBox,
  type MarqueeSelectionCandidate,
} from './marqueeSelection';

type GrapesEditor = ReturnType<typeof grapesjs.init>;
type SpacingKind = 'margin' | 'padding';
type SpacingSide = 'top' | 'right' | 'bottom' | 'left';
type PositionMode = 'absolute' | 'fixed';

type SpacingBoxMetrics = BoxValue & {
  topPx: number;
  rightPx: number;
  bottomPx: number;
  leftPx: number;
};

type SpacingOverlaySnapshot = {
  portalRoot: HTMLElement;
  selectedId: string;
  positionMode: PositionMode | null;
  borderBox: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  marginBox: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  paddingBox: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  margin: SpacingBoxMetrics;
  padding: SpacingBoxMetrics;
};

type PositionDragValue = {
  left: { value: string; unit: string };
  top: { value: string; unit: string };
};

type SpacingDragState = {
  pointerId: number;
  kind: SpacingKind;
  side: SpacingSide;
  startX: number;
  startY: number;
  startValue: { value: string; unit: string };
  handle: HTMLButtonElement | null;
  target: {
    getId?: () => string;
    get?: (key: string) => unknown;
    addStyle?: (style: Record<string, string>) => void;
    removeStyle?: (property: string) => void;
  } | null;
};

type PositionDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  startValue: PositionDragValue;
  handle: HTMLButtonElement | null;
  target: {
    getId?: () => string;
    get?: (key: string) => unknown;
    addStyle?: (style: Record<string, string>) => void;
    removeStyle?: (property: string) => void;
  } | null;
};

type SpacingOverlayProps = {
  editor: GrapesEditor | null;
  onUpdateStyle: (input: { property: string; value: string; targetKind: 'rule' | 'inline' }) => void;
  showComponentOutlines?: boolean;
  filePath: string;
  sourceText?: string;
  sourceLocationMap: SourceLocationMap;
  ensureFreshSourceLocationMap?: (() => SourceLocationMap | Promise<SourceLocationMap>) | null;
  ensureLatestSourceContextForChat?: (() => Promise<{
    sourceText: string;
    sourceLocationMap: SourceLocationMap;
    persistedSourceText?: string;
    persistedSourceLocationMap?: SourceLocationMap | null;
    preferPersistedLocation?: boolean;
  }>) | null;
  persistedSourceText?: string;
  persistedSourceLocationMap?: SourceLocationMap | null;
  preferPersistedLocation?: boolean;
  onAppendToChatInput?: ((text: string) => void) | null;
};

type SelectedComponentTarget = {
  getId?: () => string;
  get?: (key: string) => unknown;
  getAttributes?: () => Record<string, string>;
  getEl?: () => HTMLElement | null | undefined;
};

type MarqueeSelectableComponent = {
  get?: (key: string) => unknown;
  parents?: () => MarqueeSelectableComponent[];
};

type MarqueeSelectionEditor = Pick<GrapesEditor, 'Canvas' | 'getSelectedAll' | 'select'> & {
  selectAdd?: (component: MarqueeSelectableComponent | MarqueeSelectableComponent[]) => void;
};

type MarqueeDragSession = {
  pointerId: number;
  startX: number;
  startY: number;
  frame: number | null;
  boxElement: HTMLDivElement | null;
  active: boolean;
  candidates: Array<MarqueeSelectionCandidate<MarqueeSelectableComponent>> | null;
};

const SPACING_ASSIST_STYLE_ID = 'ccui-spacing-assist-style';
const CANVAS_DRAGGING_DATASET_KEY = 'ccuiOverlayDragging';
const CANVAS_CHROME_HIDDEN_ATTR = 'data-ccui-overlay-hidden';
const SEND_TO_AI_TOOLBAR_COMMAND = 'ccui-send-to-ai';
const DUPLICATE_SEND_WINDOW_MS = 400;
const MARQUEE_SELECTION_BOX_ATTR = 'data-ccui-marquee-selection';

const HANDLE_COLORS: Record<SpacingKind, string> = {
  margin: 'rgba(251, 146, 60, 0.95)',
  padding: 'rgba(59, 130, 246, 0.95)',
};

function logSpacingOverlay(event: string, payload: Record<string, unknown>) {
  if ((globalThis as typeof globalThis & { CCUI_DEBUG_SPACING_OVERLAY?: boolean }).CCUI_DEBUG_SPACING_OVERLAY !== true) {
    return;
  }

  console.log('[SpacingOverlay]', event, payload);
}

function getTimingNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }

  return Date.now();
}

function setCanvasDragChromeHidden(doc: Document | null | undefined, hidden: boolean) {
  const body = doc?.body;
  if (!body) {
    return;
  }

  if (hidden) {
    body.dataset[CANVAS_DRAGGING_DATASET_KEY] = 'true';
    return;
  }

  delete body.dataset[CANVAS_DRAGGING_DATASET_KEY];
}

function getDragChromeDocuments(doc: Document | null | undefined) {
  const docs = [doc, typeof window !== 'undefined' ? window.document : null].filter(Boolean) as Document[];
  return docs.filter((entry, index) => docs.indexOf(entry) === index);
}

function setCanvasChromeVisibility(doc: Document | null | undefined, hidden: boolean) {
  getDragChromeDocuments(doc).forEach((currentDoc) => {
    currentDoc.querySelectorAll<HTMLElement>('.gjs-toolbar, .gjs-badge').forEach((element) => {
      if (hidden) {
        element.setAttribute(CANVAS_CHROME_HIDDEN_ATTR, 'true');
        element.style.setProperty('display', 'none', 'important');
        element.style.setProperty('visibility', 'hidden', 'important');
        return;
      }

      if (!element.hasAttribute(CANVAS_CHROME_HIDDEN_ATTR)) {
        return;
      }

      element.removeAttribute(CANVAS_CHROME_HIDDEN_ATTR);
      element.style.removeProperty('display');
      element.style.removeProperty('visibility');
    });
  });
}

function formatNumber(value: number) {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(2).replace(/\.?0+$/, '');
}

export function parseSpacingLength(value: string): { value: number | null; unit: string } {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return { value: null, unit: '' };
  }

  const match = trimmed.match(/^(-?\d*\.?\d+)([a-z%]+)?$/i);
  if (!match) {
    return { value: null, unit: '' };
  }

  return {
    value: Number(match[1]),
    unit: match[2] ?? '',
  };
}

export function applySpacingDragDelta(
  current: { value: string; unit: string },
  delta: number,
  modifiers: { shiftKey?: boolean; altKey?: boolean },
): { value: string; unit: string } {
  const parsed = Number(current.value);
  const step = modifiers.altKey ? 10 : modifiers.shiftKey ? 0.1 : 1;
  return {
    value: formatNumber((Number.isFinite(parsed) ? parsed : 0) + (delta * step)),
    unit: current.unit || 'px',
  };
}

export function applyInlineStyleToTarget(
  target: {
    getId?: () => string;
    get?: (key: string) => unknown;
    addStyle?: (style: Record<string, string>) => void;
    removeStyle?: (property: string) => void;
  } | null,
  property: string,
  value: string,
) {
  if (!target) {
    logSpacingOverlay('apply-inline-skip', { property, value, reason: 'missing-target' });
    return;
  }

  const nextValue = String(value ?? '').trim();
  if (!nextValue) {
    logSpacingOverlay('apply-inline-remove', {
      property,
      targetId: String(target.getId?.() ?? target.get?.('id') ?? '').trim(),
    });
    target.removeStyle?.(property);
    return;
  }

  logSpacingOverlay('apply-inline-style', {
    property,
    value: nextValue,
    targetId: String(target.getId?.() ?? target.get?.('id') ?? '').trim(),
  });
  target.addStyle?.({ [property]: nextValue });
}

export function isPositionDragEnabled(position: string | null | undefined): position is PositionMode {
  return position === 'absolute' || position === 'fixed';
}

export function applyPositionDragDelta(start: PositionDragValue, delta: { x: number; y: number }): PositionDragValue {
  return {
    left: {
      value: formatNumber((Number(start.left.value) || 0) + delta.x),
      unit: start.left.unit || 'px',
    },
    top: {
      value: formatNumber((Number(start.top.value) || 0) + delta.y),
      unit: start.top.unit || 'px',
    },
  };
}

export function applyPositionStylesToTarget(
  target: {
    getId?: () => string;
    get?: (key: string) => unknown;
    addStyle?: (style: Record<string, string>) => void;
    removeStyle?: (property: string) => void;
  } | null,
  value: PositionDragValue,
) {
  if (!target) {
    return;
  }

  target.removeStyle?.('inset');
  target.removeStyle?.('right');
  target.removeStyle?.('bottom');
  applyInlineStyleToTarget(target, 'left', `${value.left.value}${value.left.unit || 'px'}`);
  applyInlineStyleToTarget(target, 'top', `${value.top.value}${value.top.unit || 'px'}`);
}

export function getPositionDragCursor(isDragging: boolean) {
  return isDragging ? 'grabbing' : 'grab';
}

export function getPositionDragPreviewLabel(value: { left: string; top: string }) {
  return `X ${value.left}  Y ${value.top}`;
}

type ElementSourceLocation = {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

function stripSelectionHighlightAttribute(value: string) {
  return value.replace(/\sdata-ccui-browser-selected-highlight="active"/g, '');
}

function stripEditorRuntimeAttributes(value: string) {
  return value
    .replace(/\sdata-gjs-[a-z0-9-]+="[^"]*"/gi, '')
    .replace(/\s(?:contenteditable|draggable|spellcheck|data-highlightable|data-gjs-highlightable)="[^"]*"/gi, '');
}

function stripEditorRuntimeClasses(value: string) {
  return value.replace(/\sclass="([^"]*)"/gi, (_, rawClassName: string) => {
    const cleaned = rawClassName
      .split(/\s+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .filter((entry) => !entry.startsWith('gjs-'));

    return cleaned.length > 0 ? ` class="${cleaned.join(' ')}"` : '';
  });
}

function sanitizeElementOuterHtml(value: string) {
  return stripEditorRuntimeClasses(
    stripEditorRuntimeAttributes(
      stripSelectionHighlightAttribute(value),
    ),
  ).trim();
}

function normalizeForSearch(value: string): { normalized: string; indexMap: number[] } {
  let normalized = '';
  const indexMap: number[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (/\s/.test(character)) {
      continue;
    }

    normalized += character;
    indexMap.push(index);
  }

  return { normalized, indexMap };
}

function getLineAndColumnAtIndex(value: string, targetIndex: number) {
  let line = 1;
  let column = 1;

  for (let index = 0; index < targetIndex; index += 1) {
    if (value[index] === '\n') {
      line += 1;
      column = 1;
      continue;
    }

    column += 1;
  }

  return { line, column };
}

export function findElementSourceLocation({
  sourceText,
  elementOuterHtml,
}: {
  sourceText: string;
  elementOuterHtml: string;
}): ElementSourceLocation | null {
  const sanitizedOuterHtml = sanitizeElementOuterHtml(elementOuterHtml || '');
  if (!sourceText.trim() || !sanitizedOuterHtml) {
    return null;
  }

  const normalizedSource = normalizeForSearch(sourceText);
  const normalizedElement = normalizeForSearch(sanitizedOuterHtml);
  if (!normalizedSource.normalized || !normalizedElement.normalized) {
    return null;
  }

  const startIndex = normalizedSource.normalized.indexOf(normalizedElement.normalized);
  if (startIndex === -1) {
    return null;
  }

  const endIndex = startIndex + normalizedElement.normalized.length - 1;
  const originalStartIndex = normalizedSource.indexMap[startIndex] ?? 0;
  const originalEndIndex = normalizedSource.indexMap[endIndex] ?? originalStartIndex;
  const start = getLineAndColumnAtIndex(sourceText, originalStartIndex);
  const end = getLineAndColumnAtIndex(sourceText, originalEndIndex + 1);

  return {
    startLine: start.line,
    startColumn: start.column,
    endLine: end.line,
    endColumn: end.column,
  };
}

export function findClosestElementSourceLocation({
  sourceText,
  element,
}: {
  sourceText: string;
  element: HTMLElement | null | undefined;
}): ElementSourceLocation | null {
  let current: HTMLElement | null | undefined = element;
  while (current) {
    const location = findElementSourceLocation({
      sourceText,
      elementOuterHtml: current.outerHTML ?? '',
    });
    if (location) {
      return location;
    }

    current = current.parentElement;
  }

  return null;
}

export function buildElementStyleChatPrompt({
  filePath,
  location,
}: {
  filePath: string;
  location: ElementSourceLocation | null;
}) {
  const lines = [`文件路径：\`${filePath}\``];

  if (location) {
    lines.push(`代码位置：\`${filePath}:${location.startLine}:${location.startColumn}-${location.endLine}:${location.endColumn}\``);
  }

  return lines.join('\n');
}

export function replaceToolbarMoveCommandWithSendCommand(toolbar: Array<Record<string, unknown>> | null | undefined) {
  if (!Array.isArray(toolbar) || toolbar.length === 0) {
    return toolbar ?? [];
  }

  let replaced = false;
  const nextToolbar = toolbar.map((item) => {
    if (replaced || String(item?.command ?? '').trim() !== 'tlb-move') {
      return item;
    }

    replaced = true;
    const nextAttributes = {
      ...((item?.attributes as Record<string, string> | undefined) ?? {}),
      class: 'ccui-gjs-toolbar-send',
      title: '发送到 AI',
      'data-ccui-toolbar-send': 'true',
    };

    return {
      ...item,
      command: SEND_TO_AI_TOOLBAR_COMMAND,
      label: `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M22 2 11 13" />
          <path d="m22 2-7 20-4-9-9-4Z" />
        </svg>
      `,
      attributes: nextAttributes,
    };
  });

  return replaced ? nextToolbar : toolbar;
}

export function syncSpacingOverlayToolbar(
  editor: Pick<GrapesEditor, 'getSelected' | 'refresh' | 'Canvas'>,
  component?: {
    get?: (key: string) => unknown;
    set?: (key: string, value: unknown) => void;
  } | null,
  options: { refreshTools?: boolean } = {},
) {
  const startedAt = getTimingNow();
  const target = component ?? getSelectedComponent(editor as GrapesEditor);
  const currentToolbar = target?.get?.('toolbar');
  const nextToolbar = replaceToolbarMoveCommandWithSendCommand(
    Array.isArray(currentToolbar) ? currentToolbar as Array<Record<string, unknown>> : [],
  );

  if (nextToolbar !== currentToolbar) {
    // @ts-ignore - Toolbar type compatibility issue with grapesjs
    target?.set?.('toolbar', nextToolbar);
  }

  if (options.refreshTools || nextToolbar !== currentToolbar) {
    if (editor.Canvas) {
      editor.refresh?.({ tools: true });
    }
  }

  logSpacingOverlay('toolbar-sync', {
    selectedId: String(target?.get?.('id') ?? ''),
    durationMs: Math.round((getTimingNow() - startedAt) * 100) / 100,
  });
}

export function attachSpacingOverlayToolbarSync(
  editor: Pick<GrapesEditor, 'getSelected' | 'refresh' | 'Canvas' | 'on' | 'off' | 'Commands'>,
  onSendSelectionToChat: () => void | Promise<void>,
) {
  const syncToolbar = (component?: {
    get?: (key: string) => unknown;
    set?: (key: string, value: unknown) => void;
  } | null) => {
    syncSpacingOverlayToolbar(editor, component, { refreshTools: true });
  };

  editor.Commands?.add?.(SEND_TO_AI_TOOLBAR_COMMAND, {
    run: () => {
      void onSendSelectionToChat();
    },
  });

  syncToolbar();
  editor.on?.('component:selected', syncToolbar);
  editor.on?.('component:update', syncToolbar);

  return () => {
    editor.off?.('component:selected', syncToolbar);
    editor.off?.('component:update', syncToolbar);
    // @ts-ignore - grapesjs Commands has a remove method at runtime but not in types
    editor.Commands?.remove?.(SEND_TO_AI_TOOLBAR_COMMAND);
  };
}

export function shouldSuppressDuplicateSend(
  previous: { targetId: string; at: number } | null,
  next: { targetId: string; at: number },
) {
  if (!previous) {
    return false;
  }

  if (!previous.targetId || previous.targetId !== next.targetId) {
    return false;
  }

  return (next.at - previous.at) < DUPLICATE_SEND_WINDOW_MS;
}

function isCanvasChromeElement(element: HTMLElement) {
  return Boolean(element.closest('.gjs-toolbar, .gjs-badge, .gjs-placeholder, .gjs-highlighter, .gjs-resizer'));
}

function readMarqueeSelectionComponent(element: HTMLElement): MarqueeSelectableComponent | null {
  const fromView = (element as HTMLElement & { __gjsv?: { model?: MarqueeSelectableComponent | null } }).__gjsv?.model;
  if (fromView) {
    return fromView;
  }

  const fromCash = (element as HTMLElement & { __cashData?: { model?: MarqueeSelectableComponent | null } }).__cashData?.model;
  if (fromCash) {
    return fromCash;
  }

  return null;
}

function readMarqueeSelectionCandidates(
  body: HTMLElement,
): Array<MarqueeSelectionCandidate<MarqueeSelectableComponent>> {
  const candidates: Array<MarqueeSelectionCandidate<MarqueeSelectableComponent>> = [];

  body.querySelectorAll<HTMLElement>('*').forEach((element) => {
    if (element === body || isCanvasChromeElement(element)) {
      return;
    }

    const component = readMarqueeSelectionComponent(element);
    if (!component) {
      return;
    }

    candidates.push({ component, element, rect: element.getBoundingClientRect() });
  });

  return candidates;
}

function applyMarqueeSelection(
  editor: MarqueeSelectionEditor,
  components: MarqueeSelectableComponent[],
) {
  if (components.length === 0) {
    return;
  }

  // 延迟到下一帧，避免阻塞 pointerup；一次性 select 合并列表，绕过逐个 selectAdd 的多次内部更新
  requestAnimationFrame(() => {
    const existing = Array.isArray(editor.getSelectedAll?.()) ? editor.getSelectedAll?.() ?? [] : [];
    const next = [...existing, ...components].filter((component, index, all) => all.indexOf(component) === index);
    editor.select?.(next as never);
  });
}

function updateMarqueeSelectionBox(element: HTMLElement, box: MarqueeSelectionBox) {
  element.style.left = `${box.left}px`;
  element.style.top = `${box.top}px`;
  element.style.width = `${box.width}px`;
  element.style.height = `${box.height}px`;
}

export function attachCanvasMarqueeSelection(editor: MarqueeSelectionEditor) {
  const body = editor.Canvas?.getBody?.() as HTMLElement | null | undefined;
  const doc = body?.ownerDocument;
  const win = doc?.defaultView;
  if (!body || !doc || !win) {
    return () => {};
  }

  let session: MarqueeDragSession | null = null;
  let blockNextClick = false;

  const removeBox = () => {
    if (session?.frame != null) {
      win.cancelAnimationFrame(session.frame);
    }
    session?.boxElement?.remove();
    session = null;
    body.style.userSelect = '';
  };

  const ensureBox = () => {
    if (!session) {
      return null;
    }

    if (session.boxElement) {
      return session.boxElement;
    }

    const box = body.ownerDocument.createElement('div');
    box.setAttribute(MARQUEE_SELECTION_BOX_ATTR, 'true');
    box.style.position = 'fixed';
    box.style.zIndex = '2147483647';
    box.style.pointerEvents = 'none';
    box.style.boxSizing = 'border-box';
    box.style.border = '1px dashed rgba(37, 99, 235, 0.95)';
    box.style.background = 'rgba(37, 99, 235, 0.12)';
    body.appendChild(box);
    session.boxElement = box;
    return box;
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (!session || event.pointerId !== session.pointerId) {
      return;
    }

    if (!isMarqueeSelectionDistanceMet({ x: session.startX, y: session.startY }, { x: event.clientX, y: event.clientY })) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    session.active = true;
    body.style.userSelect = 'none';

    if (session.frame != null) {
      return;
    }

    const currentX = event.clientX;
    const currentY = event.clientY;
    session.frame = win.requestAnimationFrame(() => {
      if (!session) {
        return;
      }

      session.frame = null;
      const boxElement = ensureBox();
      if (!boxElement) {
        return;
      }

      updateMarqueeSelectionBox(boxElement, buildMarqueeSelectionBox(
        { x: session.startX, y: session.startY },
        { x: currentX, y: currentY },
      ));
    });
  };

  const finishSelection = (event: PointerEvent | Event) => {
    if (!session) {
      return;
    }

    const pointerId = 'pointerId' in event ? event.pointerId : session.pointerId;
    if (pointerId !== session.pointerId) {
      return;
    }

    const endPoint = 'clientX' in event && 'clientY' in event
      ? { x: event.clientX, y: event.clientY }
      : { x: session.startX, y: session.startY };
    const shouldSelect = session.active && isMarqueeSelectionDistanceMet(
      { x: session.startX, y: session.startY },
      endPoint,
    );
    const box = buildMarqueeSelectionBox({ x: session.startX, y: session.startY }, endPoint);

    event.preventDefault?.();
    event.stopPropagation?.();
    removeBox();

    // 只要发生了 Ctrl+pointerdown，就拦截接下来的 click，防止 GrapesJS 意外清空当前选择
    blockNextClick = true;

    if (!shouldSelect) {
      return;
    }

    const candidates = session?.candidates ?? readMarqueeSelectionCandidates(body);
    const components = collectMarqueeSelectionComponents(candidates, box, MARQUEE_SELECTION_MAX_COMPONENTS);
    applyMarqueeSelection(editor, components);
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (!event.ctrlKey || (event.button !== 0 && event.button !== 2)) {
      return;
    }

    if (session?.pointerId === event.pointerId) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest && isCanvasChromeElement(target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    session = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      frame: null,
      boxElement: null,
      active: false,
      candidates: readMarqueeSelectionCandidates(body),
    };

    try {
      target?.setPointerCapture?.(event.pointerId);
    } catch {
      // Some iframe/document targets cannot capture pointers; window-level listeners still cover those drags.
    }
  };

  const handleContextMenu = (event: MouseEvent) => {
    if (!session && !event.ctrlKey) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  };

  const handleClick = (event: MouseEvent) => {
    if (!blockNextClick) {
      return;
    }
    blockNextClick = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const pointerDownTargets = Array.from(new Set<EventTarget>([
    win,
    doc,
    doc.documentElement,
    body,
  ]));

  pointerDownTargets.forEach((target) => {
    target.addEventListener('pointerdown', handlePointerDown as EventListener, true);
    target.addEventListener('contextmenu', handleContextMenu as EventListener, true);
  });
  win.addEventListener('pointermove', handlePointerMove, true);
  win.addEventListener('pointerup', finishSelection, true);
  win.addEventListener('pointercancel', finishSelection, true);
  win.addEventListener('click', handleClick, true);

  return () => {
    pointerDownTargets.forEach((target) => {
      target.removeEventListener('pointerdown', handlePointerDown as EventListener, true);
      target.removeEventListener('contextmenu', handleContextMenu as EventListener, true);
    });
    win.removeEventListener('pointermove', handlePointerMove, true);
    win.removeEventListener('pointerup', finishSelection, true);
    win.removeEventListener('pointercancel', finishSelection, true);
    win.removeEventListener('click', handleClick, true);
    removeBox();
  };
}

function readPositionValue(rawValue: string, fallback: number) {
  const parsed = parseSpacingLength(rawValue);
  if (Number.isFinite(parsed.value ?? NaN)) {
    return {
      value: formatNumber(parsed.value ?? 0),
      unit: parsed.unit || 'px',
    };
  }

  return {
    value: formatNumber(fallback),
    unit: 'px',
  };
}

function getPositionReferenceRect(element: HTMLElement, mode: PositionMode) {
  if (mode === 'fixed') {
    return { left: 0, top: 0 };
  }

  const offsetParent = element.offsetParent;
  if (offsetParent instanceof HTMLElement) {
    const rect = offsetParent.getBoundingClientRect();
    return { left: rect.left, top: rect.top };
  }

  return { left: 0, top: 0 };
}

function readPositionDragValue(
  element: HTMLElement,
  computed: Pick<CSSStyleDeclaration, 'getPropertyValue'>,
  borderBox: SpacingOverlaySnapshot['borderBox'],
  mode: PositionMode,
): PositionDragValue {
  const referenceRect = getPositionReferenceRect(element, mode);

  return {
    left: readPositionValue(computed.getPropertyValue('left'), borderBox.left - referenceRect.left),
    top: readPositionValue(computed.getPropertyValue('top'), borderBox.top - referenceRect.top),
  };
}

function buildSpacingBoxMetrics(
  base: SpacingBoxMetrics,
  next: Partial<Record<SpacingSide, { value: string; unit: string }>>,
): SpacingBoxMetrics {
  const top = next.top ?? { value: base.top, unit: base.unit };
  const right = next.right ?? { value: base.right, unit: base.unit };
  const bottom = next.bottom ?? { value: base.bottom, unit: base.unit };
  const left = next.left ?? { value: base.left, unit: base.unit };
  const unit = next.top?.unit ?? next.right?.unit ?? next.bottom?.unit ?? next.left?.unit ?? base.unit;

  return {
    top: top.value,
    right: right.value,
    bottom: bottom.value,
    left: left.value,
    unit,
    topPx: Number(top.value) || 0,
    rightPx: Number(right.value) || 0,
    bottomPx: Number(bottom.value) || 0,
    leftPx: Number(left.value) || 0,
  };
}

function buildFrameBox(
  borderBox: SpacingOverlaySnapshot['borderBox'],
  metrics: SpacingBoxMetrics,
  kind: SpacingKind,
) {
  if (kind === 'margin') {
    return {
      left: borderBox.left - metrics.leftPx,
      top: borderBox.top - metrics.topPx,
      width: borderBox.width + metrics.leftPx + metrics.rightPx,
      height: borderBox.height + metrics.topPx + metrics.bottomPx,
    };
  }

  return {
    left: borderBox.left + metrics.leftPx,
    top: borderBox.top + metrics.topPx,
    width: Math.max(borderBox.width - metrics.leftPx - metrics.rightPx, 0),
    height: Math.max(borderBox.height - metrics.topPx - metrics.bottomPx, 0),
  };
}

export function readSpacingBoxFromStyle(style: Pick<CSSStyleDeclaration, 'getPropertyValue'>, prefix: 'margin' | 'padding'): SpacingBoxMetrics {
  const sideKeys = ['top', 'right', 'bottom', 'left'] as const;
  const values = sideKeys.map((side) => style.getPropertyValue(`${prefix}-${side}`));
  const shorthand = style.getPropertyValue(prefix);
  const resolved = values.some((entry) => Boolean(entry.trim()))
    ? values
    : String(shorthand ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  const expanded = (() => {
    if (resolved.length === 0) {
      return ['', '', '', ''];
    }

    if (resolved.length === 1) {
      return [resolved[0], resolved[0], resolved[0], resolved[0]];
    }

    if (resolved.length === 2) {
      return [resolved[0], resolved[1], resolved[0], resolved[1]];
    }

    if (resolved.length === 3) {
      return [resolved[0], resolved[1], resolved[2], resolved[1]];
    }

    return [resolved[0], resolved[1], resolved[2], resolved[3]];
  })();

  const parsed = expanded.map((entry) => parseSpacingLength(String(entry ?? '')));
  const unit = parsed.find((entry) => entry.unit)?.unit ?? parseSpacingLength(String(shorthand ?? '')).unit;

  return {
    top: Number.isFinite(parsed[0]?.value ?? NaN) ? formatNumber(parsed[0]?.value ?? 0) : '',
    right: Number.isFinite(parsed[1]?.value ?? NaN) ? formatNumber(parsed[1]?.value ?? 0) : '',
    bottom: Number.isFinite(parsed[2]?.value ?? NaN) ? formatNumber(parsed[2]?.value ?? 0) : '',
    left: Number.isFinite(parsed[3]?.value ?? NaN) ? formatNumber(parsed[3]?.value ?? 0) : '',
    unit,
    topPx: parsed[0]?.value ?? 0,
    rightPx: parsed[1]?.value ?? 0,
    bottomPx: parsed[2]?.value ?? 0,
    leftPx: parsed[3]?.value ?? 0,
  };
}

function getSelectedComponent(editor: GrapesEditor) {
  try {
    return editor.getSelected?.() ?? null;
  } catch (error) {
    logSpacingOverlay('get-selected-failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function getSelectedComponentForChat(editor: GrapesEditor): SelectedComponentTarget | null {
  try {
    const selected = editor.getSelectedAll?.() ?? [];
    if (Array.isArray(selected) && selected.length === 1) {
      return (selected[0] as SelectedComponentTarget | null) ?? null;
    }
  } catch (error) {
    logSpacingOverlay('get-selected-all-failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    return (editor.getSelected?.() as SelectedComponentTarget | null) ?? null;
  } catch (error) {
    logSpacingOverlay('get-selected-failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function readComponentIdentityValue(...values: Array<unknown>) {
  for (const value of values) {
    const nextValue = String(value ?? '').trim();
    if (nextValue) {
      return nextValue;
    }
  }

  return null;
}

function readElementAttributeRecord(element: HTMLElement | null | undefined): Record<string, string> {
  if (!element || !element.getAttributeNames) {
    return {};
  }

  return element.getAttributeNames().reduce<Record<string, string>>((result, name) => {
    const value = element.getAttribute(name);
    if (value !== null) {
      result[name] = value;
    }
    return result;
  }, {});
}

export function extractComponentIdentity(component: SelectedComponentTarget | null | undefined): SourceLocationIdentity {
  const element = component?.getEl?.() ?? null;
  const attributes = {
    ...readElementAttributeRecord(element),
    ...(component?.getAttributes?.() ?? {}),
  };
  const dataset = element?.dataset;
  const tagName = String(
    component?.get?.('tagName')
    ?? component?.get?.('tagName')
    ?? element?.tagName
    ?? '',
  ).toLowerCase().trim();

  return {
    componentId: readComponentIdentityValue(
      component?.getId?.(),
      component?.get?.('id'),
      attributes['data-ccui-component-id'],
      attributes['data-gjs-id'],
      dataset?.ccuiComponentId,
      dataset?.gjsId,
    ),
    fingerprint: readComponentIdentityValue(
      attributes['data-ccui-fingerprint'],
      dataset?.ccuiFingerprint,
      tagName ? buildSourceLocationFingerprint(tagName, attributes) : '',
    ),
    domPath: readComponentIdentityValue(
      attributes['data-ccui-dom-path'],
      dataset?.ccuiDomPath,
      buildSourceLocationDomPathFromElement(element),
    ),
  };
}

function countLookupCandidates(mapping: SourceLocationMap, identity: SourceLocationIdentity) {
  if (mapping.status !== 'ready') {
    return {
      byComponentId: 0,
      byFingerprint: 0,
      byDomPath: 0,
    };
  }

  const componentId = String(identity.componentId ?? '').trim();
  const fingerprint = String(identity.fingerprint ?? '').trim();
  const domPath = String(identity.domPath ?? '').trim();

  return {
    byComponentId: componentId
      ? mapping.entries.filter((entry) => entry.componentId === componentId).length
      : 0,
    byFingerprint: fingerprint
      ? mapping.entries.filter((entry) => entry.fingerprint === fingerprint).length
      : 0,
    byDomPath: domPath
      ? mapping.entries.filter((entry) => entry.domPath === domPath).length
      : 0,
  };
}

function findClosestElementSourceLocationWithDiagnostics({
  sourceText,
  element,
}: {
  sourceText: string;
  element: HTMLElement | null | undefined;
}) {
  const attempts: Array<{ tagName: string; matched: boolean }> = [];
  let current: HTMLElement | null | undefined = element;
  while (current) {
    const location = findElementSourceLocation({
      sourceText,
      elementOuterHtml: current.outerHTML ?? '',
    });
    attempts.push({
      tagName: String(current.tagName ?? '').toLowerCase(),
      matched: Boolean(location),
    });
    if (location) {
      return { location, attempts };
    }
    current = current.parentElement;
  }

  return { location: null, attempts };
}

export async function buildSendSelectionToChatPayload({
  editor,
  filePath,
  sourceText = '',
  sourceLocationMap,
  ensureFreshSourceLocationMap,
  latestSourceContext = null,
  persistedSourceText = '',
  persistedSourceLocationMap = null,
  preferPersistedLocation = false,
}: {
  editor: GrapesEditor;
  filePath: string;
  sourceText?: string;
  sourceLocationMap: SourceLocationMap;
  ensureFreshSourceLocationMap?: (() => SourceLocationMap | Promise<SourceLocationMap>) | null;
  latestSourceContext?: {
    sourceText: string;
    sourceLocationMap: SourceLocationMap;
    persistedSourceText?: string;
    persistedSourceLocationMap?: SourceLocationMap | null;
    preferPersistedLocation?: boolean;
  } | null;
  persistedSourceText?: string;
  persistedSourceLocationMap?: SourceLocationMap | null;
  preferPersistedLocation?: boolean;
}) {
  const target = getSelectedComponentForChat(editor);
  if (!target) {
    return null;
  }

  const effectiveSourceText = latestSourceContext?.sourceText ?? sourceText;
  const effectiveSourceLocationMap = latestSourceContext?.sourceLocationMap ?? sourceLocationMap;
  const effectivePersistedSourceText = latestSourceContext?.persistedSourceText ?? persistedSourceText;
  const effectivePersistedSourceLocationMap = latestSourceContext?.persistedSourceLocationMap ?? persistedSourceLocationMap;
  const shouldPreferPersistedLocation = latestSourceContext?.preferPersistedLocation ?? preferPersistedLocation;
  const identity = extractComponentIdentity(target);
  const mapping = ensureFreshSourceLocationMap
    ? await ensureFreshSourceLocationMap()
    : effectiveSourceLocationMap;
  const persistedFallback = shouldPreferPersistedLocation
    ? findClosestElementSourceLocationWithDiagnostics({
      sourceText: effectivePersistedSourceText,
      element: target.getEl?.() ?? null,
    })
    : { location: null, attempts: [] as Array<{ tagName: string; matched: boolean }> };
  const persistedLocation = shouldPreferPersistedLocation
    ? (
      (effectivePersistedSourceLocationMap ? findSourceLocationByIdentity(effectivePersistedSourceLocationMap, identity) : null)
      ?? persistedFallback.location
    )
    : null;
  const mappingLocation = findSourceLocationByIdentity(mapping, identity);
  const fallback = findClosestElementSourceLocationWithDiagnostics({
    sourceText: effectiveSourceText,
    element: target.getEl?.() ?? null,
  });
  const location = persistedLocation ?? mappingLocation ?? fallback.location;
  const lookupCounts = countLookupCandidates(mapping, identity);

  logSpacingOverlay('send-to-chat-lookup', {
    targetId: String(target.getId?.() ?? target.get?.('id') ?? '').trim(),
    identity,
    preferPersistedLocation: shouldPreferPersistedLocation,
    mappingStatus: mapping.status,
    mappingRevision: mapping.revision,
    mappingEntryCount: mapping.entries.length,
    lookupCounts,
    persistedMappingStatus: effectivePersistedSourceLocationMap?.status ?? null,
    persistedMappingRevision: effectivePersistedSourceLocationMap?.revision ?? null,
    persistedSourceTextLength: effectivePersistedSourceText.length,
    resolvedBy: persistedLocation
      ? 'persisted'
      : mappingLocation
        ? 'mapping'
        : fallback.location
          ? 'fallback'
          : 'unresolved',
    persistedFallbackAttempts: persistedFallback.attempts,
    fallbackAttempts: fallback.attempts,
    sourceTextLength: effectiveSourceText.length,
    location: location
      ? `${location.startLine}:${location.startColumn}-${location.endLine}:${location.endColumn}`
      : null,
  });

  return {
    identity,
    location,
    prompt: buildElementStyleChatPrompt({
      filePath,
      location,
    }),
    targetId: String(target.getId?.() ?? target.get?.('id') ?? '').trim(),
  };
}

function buildSpacingSnapshot(editor: GrapesEditor): SpacingOverlaySnapshot | null {
  const body = editor.Canvas?.getBody?.();
  const selected = getSelectedComponent(editor);
  if (!selected) {
    return null;
  }
  const element = selected?.getEl?.() as HTMLElement | null | undefined;
  if (!body || !element || !body.contains(element)) {
    return null;
  }

  const computed = body.ownerDocument?.defaultView?.getComputedStyle?.(element);
  if (!computed) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  const margin = readSpacingBoxFromStyle(computed, 'margin');
  const padding = readSpacingBoxFromStyle(computed, 'padding');

  const marginBox = {
    left: rect.left - margin.leftPx,
    top: rect.top - margin.topPx,
    width: rect.width + margin.leftPx + margin.rightPx,
    height: rect.height + margin.topPx + margin.bottomPx,
  };

  const paddingBox = {
    left: rect.left + padding.leftPx,
    top: rect.top + padding.topPx,
    width: Math.max(rect.width - padding.leftPx - padding.rightPx, 0),
    height: Math.max(rect.height - padding.topPx - padding.bottomPx, 0),
  };

  return {
    portalRoot: body,
    selectedId: String(selected.getId?.() ?? selected.get?.('id') ?? '').trim(),
    positionMode: isPositionDragEnabled(computed.position) ? computed.position : null,
    borderBox: {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    },
    marginBox,
    paddingBox,
    margin,
    padding,
  };
}

function getEdgeDragDelta(
  side: SpacingSide,
  start: { x: number; y: number },
  current: { x: number; y: number },
) {
  const rawDelta = side === 'left' || side === 'right' ? current.x - start.x : current.y - start.y;
  const direction = side === 'top' || side === 'left' ? -1 : 1;
  return Math.round(rawDelta / 4) * direction;
}

function getSpacingProperty(kind: SpacingKind, side: SpacingSide) {
  return `${kind}-${side}`;
}

export function getVisibleSpacingHandleSides(activeSide: SpacingSide | null): SpacingSide[] {
  if (!activeSide) {
    return ['top', 'right', 'bottom', 'left'];
  }

  return [activeSide];
}

export function getVisibleSpacingKinds(activeKind: SpacingKind | null): SpacingKind[] {
  if (!activeKind) {
    return ['margin', 'padding'];
  }

  return [activeKind];
}

function buildSideHighlightBox(
  outerBox: { left: number; top: number; width: number; height: number },
  innerBox: { left: number; top: number; width: number; height: number },
  side: SpacingSide,
) {
  if (side === 'top') {
    return {
      left: outerBox.left,
      top: outerBox.top,
      width: outerBox.width,
      height: Math.max(innerBox.top - outerBox.top, 0),
    };
  }

  if (side === 'right') {
    return {
      left: innerBox.left + innerBox.width,
      top: outerBox.top,
      width: Math.max((outerBox.left + outerBox.width) - (innerBox.left + innerBox.width), 0),
      height: outerBox.height,
    };
  }

  if (side === 'bottom') {
    return {
      left: outerBox.left,
      top: innerBox.top + innerBox.height,
      width: outerBox.width,
      height: Math.max((outerBox.top + outerBox.height) - (innerBox.top + innerBox.height), 0),
    };
  }

  return {
    left: outerBox.left,
    top: outerBox.top,
    width: Math.max(innerBox.left - outerBox.left, 0),
    height: outerBox.height,
  };
}

export default function SpacingOverlay({
  editor,
  onUpdateStyle,
  showComponentOutlines = false,
  filePath,
  sourceText = '',
  sourceLocationMap,
  ensureFreshSourceLocationMap = null,
  ensureLatestSourceContextForChat = null,
  persistedSourceText = '',
  persistedSourceLocationMap = null,
  preferPersistedLocation = false,
  onAppendToChatInput = null,
}: SpacingOverlayProps) {
  const [snapshot, setSnapshot] = useState<SpacingOverlaySnapshot | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    kind: SpacingKind;
    side: SpacingSide;
    value: string;
    x: number;
    y: number;
  } | null>(null);
  const [positionDragPreview, setPositionDragPreview] = useState<{
    left: string;
    top: string;
    x: number;
    y: number;
  } | null>(null);
  const dragStateRef = useRef<SpacingDragState | null>(null);
  const positionDragStateRef = useRef<PositionDragState | null>(null);
  const removeDragSessionListenersRef = useRef<(() => void) | null>(null);
  const removePositionDragSessionListenersRef = useRef<(() => void) | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastSendRef = useRef<{ targetId: string; at: number } | null>(null);

  const handleSendSelectionToChat = async () => {
    if (!editor || !onAppendToChatInput) {
      return;
    }

    let latestSourceContext = null;
    if (ensureLatestSourceContextForChat) {
      try {
        latestSourceContext = await ensureLatestSourceContextForChat();
      } catch (error) {
        logSpacingOverlay('send-to-chat-sync-failed', {
          filePath,
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }
    }

    const payload = await buildSendSelectionToChatPayload({
      editor,
      filePath,
      sourceText,
      sourceLocationMap,
      ensureFreshSourceLocationMap,
      latestSourceContext,
      persistedSourceText,
      persistedSourceLocationMap,
      preferPersistedLocation,
    });
    if (!payload) {
      return;
    }

    const now = Date.now();
    const nextSend = {
      targetId: payload.targetId,
      at: now,
    };

    if (shouldSuppressDuplicateSend(lastSendRef.current, nextSend)) {
      logSpacingOverlay('send-to-chat-suppressed', {
        targetId: payload.targetId,
        location: payload.location,
      });
      return;
    }

    lastSendRef.current = nextSend;

    onAppendToChatInput(payload.prompt);
    logSpacingOverlay('send-to-chat', {
      filePath,
      identity: payload.identity,
      location: payload.location,
      targetId: payload.targetId,
    });
  };

  useEffect(() => {
    if (!editor) {
      setSnapshot(null);
      return undefined;
    }

    const body = editor.Canvas?.getBody?.();
    const document = body?.ownerDocument;
    if (document && !document.getElementById(SPACING_ASSIST_STYLE_ID)) {
      const style = document.createElement('style');
      style.id = SPACING_ASSIST_STYLE_ID;
      style.textContent = `
        .ccui-spacing-overlay-hide-outlines .gjs-com-dashed,
        .ccui-spacing-overlay-hide-outlines .gjs-com-dashed * {
          outline: none !important;
          box-shadow: none !important;
        }
        .gjs-offset-v,
        .gjs-offset-fixed-v,
        .gjs-margin-v-el,
        .gjs-padding-v-el,
        .gjs-fixedmargin-v-el,
        .gjs-fixedpadding-v-el {
          display: none !important;
        }
        body[data-ccui-overlay-dragging="true"] .gjs-toolbar,
        body[data-ccui-overlay-dragging="true"] .gjs-badge {
          display: none !important;
        }
        .ccui-gjs-toolbar-send {
          display: inline-flex !important;
          align-items: center;
          justify-content: center;
          font-size: 0 !important;
        }
        .ccui-gjs-toolbar-send svg {
          width: 13px;
          height: 13px;
          pointer-events: none;
        }
      `;
      document.head.appendChild(style);
    }

    const updateSnapshot = () => {
      setSnapshot(buildSpacingSnapshot(editor));
    };

    const scheduleUpdate = () => {
      const win = editor.Canvas?.getBody?.()?.ownerDocument?.defaultView ?? window;
      if (rafRef.current !== null) {
        return;
      }

      rafRef.current = win.requestAnimationFrame(() => {
        rafRef.current = null;
        updateSnapshot();
      });
    };

    scheduleUpdate();

    const eventNames = [
      'component:selected',
      'component:deselected',
      'component:update',
      'component:styleUpdate',
      'undo',
      'redo',
      'canvas:frame:load',
    ];

    eventNames.forEach((eventName) => {
      editor.on?.(eventName, scheduleUpdate);
    });

    const win = editor.Canvas?.getBody?.()?.ownerDocument?.defaultView;
    const scrollListenerOptions = { capture: true, passive: true } as const;
    win?.addEventListener('scroll', scheduleUpdate, scrollListenerOptions);
    win?.addEventListener('resize', scheduleUpdate);

    return () => {
      eventNames.forEach((eventName) => {
        editor.off?.(eventName, scheduleUpdate);
      });
      win?.removeEventListener('scroll', scheduleUpdate, scrollListenerOptions);
      win?.removeEventListener('resize', scheduleUpdate);
      if (rafRef.current !== null) {
        win?.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      removeDragSessionListenersRef.current?.();
      removeDragSessionListenersRef.current = null;
      removePositionDragSessionListenersRef.current?.();
      removePositionDragSessionListenersRef.current = null;
      setCanvasDragChromeHidden(document, false);
      setCanvasChromeVisibility(document, false);
      dragStateRef.current = null;
      positionDragStateRef.current = null;
      setDragPreview(null);
      setPositionDragPreview(null);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) {
      return undefined;
    }

    const syncOutlineVisibility = () => {
      const body = editor.Canvas?.getBody?.();
      const document = body?.ownerDocument;
      const outlineVisibilityRoots = [body, document?.documentElement].filter(Boolean) as HTMLElement[];
      outlineVisibilityRoots.forEach((root) => {
        root.classList.toggle('ccui-spacing-overlay-hide-outlines', !showComponentOutlines);
      });
    };

    syncOutlineVisibility();
    editor.on?.('canvas:frame:load', syncOutlineVisibility);
    return () => {
      editor.off?.('canvas:frame:load', syncOutlineVisibility);
      const body = editor.Canvas?.getBody?.();
      const document = body?.ownerDocument;
      const outlineVisibilityRoots = [body, document?.documentElement].filter(Boolean) as HTMLElement[];
      outlineVisibilityRoots.forEach((root) => {
        root.classList.remove('ccui-spacing-overlay-hide-outlines');
      });
    };
  }, [editor, showComponentOutlines]);

  useEffect(() => {
    if (!editor || !onAppendToChatInput) {
      return;
    }

    return attachSpacingOverlayToolbarSync(editor, () => handleSendSelectionToChat());
  }, [editor, handleSendSelectionToChat, onAppendToChatInput]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    let detachMarqueeSelection = attachCanvasMarqueeSelection(editor as unknown as MarqueeSelectionEditor);
    const reattachMarqueeSelection = () => {
      detachMarqueeSelection();
      detachMarqueeSelection = attachCanvasMarqueeSelection(editor as unknown as MarqueeSelectionEditor);
    };

    editor.on?.('canvas:frame:load', reattachMarqueeSelection);
    return () => {
      editor.off?.('canvas:frame:load', reattachMarqueeSelection);
      detachMarqueeSelection();
    };
  }, [editor]);

  if (!snapshot) {
    return null;
  }

  const currentEditor = editor;
  if (!currentEditor) {
    return null;
  }

  const activeDragSide = dragPreview?.side ?? null;
  const visibleKinds = positionDragPreview ? [] : getVisibleSpacingKinds(dragPreview?.kind ?? null);
  const shouldShowPositionHandle = Boolean(snapshot.positionMode && !dragPreview && !positionDragPreview);
  const sideHighlightBox = dragPreview && activeDragSide
    ? buildSideHighlightBox(
      dragPreview.kind === 'margin' ? snapshot.marginBox : snapshot.borderBox,
      dragPreview.kind === 'margin' ? snapshot.borderBox : snapshot.paddingBox,
      activeDragSide,
    )
    : null;

  const startDragSession = (
    event: PointerEvent,
    currentTarget: HTMLButtonElement,
    kind: SpacingKind,
    side: SpacingSide,
    value: { value: string; unit: string },
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    currentTarget.setPointerCapture?.(event.pointerId);
    removeDragSessionListenersRef.current?.();

    const target = getSelectedComponent(currentEditor);
    logSpacingOverlay('pointer-down', {
      pointerId: event.pointerId,
      kind,
      side,
      startValue: value,
      targetId: String(target?.getId?.() ?? target?.get?.('id') ?? '').trim(),
    });

    dragStateRef.current = {
      pointerId: event.pointerId,
      kind,
      side,
      startX: event.clientX,
      startY: event.clientY,
      startValue: value,
      handle: currentTarget,
      target,
    };

    const doc = snapshot.portalRoot.ownerDocument;
    const win = doc?.defaultView;
    if (doc?.body) {
      doc.body.style.cursor = side === 'top' || side === 'bottom' ? 'ns-resize' : 'ew-resize';
      doc.body.style.userSelect = 'none';
    }
    setCanvasDragChromeHidden(doc, true);
    setCanvasChromeVisibility(doc, true);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== moveEvent.pointerId) {
        return;
      }

      const delta = getEdgeDragDelta(
        dragState.side,
        { x: dragState.startX, y: dragState.startY },
        { x: moveEvent.clientX, y: moveEvent.clientY },
      );
      const nextValue = applySpacingDragDelta(dragState.startValue, delta, {
        shiftKey: moveEvent.shiftKey,
        altKey: moveEvent.altKey,
      });
      const nextText = `${nextValue.value}${nextValue.unit}`;
      logSpacingOverlay('pointer-move', {
        pointerId: moveEvent.pointerId,
        kind: dragState.kind,
        side: dragState.side,
        delta,
        nextText,
      });
      setDragPreview({
        kind: dragState.kind,
        side: dragState.side,
        value: nextText,
        x: moveEvent.clientX,
        y: moveEvent.clientY,
      });

      const property = getSpacingProperty(dragState.kind, dragState.side);
      if (dragState.target) {
        applyInlineStyleToTarget(dragState.target, property, nextText);
      } else {
        onUpdateStyle({
          property,
          value: nextText,
          targetKind: 'inline',
        });
      }
    };

    const finishDragSession = (endEvent: PointerEvent | Event) => {
      const pointerId = 'pointerId' in endEvent ? endEvent.pointerId : dragStateRef.current?.pointerId;
      const dragState = dragStateRef.current;
      if (!dragState || (pointerId !== undefined && dragState.pointerId !== pointerId)) {
        return;
      }

      dragStateRef.current = null;
      setDragPreview(null);
      if (doc?.body) {
        doc.body.style.cursor = '';
        doc.body.style.userSelect = '';
      }
      setCanvasDragChromeHidden(doc, false);
      setCanvasChromeVisibility(doc, false);
      if (pointerId !== undefined) {
        dragState.handle?.releasePointerCapture?.(pointerId);
      }
      logSpacingOverlay('pointer-up', {
        pointerId: pointerId ?? null,
        kind: dragState.kind,
        side: dragState.side,
      });
      removeDragSessionListenersRef.current?.();
      removeDragSessionListenersRef.current = null;
    };

    const handle = currentTarget;
    const dragMoveListenerOptions: AddEventListenerOptions = { passive: true };
    handle.addEventListener('pointermove', handlePointerMove, dragMoveListenerOptions);
    handle.addEventListener('pointerup', finishDragSession as EventListener);
    handle.addEventListener('pointercancel', finishDragSession as EventListener);
    handle.addEventListener('lostpointercapture', finishDragSession as EventListener);
    win?.addEventListener('pointermove', handlePointerMove, dragMoveListenerOptions);
    win?.addEventListener('pointerup', finishDragSession as EventListener);
    win?.addEventListener('pointercancel', finishDragSession as EventListener);

    removeDragSessionListenersRef.current = () => {
      handle.removeEventListener('pointermove', handlePointerMove, dragMoveListenerOptions);
      handle.removeEventListener('pointerup', finishDragSession as EventListener);
      handle.removeEventListener('pointercancel', finishDragSession as EventListener);
      handle.removeEventListener('lostpointercapture', finishDragSession as EventListener);
      win?.removeEventListener('pointermove', handlePointerMove, dragMoveListenerOptions);
      win?.removeEventListener('pointerup', finishDragSession as EventListener);
      win?.removeEventListener('pointercancel', finishDragSession as EventListener);
    };
  };

  const startPositionDragSession = (
    event: PointerEvent,
    currentTarget: HTMLButtonElement,
  ) => {
    if (!snapshot.positionMode) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    currentTarget.setPointerCapture?.(event.pointerId);
    removePositionDragSessionListenersRef.current?.();

    const target = getSelectedComponent(currentEditor);
    const targetElement = target?.getEl?.() as HTMLElement | null | undefined;
    if (!targetElement) {
      return;
    }

    const computed = snapshot.portalRoot.ownerDocument.defaultView?.getComputedStyle?.(targetElement);
    if (!computed) {
      return;
    }

    const startValue = readPositionDragValue(targetElement, computed, snapshot.borderBox, snapshot.positionMode);
    logSpacingOverlay('position-pointer-down', {
      pointerId: event.pointerId,
      position: snapshot.positionMode,
      targetId: String(target?.getId?.() ?? target?.get?.('id') ?? '').trim(),
      startValue,
    });

    positionDragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startValue,
      handle: currentTarget,
      target,
    };

    const doc = snapshot.portalRoot.ownerDocument;
    const win = doc.defaultView;
    if (doc.body) {
      doc.body.style.cursor = 'grabbing';
      doc.body.style.userSelect = 'none';
    }
    setCanvasDragChromeHidden(doc, true);
    setCanvasChromeVisibility(doc, true);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dragState = positionDragStateRef.current;
      if (!dragState || dragState.pointerId !== moveEvent.pointerId) {
        return;
      }

      const nextValue = applyPositionDragDelta(dragState.startValue, {
        x: moveEvent.clientX - dragState.startX,
        y: moveEvent.clientY - dragState.startY,
      });
      const nextPreview = {
        left: `${nextValue.left.value}${nextValue.left.unit}`,
        top: `${nextValue.top.value}${nextValue.top.unit}`,
        x: moveEvent.clientX,
        y: moveEvent.clientY,
      };

      logSpacingOverlay('position-pointer-move', {
        pointerId: moveEvent.pointerId,
        left: nextPreview.left,
        top: nextPreview.top,
      });
      setPositionDragPreview(nextPreview);
      applyPositionStylesToTarget(dragState.target, nextValue);
    };

    const finishDragSession = (endEvent: PointerEvent | Event) => {
      const pointerId = 'pointerId' in endEvent ? endEvent.pointerId : positionDragStateRef.current?.pointerId;
      const dragState = positionDragStateRef.current;
      if (!dragState || (pointerId !== undefined && dragState.pointerId !== pointerId)) {
        return;
      }

      positionDragStateRef.current = null;
      setPositionDragPreview(null);
      if (doc.body) {
        doc.body.style.cursor = '';
        doc.body.style.userSelect = '';
      }
      setCanvasDragChromeHidden(doc, false);
      setCanvasChromeVisibility(doc, false);
      if (pointerId !== undefined) {
        dragState.handle?.releasePointerCapture?.(pointerId);
      }
      logSpacingOverlay('position-pointer-up', {
        pointerId: pointerId ?? null,
      });
      removePositionDragSessionListenersRef.current?.();
      removePositionDragSessionListenersRef.current = null;
    };

    const handle = currentTarget;
    const positionMoveListenerOptions: AddEventListenerOptions = { passive: true };
    handle.addEventListener('pointermove', handlePointerMove, positionMoveListenerOptions);
    handle.addEventListener('pointerup', finishDragSession as EventListener);
    handle.addEventListener('pointercancel', finishDragSession as EventListener);
    handle.addEventListener('lostpointercapture', finishDragSession as EventListener);
    win?.addEventListener('pointermove', handlePointerMove, positionMoveListenerOptions);
    win?.addEventListener('pointerup', finishDragSession as EventListener);
    win?.addEventListener('pointercancel', finishDragSession as EventListener);

    removePositionDragSessionListenersRef.current = () => {
      handle.removeEventListener('pointermove', handlePointerMove, positionMoveListenerOptions);
      handle.removeEventListener('pointerup', finishDragSession as EventListener);
      handle.removeEventListener('pointercancel', finishDragSession as EventListener);
      handle.removeEventListener('lostpointercapture', finishDragSession as EventListener);
      win?.removeEventListener('pointermove', handlePointerMove, positionMoveListenerOptions);
      win?.removeEventListener('pointerup', finishDragSession as EventListener);
      win?.removeEventListener('pointercancel', finishDragSession as EventListener);
    };
  };

  return createPortal(
    <div
      aria-hidden="true"
      data-spacing-overlay="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483646,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: snapshot.borderBox.left,
          top: snapshot.borderBox.top,
          width: snapshot.borderBox.width,
          height: snapshot.borderBox.height,
          border: '1px solid rgba(148, 163, 184, 0.8)',
          boxSizing: 'border-box',
          pointerEvents: 'none',
        }}
      />

      {shouldShowPositionHandle ? (
        <PositionDragHandle
          box={snapshot.borderBox}
          isDragging={Boolean(positionDragPreview)}
          onPointerDown={startPositionDragSession}
          showDragSurface={Boolean(snapshot.positionMode)}
        />
      ) : null}

      {visibleKinds.includes('margin') ? (
        <OverlayFrame
          kind="margin"
          anchorBox={snapshot.borderBox}
          activeSide={dragPreview?.kind === 'margin' ? activeDragSide : null}
          tone="margin"
          label="外边距"
          value={snapshot.margin}
          placement="outer"
          onDragStart={(event, currentTarget, kind, side, value) => {
            startDragSession(event, currentTarget, kind, side, value);
          }}
        />
      ) : null}
      {visibleKinds.includes('padding') ? (
        <OverlayFrame
          kind="padding"
          anchorBox={snapshot.borderBox}
          activeSide={dragPreview?.kind === 'padding' ? activeDragSide : null}
          tone="padding"
          label="内边距"
          value={snapshot.padding}
          placement="inner"
          onDragStart={(event, currentTarget, kind, side, value) => {
            startDragSession(event, currentTarget, kind, side, value);
          }}
        />
      ) : null}

      {dragPreview && sideHighlightBox && sideHighlightBox.width > 0 && sideHighlightBox.height > 0 ? (
        <div
          style={{
            position: 'absolute',
            left: sideHighlightBox.left,
            top: sideHighlightBox.top,
            width: sideHighlightBox.width,
            height: sideHighlightBox.height,
            background: dragPreview.kind === 'margin' ? 'rgba(251, 191, 36, 0.36)' : 'rgba(96, 165, 250, 0.32)',
            border: `1px solid ${dragPreview.kind === 'margin' ? 'rgba(251, 146, 60, 0.9)' : 'rgba(59, 130, 246, 0.9)'}`,
            boxSizing: 'border-box',
            pointerEvents: 'none',
          }}
        />
      ) : null}

      {dragPreview ? (
        <div
          style={{
            position: 'fixed',
            left: dragPreview.x,
            top: dragPreview.y,
            zIndex: 2147483647,
            pointerEvents: 'none',
            transform: 'translate(-50%, -128%)',
          }}
        >
          <div
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              borderRadius: 999,
              padding: '10px 14px',
              background: 'rgba(15, 23, 42, 0.96)',
              color: '#fff',
              boxShadow: '0 16px 36px rgba(15, 23, 42, 0.34)',
              border: `1px solid ${HANDLE_COLORS[dragPreview.kind]}`,
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              letterSpacing: '0.01em',
            }}
          >
            <span
              style={{
                position: 'absolute',
                left: '50%',
                bottom: -6,
                width: 10,
                height: 10,
                background: 'rgba(15, 23, 42, 0.96)',
                borderRight: `1px solid ${HANDLE_COLORS[dragPreview.kind]}`,
                borderBottom: `1px solid ${HANDLE_COLORS[dragPreview.kind]}`,
                transform: 'translateX(-50%) rotate(45deg)',
              }}
            />
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 20,
                height: 20,
                borderRadius: 999,
                background: HANDLE_COLORS[dragPreview.kind],
                color: '#fff',
                fontSize: 12,
                boxShadow: '0 0 0 3px rgba(255, 255, 255, 0.14), 0 0 0 5px rgba(15, 23, 42, 0.12)',
              }}
            >
              {dragPreview.kind === 'margin' ? 'M' : 'P'}
            </span>
            <span>
              {dragPreview.kind === 'margin' ? '外边距' : '内边距'}
              {' '}
              {dragPreview.side === 'top' ? '上' : dragPreview.side === 'right' ? '右' : dragPreview.side === 'bottom' ? '下' : '左'}
            </span>
            <span style={{ opacity: 0.8, fontVariantNumeric: 'tabular-nums' }}>{dragPreview.value}</span>
          </div>
        </div>
      ) : null}

      {positionDragPreview ? (
        <div
          style={{
            position: 'fixed',
            left: positionDragPreview.x,
            top: positionDragPreview.y,
            zIndex: 2147483647,
            pointerEvents: 'none',
            transform: 'translate(-50%, -128%)',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              borderRadius: 999,
              padding: '8px 12px',
              background: 'rgba(15, 23, 42, 0.96)',
              color: '#fff',
              boxShadow: '0 16px 36px rgba(15, 23, 42, 0.34)',
              border: '1px solid rgba(56, 189, 248, 0.9)',
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              letterSpacing: '0.01em',
            }}
          >
            <span style={{ opacity: 0.72 }}>定位</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {getPositionDragPreviewLabel({
                left: positionDragPreview.left,
                top: positionDragPreview.top,
              })}
            </span>
          </div>
        </div>
      ) : null}
    </div>,
    snapshot.portalRoot,
  );
}

function PositionDragHandle({
  box,
  isDragging,
  onPointerDown,
  showDragSurface,
}: {
  box: { left: number; top: number; width: number; height: number };
  isDragging: boolean;
  onPointerDown: (event: PointerEvent, currentTarget: HTMLButtonElement) => void;
  showDragSurface: boolean;
}) {
  return (
    <>
      {showDragSurface ? (
        <SpacingHandleButton
          ariaLabel="绝对定位，可拖动调整位置"
          title="绝对定位，可拖动调整位置"
          cursor={getPositionDragCursor(isDragging)}
          dataPositionDragHandle="true"
          style={{
            position: 'absolute',
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
            border: 'none',
            background: 'transparent',
            padding: 0,
            pointerEvents: 'auto',
            touchAction: 'none',
          }}
          onPointerDown={onPointerDown}
        >
          <span style={{ display: 'none' }}>定</span>
        </SpacingHandleButton>
      ) : null}
    </>
  );
}

function OverlayFrame({
  kind,
  anchorBox,
  activeSide,
  tone,
  label,
  value,
  placement,
  onDragStart,
}: {
  kind: SpacingKind;
  anchorBox: { left: number; top: number; width: number; height: number };
  activeSide: SpacingSide | null;
  tone: SpacingKind;
  label: string;
  value: SpacingBoxMetrics;
  placement: 'outer' | 'inner';
  onDragStart: (event: PointerEvent, currentTarget: HTMLButtonElement, kind: SpacingKind, side: SpacingSide, value: { value: string; unit: string }) => void;
}) {
  const frameColor = tone === 'margin' ? 'rgba(255, 196, 132, 0.98)' : 'rgba(195, 255, 154, 0.98)';
  const slotColor = 'rgba(255, 255, 255, 0.96)';
  const sides: Array<{ side: SpacingSide; axis: 'horizontal' | 'vertical' }> = [
    { side: 'top', axis: 'horizontal' },
    { side: 'right', axis: 'vertical' },
    { side: 'bottom', axis: 'horizontal' },
    { side: 'left', axis: 'vertical' },
  ];
  const values: Record<SpacingSide, { value: string; unit: string }> = {
    top: { value: value.top, unit: value.unit },
    right: { value: value.right, unit: value.unit },
    bottom: { value: value.bottom, unit: value.unit },
    left: { value: value.left, unit: value.unit },
  };
  const hitSize = 22;
  const knobWidth = 10;
  const knobHeight = 24;
  const visibleSides = getVisibleSpacingHandleSides(activeSide);
  const slotOffset = placement === 'outer' ? -8 : 8;

  return (
    <div
      style={{
        position: 'absolute',
        left: anchorBox.left,
        top: anchorBox.top,
        width: anchorBox.width,
        height: anchorBox.height,
        boxSizing: 'border-box',
        pointerEvents: 'none',
      }}
    >
      {sides
        .filter(({ side }) => visibleSides.includes(side))
        .map(({ side, axis }) => {
        const sideLabel = side === 'top' ? '上' : side === 'right' ? '右' : side === 'bottom' ? '下' : '左';
        const chipStyle = axis === 'horizontal'
          ? {
              left: anchorBox.width / 2,
              top: side === 'top' ? slotOffset : anchorBox.height - slotOffset,
              transform: 'translate(-50%, -50%)',
            }
          : {
              left: side === 'left' ? slotOffset : anchorBox.width - slotOffset,
              top: anchorBox.height / 2,
              transform: 'translate(-50%, -50%)',
            };
        const isHorizontal = axis === 'horizontal';

        return (
          <SpacingHandleButton
            key={`${kind}-${side}`}
            ariaLabel={`${label}${sideLabel}`}
            title={`${label}${sideLabel}`}
            cursor={isHorizontal ? 'ns-resize' : 'ew-resize'}
            style={{
              position: 'absolute',
              pointerEvents: 'auto',
              border: 'none',
              background: 'transparent',
              padding: 0,
              touchAction: 'none',
              width: isHorizontal ? knobHeight : hitSize,
              height: isHorizontal ? hitSize : knobHeight,
              zIndex: 2,
              ...chipStyle,
            }}
            onPointerDown={(event, currentTarget) => {
              onDragStart(event, currentTarget, tone, side, values[side]);
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: isHorizontal ? knobHeight : knobWidth,
                height: isHorizontal ? knobWidth : knobHeight,
                borderRadius: 6,
                background: slotColor,
                border: '1px solid rgba(15, 23, 42, 0.16)',
                boxShadow: '0 2px 6px rgba(15, 23, 42, 0.16)',
              }}
            >
              <span
                style={{
                  width: isHorizontal ? 14 : 4,
                  height: isHorizontal ? 4 : 14,
                  borderRadius: 999,
                  background: frameColor,
                  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.7)',
                }}
              />
            </span>
          </SpacingHandleButton>
        );
      })}
    </div>
  );
}

function SpacingHandleButton({
  ariaLabel,
  title,
  cursor,
  style,
  onPointerDown,
  dataPositionDragHandle,
  children,
}: {
  ariaLabel: string;
  title: string;
  cursor: string;
  style: CSSProperties;
  onPointerDown: (event: PointerEvent, currentTarget: HTMLButtonElement) => void;
  dataPositionDragHandle?: string;
  children: ReactNode;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const button = buttonRef.current;
    if (!button) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      onPointerDown(event, button);
    };

    button.addEventListener('pointerdown', handlePointerDown);
    return () => {
      button.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [onPointerDown]);

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={ariaLabel}
      title={title}
      className="ccui-spacing-handle"
      data-position-drag-handle={dataPositionDragHandle}
      style={{ ...style, cursor }}
    >
      {children}
    </button>
  );
}
