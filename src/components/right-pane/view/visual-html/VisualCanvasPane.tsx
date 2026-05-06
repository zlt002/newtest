import grapesjs from 'grapesjs';
import 'grapesjs/dist/css/grapes.min.css';
import './VisualCanvasPane.css';
import { useEffect, useRef } from 'react';
import {
  injectCanvasHeadMarkup,
  resolveCanvasBody,
  resolveCanvasDocument,
  rewriteCanvasHeadAssetUrls,
} from './canvasHeadMarkup';
import { registerVisualHtmlBlocks } from './grapesjsBlockRegistry';
import { registerVisualHtmlComponentTypes } from './grapesjsComponentRegistry';
import grapesjsZhCn from './grapesjsZhCn';

type VisualCanvasPaneProps = {
  fullHtml: string;
  assetBaseUrl?: string | null;
  showHiddenLayers?: boolean;
  hiddenLayerFilter?: HiddenLayerFilter;
  onEditorReady?: (editor: ReturnType<typeof grapesjs.init> | null) => void;
  onDirtyChange?: (isDirty: boolean, editor: ReturnType<typeof grapesjs.init>) => void;
};

const RAW_CANVAS_STYLE_ATTRIBUTE = 'data-ccui-raw-canvas-style';
const HIDDEN_LAYER_EDIT_STYLE_ATTRIBUTE = 'data-ccui-hidden-layer-edit-style';
const HIDDEN_LAYER_PREVIEW_ATTRIBUTE = 'data-ccui-hidden-layer-preview';
const HIDDEN_LAYER_ORIGINAL_STYLE_ATTRIBUTE = 'data-ccui-hidden-layer-original-style';
const HIDDEN_LAYER_PASS_THROUGH_ATTRIBUTE = 'data-ccui-hidden-layer-pass-through';
const NON_VISUAL_HIDDEN_LAYER_TAG_NAMES = new Set([
  'base',
  'link',
  'meta',
  'noscript',
  'script',
  'style',
  'template',
  'title',
]);
type HiddenLayerDisplayMode = 'block' | 'flex' | 'grid' | 'inline-flex' | 'table-row' | 'table-header-group' | 'table-row-group' | 'table-footer-group' | 'table-cell' | 'list-item';
type HiddenLayerReason = 'display-none' | 'visibility-hidden' | 'opacity-zero' | 'zero-size' | 'offscreen' | 'ancestor-hidden';
type HiddenLayerFilter = {
  reasons: HiddenLayerReason[];
  includeInternal: boolean;
  includeDescendants: boolean;
  textQuery: string;
};
type HiddenLayerRecord = {
  element: HTMLElement;
  reason: HiddenLayerReason;
  isCanvasInternal: boolean;
  hasHiddenAncestor: boolean;
  computedStyle: CSSStyleDeclaration;
};

function isCanvasPerfDebugEnabled() {
  return (globalThis as typeof globalThis & { CCUI_DEBUG_VISUAL_CANVAS_PERF?: boolean }).CCUI_DEBUG_VISUAL_CANVAS_PERF === true;
}

function getPerfNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }

  return Date.now();
}

function logCanvasPerf(stage: string, payload: Record<string, unknown> = {}) {
  if (!isCanvasPerfDebugEnabled()) {
    return;
  }

  console.info('[VisualCanvasPerf]', {
    stage,
    at: new Date().toISOString(),
    ...payload,
  });
}

function logHiddenLayerDebug(payload: Record<string, unknown>) {
  if (!isCanvasPerfDebugEnabled()) {
    return;
  }

  console.info('[VisualCanvasHiddenLayers]', {
    at: new Date().toISOString(),
    ...payload,
  });
}

function collectCanvasHeadDebugSummary(canvasDocument: Document) {
  const headElements = Array.from(canvasDocument.head?.children ?? []);
  const assetUrls = headElements
    .flatMap((element) => {
      if (!(element instanceof canvasDocument.defaultView!.HTMLElement)) {
        return [];
      }

      const tagName = element.tagName.toLowerCase();
      const url = element.getAttribute('href')?.trim() || element.getAttribute('src')?.trim() || '';
      return url ? [`${tagName}:${url}`] : [];
    })
    .slice(0, 40);
  const managedHeadNodes = canvasDocument.head?.querySelectorAll('[data-ccui-canvas-head-node]').length ?? 0;
  const rawStyleNodes = canvasDocument.head?.querySelectorAll(`[${RAW_CANVAS_STYLE_ATTRIBUTE}]`).length ?? 0;

  return {
    baseURI: canvasDocument.baseURI,
    headChildCount: headElements.length,
    styleTagCount: canvasDocument.head?.querySelectorAll('style').length ?? 0,
    scriptTagCount: canvasDocument.head?.querySelectorAll('script').length ?? 0,
    linkTagCount: canvasDocument.head?.querySelectorAll('link').length ?? 0,
    baseTagCount: canvasDocument.head?.querySelectorAll('base').length ?? 0,
    managedHeadNodeCount: managedHeadNodes,
    rawCanvasStyleNodeCount: rawStyleNodes,
    assetUrls: assetUrls,
    headTagSummary: headElements
      .slice(0, 40)
      .map((element) => {
        const tagName = element.tagName.toLowerCase();
        const managed = element.hasAttribute('data-ccui-canvas-head-node') ? ':managed' : '';
        const raw = element.hasAttribute(RAW_CANVAS_STYLE_ATTRIBUTE) ? ':raw-style' : '';
        return `${tagName}${managed}${raw}`;
      }),
  };
}

function extractRootCustomProperties(fullHtml: string): Record<string, string> {
  const styleContents = Array.from(fullHtml.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi))
    .map((match) => match[1] ?? '')
    .filter(Boolean);

  const declarations: Record<string, string> = {};
  styleContents.forEach((cssText) => {
    Array.from(cssText.matchAll(/:root\s*{([\s\S]*?)}/gi)).forEach((match) => {
      const blockText = match[1] ?? '';
      Array.from(blockText.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)).forEach((declarationMatch) => {
        const propertyName = declarationMatch[1]?.trim();
        const propertyValue = declarationMatch[2]?.trim();
        if (propertyName && propertyValue) {
          declarations[propertyName] = propertyValue;
        }
      });
    });
  });

  return declarations;
}

function serializeCustomProperties(customProperties: Record<string, string>): string {
  return Object.entries(customProperties)
    .map(([propertyName, propertyValue]) => `${propertyName}: ${propertyValue};`)
    .join(' ');
}

