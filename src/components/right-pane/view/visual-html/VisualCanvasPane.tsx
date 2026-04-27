import grapesjs from 'grapesjs';
import 'grapesjs/dist/css/grapes.min.css';
import './VisualCanvasPane.css';
import { useEffect, useRef } from 'react';
import { registerVisualHtmlBlocks } from './grapesjsBlockRegistry';
import { registerVisualHtmlComponentTypes } from './grapesjsComponentRegistry';
import grapesjsZhCn from './grapesjsZhCn';

type VisualCanvasPaneProps = {
  bodyHtml: string;
  styles: string;
  onEditorReady?: (editor: ReturnType<typeof grapesjs.init> | null) => void;
  onDirtyChange?: (isDirty: boolean, editor: ReturnType<typeof grapesjs.init>) => void;
};

export default function VisualCanvasPane({
  bodyHtml,
  styles,
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

    const editor = grapesjs.init({
      container: containerRef.current,
      fromElement: false,
      height: '100%',
      width: 'auto',
      storageManager: false,
      noticeOnUnload: false,
      selectorManager: { componentFirst: true },
      components: bodyHtml,
      style: styles,
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

    editor.on('update', notifyDirty);
    editor.clearDirtyCount();
    onEditorReadyRef.current?.(editor);
    notifyDirty();

    return () => {
      editor.off('update', notifyDirty);
      editor.destroy();
      editorRef.current = null;
      onEditorReadyRef.current?.(null);
    };
  }, [bodyHtml, styles]);

  return <div ref={containerRef} className="ccui-visual-canvas h-full min-h-0" data-visual-html-mode="design" />;
}
