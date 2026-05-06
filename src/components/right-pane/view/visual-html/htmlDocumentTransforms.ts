import { parseFragment, serialize } from 'parse5';
import { formatHtmlDocument } from './formatHtmlDocument.js';

export type HtmlDocumentSnapshot = {
  htmlAttributes: string;
  bodyAttributes: string;
  headMarkup: string;
  bodyScriptMarkup?: string;
  bodyEventAttributes?: Record<string, Record<string, string>>;
};

type ParsedHtmlDocument = {
  htmlAttributes: string;
  bodyAttributes: string;
  headMarkup: string;
  bodyHtml: string;
  styles: string;
  bodyScriptMarkup: string;
  bodyEventAttributes: Record<string, Record<string, string>>;
};

type CanvasCssDeclaration = {
  property: string;
  value: string;
};

type CanvasCssRule = {
  selector: string;
  declarations: CanvasCssDeclaration[];
};

type VisualHtmlSaveDebugEntry = {
  timestamp: string;
  sourceHtmlLength: number;
  bodyHtmlLength: number;
  canvasCssLength: number;
  previousManagedCanvasCssLength: number;
  sanitizedLegacyManagedCanvasCssLength: number;
  mergedCanvasCssLength: number;
  persistentCanvasCssLength: number;
  removedLegacyManagedSelectors: string[];
  removedDuplicatedSelectors: string[];
  sourceManagedCanvasCss: string;
  sanitizedLegacyManagedCanvasCss: string;
  canvasCssInput: string;
  mergedCanvasCss: string;
  persistentCanvasCss: string;
};