function inlineCustomPropertyReferences(fullHtml: string, customProperties: Record<string, string>): string {
  if (Object.keys(customProperties).length === 0) {
    return fullHtml;
  }

  return fullHtml.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (_match, propertyName: string, fallbackValue: string | undefined) => (
    customProperties[propertyName] ?? fallbackValue?.trim() ?? _match
  ));
}

function appendInlineStyleAttribute(tagSource: string, declarations: string): string {
  if (!declarations.trim()) {
    return tagSource;
  }

  if (/\bstyle\s*=/i.test(tagSource)) {
    return tagSource.replace(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/i, (_match, quote: string, styleText: string) => {
      const trimmed = styleText.trim();
      const separator = trimmed && !trimmed.endsWith(';') ? '; ' : ' ';
      return `style=${quote}${trimmed}${separator}${declarations}${quote}`;
    });
  }

  return tagSource.replace(/>$/, ` style="${declarations}">`);
}

function stripCanvasSecurityPolicyMeta(fullHtml: string): string {
  return fullHtml.replace(
    /<meta\b(?=[^>]*\bhttp-equiv\s*=\s*(["'])?Content-Security-Policy\1?)[^>]*>/gi,
    '',
  );
}

function normalizeDesignCanvasHtml(fullHtml: string): string {
  // 仅移除 CSP meta 标签，保留原始 CSS 变量定义
  // 完整 head 样式（含 CSS 变量）由 createCanvasStructureHtml 传入 GrapesJS，
  // 浏览器原生支持 var() 解析，无需手动内联
  return stripCanvasSecurityPolicyMeta(fullHtml);
}

function collectStyleMarkup(fullHtml: string): string {
  return Array.from(fullHtml.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi))
    .map((match) => match[0] ?? '')
    .filter(Boolean)
    .join('\n');
}

function stripHeadRuntimeMarkup(markup: string): string {
  return markup
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .trim();
}

function stripCanvasStructureRuntimeMarkup(markup: string): string {
  const strippedMarkup = markup
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<meta\b[^>]*>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<base\b[^>]*>/gi, '')
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
    .trim();

  if (typeof DOMParser === 'undefined') {
    return strippedMarkup;
  }

  const parsed = new DOMParser().parseFromString(`<body>${strippedMarkup}</body>`, 'text/html');
  return parsed.body.innerHTML.trim();
}

function readTagAttributes(fullHtml: string, tagName: 'html' | 'body'): string {
  const match = fullHtml.match(new RegExp(`<${tagName}\\b([^>]*)>`, 'i'));
  return match?.[1]?.trim() ? ` ${match[1].trim()}` : '';
}

function readBodyMarkup(fullHtml: string): string {
  return fullHtml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? fullHtml;
}

function collectCanvasHeadMarkup(fullHtml: string): string {
  const headMarkup = fullHtml.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? '';
  return stripHeadRuntimeMarkup(headMarkup);
}

function readRawHeadContent(fullHtml: string): string {
  return fullHtml.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1]?.trim() ?? '';
}

function createCanvasStructureHtml(fullHtml: string): string {
  const htmlAttributes = readTagAttributes(fullHtml, 'html');
  const bodyAttributes = readTagAttributes(fullHtml, 'body');
  const bodyMarkup = stripCanvasStructureRuntimeMarkup(readBodyMarkup(fullHtml));
  const headMarkup = readRawHeadContent(fullHtml);

  return `<!doctype html>
<html${htmlAttributes}>
<head>
${headMarkup}
</head>
<body${bodyAttributes}>
${bodyMarkup}
</body>
</html>`;
}

type OriginalElementSnapshot = {
  path: number[];
  tagName: string;
  className: string;
  text: string;
  attributes: Record<string, string>;
};

type OriginalElementRestoreResult = {
  snapshots: number;
  matched: number;
  classUpdates: number;
  styleUpdates: number;
  attributeUpdates: number;
  domUpdates: number;
  durationMs: number;
};

type OriginalElementRestoreOptions = {
  syncComponentModels?: boolean;
};

function normalizeOriginalElementFingerprintText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function readOriginalElementAttributes(element: Element): Record<string, string> {
  return Array.from(element.attributes).reduce<Record<string, string>>((attributes, { name, value }) => {
    const normalizedName = name.toLowerCase();
    if (!normalizedName.startsWith('data-gjs-') && !normalizedName.startsWith('gjs-')) {
      attributes[name] = value;
    }

    return attributes;
  }, {});
}

function collectOriginalElementSnapshots(fullHtml: string): OriginalElementSnapshot[] {
  if (typeof DOMParser === 'undefined') {
    return [];
  }

  const parsed = new DOMParser().parseFromString(fullHtml, 'text/html');
  const snapshots: OriginalElementSnapshot[] = [];
  const visit = (element: Element, path: number[]) => {
    const attributes = readOriginalElementAttributes(element);
    if (Object.keys(attributes).length > 0) {
      snapshots.push({
        path,
        tagName: element.tagName.toLowerCase(),
        className: element.getAttribute('class')?.trim() ?? '',
        text: normalizeOriginalElementFingerprintText(element.textContent ?? ''),
        attributes,
      });
    }

    Array.from(element.children).forEach((child, index) => visit(child, [...path, index]));
  };

  visit(parsed.body, []);
  return snapshots;
}

function findCanvasElementByPath(root: ParentNode | null | undefined, path: number[], tagName: string): Element | null {
  if (path.length === 0) {
    const rootElement = root as Element | null | undefined;
    return typeof rootElement?.tagName === 'string' && rootElement.tagName.toLowerCase() === tagName ? rootElement : null;
  }

  let current: Element | null = null;
  let parent: ParentNode | null | undefined = root;

  for (const index of path) {
    const next = parent?.children.item(index);
    if (!next) {
      return null;
    }

    current = next;
    parent = next;
  }

  return current?.tagName.toLowerCase() === tagName ? current : null;
}

function hasMatchingClassList(element: Element, className: string): boolean {
  const expectedClasses = className.split(/\s+/).filter(Boolean);
  return expectedClasses.length === 0 || expectedClasses.every((classEntry) => element.classList.contains(classEntry));
}

