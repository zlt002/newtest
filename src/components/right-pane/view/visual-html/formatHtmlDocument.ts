const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

type HtmlToken =
  | { type: 'doctype'; value: string }
  | { type: 'comment'; value: string }
  | { type: 'startTag'; value: string; tagName: string; selfClosing: boolean }
  | { type: 'endTag'; value: string; tagName: string }
  | { type: 'text'; value: string };

function getTagName(tagSource: string): string {
  return tagSource.match(/^<\s*\/?\s*([a-zA-Z0-9-]+)/)?.[1]?.toLowerCase() ?? '';
}

function isSelfClosingTag(tagSource: string, tagName: string): boolean {
  return /\/\s*>$/.test(tagSource) || VOID_ELEMENTS.has(tagName);
}

function tokenizeHtml(source: string): HtmlToken[] {
  const tokens: HtmlToken[] = [];
  let index = 0;

  while (index < source.length) {
    const nextTagIndex = source.indexOf('<', index);
    if (nextTagIndex < 0) {
      const text = source.slice(index);
      if (text.trim()) {
        tokens.push({ type: 'text', value: text });
      }
      break;
    }

    const text = source.slice(index, nextTagIndex);
    if (text.trim()) {
      tokens.push({ type: 'text', value: text });
    }

    if (source.startsWith('<!--', nextTagIndex)) {
      const commentEnd = source.indexOf('-->', nextTagIndex);
      const endIndex = commentEnd >= 0 ? commentEnd + 3 : source.length;
      tokens.push({ type: 'comment', value: source.slice(nextTagIndex, endIndex) });
      index = endIndex;
      continue;
    }

    if (/^<!doctype/i.test(source.slice(nextTagIndex, nextTagIndex + 10))) {
      const doctypeEnd = source.indexOf('>', nextTagIndex);
      const endIndex = doctypeEnd >= 0 ? doctypeEnd + 1 : source.length;
      tokens.push({ type: 'doctype', value: source.slice(nextTagIndex, endIndex) });
      index = endIndex;
      continue;
    }

    const tagEnd = source.indexOf('>', nextTagIndex);
    if (tagEnd < 0) {
      const trailing = source.slice(nextTagIndex);
      if (trailing.trim()) {
        tokens.push({ type: 'text', value: trailing });
      }
      break;
    }

    const tagSource = source.slice(nextTagIndex, tagEnd + 1);
    if (/^<\//.test(tagSource)) {
      const tagName = getTagName(tagSource);
      tokens.push({ type: 'endTag', value: tagSource, tagName });
      index = tagEnd + 1;
      continue;
    }

    const tagName = getTagName(tagSource);
    const selfClosing = isSelfClosingTag(tagSource, tagName);
    tokens.push({ type: 'startTag', value: tagSource, tagName, selfClosing });
    index = tagEnd + 1;
  }

  return tokens;
}

function indentLine(line: string, level: number) {
  const trimmed = line.trim();
  if (!trimmed) {
    return '';
  }

  return `${'  '.repeat(Math.max(level, 0))}${trimmed}`;
}

function formatTextBlock(value: string, indentLevel: number): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => indentLine(line, indentLevel));
}

export function formatHtmlDocument(source: string): string {
  const normalizedSource = source.replace(/\r\n/g, '\n').trim();
  if (!normalizedSource) {
    return '';
  }

  const tokens = tokenizeHtml(normalizedSource);
  const lines: string[] = [];
  let indentLevel = 0;

  tokens.forEach((token) => {
    if (token.type === 'doctype' || token.type === 'comment') {
      lines.push(indentLine(token.value, indentLevel));
      return;
    }

    if (token.type === 'text') {
      lines.push(...formatTextBlock(token.value, indentLevel));
      return;
    }

    if (token.type === 'endTag') {
      indentLevel = Math.max(indentLevel - 1, 0);
      lines.push(indentLine(token.value, indentLevel));
      return;
    }

    lines.push(indentLine(token.value, indentLevel));
    if (!token.selfClosing) {
      indentLevel += 1;
    }
  });

  return `${lines.filter(Boolean).join('\n').trimEnd()}\n`;
}
