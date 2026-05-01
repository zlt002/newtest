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

function normalizeDesignCanvasHtml(fullHtml: string): string {
  const rootCustomProperties = extractRootCustomProperties(fullHtml);
  const rootDeclarations = serializeCustomProperties(rootCustomProperties);
  const htmlWithInlinedVariables = inlineCustomPropertyReferences(fullHtml, rootCustomProperties);
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
    const pendingStyleSyncTimeouts: number[] = [];
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

    editor.getWrapper()?.components(canvasHtml, {
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
      injectCanvasHeadMarkup(editor, '');
      injectRawCanvasStyles(editor, rawStyleMarkup);
    };
    const scheduleCanvasHeadMarkupSync = () => {
      syncCanvasHeadMarkup();
      [0, 50, 150, 350].forEach((delay) => {
        const timeout = window.setTimeout(syncCanvasHeadMarkup, delay);
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