function scoreOriginalElementCandidate(element: Element, snapshot: OriginalElementSnapshot): number {
  if (element.tagName.toLowerCase() !== snapshot.tagName) {
    return -1;
  }

  let score = 1;
  const snapshotId = snapshot.attributes.id;
  if (snapshotId) {
    return element.getAttribute('id') === snapshotId ? 100 : -1;
  }

  if (snapshot.className) {
    if (!hasMatchingClassList(element, snapshot.className)) {
      return -1;
    }

    score += 8;
  }

  Object.entries(snapshot.attributes).forEach(([name, value]) => {
    if (name === 'class') {
      return;
    }

    if (element.getAttribute(name) === value) {
      score += 12;
    }
  });

  const snapshotText = snapshot.text;
  if (snapshotText) {
    const elementText = normalizeOriginalElementFingerprintText(element.textContent ?? '');
    if (elementText === snapshotText) {
      score += 24;
    } else if (elementText.includes(snapshotText) || snapshotText.includes(elementText)) {
      score += 8;
    }
  }

  return score;
}

function findCanvasElementByFingerprint(root: ParentNode | null | undefined, snapshot: OriginalElementSnapshot): Element | null {
  if (!root) {
    return null;
  }

  const candidates = Array.from(root.querySelectorAll(snapshot.tagName));
  let bestCandidate: Element | null = null;
  let bestScore = 0;
  candidates.forEach((candidate) => {
    const score = scoreOriginalElementCandidate(candidate, snapshot);
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  });

  return bestScore >= 9 ? bestCandidate : null;
}

function parseInlineStyleRecord(styleText: string): Record<string, string> {
  return styleText
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((style, declaration) => {
      const separatorIndex = declaration.indexOf(':');
      if (separatorIndex <= 0) {
        return style;
      }

      const property = declaration.slice(0, separatorIndex).trim();
      const value = declaration.slice(separatorIndex + 1).trim();
      if (property && value) {
        style[property] = value;
      }

      return style;
    }, {});
}

function collectComponentByElement(component: any, result: Map<Element, any>) {
  if (!component) {
    return;
  }

  const element = component.getEl?.();
  if (element) {
    result.set(element, component);
  }

  const children = component.components?.();
  const childModels = typeof children?.models !== 'undefined' ? children.models : children;
  for (const child of Array.from(childModels ?? [])) {
    collectComponentByElement(child, result);
  }
}

function buildComponentByElementMap(component: any): Map<Element, any> {
  const result = new Map<Element, any>();
  collectComponentByElement(component, result);
  return result;
}

function splitOriginalElementAttributes(attributes: Record<string, string>) {
  const { class: className, style: styleText, ...restAttributes } = attributes;
  return {
    className: className?.trim() ?? '',
    styleText: styleText?.trim() ?? '',
    restAttributes,
  };
}

function normalizeClassAttribute(value: string): string {
  return value.split(/\s+/).filter(Boolean).join(' ');
}

function readComponentClassAttribute(component: any): string {
  const classes = component?.getClasses?.() ?? [];
  return classes.map((entry: string | { get?: (key: string) => unknown }) => (
    typeof entry === 'string' ? entry : String(entry?.get?.('name') ?? entry?.get?.('label') ?? '')
  )).filter(Boolean).join(' ');
}

function readComponentInlineStyleRecord(component: any): Record<string, string> {
  const style = component?.getStyle?.({ inline: true }) ?? component?.getStyle?.() ?? {};
  return Object.entries(style).reduce<Record<string, string>>((record, [property, value]) => {
    const nextValue = String(value ?? '').trim();
    if (nextValue) {
      record[property] = nextValue;
    }

    return record;
  }, {});
}

function collectChangedAttributes(element: Element, attributes: Record<string, string>): Record<string, string> {
  return Object.entries(attributes).reduce<Record<string, string>>((changedAttributes, [name, value]) => {
    if (element.getAttribute(name) !== value) {
      changedAttributes[name] = value;
    }

    return changedAttributes;
  }, {});
}

// Layout-affecting CSS properties that could cause unexpected canvas collapse
// if auto-restored during component selection. These are handled by GrapesJS's
// own style system and should not be blindly restored from original inline styles.
const LAYOUT_AFFECTING_STYLE_PROPERTIES = new Set([
  'width', 'height',
  'max-width', 'maxWidth', 'max-height', 'maxHeight',
  'min-width', 'minWidth', 'min-height', 'minHeight',
  'display', 'position', 'float', 'clear',
  'top', 'right', 'bottom', 'left',
  'margin-top', 'marginTop', 'margin-right', 'marginRight',
  'margin-bottom', 'marginBottom', 'margin-left', 'marginLeft',
  'padding-top', 'paddingTop', 'padding-right', 'paddingRight',
  'padding-bottom', 'paddingBottom', 'padding-left', 'paddingLeft',
  'overflow', 'overflow-x', 'overflowX', 'overflow-y', 'overflowY',
  'z-index', 'zIndex',
]);

function collectMissingStyleRecord(
  sourceStyle: Record<string, string>,
  componentStyle: Record<string, string>,
  elementStyle: Record<string, string>,
): Record<string, string> {
  return Object.entries(sourceStyle).reduce<Record<string, string>>((missingStyle, [property, value]) => {
    if (!componentStyle[property] && !elementStyle[property]) {
      // Skip layout-affecting properties to prevent unexpected dimension changes
      // that could collapse the canvas content. GrapesJS manages these through
      // its own style system.
      if (!LAYOUT_AFFECTING_STYLE_PROPERTIES.has(property)) {
        missingStyle[property] = value;
      }
    }

    return missingStyle;
  }, {});
}

