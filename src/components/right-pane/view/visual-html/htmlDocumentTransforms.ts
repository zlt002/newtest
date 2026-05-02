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
  const elements = Array.from(element.querySelectorAll('[id]'));

  for (const node of elements) {
    const eventAttributes = Array.from(node.attributes)
      .filter(({ name }) => /^on[a-z]/i.test(name))
      .reduce<Record<string, string>>((attributes, { name, value }) => {
        attributes[name] = value;
        return attributes;
      }, {});

    if (Object.keys(eventAttributes).length > 0) {
      eventAttributesById[node.id] = eventAttributes;
    }
  }

  return eventAttributesById;
}

function collectEventAttributesFromMarkup(markup: string): Record<string, Record<string, string>> {
  const eventAttributesById: Record<string, Record<string, string>> = {};

  for (const match of markup.matchAll(/<([a-z][\w:-]*)\b([^<>]*)>/gi)) {
    const attributesSource = match[2] ?? '';
    const idMatch = attributesSource.match(/\bid\s*=\s*(["'])(.*?)\1/i);
    if (!idMatch?.[2]) {
      continue;
    }

    const eventAttributes: Record<string, string> = {};
    for (const eventMatch of attributesSource.matchAll(/\s(on[a-z][\w:-]*)\s*=\s*(["'])(.*?)\2/gi)) {
      if (eventMatch[1] && eventMatch[3] !== undefined) {
        eventAttributes[eventMatch[1]] = eventMatch[3];
      }
    }

    if (Object.keys(eventAttributes).length > 0) {
      eventAttributesById[idMatch[2]] = eventAttributes;
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
  const elementsWithIds = Array.from(parsed.body.querySelectorAll('[id]'));

  for (const [id, eventAttributes] of Object.entries(eventAttributesById)) {
    const element = elementsWithIds.find((node) => node.id === id);
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
    const idMatch = attributesSource.match(/\bid\s*=\s*(["'])(.*?)\1/i);
    if (!idMatch?.[2]) {
      return fullMatch;
    }

    const eventAttributes = eventAttributesById[idMatch[2]];
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
  return Array.from(content.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi))
    .map((match) => match[0]?.trim() ?? '')
    .filter(Boolean)
    .join('\n');
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
  const cleanBodyHtml = restoreEventAttributes(stripScriptNodes(stripStyleNodes(mergedBodyHtml ?? bodyHtml)), snapshot.bodyEventAttributes);
  const headMarkup = stripStyleNodes(readHeadMarkup(sourceHtml));
  const sourceStyleMarkup = collectStyleMarkup(sourceHtml);
  const canvasStyleMarkup = canvasCss.trim()
    ? `<style data-ccui-visual-html-canvas-style="true">\n${canvasCss}\n</style>`
    : '';
  const headParts = [headMarkup, sourceStyleMarkup, canvasStyleMarkup].filter(Boolean);

  return formatHtmlDocument(`<!doctype html>
<html${snapshot.htmlAttributes}>
<head>
${headParts.join('\n')}
</head>
<body${snapshot.bodyAttributes}>
${cleanBodyHtml}
${snapshot.bodyScriptMarkup ?? ''}
</body>
</html>
`);
}
