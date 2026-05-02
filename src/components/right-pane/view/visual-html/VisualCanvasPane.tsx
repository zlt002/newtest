import grapesjs from 'grapesjs';
import 'grapesjs/dist/css/grapes.min.css';
import './VisualCanvasPane.css';
import { useEffect, useRef } from 'react';
import { injectCanvasHeadMarkup } from './canvasHeadMarkup';
import { registerVisualHtmlBlocks } from './grapesjsBlockRegistry';
import { registerVisualHtmlComponentTypes } from './grapesjsComponentRegistry';
import grapesjsZhCn from './grapesjsZhCn';

type VisualCanvasPaneProps = {
  fullHtml: string;
  onEditorReady?: (editor: ReturnType<typeof grapesjs.init> | null) => void;
  onDirtyChange?: (isDirty: boolean, editor: ReturnType<typeof grapesjs.init>) => void;
};

const RAW_CANVAS_STYLE_ATTRIBUTE = 'data-ccui-raw-canvas-style';

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
  const htmlWithoutCanvasCsp = stripCanvasSecurityPolicyMeta(fullHtml);
  const rootCustomProperties = extractRootCustomProperties(htmlWithoutCanvasCsp);
  const rootDeclarations = serializeCustomProperties(rootCustomProperties);
  const htmlWithInlinedVariables = inlineCustomPropertyReferences(htmlWithoutCanvasCsp, rootCustomProperties);
  if (!rootDeclarations) {
    return htmlWithInlinedVariables;
  }

  let nextHtml = htmlWithInlinedVariables.replace(/<html\b[^>]*>/i, (match) => appendInlineStyleAttribute(match, rootDeclarations));

  if (/<body\b[^>]*>/i.test(nextHtml)) {
    nextHtml = nextHtml.replace(/<body\b[^>]*>/i, (match) => appendInlineStyleAttribute(match, rootDeclarations));
  }

  return nextHtml;
}

function collectStyleMarkup(fullHtml: string): string {
  return Array.from(fullHtml.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi))
    .map((match) => match[0] ?? '')
    .filter(Boolean)
    .join('\n');
}

function stripHeadRuntimeMarkup(markup: string): string {
  return markup
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
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

function createCanvasStructureHtml(fullHtml: string): string {
  const htmlAttributes = readTagAttributes(fullHtml, 'html');
  const bodyAttributes = readTagAttributes(fullHtml, 'body');
  const bodyMarkup = stripCanvasStructureRuntimeMarkup(readBodyMarkup(fullHtml));

  return `<!doctype html>
<html${htmlAttributes}>
<head></head>
<body${bodyAttributes}>
${bodyMarkup}
</body>
</html>`;
}

function injectRawCanvasStyles(editor: ReturnType<typeof grapesjs.init>, styleMarkup: string) {
  const canvasDocument = editor.Canvas.getDocument?.();
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

function isNonVisualEditableElement(element: HTMLElement, viewportWidth: number, viewportHeight: number) {
  if (element === element.ownerDocument.body || element === element.ownerDocument.documentElement) {
    return false;
  }

  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) {
    return false;
  }

  const display = style.display;
  const visibility = style.visibility;
  const opacity = style.opacity;
  if (display === 'none' || visibility === 'hidden' || opacity === '0') {
    return true;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return true;
  }

  const position = style.position;
  return (position === 'absolute' || position === 'fixed')
    && isElementCompletelyOutsideViewport(rect, viewportWidth, viewportHeight);
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
  const canvasDocument = editor.Canvas.getDocument?.();
  const canvasWindow = canvasDocument?.defaultView;
  const wrapper = editor.DomComponents?.getWrapper?.() as any;
  if (!canvasDocument?.body || !canvasWindow || !wrapper) {
    return;
  }

  const viewportWidth = canvasWindow.innerWidth || canvasDocument.documentElement.clientWidth || canvasDocument.body.clientWidth;
  const viewportHeight = canvasWindow.innerHeight || canvasDocument.documentElement.clientHeight || canvasDocument.body.clientHeight;
  const visit = (component: any) => {
    readComponentChildren(component).forEach(visit);

    const element = component?.getEl?.() as HTMLElement | null;
    if (!element || !canvasDocument.body.contains(element)) {
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

export default function VisualCanvasPane({
  fullHtml,
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
    if (!containerRef.current) {
      return undefined;
    }

    const canvasHtml = normalizeDesignCanvasHtml(fullHtml);
    const rawStyleMarkup = collectStyleMarkup(canvasHtml);
    const canvasHeadMarkup = collectCanvasHeadMarkup(canvasHtml);
    const canvasStructureHtml = createCanvasStructureHtml(canvasHtml);
    logCanvasPerf('prepared', {
      fullHtmlLength: fullHtml.length,
      normalizedHtmlLength: canvasHtml.length,
      structureHtmlLength: canvasStructureHtml.length,
      rawStyleMarkupLength: rawStyleMarkup.length,
      canvasHeadMarkupLength: canvasHeadMarkup.length,
      structureReductionPercent: canvasHtml.length > 0
        ? Math.round((1 - canvasStructureHtml.length / canvasHtml.length) * 10000) / 100
        : 0,
    });
    const pendingStyleSyncTimeouts: number[] = [];
    const visualEditableFilterRef = { current: false };
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

    const notifyDirty = () => {
      onDirtyChangeRef.current?.(editor.getDirtyCount() > 0, editor);
    };
    const syncCanvasHeadMarkup = () => {
      const canvasDocument = editor.Canvas.getDocument?.();
      if (!canvasDocument?.head) {
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
    };
    const scheduleCanvasHeadMarkupSync = () => {
      const disableInitialNonVisualEditableComponents = () => {
        if (visualEditableFilterRef.current) {
          return;
        }

        disableNonVisualEditableCanvasComponents(editor);
        visualEditableFilterRef.current = true;
      };

      syncCanvasHeadMarkup();
      disableInitialNonVisualEditableComponents();
      [0, 50, 150, 350].forEach((delay) => {
        const timeout = window.setTimeout(() => {
          syncCanvasHeadMarkup();
          disableInitialNonVisualEditableComponents();
        }, delay);
        pendingStyleSyncTimeouts.push(timeout);
      });
    };

    editor.on('update', notifyDirty);
    editor.on('canvas:frame:load', scheduleCanvasHeadMarkupSync);
    editor.on('canvas:frame:load:body', scheduleCanvasHeadMarkupSync);
    editor.clearDirtyCount();
    scheduleCanvasHeadMarkupSync();
    onEditorReadyRef.current?.(editor);
    notifyDirty();

    return () => {
      pendingStyleSyncTimeouts.forEach((timeout) => {
        window.clearTimeout(timeout);
      });
      editor.off('update', notifyDirty);
      editor.off('canvas:frame:load', scheduleCanvasHeadMarkupSync);
      editor.off('canvas:frame:load:body', scheduleCanvasHeadMarkupSync);
      editor.destroy();
      editorRef.current = null;
      onEditorReadyRef.current?.(null);
    };
  }, [fullHtml]);

  return <div ref={containerRef} className="ccui-visual-canvas h-full min-h-0" data-visual-html-mode="design" />;
}