function restoreOriginalElementAttributes(
  editor: ReturnType<typeof grapesjs.init>,
  snapshots: OriginalElementSnapshot[],
  options: OriginalElementRestoreOptions = {},
): OriginalElementRestoreResult {
  const startedAt = getPerfNow();
  const result: OriginalElementRestoreResult = {
    snapshots: snapshots.length,
    matched: 0,
    classUpdates: 0,
    styleUpdates: 0,
    attributeUpdates: 0,
    domUpdates: 0,
    durationMs: 0,
  };

  if (snapshots.length === 0) {
    return result;
  }

  const canvasBody = resolveCanvasBody(editor);
  const wrapper = editor.getWrapper?.();
  const syncComponentModels = options.syncComponentModels === true;
  const componentByElement = syncComponentModels ? buildComponentByElementMap(wrapper) : new Map<Element, any>();
  snapshots.forEach((snapshot) => {
    const pathElement = findCanvasElementByPath(canvasBody, snapshot.path, snapshot.tagName);
    const element = pathElement ?? findCanvasElementByFingerprint(canvasBody, snapshot);
    if (!element) {
      return;
    }

    result.matched += 1;
    const component = componentByElement.get(element);
    const { className, styleText, restAttributes } = splitOriginalElementAttributes(snapshot.attributes);
    const styleRecord = parseInlineStyleRecord(styleText);
    if (
      component
      && className
      && normalizeClassAttribute(readComponentClassAttribute(component)) !== normalizeClassAttribute(className)
    ) {
      component.setClass?.(className, { avoidStore: true, noUndo: true });
      result.classUpdates += 1;
    }

    if (component && styleText && element.getAttribute('style') !== styleText && Object.keys(styleRecord).length > 0) {
      component.addStyle?.(styleRecord, { avoidStore: true, noUndo: true });
      result.styleUpdates += 1;
    }

    const changedRestAttributes = collectChangedAttributes(element, restAttributes);
    if (component && Object.keys(changedRestAttributes).length > 0) {
      component.addAttributes?.(changedRestAttributes, { avoidStore: true, noUndo: true });
      result.attributeUpdates += Object.keys(changedRestAttributes).length;
    }

    const changedDomAttributes = collectChangedAttributes(element, snapshot.attributes);
    Object.entries(changedDomAttributes).forEach(([name, value]) => {
      element.setAttribute(name, value);
    });
    result.domUpdates += Object.keys(changedDomAttributes).length;
  });

  result.durationMs = Math.round(getPerfNow() - startedAt);
  return result;
}

function findOriginalElementSnapshotForCanvasElement(
  canvasBody: ParentNode | null | undefined,
  snapshots: OriginalElementSnapshot[],
  element: Element,
): OriginalElementSnapshot | null {
  for (const snapshot of snapshots) {
    const pathElement = findCanvasElementByPath(canvasBody, snapshot.path, snapshot.tagName);
    if (pathElement === element) {
      return snapshot;
    }
  }

  return null;
}

function syncOriginalAttributesForComponent(
  editor: ReturnType<typeof grapesjs.init>,
  component: any,
  snapshots: OriginalElementSnapshot[],
) {
  const element = component?.getEl?.();
  if (!element) {
    return;
  }

  const snapshot = findOriginalElementSnapshotForCanvasElement(resolveCanvasBody(editor), snapshots, element);
  if (!snapshot) {
    return;
  }

  const { className, styleText, restAttributes } = splitOriginalElementAttributes(snapshot.attributes);
  if (className && normalizeClassAttribute(readComponentClassAttribute(component)) !== normalizeClassAttribute(className)) {
    component.setClass?.(className, { avoidStore: true, noUndo: true });
  }

  const missingStyle = collectMissingStyleRecord(
    parseInlineStyleRecord(styleText),
    readComponentInlineStyleRecord(component),
    parseInlineStyleRecord(element.getAttribute('style') ?? ''),
  );
  if (Object.keys(missingStyle).length > 0) {
    component.addStyle?.(missingStyle, { avoidStore: true, noUndo: true });
  }

  const changedRestAttributes = collectChangedAttributes(element, restAttributes);
  if (Object.keys(changedRestAttributes).length > 0) {
    component.addAttributes?.(changedRestAttributes, { avoidStore: true, noUndo: true });
  }
}

function injectRawCanvasStyles(editor: ReturnType<typeof grapesjs.init>, styleMarkup: string) {
  const canvasDocument = resolveCanvasDocument(editor);
  if (!canvasDocument?.head) {
    return;
  }

  canvasDocument.head.querySelectorAll(`[${RAW_CANVAS_STYLE_ATTRIBUTE}]`).forEach((node) => {
    node.remove();
  });

  if (!styleMarkup.trim()) {
    return;
  }

  const template = canvasDocument.createElement('template');
  template.innerHTML = styleMarkup;
  Array.from(template.content.querySelectorAll('style')).forEach((styleNode) => {
    const clone = styleNode.cloneNode(true) as HTMLStyleElement;
    clone.setAttribute(RAW_CANVAS_STYLE_ATTRIBUTE, 'true');
    canvasDocument.head.appendChild(clone);
  });
}

function hasSyncedCanvasHeadMarkup({
  canvasDocument,
  canvasHeadMarkup,
  rawStyleMarkup,
}: {
  canvasDocument: Document;
  canvasHeadMarkup: string;
  rawStyleMarkup: string;
}) {
  const hasRawStyles = !rawStyleMarkup.trim()
    || Boolean(canvasDocument.head.querySelector(`[${RAW_CANVAS_STYLE_ATTRIBUTE}]`));
  const hasHeadMarkup = !canvasHeadMarkup.trim()
    || Boolean(canvasDocument.head.querySelector('[data-ccui-canvas-head-node]'));

  return hasRawStyles && hasHeadMarkup;
}

function isElementCompletelyOutsideViewport(rect: DOMRect, viewportWidth: number, viewportHeight: number) {
  return rect.right <= 0 || rect.bottom <= 0 || rect.left >= viewportWidth || rect.top >= viewportHeight;
}

function isCanvasHTMLElement(value: unknown, canvasDocument: Document): value is HTMLElement {
  const canvasWindow = canvasDocument.defaultView;
  return Boolean(
    canvasWindow
      && value instanceof canvasWindow.HTMLElement
      && value.ownerDocument === canvasDocument
      && canvasDocument.body.contains(value),
  );
}

function getDirectHiddenLayerReason(
  element: HTMLElement,
  viewportWidth: number,
  viewportHeight: number,
): HiddenLayerReason | null {
  if (element === element.ownerDocument.body || element === element.ownerDocument.documentElement) {
    return null;
  }

  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) {
    return null;
  }

  const display = style.display;
  const visibility = style.visibility;
  const opacity = style.opacity;
  if (display === 'none' || visibility === 'hidden' || opacity === '0') {
    if (display === 'none') {
      return 'display-none';
    }
    if (visibility === 'hidden') {
      return 'visibility-hidden';
    }
    return 'opacity-zero';
  }

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return 'zero-size';
  }

  const position = style.position;
  if ((position === 'absolute' || position === 'fixed')
    && isElementCompletelyOutsideViewport(rect, viewportWidth, viewportHeight)) {
    return 'offscreen';
  }

  return null;
}

