import grapesjs from 'grapesjs';

const SCRIPT_TAG_PATTERN = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const SCRIPT_ATTRIBUTE_PATTERN = /([:@\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const MANAGED_HEAD_NODE_ATTRIBUTE = 'data-ccui-canvas-head-node';

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

export function injectCanvasHeadMarkup(editor: ReturnType<typeof grapesjs.init>, headMarkup: string) {
  const canvasDocument = editor.Canvas.getDocument?.();
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
