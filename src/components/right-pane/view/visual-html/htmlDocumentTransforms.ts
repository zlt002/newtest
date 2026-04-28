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