function hasDirectHiddenAncestor(
  element: HTMLElement,
  viewportWidth: number,
  viewportHeight: number,
) {
  let current = element.parentElement;
  while (current) {
    if (getDirectHiddenLayerReason(current, viewportWidth, viewportHeight)) {
      return true;
    }
    current = current.parentElement;
  }

  return false;
}

function classifyHiddenLayerElement(
  element: HTMLElement,
  viewportWidth: number,
  viewportHeight: number,
): HiddenLayerRecord | null {
  if (NON_VISUAL_HIDDEN_LAYER_TAG_NAMES.has(element.tagName.toLowerCase())) {
    return null;
  }

  const computedStyle = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!computedStyle) {
    return null;
  }

  const directReason = getDirectHiddenLayerReason(element, viewportWidth, viewportHeight);
  const hasHiddenAncestor = hasDirectHiddenAncestor(element, viewportWidth, viewportHeight);
  const reason = directReason ?? (hasHiddenAncestor ? 'ancestor-hidden' : null);
  if (!reason) {
    return null;
  }

  return {
    element,
    reason,
    isCanvasInternal: isCanvasInternalElement(element),
    hasHiddenAncestor,
    computedStyle,
  };
}

function isNonVisualEditableElement(element: HTMLElement, viewportWidth: number, viewportHeight: number) {
  return Boolean(classifyHiddenLayerElement(element, viewportWidth, viewportHeight));
}

function decodeTemporaryStyle(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isCanvasInternalElement(element: HTMLElement) {
  const matchesInternalClass = (node: HTMLElement | null) => {
    if (!node) {
      return false;
    }

    const className = node.className;
    if (typeof className !== 'string') {
      return false;
    }

    return className
      .split(/\s+/)
      .filter(Boolean)
      .some((classToken) => classToken.startsWith('gjs-'));
  };

  if (matchesInternalClass(element)) {
    return true;
  }

  let current = element.parentElement;
  while (current) {
    if (matchesInternalClass(current)) {
      return true;
    }
    current = current.parentElement;
  }

  return false;
}

function shouldDisplayHiddenLayerRecord(record: HiddenLayerRecord, filter: HiddenLayerFilter) {
  if (!filter.reasons.includes(record.reason)) {
    return false;
  }
  if (!filter.includeInternal && record.isCanvasInternal) {
    return false;
  }
  if (!filter.includeDescendants && record.hasHiddenAncestor) {
    return false;
  }
  const textQuery = filter.textQuery.trim().toLowerCase();
  if (textQuery) {
    const elementText = record.element.textContent?.trim().toLowerCase() ?? '';
    if (!elementText.includes(textQuery)) {
      return false;
    }
  }

  return true;
}

function getPreviewZIndex(element: HTMLElement, computedStyle: CSSStyleDeclaration) {
  const parsedZIndex = Number.parseInt(computedStyle.zIndex, 10);
  const baseZIndex = Number.isFinite(parsedZIndex) ? parsedZIndex : 0;
  let depth = 0;
  let current = element.parentElement;
  while (current) {
    depth += 1;
    current = current.parentElement;
  }

  return Math.max(baseZIndex, 1000 + depth);
}

function getHiddenLayerPreviewDisplay(element: HTMLElement, style: CSSStyleDeclaration): HiddenLayerDisplayMode {
  const tagName = element.tagName.toLowerCase();
  if (tagName === 'tr') {
    return 'table-row';
  }
  if (tagName === 'thead') {
    return 'table-header-group';
  }
  if (tagName === 'tbody') {
    return 'table-row-group';
  }
  if (tagName === 'tfoot') {
    return 'table-footer-group';
  }
  if (tagName === 'td' || tagName === 'th') {
    return 'table-cell';
  }
  if (tagName === 'li') {
    return 'list-item';
  }
  if (style.display === 'inline-flex') {
    return 'inline-flex';
  }
  if (style.display === 'flex' || style.justifyContent !== 'normal' || style.alignItems !== 'normal') {
    return 'flex';
  }
  if (style.display === 'grid' || style.display === 'inline-grid') {
    return 'grid';
  }
  return 'block';
}

function applyTemporaryHiddenLayerStyle(
  element: HTMLElement,
  computedStyle: CSSStyleDeclaration,
  viewportWidth: number,
  viewportHeight: number,
) {
  if (!element.hasAttribute(HIDDEN_LAYER_ORIGINAL_STYLE_ATTRIBUTE)) {
    element.setAttribute(
      HIDDEN_LAYER_ORIGINAL_STYLE_ATTRIBUTE,
      encodeURIComponent(element.getAttribute('style') ?? ''),
    );
  }

  element.style.setProperty('display', getHiddenLayerPreviewDisplay(element, computedStyle), 'important');
  element.style.setProperty('visibility', 'visible', 'important');
  if (computedStyle.opacity === '0') {
    element.style.setProperty('opacity', '0.82', 'important');
  } else {
    element.style.setProperty('opacity', computedStyle.opacity, 'important');
  }
  element.style.setProperty('z-index', String(getPreviewZIndex(element, computedStyle)), 'important');

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0) {
    element.style.setProperty('min-width', '96px', 'important');
  } else {
    element.style.removeProperty('min-width');
  }
  if (rect.height <= 0) {
    element.style.setProperty('min-height', '32px', 'important');
  } else {
    element.style.removeProperty('min-height');
  }
  const shouldReposition = isElementCompletelyOutsideViewport(rect, viewportWidth, viewportHeight);
  if (shouldReposition) {
    element.style.setProperty('position', 'relative', 'important');
    element.style.setProperty('left', 'auto', 'important');
    element.style.setProperty('right', 'auto', 'important');
    element.style.setProperty('top', 'auto', 'important');
    element.style.setProperty('bottom', 'auto', 'important');
    element.style.setProperty('transform', 'none', 'important');
    return;
  }

  element.style.removeProperty('position');
  element.style.removeProperty('left');
  element.style.removeProperty('right');
  element.style.removeProperty('top');
  element.style.removeProperty('bottom');
  element.style.removeProperty('transform');
}

