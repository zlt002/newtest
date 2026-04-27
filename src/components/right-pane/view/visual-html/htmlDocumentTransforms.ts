import { formatHtmlDocument } from './formatHtmlDocument.js';

export type HtmlDocumentSnapshot = {
  htmlAttributes: string;
  bodyAttributes: string;
  headMarkup: string;
};

type ParsedHtmlDocument = {
  htmlAttributes: string;
  bodyAttributes: string;
  headMarkup: string;
  bodyHtml: string;
  styles: string;
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

function parseWithDomParser(content: string): ParsedHtmlDocument {
  const parsed = new DOMParser().parseFromString(content, 'text/html');
  const styles = Array.from(parsed.head.querySelectorAll('style'))
    .map((node) => node.textContent ?? '')
    .filter(Boolean)
    .join('\n\n');

  parsed.head.querySelectorAll('style').forEach((styleNode) => {
    styleNode.remove();
  });

  return {
    htmlAttributes: serializeAttributesFromElement(parsed.documentElement),
    bodyAttributes: serializeAttributesFromElement(parsed.body),
    headMarkup: parsed.head.innerHTML.trim(),
    bodyHtml: parsed.body.innerHTML,
    styles,
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
    bodyHtml: bodyMatch?.[1] ?? '',
    styles: collectStyleContents(headMatch?.[1] ?? ''),
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
  if (css.trim()) {
    headParts.push(`<style data-ccui-visual-html-style="true">\n${css}\n</style>`);
  }

  return formatHtmlDocument(`<!doctype html>
<html${snapshot.htmlAttributes}>
<head>
${headParts.filter(Boolean).join('\n')}
</head>
<body${snapshot.bodyAttributes}>
${bodyHtml}
</body>
</html>
`);
}
