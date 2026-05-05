import grapesjs from 'grapesjs';

const SCRIPT_TAG_PATTERN = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const SCRIPT_ATTRIBUTE_PATTERN = /([:@\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const MANAGED_HEAD_NODE_ATTRIBUTE = 'data-ccui-canvas-head-node';
const RELATIVE_ASSET_ATTRIBUTE_SELECTORS = [
  ['link[href]', 'href'],
  ['script[src]', 'src'],
  ['img[src]', 'src'],
  ['source[src]', 'src'],
  ['video[src]', 'src'],
  ['audio[src]', 'src'],
] as const;

type CanvasHeadScript = {
  attributes: Record<string, string>;
  content: string;
};

function parseScriptAttributes(attributesSource: string): Record<string, string> {
  const attributes: Record<string, string> = {};

  for (const match of attributesSource.matchAll(SCRIPT_ATTRIBUTE_PATTERN)) {
    const name = match[1]?.trim();
    if (!name) {
      continue;
    }

    attributes[name] = match[2] ?? match[3] ?? match[4] ?? '';
  }

  return attributes;
}

function markManagedNode(node: Node) {
  if (node.nodeType === Node.ELEMENT_NODE) {
    (node as Element).setAttribute(MANAGED_HEAD_NODE_ATTRIBUTE, 'true');
  }
}

function isIframeElement(value: unknown): value is HTMLIFrameElement {
  return typeof HTMLIFrameElement !== 'undefined' && value instanceof HTMLIFrameElement;
}

function resolveCanvasFrameElement(editor: ReturnType<typeof grapesjs.init>): HTMLIFrameElement | null {
  const directFrameElement = editor.Canvas.getFrameEl?.();
  if (isIframeElement(directFrameElement)) {
    return directFrameElement;
  }

  const frameWindow = editor.Canvas.getWindow?.();
  if (isIframeElement(frameWindow?.frameElement)) {
    return frameWindow.frameElement;
  }

  const container = editor.getContainer?.();
  const queriedFrame = container?.querySelector?.('iframe');
  if (isIframeElement(queriedFrame)) {
    return queriedFrame;
  }

  return null;
}

export function resolveCanvasDocument(editor: ReturnType<typeof grapesjs.init>): Document | null {
  const directDocument = editor.Canvas.getDocument?.();
  if (directDocument) {
    return directDocument;
  }

  const frameElement = resolveCanvasFrameElement(editor);
  if (frameElement?.contentDocument) {
    return frameElement.contentDocument;
  }

  const frameWindow = editor.Canvas.getWindow?.();
  if (frameWindow?.document) {
    return frameWindow.document;
  }

  return null;
}

export function resolveCanvasBody(editor: ReturnType<typeof grapesjs.init>): HTMLBodyElement | null {
  const directBody = editor.Canvas.getBody?.();
  if (directBody) {
    return directBody;
  }

  return resolveCanvasDocument(editor)?.body ?? null;
}

export function splitCanvasHeadMarkup(headMarkup: string): {
  staticMarkup: string;
  scripts: CanvasHeadScript[];
} {
  const normalizedMarkup = String(headMarkup ?? '');

  return {
    staticMarkup: normalizedMarkup.replace(SCRIPT_TAG_PATTERN, '').trim(),
    scripts: Array.from(normalizedMarkup.matchAll(SCRIPT_TAG_PATTERN)).map((match) => ({
      attributes: parseScriptAttributes(match[1] ?? ''),
      content: (match[2] ?? '').trim(),
    })),
  };
}

function shouldRewriteRelativeAssetUrl(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }

  return !/^(?:[a-z]+:|\/\/|#|data:|blob:|about:|javascript:)/i.test(normalized);
}

export function rewriteCanvasHeadAssetUrls(headMarkup: string, assetBaseUrl: string | null | undefined) {
  const normalizedMarkup = String(headMarkup ?? '').trim();
  const normalizedBaseUrl = String(assetBaseUrl ?? '').trim();
  if (!normalizedMarkup || !normalizedBaseUrl) {
    return normalizedMarkup;
  }

  if (typeof DOMParser === 'undefined') {
    return normalizedMarkup.replace(
      /\b(href|src)\s*=\s*(["'])(.*?)\2/gi,
      (fullMatch, attributeName: string, quote: string, rawValue: string) => {
        if (!shouldRewriteRelativeAssetUrl(rawValue)) {
          return fullMatch;
        }

        try {
          return `${attributeName}=${quote}${new URL(rawValue, normalizedBaseUrl).toString()}${quote}`;
        } catch {
          return fullMatch;
        }
      },
    );
  }

  const parsed = new DOMParser().parseFromString(`<head>${normalizedMarkup}</head>`, 'text/html');
  RELATIVE_ASSET_ATTRIBUTE_SELECTORS.forEach(([selector, attributeName]) => {
    parsed.head.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      const rawValue = element.getAttribute(attributeName)?.trim();
      if (!rawValue || !shouldRewriteRelativeAssetUrl(rawValue)) {
        return;
      }

      try {
        element.setAttribute(attributeName, new URL(rawValue, normalizedBaseUrl).toString());
      } catch {
        // Ignore malformed asset URLs and keep original markup.
      }
    });
  });

  return parsed.head.innerHTML.trim();
}

export function injectCanvasHeadMarkup(editor: ReturnType<typeof grapesjs.init>, headMarkup: string) {
  const canvasDocument = resolveCanvasDocument(editor);
  if (!canvasDocument?.head) {
    return;
  }

  canvasDocument.head.querySelectorAll(`[${MANAGED_HEAD_NODE_ATTRIBUTE}]`).forEach((node) => {
    node.remove();
  });

  const { staticMarkup, scripts } = splitCanvasHeadMarkup(headMarkup);

  if (staticMarkup) {
    const template = canvasDocument.createElement('template');
    template.innerHTML = staticMarkup;
    Array.from(template.content.childNodes).forEach((node) => {
      // <link> elements must be created directly via createElement to trigger
      // stylesheet loading — cloneNode does not fetch linked resources
      if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName.toLowerCase() === 'link') {
        const linkElement = canvasDocument.createElement('link');
        const source = node as Element;
        for (const attr of Array.from(source.attributes)) {
          linkElement.setAttribute(attr.name, attr.value);
        }
        markManagedNode(linkElement);
        canvasDocument.head.appendChild(linkElement);
        return;
      }

      const clone = node.cloneNode(true);
      markManagedNode(clone);
      canvasDocument.head.appendChild(clone);
    });
  }

  scripts.forEach(({ attributes, content }) => {
    const scriptElement = canvasDocument.createElement('script');
    Object.entries(attributes).forEach(([name, value]) => {
      scriptElement.setAttribute(name, value);
    });
    if (content) {
      scriptElement.textContent = content;
    }
    scriptElement.setAttribute(MANAGED_HEAD_NODE_ATTRIBUTE, 'true');
    canvasDocument.head.appendChild(scriptElement);
  });
}