function restoreTemporaryHiddenLayerStyle(element: HTMLElement) {
  const encodedOriginalStyle = element.getAttribute(HIDDEN_LAYER_ORIGINAL_STYLE_ATTRIBUTE);
  element.removeAttribute(HIDDEN_LAYER_PREVIEW_ATTRIBUTE);
  element.removeAttribute(HIDDEN_LAYER_ORIGINAL_STYLE_ATTRIBUTE);
  element.removeAttribute(HIDDEN_LAYER_PASS_THROUGH_ATTRIBUTE);
  if (encodedOriginalStyle == null) {
    return;
  }

  const originalStyle = decodeTemporaryStyle(encodedOriginalStyle);
  if (originalStyle.trim()) {
    element.setAttribute('style', originalStyle);
  } else {
    element.removeAttribute('style');
  }
}

function readComponentChildren(component: any) {
  const children = component?.components?.();
  if (Array.isArray(children)) {
    return children;
  }

  const items: any[] = [];
  if (typeof children?.forEach === 'function') {
    children.forEach((child: any) => {
      items.push(child);
    });
  }

  return items;
}

function disableNonVisualEditableCanvasComponents(editor: ReturnType<typeof grapesjs.init>) {
  const canvasDocument = resolveCanvasDocument(editor);
  const canvasWindow = canvasDocument?.defaultView;
  const wrapper = editor.DomComponents?.getWrapper?.() as any;
  if (!canvasDocument?.body || !canvasWindow || !wrapper) {
    return;
  }

  const viewportWidth = canvasWindow.innerWidth || canvasDocument.documentElement.clientWidth || canvasDocument.body.clientWidth;
  const viewportHeight = canvasWindow.innerHeight || canvasDocument.documentElement.clientHeight || canvasDocument.body.clientHeight;
  const visit = (component: any) => {
    readComponentChildren(component).forEach(visit);

    const element = component?.getEl?.();
    if (!isCanvasHTMLElement(element, canvasDocument)) {
      return;
    }

    if (isNonVisualEditableElement(element, viewportWidth, viewportHeight)) {
      component.set?.({
        selectable: false,
        hoverable: false,
        draggable: false,
        editable: false,
      }, { silent: true });
    }
  };

  readComponentChildren(wrapper).forEach(visit);
}

function applyHiddenLayerEditing(
  editor: ReturnType<typeof grapesjs.init>,
  enabled: boolean,
  hiddenLayerFilter: HiddenLayerFilter,
) {
  const canvasDocument = resolveCanvasDocument(editor);
  const canvasWindow = canvasDocument?.defaultView;
  const wrapper = editor.DomComponents?.getWrapper?.() as any;
  if (!canvasDocument?.body || !canvasWindow || !wrapper) {
    return;
  }

  canvasDocument.documentElement.classList.toggle('ccui-hidden-layer-editing', enabled);
  canvasDocument.body.classList.toggle('ccui-hidden-layer-editing', enabled);
  canvasDocument.head.querySelectorAll(`[${HIDDEN_LAYER_EDIT_STYLE_ATTRIBUTE}]`).forEach((node) => {
    node.remove();
  });
  canvasDocument.body.querySelectorAll<HTMLElement>(
    `[${HIDDEN_LAYER_PREVIEW_ATTRIBUTE}], [${HIDDEN_LAYER_ORIGINAL_STYLE_ATTRIBUTE}]`,
  ).forEach((element) => {
    restoreTemporaryHiddenLayerStyle(element);
  });

  if (!enabled) {
    disableNonVisualEditableCanvasComponents(editor);
    return;
  }

  const viewportWidth = canvasWindow.innerWidth || canvasDocument.documentElement.clientWidth || canvasDocument.body.clientWidth;
  const viewportHeight = canvasWindow.innerHeight || canvasDocument.documentElement.clientHeight || canvasDocument.body.clientHeight;
  const matchedElements: Array<{ id: string; tagName: string; className: string; display: string; position: string }> = [];
  const previewedElements: HTMLElement[] = [];
  const visitedElements = new Set<HTMLElement>();
  const componentByElement = new Map<HTMLElement, any>();
  let visitedCount = 0;
  let infoModalVisited = false;
  const visit = (component: any) => {
    const element = component?.getEl?.();
    if (isCanvasHTMLElement(element, canvasDocument)) {
      visitedCount += 1;
      visitedElements.add(element);
      componentByElement.set(element, component);
      if (element.id === 'infoModal') {
        infoModalVisited = true;
      }
    }

    readComponentChildren(component).forEach(visit);
  };

  readComponentChildren(wrapper).forEach(visit);
  const hiddenLayerRecords: HiddenLayerRecord[] = [];
  canvasDocument.body.querySelectorAll<HTMLElement>('*').forEach((element) => {
    if (element.id === 'infoModal') {
      infoModalVisited = true;
    }
    const record = classifyHiddenLayerElement(element, viewportWidth, viewportHeight);
    if (!record) {
      return;
    }

    hiddenLayerRecords.push(record);
    if (!shouldDisplayHiddenLayerRecord(record, hiddenLayerFilter)) {
      return;
    }

    matchedElements.push({
      id: element.id || '',
      tagName: element.tagName.toLowerCase(),
      className: element.className || '',
      display: record.computedStyle.display,
      position: record.computedStyle.position,
    });
    element.setAttribute(HIDDEN_LAYER_PREVIEW_ATTRIBUTE, 'true');
    applyTemporaryHiddenLayerStyle(element, record.computedStyle, viewportWidth, viewportHeight);
    previewedElements.push(element);
    const component = componentByElement.get(element);
    component?.set?.({
      selectable: true,
      hoverable: true,
      draggable: true,
      editable: true,
    }, { silent: true });
  });

  previewedElements.forEach((element) => {
    const hasNestedPreview = Boolean(
      element.querySelector(`[${HIDDEN_LAYER_PREVIEW_ATTRIBUTE}]`),
    );
    if (!hasNestedPreview) {
      return;
    }

    element.setAttribute(HIDDEN_LAYER_PASS_THROUGH_ATTRIBUTE, 'true');
    const component = componentByElement.get(element);
    component?.set?.({
      selectable: false,
      hoverable: false,
      draggable: false,
      editable: false,
    }, { silent: true });
  });

  const infoModal = canvasDocument.getElementById('infoModal');
  const infoModalStyle = infoModal ? canvasWindow.getComputedStyle(infoModal) : null;
  const infoModalRect = infoModal?.getBoundingClientRect?.();
  logHiddenLayerDebug({
    enabled,
    visitedCount,
    infoModalVisited,
    hiddenLayerFilter,
    hiddenLayerCountsByReason: hiddenLayerRecords.reduce<Record<string, number>>((counts, record) => {
      counts[record.reason] = (counts[record.reason] ?? 0) + 1;
      return counts;
    }, {}),
    matchedCount: matchedElements.length,
    matchedElements: matchedElements.slice(0, 20),
    infoModalFound: Boolean(infoModal),
    infoModalTagName: infoModal?.tagName.toLowerCase() ?? null,
    infoModalClassName: infoModal?.className ?? null,
    infoModalPreviewFlag: infoModal?.getAttribute(HIDDEN_LAYER_PREVIEW_ATTRIBUTE) ?? null,
    infoModalInlineStyle: infoModal?.getAttribute('style') ?? null,
    infoModalComputedDisplay: infoModalStyle?.display ?? null,
    infoModalComputedVisibility: infoModalStyle?.visibility ?? null,
    infoModalComputedOpacity: infoModalStyle?.opacity ?? null,
    infoModalComputedPosition: infoModalStyle?.position ?? null,
    infoModalRect: infoModalRect
      ? {
        width: Math.round(infoModalRect.width),
        height: Math.round(infoModalRect.height),
        top: Math.round(infoModalRect.top),
        right: Math.round(infoModalRect.right),
        bottom: Math.round(infoModalRect.bottom),
        left: Math.round(infoModalRect.left),
      }
      : null,
  });

  const style = canvasDocument.createElement('style');
  style.setAttribute(HIDDEN_LAYER_EDIT_STYLE_ATTRIBUTE, 'true');
  style.textContent = `
    [${HIDDEN_LAYER_PREVIEW_ATTRIBUTE}] {
      visibility: visible !important;
      pointer-events: auto !important;
      outline: 2px dashed #f59e0b !important;
      outline-offset: 2px !important;
    }
    [${HIDDEN_LAYER_PASS_THROUGH_ATTRIBUTE}] {
      pointer-events: none !important;
    }
    [${HIDDEN_LAYER_PREVIEW_ATTRIBUTE}]::before {
      content: "隐藏层";
      display: inline-flex;
      margin: 0 0 4px 0;
      padding: 1px 6px;
      border-radius: 999px;
      background: #f59e0b;
      color: #111827;
      font-size: 11px;
      line-height: 16px;
      font-weight: 600;
    }
  `;
  canvasDocument.head.appendChild(style);
}

