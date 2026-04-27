const TEMPLATE_PATTERNS = [/\{\{[\s\S]*?\}\}/, /\{%[\s\S]*?%\}/, /<%[\s\S]*?%>/];
const HTML_ROOT_PATTERN = /<html\b[^>]*>[\s\S]*<\/html>/i;
const BODY_PATTERN = /<body\b[^>]*>[\s\S]*<\/body>/i;
const HEAD_PATTERN = /<head\b[^>]*>[\s\S]*<\/head>/i;
const DOCTYPE_PATTERN = /^\s*<!doctype\s+html\b/i;
const SCRIPT_TAG_PATTERN = /<script\b([^>]*)>[\s\S]*?<\/script>/gi;
const EXTERNAL_SCRIPT_PATTERN = /\bsrc\s*=/i;

function hasTrustedHtmlStructure(content: string): boolean {
  if (!HTML_ROOT_PATTERN.test(content) || !BODY_PATTERN.test(content)) {
    return false;
  }

  return DOCTYPE_PATTERN.test(content) || HEAD_PATTERN.test(content);
}

function hasNoExternalScripts(content: string): boolean {
  const matches = Array.from(content.matchAll(SCRIPT_TAG_PATTERN));

  for (const match of matches) {
    const attributes = match[1] ?? '';

    if (EXTERNAL_SCRIPT_PATTERN.test(attributes)) {
      return false;
    }
  }

  return true;
}

export function isHtmlEligibleForVisualEditing(content: string): boolean {
  const normalized = content.trim();
  if (!normalized) {
    return false;
  }

  if (!hasTrustedHtmlStructure(normalized)) {
    return false;
  }

  if (TEMPLATE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }

  if (!hasNoExternalScripts(normalized)) {
    return false;
  }

  return true;
}