const NON_PERSISTENT_CANVAS_SELECTOR_PATTERNS = [
  /^#plasmo-/i,
  /^#__hcfy__$/i,
  /^\[data-ccui-hidden-layer-preview/i,
];

function isVisualHtmlSaveDebugEnabled() {
  return (
    typeof window !== 'undefined'
    && (window as Window & { CCUI_DEBUG_VISUAL_SAVE?: boolean }).CCUI_DEBUG_VISUAL_SAVE === true
  );
}

function pushVisualHtmlSaveDebugEntry(entry: VisualHtmlSaveDebugEntry) {
  if (typeof window === 'undefined') {
    return;
  }

  const debugWindow = window as Window & {
    __CCUI_VISUAL_SAVE_DEBUG__?: VisualHtmlSaveDebugEntry;
    __CCUI_VISUAL_SAVE_DEBUG_HISTORY__?: VisualHtmlSaveDebugEntry[];
  };

  const nextHistory = [...(debugWindow.__CCUI_VISUAL_SAVE_DEBUG_HISTORY__ ?? []), entry].slice(-20);
  debugWindow.__CCUI_VISUAL_SAVE_DEBUG__ = entry;
  debugWindow.__CCUI_VISUAL_SAVE_DEBUG_HISTORY__ = nextHistory;

  console.groupCollapsed('[VisualHtmlSaveDebug]', entry.timestamp);
  console.info('lengths', {
    sourceHtmlLength: entry.sourceHtmlLength,
    bodyHtmlLength: entry.bodyHtmlLength,
    canvasCssLength: entry.canvasCssLength,
    previousManagedCanvasCssLength: entry.previousManagedCanvasCssLength,
    sanitizedLegacyManagedCanvasCssLength: entry.sanitizedLegacyManagedCanvasCssLength,
    mergedCanvasCssLength: entry.mergedCanvasCssLength,
    persistentCanvasCssLength: entry.persistentCanvasCssLength,
  });
  console.info('removedLegacyManagedSelectors', entry.removedLegacyManagedSelectors);
  console.info('removedDuplicatedSelectors', entry.removedDuplicatedSelectors);
  console.info('latestEntry', entry);
  console.groupEnd();
}

function serializeAttributesFromElement(element: Element): string {
  return Array.from(element.attributes)
    .map(({ name, value }) => (value ? ` ${name}="${value.replace(/"/g, '&quot;')}"` : ` ${name}`))
    .join('');
}

function getAttributeString(tagSource: string, tagName: string): string {
  const match = tagSource.match(new RegExp(`<${tagName}\\b([^>]*)>`, 'i'));
  return match?.[1]?.trim() ? ` ${match[1].trim()}` : '';
}

function stripStyleNodes(markup: string): string {
  return markup.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').trim();
}

function stripManagedCanvasStyleNodes(markup: string): string {
  return markup
    .replace(/<style\b[^>]*data-ccui-visual-html-canvas-style\s*=\s*(["']).*?\1[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<style\b[^>]*data-ccui-raw-canvas-style\s*=\s*(["']).*?\1[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<style\b[^>]*data-ccui-hidden-layer-edit-style\s*=\s*(["']).*?\1[^>]*>[\s\S]*?<\/style>/gi, '')
    .trim();
}

function collectManagedCanvasStyleContents(markup: string): string[] {
  return Array.from(
    markup.matchAll(/<style\b[^>]*data-ccui-visual-html-canvas-style\s*=\s*(["']).*?\1[^>]*>([\s\S]*?)<\/style>/gi),
  )
    .map((match) => match[2] ?? '')
    .map((text) => text.trim())
    .filter(Boolean);
}

function splitCanvasCssDeclarations(cssText: string) {
  return cssText
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const separatorIndex = declaration.indexOf(':');
      if (separatorIndex < 0) {
        return null;
      }

      const property = declaration.slice(0, separatorIndex).trim().toLowerCase();
      const value = declaration.slice(separatorIndex + 1).trim();
      if (!property || !value) {
        return null;
      }

      return { property, value };
    })
    .filter((declaration): declaration is { property: string; value: string } => Boolean(declaration));
}

function collectCanvasCssRules(css: string): CanvasCssRule[] {
  const rules: CanvasCssRule[] = [];

  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = String(match[1] ?? '').trim().replace(/\s+/g, ' ');
    const body = String(match[2] ?? '').trim();
    if (!selector || selector.startsWith('@')) {
      continue;
    }

    const declarations = splitCanvasCssDeclarations(body);
    if (declarations.length === 0) {
      continue;
    }

    rules.push({ selector, declarations });
  }

  return rules;
}

function serializeCanvasCssRules(rules: CanvasCssRule[]) {
  return rules
    .map(({ selector, declarations }) => {
      const body = declarations
        .map(({ property, value }) => `${property}:${value};`)
        .join('');
      return body ? `${selector}{${body}}` : '';
    })
    .filter(Boolean)
    .join('');
}

function collectMarkupElementIds(markup: string) {
  return new Set(
    Array.from(markup.matchAll(/\bid\s*=\s*(["'])(.*?)\1/gi))
      .map((match) => String(match[2] ?? '').trim())
      .filter(Boolean),
  );
}

function readSimpleIdSelector(selector: string) {
  const normalized = selector.trim();
  const match = normalized.match(/^#([A-Za-z][\w:-]*)$/);
  return match?.[1] ?? null;
}

function isRuntimeCanvasSelector(selector: string) {
  const normalized = selector.trim();
  return NON_PERSISTENT_CANVAS_SELECTOR_PATTERNS.some((pattern) => pattern.test(normalized));
}

function mergeStyleDeclarationText(existingStyle: string, declarations: CanvasCssDeclaration[]) {
  const declarationMap = new Map<string, string>();
  const declarationOrder: string[] = [];
  const pushDeclaration = (property: string, value: string) => {
    if (!declarationMap.has(property)) {
      declarationOrder.push(property);
    }
    declarationMap.set(property, value);
  };

  splitCanvasCssDeclarations(existingStyle).forEach(({ property, value }) => {
    pushDeclaration(property, value);
  });
  declarations.forEach(({ property, value }) => {
    pushDeclaration(property, value);
  });

  return declarationOrder
    .map((property) => `${property}: ${declarationMap.get(property)};`)
    .join(' ');
}

function inlineCanvasRuleDeclarationsIntoBody(bodyHtml: string, rules: CanvasCssRule[]) {
  if (rules.length === 0) {
    return bodyHtml;
  }

  if (typeof DOMParser !== 'undefined') {
    const parsed = new DOMParser().parseFromString(`<body>${bodyHtml}</body>`, 'text/html');
    rules.forEach(({ selector, declarations }) => {
      const id = readSimpleIdSelector(selector);
      if (!id) {
        return;
      }

      const element = parsed.body.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
      if (!element) {
        return;
      }

      const mergedStyle = mergeStyleDeclarationText(element.getAttribute('style') ?? '', declarations);
      if (mergedStyle) {
        element.setAttribute('style', mergedStyle);
      }
    });

    return parsed.body.innerHTML.trim();
  }

  const fragment = parseFragment(bodyHtml) as any;
  const nodesById = indexParse5NodesById(fragment);
  rules.forEach(({ selector, declarations }) => {
    const id = readSimpleIdSelector(selector);
    if (!id) {
      return;
    }

    const node = nodesById.get(id);
    if (!node) {
      return;
    }

    const mergedStyle = mergeStyleDeclarationText(String(getNodeAttribute(node, 'style') ?? ''), declarations);
    if (mergedStyle) {
      setNodeAttribute(node, 'style', mergedStyle);
    }
  });

  return serialize(fragment).trim();
}

function normalizePersistentCanvasEdits({
  sourceHtml,
  bodyHtml,
  canvasCss,
}: {
  sourceHtml: string;
  bodyHtml: string;
  canvasCss: string;
}) {
  const sourceNonEditableIds = collectSourceNonEditableElementIds(sourceHtml);
  const bodyIds = collectMarkupElementIds(bodyHtml);
  const rules = collectCanvasCssRules(canvasCss);
  const rulesToInline: CanvasCssRule[] = [];
  const persistentRules: CanvasCssRule[] = [];

  rules.forEach((rule) => {
    const id = readSimpleIdSelector(rule.selector);
    const keepForSourceNonEditableElement = Boolean(id && sourceNonEditableIds.has(id));

    if (isRuntimeCanvasSelector(rule.selector) && !keepForSourceNonEditableElement) {
      return;
    }

    if (id && !bodyIds.has(id)) {
      return;
    }

    if (id && bodyIds.has(id) && !keepForSourceNonEditableElement) {
      rulesToInline.push(rule);
      return;
    }

    // Managed canvas CSS is only for editor-owned element patches and a tiny
    // set of global bootstrap rules. GrapesJS re-exports imported page-level
    // class/attribute selectors from <style> tags via getCss(), even on pure
    // text edits; persisting those rules causes cascade drift on reopen.
    if (!keepForSourceNonEditableElement && !isAllowedManagedCanvasGlobalSelector(rule.selector)) {
      return;
    }

    persistentRules.push(rule);
  });

  return {
    bodyHtml: inlineCanvasRuleDeclarationsIntoBody(bodyHtml, rulesToInline),
    canvasCss: serializeCanvasCssRules(persistentRules),
  };
}

function coalesceCanvasCss(css: string) {
  const rulesBySelector = new Map<string, Map<string, string>>();
  const selectorOrder: string[] = [];

  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = String(match[1] ?? '').trim().replace(/\s+/g, ' ');
    const body = String(match[2] ?? '').trim();
    if (!selector || selector.startsWith('@')) {
      continue;
    }

    const declarations = splitCanvasCssDeclarations(body);
    if (declarations.length === 0) {
      continue;
    }

    let declarationsByProperty = rulesBySelector.get(selector);
    if (!declarationsByProperty) {
      declarationsByProperty = new Map<string, string>();
      rulesBySelector.set(selector, declarationsByProperty);
      selectorOrder.push(selector);
    }

    declarations.forEach(({ property, value }) => {
      declarationsByProperty.set(property, value);
    });
  }

  return selectorOrder
    .map((selector) => {
      const declarationsByProperty = rulesBySelector.get(selector);
      if (!declarationsByProperty || declarationsByProperty.size === 0) {
        return '';
      }

      const declarations = Array.from(declarationsByProperty.entries())
        .map(([property, value]) => `${property}:${value};`)
        .join('');
      return `${selector}{${declarations}}`;
    })
    .filter(Boolean)
    .join('\n');
}

function mergeCanvasCssBlocks(...blocks: string[]) {
  const mergedBlocks: string[] = [];
  const seenBlocks = new Set<string>();

  blocks
    .map((block) => stripHiddenLayerEditCss(block).trim())
    .filter(Boolean)
    .forEach((block) => {
      if (seenBlocks.has(block)) {
        return;
      }

      seenBlocks.add(block);
      mergedBlocks.push(block);
    });

  return coalesceCanvasCss(mergedBlocks.join('\n'));
}

const MANAGED_CANVAS_GLOBAL_SELECTOR_ALLOWLIST = new Set([
  '*',
  'body',
  'html',
  ':root',
]);

function isAllowedManagedCanvasGlobalSelector(selector: string) {
  const selectorParts = selector
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  return selectorParts.length > 0
    && selectorParts.every((part) => MANAGED_CANVAS_GLOBAL_SELECTOR_ALLOWLIST.has(part));
}

function sanitizeLegacyManagedCanvasCss(css: string) {
  const normalizedCss = coalesceCanvasCss(css);
  if (!normalizedCss.trim()) {
    return {
      css: normalizedCss,
      removedSelectors: [] as string[],
    };
  }

  const allRules = collectCanvasCssRules(normalizedCss);
  const filteredRules = allRules
    .filter(({ selector }) => (
      Boolean(readSimpleIdSelector(selector))
      || isAllowedManagedCanvasGlobalSelector(selector)
    ));
  const keptSelectors = new Set(filteredRules.map(({ selector }) => selector));
  const removedSelectors = allRules
    .map(({ selector }) => selector)
    .filter((selector) => !keptSelectors.has(selector));

  return {
    css: serializeCanvasCssRules(filteredRules),
    removedSelectors,
  };
}

function buildCanvasCssDeclarationMap(css: string) {
  const declarationsBySelector = new Map<string, Map<string, string>>();

  collectCanvasCssRules(coalesceCanvasCss(css)).forEach(({ selector, declarations }) => {
    if (!selector) {
      return;
    }

    let selectorDeclarations = declarationsBySelector.get(selector);
    if (!selectorDeclarations) {
      selectorDeclarations = new Map<string, string>();
      declarationsBySelector.set(selector, selectorDeclarations);
    }

    declarations.forEach(({ property, value }) => {
      selectorDeclarations!.set(property, value);
    });
  });

  return declarationsBySelector;
}

function removeSourceDuplicatedCanvasCss(sourceCss: string, canvasCss: string) {
  const normalizedCanvasCss = coalesceCanvasCss(canvasCss);
  if (!sourceCss.trim() || !normalizedCanvasCss.trim()) {
    return {
      css: normalizedCanvasCss,
      removedSelectors: [] as string[],
    };
  }

  const sourceDeclarationsBySelector = buildCanvasCssDeclarationMap(sourceCss);
  if (sourceDeclarationsBySelector.size === 0) {
    return {
      css: normalizedCanvasCss,
      removedSelectors: [] as string[],
    };
  }

  const removedSelectors: string[] = [];
  const filteredRules = collectCanvasCssRules(normalizedCanvasCss)
    .map(({ selector, declarations }) => {
      const sourceDeclarations = sourceDeclarationsBySelector.get(selector);
      if (!sourceDeclarations) {
        return { selector, declarations };
      }

       // The source document should remain the single owner of non-id selectors
       // (class, element, attribute, pseudo, etc). GrapesJS getCss() can mirror
       // those source rules back out in normalized longhand form even when the
       // user only edited text content, and persisting them causes whole-page
       // cascade drift on reopen. For persisted visual edits we keep id-based
       // selectors, which are how element-scoped canvas overrides are stored.
      if (!readSimpleIdSelector(selector)) {
        removedSelectors.push(selector);
        return null;
      }

      const nextDeclarations = declarations.filter(({ property, value }) => (
        sourceDeclarations.get(property) !== value
      ));

      if (nextDeclarations.length === 0) {
        removedSelectors.push(selector);
        return null;
      }

      return { selector, declarations: nextDeclarations };
    })
    .filter((rule): rule is CanvasCssRule => Boolean(rule));

  return {
    css: serializeCanvasCssRules(filteredRules),
    removedSelectors,
  };
}

function collectStyleContents(markup: string): string {
  return Array.from(markup.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi))
    .map((match) => match[1] ?? '')
    .map((text) => text.trim())
    .filter(Boolean)
    .join('\n\n');
}

function collectScriptMarkupFromElement(element: Element): string {
  return Array.from(element.querySelectorAll('script'))
    .map((node) => node.outerHTML.trim())
    .filter(Boolean)
    .join('\n\n');
}

function stripScriptNodes(markup: string): string {
  return markup.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').trim();
}

function collectEventAttributesFromElement(element: Element): Record<string, Record<string, string>> {
  const eventAttributesById: Record<string, Record<string, string>> = {};
  const elements = Array.from(element.querySelectorAll('*'));

  for (const node of elements) {
    const eventAttributes = Array.from(node.attributes)
      .filter(({ name }) => /^on[a-z]/i.test(name))
      .reduce<Record<string, string>>((attributes, { name, value }) => {
        attributes[name] = value;
        return attributes;
      }, {});

    const attributeKey = buildEventAttributeKeyFromElement(node);
    if (attributeKey && Object.keys(eventAttributes).length > 0) {
      eventAttributesById[attributeKey] = eventAttributes;
    }
  }

  return eventAttributesById;
}

function normalizeClassAttribute(value: string) {
  return value
    .split(/\s+/)
    .map((className) => className.trim())
    .filter(Boolean)
    .sort()
    .join('.');
}

function buildEventAttributeKey(tagName: string, attributesSource: string) {
  const idMatch = attributesSource.match(/\bid\s*=\s*(["'])(.*?)\1/i);
  if (idMatch?.[2]) {
    return idMatch[2];
  }

  const classMatch = attributesSource.match(/\bclass\s*=\s*(["'])(.*?)\1/i);
  const classKey = normalizeClassAttribute(classMatch?.[2] ?? '');
  if (!classKey) {
    return '';
  }

  return `${tagName.toLowerCase()}.${classKey}`;
}

function buildEventAttributeKeyFromElement(element: Element) {
  const id = element.getAttribute('id');
  if (id) {
    return id;
  }

  const classKey = normalizeClassAttribute(element.getAttribute('class') ?? '');
  if (!classKey) {
    return '';
  }

  return `${element.tagName.toLowerCase()}.${classKey}`;
}

function collectEventAttributesFromMarkup(markup: string): Record<string, Record<string, string>> {
  const eventAttributesById: Record<string, Record<string, string>> = {};

  for (const match of markup.matchAll(/<([a-z][\w:-]*)\b([^<>]*)>/gi)) {
    const tagName = match[1] ?? '';
    const attributesSource = match[2] ?? '';
    const attributeKey = buildEventAttributeKey(tagName, attributesSource);

    const eventAttributes: Record<string, string> = {};
    for (const eventMatch of attributesSource.matchAll(/\s(on[a-z][\w:-]*)\s*=\s*(["'])(.*?)\2/gi)) {
      if (eventMatch[1] && eventMatch[3] !== undefined) {
        eventAttributes[eventMatch[1]] = eventMatch[3];
      }
    }

    if (attributeKey && Object.keys(eventAttributes).length > 0) {
      eventAttributesById[attributeKey] = eventAttributes;
    }
  }

  return eventAttributesById;
}

function escapeAttributeValue(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function restoreEventAttributesWithDomParser(
  bodyHtml: string,
  eventAttributesById: Record<string, Record<string, string>>,
): string {
  const parsed = new DOMParser().parseFromString(`<body>${bodyHtml}</body>`, 'text/html');
  const elements = Array.from(parsed.body.querySelectorAll('*'));
  const elementsByEventAttributeKey = elements.reduce<Record<string, Element>>((byKey, element) => {
    const attributeKey = buildEventAttributeKeyFromElement(element);
    if (attributeKey && !byKey[attributeKey]) {
      byKey[attributeKey] = element;
    }

    return byKey;
  }, {});

  for (const [attributeKey, eventAttributes] of Object.entries(eventAttributesById)) {
    const element = elementsByEventAttributeKey[attributeKey];
    if (!element) {
      continue;
    }

    for (const [name, value] of Object.entries(eventAttributes)) {
      if (!element.hasAttribute(name)) {
        element.setAttribute(name, value);
      }
    }
  }

  return parsed.body.innerHTML;
}

function restoreEventAttributesWithRegex(
  bodyHtml: string,
  eventAttributesById: Record<string, Record<string, string>>,
): string {
  return bodyHtml.replace(/<([a-z][\w:-]*)\b([^<>]*)>/gi, (fullMatch, tagName: string, attributesSource: string) => {
    const attributeKey = buildEventAttributeKey(tagName, attributesSource);
    if (!attributeKey) {
      return fullMatch;
    }

    const eventAttributes = eventAttributesById[attributeKey];
    if (!eventAttributes) {
      return fullMatch;
    }

    const missingAttributes = Object.entries(eventAttributes)
      .filter(([name]) => !new RegExp(`\\s${name}\\s*=`, 'i').test(attributesSource))
      .map(([name, value]) => ` ${name}="${escapeAttributeValue(value)}"`)
      .join('');

    return missingAttributes ? `<${tagName}${attributesSource}${missingAttributes}>` : fullMatch;
  });
}

function restoreEventAttributes(
  bodyHtml: string,
  eventAttributesById: Record<string, Record<string, string>> | undefined,
): string {
  if (!eventAttributesById || Object.keys(eventAttributesById).length === 0) {
    return bodyHtml;
  }

  if (typeof DOMParser !== 'undefined') {
    return restoreEventAttributesWithDomParser(bodyHtml, eventAttributesById);
  }

  return restoreEventAttributesWithRegex(bodyHtml, eventAttributesById);
}

function parseWithDomParser(content: string): ParsedHtmlDocument {
  const parsed = new DOMParser().parseFromString(content, 'text/html');
  const styles = Array.from(parsed.head.querySelectorAll('style'))
    .map((node) => node.textContent ?? '')
    .filter(Boolean)
    .join('\n\n');
  const bodyScriptMarkup = collectScriptMarkupFromElement(parsed.body);
  const bodyEventAttributes = collectEventAttributesFromElement(parsed.body);

  parsed.head.querySelectorAll('style').forEach((styleNode) => {
    styleNode.remove();
  });
  parsed.body.querySelectorAll('script').forEach((scriptNode) => {
    scriptNode.remove();
  });

  return {
    htmlAttributes: serializeAttributesFromElement(parsed.documentElement),
    bodyAttributes: serializeAttributesFromElement(parsed.body),
    headMarkup: parsed.head.innerHTML.trim(),
    bodyHtml: parsed.body.innerHTML,
    styles,
    bodyScriptMarkup,
    bodyEventAttributes,
  };
}

function parseWithoutDomParser(content: string): ParsedHtmlDocument {
  const htmlMatch = content.match(/<html\b[\s\S]*?>[\s\S]*<\/html>/i);
  const htmlSource = htmlMatch?.[0] ?? content;
  const headMatch = htmlSource.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  const bodyMatch = htmlSource.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);

  return {
    htmlAttributes: getAttributeString(htmlSource, 'html'),
    bodyAttributes: getAttributeString(htmlSource, 'body'),
    headMarkup: stripStyleNodes(headMatch?.[1] ?? ''),
    bodyHtml: stripScriptNodes(bodyMatch?.[1] ?? ''),
    styles: collectStyleContents(headMatch?.[1] ?? ''),
    bodyScriptMarkup: Array.from((bodyMatch?.[1] ?? '').matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi))
      .map((match) => match[0].trim())
      .filter(Boolean)
      .join('\n\n'),
    bodyEventAttributes: collectEventAttributesFromMarkup(bodyMatch?.[1] ?? ''),
  };
}

function parseHtmlDocument(content: string): ParsedHtmlDocument {
  if (typeof DOMParser !== 'undefined') {
    return parseWithDomParser(content);
  }

  return parseWithoutDomParser(content);
}

export function createDocumentSnapshot(content: string): HtmlDocumentSnapshot {
  const parsed = parseHtmlDocument(content);

  return {
    htmlAttributes: parsed.htmlAttributes,
    bodyAttributes: parsed.bodyAttributes,
    headMarkup: parsed.headMarkup,
    bodyScriptMarkup: parsed.bodyScriptMarkup,
    bodyEventAttributes: parsed.bodyEventAttributes,
  };
}

export function createWorkspaceDocument(content: string) {
  const parsed = parseHtmlDocument(content);

  return {
    snapshot: createDocumentSnapshot(content),
    bodyHtml: parsed.bodyHtml,
    styles: parsed.styles,
  };
}

export function buildSavedHtml({
  snapshot,
  bodyHtml,
  css,
}: {
  snapshot: HtmlDocumentSnapshot;
  bodyHtml: string;
  css: string;
}) {
  const headParts = [snapshot.headMarkup];
  const cleanBodyHtml = restoreEventAttributes(stripScriptNodes(bodyHtml), snapshot.bodyEventAttributes);
  if (css.trim()) {
    headParts.push(`<style data-ccui-visual-html-style="true">\n${css}\n</style>`);
  }

  return formatHtmlDocument(`<!doctype html>
<html${snapshot.htmlAttributes}>
<head>
${headParts.filter(Boolean).join('\n')}
</head>
<body${snapshot.bodyAttributes}>
${cleanBodyHtml}
${snapshot.bodyScriptMarkup ?? ''}
</body>
</html>
`);
}

function readHeadMarkup(content: string): string {
  return content.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1]?.trim() ?? '';
}

function collectStyleMarkup(content: string): string {
  return Array.from(stripManagedCanvasStyleNodes(content).matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi))
    .map((match) => match[0]?.trim() ?? '')
    .filter(Boolean)
    .join('\n');
}

function stripHiddenLayerEditCss(css: string) {
  return css
    .replace(/[^{}]*data-ccui-hidden-layer-preview[^{}]*\{[^{}]*\}/gi, '')
    .replace(/[^{}]*data-ccui-hidden-layer-edit-style[^{}]*\{[^{}]*\}/gi, '')
    .trim();
}

function decodeTemporaryHiddenLayerStyle(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function stripTemporaryHiddenLayerAttributesWithDomParser(bodyHtml: string) {
  const parsed = new DOMParser().parseFromString(`<body>${bodyHtml}</body>`, 'text/html');
  parsed.body.querySelectorAll<HTMLElement>('[data-ccui-hidden-layer-preview], [data-ccui-hidden-layer-original-style]').forEach((node) => {
    const encodedOriginalStyle = node.getAttribute('data-ccui-hidden-layer-original-style');
    node.removeAttribute('data-ccui-hidden-layer-preview');
    node.removeAttribute('data-ccui-hidden-layer-original-style');
    if (encodedOriginalStyle == null) {
      return;
    }

    const originalStyle = decodeTemporaryHiddenLayerStyle(encodedOriginalStyle);
    if (originalStyle.trim()) {
      node.setAttribute('style', originalStyle);
    } else {
      node.removeAttribute('style');
    }
  });
  parsed.body.querySelectorAll('[data-ccui-hidden-layer-edit-style]').forEach((node) => {
    node.remove();
  });
  return parsed.body.innerHTML;
}

function stripTemporaryHiddenLayerAttributes(bodyHtml: string) {
  if (typeof DOMParser !== 'undefined') {
    return stripTemporaryHiddenLayerAttributesWithDomParser(bodyHtml);
  }

  return bodyHtml
    .replace(/<([a-z][\w:-]*)([^>]*?)\sdata-ccui-hidden-layer-original-style\s*=\s*(["'])(.*?)\3([^>]*)>/gi, (
      match,
      tagName,
      beforeAttributes,
      _quote,
      encodedOriginalStyle,
      afterAttributes,
    ) => {
      const attributes = `${beforeAttributes}${afterAttributes}`
        .replace(/\sstyle\s*=\s*(["']).*?\1/gi, '')
        .replace(/\sdata-ccui-hidden-layer-preview\s*=\s*(["']).*?\1/gi, '')
        .replace(/\sdata-ccui-hidden-layer-edit-style\s*=\s*(["']).*?\1/gi, '');
      const originalStyle = decodeTemporaryHiddenLayerStyle(encodedOriginalStyle);
      const styleAttribute = originalStyle.trim() ? ` style="${escapeHtmlAttribute(originalStyle)}"` : '';
      return `<${tagName}${attributes}${styleAttribute}>`;
    })
    .replace(/\sdata-ccui-hidden-layer-preview\s*=\s*(["']).*?\1/gi, '')
    .replace(/\sdata-ccui-hidden-layer-original-style\s*=\s*(["']).*?\1/gi, '')
    .replace(/\sdata-ccui-hidden-layer-edit-style\s*=\s*(["']).*?\1/gi, '');
}

function cleanCanvasClassName(value: string) {
  return value
    .split(/\s+/)
    .map((className) => className.trim())
    .filter(Boolean)
    .filter((className) => !className.startsWith('gjs-'))
    .join(' ');
}

function hasRuntimeSnapshotMarkers(sourceHtml: string) {
  return /\bel-popover__reference-wrapper\b|\brole\s*=\s*["']tooltip["']|\bmicro-app\b|\bshadowrootmode\b/i.test(sourceHtml);
}

function cleanImportedCanvasElement(element: Element) {
  if (element.hasAttribute('class')) {
    const cleanClassName = cleanCanvasClassName(element.getAttribute('class') ?? '');
    if (cleanClassName) {
      element.setAttribute('class', cleanClassName);
    } else {
      element.removeAttribute('class');
    }
  }

  Array.from(element.children).forEach((child) => cleanImportedCanvasElement(child));
}

function readBodyInnerMarkup(content: string): string {
  return content.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? content;
}

function getNodeTagName(node: any) {
  return String(node?.tagName ?? '').toLowerCase();
}

function getNodeAttribute(node: any, name: string) {
  const attribute = (node?.attrs ?? []).find((nextAttribute: any) => nextAttribute?.name === name);
  return attribute?.value;
}

function setNodeAttribute(node: any, name: string, value: string) {
  node.attrs = Array.isArray(node.attrs) ? node.attrs : [];
  const attribute = node.attrs.find((nextAttribute: any) => nextAttribute?.name === name);
  if (attribute) {
    attribute.value = value;
    return;
  }

  node.attrs.push({ name, value });
}

function removeNodeAttribute(node: any, name: string) {
  if (!Array.isArray(node?.attrs)) {
    return;
  }

  node.attrs = node.attrs.filter((attribute: any) => attribute?.name !== name);
}

function walkElementNodes(root: any, visit: (node: any) => void) {
  const queue = [...(root?.childNodes ?? [])];
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) {
      continue;
    }

    if (node.tagName) {
      visit(node);
    }

    queue.push(...(node.childNodes ?? []));
  }
}

function parseCssStyleDeclarations(styleText: string) {
  return styleText
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((declarations, declaration) => {
      const separatorIndex = declaration.indexOf(':');
      if (separatorIndex <= 0) {
        return declarations;
      }

      const propertyName = declaration.slice(0, separatorIndex).trim().toLowerCase();
      const propertyValue = declaration.slice(separatorIndex + 1).trim().toLowerCase();
      if (propertyName && propertyValue) {
        declarations[propertyName] = propertyValue;
      }

      return declarations;
    }, {});
}

function parseCssPixelValue(value: string | undefined) {
  if (!value) {
    return null;
  }

  const match = value.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function isOffscreenPositionedStyle(styleText: string) {
  const declarations = parseCssStyleDeclarations(styleText);
  const position = declarations.position;
  if (position !== 'absolute' && position !== 'fixed') {
    return false;
  }

  const left = parseCssPixelValue(declarations.left);
  const top = parseCssPixelValue(declarations.top);
  const right = parseCssPixelValue(declarations.right);
  const bottom = parseCssPixelValue(declarations.bottom);
  const transform = declarations.transform ?? '';

  return Boolean(
    (left !== null && left <= -50)
    || (top !== null && top <= -50)
    || (right !== null && right <= -50)
    || (bottom !== null && bottom <= -50)
    || /translate[xy]?\(\s*-\d{2,}/.test(transform),
  );
}

function isNonEditableByStaticAttributes({
  hidden,
  styleText,
}: {
  hidden: boolean;
  styleText: string;
}) {
  if (hidden) {
    return true;
  }

  const declarations = parseCssStyleDeclarations(styleText);
  return Boolean(
    declarations.display === 'none'
    || declarations.visibility === 'hidden'
    || declarations.opacity === '0'
    || isOffscreenPositionedStyle(styleText),
  );
}

function isDomNonEditableElement(element: Element) {
  return isNonEditableByStaticAttributes({
    hidden: element.hasAttribute('hidden'),
    styleText: element.getAttribute('style') ?? '',
  });
}

function collectTopLevelDomNonEditableElements(root: ParentNode) {
  const elements: Element[] = [];

  const visit = (element: Element, isInsideNonEditable: boolean) => {
    const isNonEditable = isDomNonEditableElement(element);
    if (isNonEditable && !isInsideNonEditable) {
      elements.push(element);
    }

    Array.from(element.children).forEach((child) => visit(child, isInsideNonEditable || isNonEditable));
  };

  Array.from(root.children).forEach((element) => visit(element, false));
  return elements;
}

function collectDomElementIds(root: ParentNode | Element) {
  const ids = new Set<string>();
  const elements = root instanceof Element
    ? [root, ...Array.from(root.querySelectorAll('[id]'))]
    : Array.from(root.querySelectorAll('[id]'));

  elements.forEach((element) => {
    const id = element.getAttribute('id')?.trim();
    if (id) {
      ids.add(id);
    }
  });

  return ids;
}

function collectDomNonEditableElementIds(sourceHtml: string) {
  const sourceDocument = new DOMParser().parseFromString(sourceHtml, 'text/html');
  const ids = new Set<string>();

  collectTopLevelDomNonEditableElements(sourceDocument.body).forEach((element) => {
    collectDomElementIds(element).forEach((id) => ids.add(id));
  });

  return ids;
}

function restoreMissingDomRuntimeAttributes(sourceDocument: Document, canvasDocument: Document) {
  sourceDocument.body.querySelectorAll<HTMLElement>('[id]').forEach((sourceElement) => {
    const canvasElement = canvasDocument.getElementById(sourceElement.id);
    if (!canvasElement || canvasElement.tagName.toLowerCase() !== sourceElement.tagName.toLowerCase()) {
      return;
    }

    Array.from(sourceElement.attributes).forEach(({ name, value }) => {
      const shouldPreserve = /^aria-/i.test(name) || /^data-/i.test(name) || ['role', 'tabindex'].includes(name);
      if (shouldPreserve && !canvasElement.hasAttribute(name)) {
        canvasElement.setAttribute(name, value);
      }
    });
  });
}

function mergeDomCanvasBodyWithSourceNonEditableNodes(sourceHtml: string, canvasBodyHtml: string) {
  const sourceDocument = new DOMParser().parseFromString(sourceHtml, 'text/html');
  const canvasDocument = new DOMParser().parseFromString(`<body>${canvasBodyHtml}</body>`, 'text/html');
  const canvasIds = new Set(
    Array.from(canvasDocument.body.querySelectorAll<HTMLElement>('[id]'))
      .map((element) => element.id)
      .filter(Boolean),
  );

  Array.from(canvasDocument.body.children).forEach((element) => cleanImportedCanvasElement(element));
  restoreMissingDomRuntimeAttributes(sourceDocument, canvasDocument);

  collectTopLevelDomNonEditableElements(sourceDocument.body).forEach((sourceElement) => {
    const sourceId = sourceElement.getAttribute('id') ?? '';
    if (sourceId && canvasIds.has(sourceId)) {
      return;
    }

    const importedNode = canvasDocument.importNode(sourceElement, true);
    canvasDocument.body.appendChild(importedNode);
  });

  return canvasDocument.body.innerHTML;
}

function cloneParse5NodeForParent(node: any, parentNode: any): any {
  const clone: any = {};

  for (const [key, value] of Object.entries(node ?? {})) {
    if (key === 'parentNode') {
      continue;
    }

    if (key === 'attrs' && Array.isArray(value)) {
      clone.attrs = value
        .map((attribute: any) => {
          if (attribute?.name === 'class') {
            const className = cleanCanvasClassName(String(attribute.value ?? ''));
            return className ? { name: 'class', value: className } : null;
          }

          return { ...attribute };
        })
        .filter(Boolean);
      continue;
    }

    if (key === 'childNodes' && Array.isArray(value)) {
      clone.childNodes = [];
      continue;
    }

    clone[key] = value;
  }

  clone.parentNode = parentNode;
  clone.childNodes = Array.isArray(node?.childNodes)
    ? node.childNodes.map((child: any) => cloneParse5NodeForParent(child, clone))
    : clone.childNodes;

  return clone;
}

function isParse5NonEditableElement(node: any) {
  return isNonEditableByStaticAttributes({
    hidden: getNodeAttribute(node, 'hidden') !== undefined,
    styleText: String(getNodeAttribute(node, 'style') ?? ''),
  });
}

function collectTopLevelParse5NonEditableElements(root: any) {
  const elements: any[] = [];

  const visit = (node: any, isInsideNonEditable: boolean) => {
    if (!node?.tagName) {
      return;
    }

    const isNonEditable = isParse5NonEditableElement(node);
    if (isNonEditable && !isInsideNonEditable) {
      elements.push(node);
    }

    (node.childNodes ?? []).forEach((child: any) => visit(child, isInsideNonEditable || isNonEditable));
  };

  (root?.childNodes ?? []).forEach((node: any) => visit(node, false));
  return elements;
}

function collectParse5ElementIds(root: any) {
  const ids = new Set<string>();
  const rootId = String(getNodeAttribute(root, 'id') ?? '').trim();
  if (rootId) {
    ids.add(rootId);
  }

  walkElementNodes(root, (node) => {
    const id = String(getNodeAttribute(node, 'id') ?? '').trim();
    if (id) {
      ids.add(id);
    }
  });

  return ids;
}

function collectParse5NonEditableElementIds(sourceHtml: string) {
  const sourceFragment = parseFragment(readBodyInnerMarkup(sourceHtml)) as any;
  const ids = new Set<string>();

  collectTopLevelParse5NonEditableElements(sourceFragment).forEach((node) => {
    collectParse5ElementIds(node).forEach((id) => ids.add(id));
  });

  return ids;
}

function collectSourceNonEditableElementIds(sourceHtml: string) {
  if (typeof DOMParser !== 'undefined') {
    return collectDomNonEditableElementIds(sourceHtml);
  }

  return collectParse5NonEditableElementIds(sourceHtml);
}

function indexParse5NodesById(root: any) {
  const nodesById = new Map<string, any>();

  walkElementNodes(root, (node) => {
    const id = String(getNodeAttribute(node, 'id') ?? '').trim();
    if (id) {
      nodesById.set(id, node);
    }
  });

  return nodesById;
}

function restoreMissingParse5RuntimeAttributes(sourceFragment: any, canvasFragment: any) {
  const canvasNodesById = indexParse5NodesById(canvasFragment);

  walkElementNodes(sourceFragment, (sourceNode) => {
    const id = String(getNodeAttribute(sourceNode, 'id') ?? '').trim();
    const canvasNode = id ? canvasNodesById.get(id) : null;
    if (!canvasNode || getNodeTagName(canvasNode) !== getNodeTagName(sourceNode)) {
      return;
    }

    (sourceNode.attrs ?? []).forEach((attribute: any) => {
      const name = String(attribute?.name ?? '');
      const shouldPreserve = /^aria-/i.test(name) || /^data-/i.test(name) || ['role', 'tabindex'].includes(name);
      if (shouldPreserve && getNodeAttribute(canvasNode, name) === undefined) {
        setNodeAttribute(canvasNode, name, String(attribute?.value ?? ''));
      }
    });
  });
}

function cleanParse5CanvasRuntimeClasses(root: any) {
  walkElementNodes(root, (node) => {
    const rawClassName = getNodeAttribute(node, 'class');
    if (rawClassName === undefined) {
      return;
    }

    const className = cleanCanvasClassName(rawClassName);
    if (className) {
      setNodeAttribute(node, 'class', className);
    } else {
      removeNodeAttribute(node, 'class');
    }
  });
}

function mergeParse5CanvasBodyWithSourceNonEditableNodes(sourceHtml: string, canvasBodyHtml: string) {
  const sourceFragment = parseFragment(readBodyInnerMarkup(sourceHtml)) as any;
  const canvasFragment = parseFragment(canvasBodyHtml) as any;
  const canvasNodesById = indexParse5NodesById(canvasFragment);

  cleanParse5CanvasRuntimeClasses(canvasFragment);
  restoreMissingParse5RuntimeAttributes(sourceFragment, canvasFragment);

  collectTopLevelParse5NonEditableElements(sourceFragment).forEach((sourceNode) => {
    const sourceId = String(getNodeAttribute(sourceNode, 'id') ?? '').trim();
    if (sourceId && canvasNodesById.has(sourceId)) {
      return;
    }

    const clone = cloneParse5NodeForParent(sourceNode, canvasFragment);
    canvasFragment.childNodes = Array.isArray(canvasFragment.childNodes) ? canvasFragment.childNodes : [];
    canvasFragment.childNodes.push(clone);
  });

  return serialize(canvasFragment);
}

function mergeCanvasBodyWithSourceNonEditableNodes(sourceHtml: string, canvasBodyHtml: string) {
  if (typeof DOMParser !== 'undefined') {
    return mergeDomCanvasBodyWithSourceNonEditableNodes(sourceHtml, canvasBodyHtml);
  }

  return mergeParse5CanvasBodyWithSourceNonEditableNodes(sourceHtml, canvasBodyHtml);
}

export function buildSavedHtmlPreservingHead({
  sourceHtml,
  bodyHtml,
  canvasCss = '',
}: {
  sourceHtml: string;
  bodyHtml: string;
  canvasCss?: string;
}) {
  const snapshot = createDocumentSnapshot(sourceHtml);
  const mergedBodyHtml = hasRuntimeSnapshotMarkers(sourceHtml)
    ? mergeCanvasBodyWithSourceNonEditableNodes(sourceHtml, bodyHtml)
    : null;
  const cleanBodyHtml = restoreEventAttributes(
    stripTemporaryHiddenLayerAttributes(stripScriptNodes(stripManagedCanvasStyleNodes(mergedBodyHtml ?? bodyHtml))),
    snapshot.bodyEventAttributes,
  );
  const headMarkup = stripStyleNodes(readHeadMarkup(sourceHtml));
  const sourceHtmlWithoutManagedCanvasStyles = stripManagedCanvasStyleNodes(sourceHtml);
  const sourceStyleMarkup = collectStyleMarkup(sourceHtmlWithoutManagedCanvasStyles);
  const sourceStyleContents = collectStyleContents(sourceHtmlWithoutManagedCanvasStyles);
  const previousCanvasCssBlocks = collectManagedCanvasStyleContents(sourceHtml);
  const sanitizedLegacyManagedCanvasCss = sanitizeLegacyManagedCanvasCss(
    previousCanvasCssBlocks[previousCanvasCssBlocks.length - 1] ?? '',
  );
  const mergedCanvasCss = removeSourceDuplicatedCanvasCss(
    sourceStyleContents,
    mergeCanvasCssBlocks(sanitizedLegacyManagedCanvasCss.css, canvasCss),
  );
  const persistentCanvasEdits = normalizePersistentCanvasEdits({
    sourceHtml,
    bodyHtml: cleanBodyHtml,
    canvasCss: mergedCanvasCss.css,
  });
  const canvasStyleMarkup = persistentCanvasEdits.canvasCss
    ? `<style data-ccui-visual-html-canvas-style="true">${persistentCanvasEdits.canvasCss}</style>`
    : '';
  const headParts = [headMarkup, sourceStyleMarkup, canvasStyleMarkup].filter(Boolean);

  if (isVisualHtmlSaveDebugEnabled()) {
    pushVisualHtmlSaveDebugEntry({
      timestamp: new Date().toISOString(),
      sourceHtmlLength: sourceHtml.length,
      bodyHtmlLength: bodyHtml.length,
      canvasCssLength: canvasCss.length,
      previousManagedCanvasCssLength: (previousCanvasCssBlocks[previousCanvasCssBlocks.length - 1] ?? '').length,
      sanitizedLegacyManagedCanvasCssLength: sanitizedLegacyManagedCanvasCss.css.length,
      mergedCanvasCssLength: mergedCanvasCss.css.length,
      persistentCanvasCssLength: persistentCanvasEdits.canvasCss.length,
      removedLegacyManagedSelectors: sanitizedLegacyManagedCanvasCss.removedSelectors,
      removedDuplicatedSelectors: mergedCanvasCss.removedSelectors,
      sourceManagedCanvasCss: previousCanvasCssBlocks[previousCanvasCssBlocks.length - 1] ?? '',
      sanitizedLegacyManagedCanvasCss: sanitizedLegacyManagedCanvasCss.css,
      canvasCssInput: canvasCss,
      mergedCanvasCss: mergedCanvasCss.css,
      persistentCanvasCss: persistentCanvasEdits.canvasCss,
    });
  }

  return formatHtmlDocument(`<!doctype html>
<html${snapshot.htmlAttributes}>
<head>
${headParts.join('\n')}
</head>
<body${snapshot.bodyAttributes}>
${persistentCanvasEdits.bodyHtml}
${snapshot.bodyScriptMarkup ?? ''}
</body>
</html>
`);
}