export default function VisualCanvasPane({
  fullHtml,
  assetBaseUrl = null,
  showHiddenLayers = false,
  hiddenLayerFilter = {
    reasons: ['display-none', 'visibility-hidden', 'opacity-zero', 'zero-size', 'offscreen', 'ancestor-hidden'],
    includeInternal: false,
    includeDescendants: true,
    textQuery: '',
  },
  onEditorReady,
  onDirtyChange,
}: VisualCanvasPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<ReturnType<typeof grapesjs.init> | null>(null);
  const onEditorReadyRef = useRef(onEditorReady);
  const onDirtyChangeRef = useRef(onDirtyChange);

  useEffect(() => {
    onEditorReadyRef.current = onEditorReady;
  }, [onEditorReady]);

  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
  }, [onDirtyChange]);

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }

    applyHiddenLayerEditing(editorRef.current, showHiddenLayers, hiddenLayerFilter);
  }, [hiddenLayerFilter, showHiddenLayers]);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const canvasHtml = normalizeDesignCanvasHtml(fullHtml);
    const rawStyleMarkup = collectStyleMarkup(canvasHtml);
    const canvasHeadMarkup = rewriteCanvasHeadAssetUrls(
      collectCanvasHeadMarkup(canvasHtml),
      assetBaseUrl,
    );
    const canvasStructureHtml = createCanvasStructureHtml(canvasHtml);
    const originalElementSnapshots = collectOriginalElementSnapshots(canvasStructureHtml);
    logCanvasPerf('prepared', {
      fullHtmlLength: fullHtml.length,
      normalizedHtmlLength: canvasHtml.length,
      structureHtmlLength: canvasStructureHtml.length,
      rawStyleMarkupLength: rawStyleMarkup.length,
      canvasHeadMarkupLength: canvasHeadMarkup.length,
      originalElementSnapshotCount: originalElementSnapshots.length,
      structureReductionPercent: canvasHtml.length > 0
        ? Math.round((1 - canvasStructureHtml.length / canvasHtml.length) * 10000) / 100
        : 0,
    });
    const pendingStyleSyncTimeouts: number[] = [];
    const visualEditableFilterRef = { current: false };
    const restoredAttributeDocumentRef: { current: Document | null } = { current: null };
    const lastHeadSyncRef: {
      current: {
        document: Document;
        key: string;
      } | null;
    } = { current: null };
    const editor = grapesjs.init({
      container: containerRef.current,
      fromElement: false,
      height: '100%',
      width: 'auto',
      storageManager: false,
      noticeOnUnload: false,
      avoidInlineStyle: false,
      forceClass: false,
      selectorManager: { componentFirst: true },
      parser: {
        optionsHtml: {
          allowScripts: true,
          detectDocument: true,
        },
      },
      i18n: {
        locale: 'zh-CN',
        localeFallback: 'en',
        detectLocale: false,
        messagesAdd: {
          'zh-CN': grapesjsZhCn,
        },
      },
      plugins: [
        (editorInstance) => {
          registerVisualHtmlComponentTypes(editorInstance);
          registerVisualHtmlBlocks(editorInstance);
        },
      ],
    });

    const componentsStartedAt = getPerfNow();
    editor.getWrapper()?.components(canvasStructureHtml, {
      asDocument: true,
      parserOptions: {
        allowScripts: true,
        detectDocument: true,
      },
    } as Parameters<NonNullable<ReturnType<typeof editor.getWrapper>>['components']>[1] & {
      parserOptions: {
        allowScripts: boolean;
        detectDocument: boolean;
      };
    });
    logCanvasPerf('components', {
      durationMs: Math.round(getPerfNow() - componentsStartedAt),
      structureHtmlLength: canvasStructureHtml.length,
    });

    editorRef.current = editor;

    const optionsPanel = editor.Panels.getPanel('options');
    if (optionsPanel) {
      optionsPanel.set('visible', false);
    }

    const commandsPanel = editor.Panels.getPanel('commands');
    if (commandsPanel) {
      commandsPanel.set('visible', false);
    }

    const devicesPanel = editor.Panels.getPanel('devices-c');
    if (devicesPanel) {
      devicesPanel.set('visible', false);
    }

    const viewsPanel = editor.Panels.getPanel('views');
    if (viewsPanel) {
      viewsPanel.set('visible', false);
    }

    const notifyDirty = (forceDirty = false) => {
      onDirtyChangeRef.current?.(forceDirty || editor.getDirtyCount() > 0, editor);
    };
    const notifyStyleDirty = () => notifyDirty(true);
    const syncSelectedOriginalAttributes = (component?: any) => {
      syncOriginalAttributesForComponent(
        editor,
        component ?? editor.getSelected?.(),
        originalElementSnapshots,
      );
    };
    const syncCanvasHeadMarkup = () => {
      const canvasDocument = resolveCanvasDocument(editor);
      if (!canvasDocument?.head) {
        logCanvasPerf('head-sync-missing-document', {
          hasDocument: Boolean(canvasDocument),
          readyState: canvasDocument?.readyState ?? null,
          hasHead: Boolean(canvasDocument?.head),
          hasBody: Boolean(canvasDocument?.body),
          baseURI: canvasDocument?.baseURI ?? null,
        });
        return;
      }

      const headSyncKey = `${canvasHeadMarkup.length}:${rawStyleMarkup.length}`;
      if (
        lastHeadSyncRef.current?.document === canvasDocument
        && lastHeadSyncRef.current.key === headSyncKey
        && hasSyncedCanvasHeadMarkup({
          canvasDocument,
          canvasHeadMarkup,
          rawStyleMarkup,
        })
      ) {
        logCanvasPerf('head-sync-skip', {
          reason: 'same-document',
          rawStyleMarkupLength: rawStyleMarkup.length,
          canvasHeadMarkupLength: canvasHeadMarkup.length,
        });
        return;
      }

      const headSyncStartedAt = getPerfNow();
      // 清除初始结构 HTML 带入的 head 元素，避免与受管注入重复
      // 这些元素没有 data-ccui-canvas-head-node 属性，是 createCanvasStructureHtml 中包含的原始 head 内容
      const canvasWindow = canvasDocument.defaultView;
      if (canvasWindow) {
        Array.from(canvasDocument.head.children).forEach((child) => {
          if (!(child instanceof canvasWindow.HTMLElement)) return;
          if (child.hasAttribute('data-ccui-canvas-head-node')) return;
          if (child.hasAttribute(RAW_CANVAS_STYLE_ATTRIBUTE)) return;
          if (child.hasAttribute(HIDDEN_LAYER_EDIT_STYLE_ATTRIBUTE)) return;
          const tag = child.tagName.toLowerCase();
          if (['link', 'style', 'meta', 'base'].includes(tag)) {
            child.remove();
          }
        });
      }
      injectCanvasHeadMarkup(editor, canvasHeadMarkup);
      injectRawCanvasStyles(editor, rawStyleMarkup);
      lastHeadSyncRef.current = {
        document: canvasDocument,
        key: headSyncKey,
      };
      logCanvasPerf('head-sync', {
        durationMs: Math.round(getPerfNow() - headSyncStartedAt),
        rawStyleMarkupLength: rawStyleMarkup.length,
        canvasHeadMarkupLength: canvasHeadMarkup.length,
      });
      logCanvasPerf('head-state', collectCanvasHeadDebugSummary(canvasDocument));
    };
    const scheduleCanvasHeadMarkupSync = () => {
      const canvasDocument = resolveCanvasDocument(editor);
      logCanvasPerf('head-sync-scheduled', {
        hasDocument: Boolean(canvasDocument),
        readyState: canvasDocument?.readyState ?? null,
        hasHead: Boolean(canvasDocument?.head),
        hasBody: Boolean(canvasDocument?.body),
        baseURI: canvasDocument?.baseURI ?? null,
      });
      const disableInitialNonVisualEditableComponents = () => {
        if (visualEditableFilterRef.current) {
          return;
        }

        applyHiddenLayerEditing(editor, showHiddenLayers, hiddenLayerFilter);
        visualEditableFilterRef.current = true;
      };
      const restoreOriginalAttributesOnce = () => {
        const canvasDocument = resolveCanvasDocument(editor);
        if (!canvasDocument || restoredAttributeDocumentRef.current === canvasDocument) {
          return;
        }

        restoredAttributeDocumentRef.current = canvasDocument;
        logCanvasPerf('attribute-restore', restoreOriginalElementAttributes(editor, originalElementSnapshots));
      };

      syncCanvasHeadMarkup();
      restoreOriginalAttributesOnce();
      disableInitialNonVisualEditableComponents();
    };

    editor.on('update', notifyDirty);
    editor.on('component:styleUpdate', notifyStyleDirty);
    editor.on('component:selected', syncSelectedOriginalAttributes);
    editor.on('canvas:frame:load', () => {
      const canvasDocument = resolveCanvasDocument(editor);
      logCanvasPerf('canvas-frame-load-event', {
        hasDocument: Boolean(canvasDocument),
        readyState: canvasDocument?.readyState ?? null,
        hasHead: Boolean(canvasDocument?.head),
        hasBody: Boolean(canvasDocument?.body),
        baseURI: canvasDocument?.baseURI ?? null,
      });
      scheduleCanvasHeadMarkupSync();
    });
    editor.on('canvas:frame:load:body', () => {
      const canvasDocument = resolveCanvasDocument(editor);
      logCanvasPerf('canvas-frame-load-body-event', {
        hasDocument: Boolean(canvasDocument),
        readyState: canvasDocument?.readyState ?? null,
        hasHead: Boolean(canvasDocument?.head),
        hasBody: Boolean(canvasDocument?.body),
        baseURI: canvasDocument?.baseURI ?? null,
      });
      scheduleCanvasHeadMarkupSync();
    });
    editor.clearDirtyCount();
    scheduleCanvasHeadMarkupSync();
    onEditorReadyRef.current?.(editor);
    notifyDirty();

    return () => {
      pendingStyleSyncTimeouts.forEach((timeout) => {
        window.clearTimeout(timeout);
      });
      editor.off('update', notifyDirty);
      editor.off('component:styleUpdate', notifyStyleDirty);
      editor.off('component:selected', syncSelectedOriginalAttributes);
      editor.destroy();
      editorRef.current = null;
      onEditorReadyRef.current?.(null);
    };
  }, [assetBaseUrl, fullHtml]);

  return <div ref={containerRef} className="ccui-visual-canvas h-full min-h-0" data-visual-html-mode="design" />;
}
