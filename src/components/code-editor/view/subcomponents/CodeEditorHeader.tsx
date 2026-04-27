import { Code2, Download, Eye, Maximize2, MessageSquarePlus, Minimize2, Save, Settings as SettingsIcon, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CodeEditorFile } from '../../types/types';
import MarkdownAnnotationToolbarMenu, { type MarkdownToolbarAnnotationItem } from './MarkdownAnnotationToolbarMenu';

type CodeEditorHeaderProps = {
  file: CodeEditorFile;
  isSidebar: boolean;
  isFullscreen: boolean;
  isMarkdownFile: boolean;
  markdownPreview: boolean;
  saving: boolean;
  saveSuccess: boolean;
  markdownAnnotationCount?: number;
  canAddAnnotationsToChatInput?: boolean;
  markdownToolbarItems?: MarkdownToolbarAnnotationItem[];
  onToggleMarkdownPreview: () => void;
  onAddAnnotationsToChatInput?: (() => void) | null;
  onRequestEditAnnotation?: ((annotationId: string) => void) | null;
  onDeleteAnnotation?: ((annotationId: string) => void) | null;
  onSendAnnotationToChatInput?: ((annotationId: string) => void) | null;
  onOpenSettings: () => void;
  showVisualHtmlAction?: boolean;
  onOpenVisualHtmlEditor?: (() => void) | null;
  onPopOut?: (() => void) | null;
  onDownload: () => void;
  onDownloadAsMarkdown?: (() => void) | null;
  onDownloadAsDoc?: (() => void) | null;
  onSave: () => void;
  onToggleFullscreen: () => void;
  onClose: () => void;
  labels: {
    showingChanges: string;
    editMarkdown: string;
    previewMarkdown: string;
    settings: string;
    download: string;
    downloadMarkdown: string;
    downloadDoc: string;
    save: string;
    saving: string;
    saved: string;
    addAnnotationsToChatInput: string;
    addAnnotationsUnavailable: string;
    fullscreen: string;
    exitFullscreen: string;
    close: string;
  };
};

export default function CodeEditorHeader({
  file,
  isSidebar,
  isFullscreen,
  isMarkdownFile,
  markdownPreview,
  saving,
  saveSuccess,
  markdownAnnotationCount = 0,
  canAddAnnotationsToChatInput = false,
  markdownToolbarItems = [],
  onToggleMarkdownPreview,
  onAddAnnotationsToChatInput = null,
  onRequestEditAnnotation = null,
  onDeleteAnnotation = null,
  onSendAnnotationToChatInput = null,
  onOpenSettings,
  showVisualHtmlAction = false,
  onOpenVisualHtmlEditor = null,
  onPopOut = null,
  onDownload,
  onDownloadAsMarkdown = null,
  onDownloadAsDoc = null,
  onSave,
  onToggleFullscreen,
  onClose,
  labels,
}: CodeEditorHeaderProps) {
  const [isAnnotationsMenuOpen, setIsAnnotationsMenuOpen] = useState(false);
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const annotationsMenuRef = useRef<HTMLDivElement>(null);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const saveTitle = saveSuccess ? labels.saved : saving ? labels.saving : labels.save;
  const addAnnotationsTitle = canAddAnnotationsToChatInput
    ? `${labels.addAnnotationsToChatInput}${markdownAnnotationCount > 0 ? `（${markdownAnnotationCount}）` : ''}`
    : labels.addAnnotationsUnavailable;
  const isMarkdownPreviewMode = isMarkdownFile && markdownPreview;
  const showPreviewFullscreen = isMarkdownPreviewMode;

  useEffect(() => {
    if (!isAnnotationsMenuOpen && !isDownloadMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedOutsideAnnotationsMenu = annotationsMenuRef.current && !annotationsMenuRef.current.contains(target);
      const clickedOutsideDownloadMenu = downloadMenuRef.current && !downloadMenuRef.current.contains(target);

      if (clickedOutsideAnnotationsMenu) {
        setIsAnnotationsMenuOpen(false);
      }

      if (clickedOutsideDownloadMenu) {
        setIsDownloadMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsAnnotationsMenuOpen(false);
        setIsDownloadMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isAnnotationsMenuOpen, isDownloadMenuOpen]);

  return (
    <div className="flex flex-shrink-0 gap-2 justify-between items-center px-3 py-2 min-w-0 h-12 border-b border-border">
      {/* File info - can shrink */}
      <div className="flex flex-1 gap-2 items-center min-w-0 shrink">
        <div className="min-w-0 shrink">
          <div className="flex gap-2 items-center min-w-0">
            {file.diffInfo && (
              <span className="shrink-0 whitespace-nowrap rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-600 dark:bg-blue-900 dark:text-blue-300">
                {labels.showingChanges}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 truncate dark:text-gray-400">{file.path}</p>
        </div>
      </div>

      {/* Buttons - don't shrink, always visible */}
      <div className="flex shrink-0 items-center gap-0.5">
        {isMarkdownFile && (
          <button
            type="button"
            onClick={onToggleMarkdownPreview}
            className={`flex items-center justify-center rounded-md p-1.5 transition-colors ${
              markdownPreview
                ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white'
            }`}
            title={markdownPreview ? labels.editMarkdown : labels.previewMarkdown}
          >
            {markdownPreview ? <Code2 className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}

        {isMarkdownFile && markdownPreview && (
          <div
            className="relative"
            ref={annotationsMenuRef}
          >
            <button
              type="button"
              onClick={() => setIsAnnotationsMenuOpen((previous) => !previous)}
              aria-expanded={isAnnotationsMenuOpen}
              aria-haspopup="menu"
              className={`relative flex items-center justify-center rounded-md p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                isAnnotationsMenuOpen || canAddAnnotationsToChatInput
                  ? 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white'
                  : 'text-gray-400 dark:text-gray-600'
              }`}
              title={addAnnotationsTitle}
              aria-label={addAnnotationsTitle}
            >
              <MessageSquarePlus className="w-4 h-4" />
              {markdownAnnotationCount > 0 && (
                <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-blue-600 px-1 text-center text-[10px] leading-4 text-white">
                  {markdownAnnotationCount}
                </span>
              )}
            </button>
            {isAnnotationsMenuOpen && (
              <MarkdownAnnotationToolbarMenu
                items={markdownToolbarItems}
                onEdit={(annotationId) => {
                  onRequestEditAnnotation?.(annotationId);
                  window.setTimeout(() => {
                    setIsAnnotationsMenuOpen(false);
                  }, 0);
                }}
                onDelete={(annotationId) => {
                  onDeleteAnnotation?.(annotationId);
                }}
                onSend={(annotationId) => {
                  onSendAnnotationToChatInput?.(annotationId);
                  window.setTimeout(() => {
                    setIsAnnotationsMenuOpen(false);
                  }, 0);
                }}
                onSendAll={onAddAnnotationsToChatInput
                  ? () => {
                    onAddAnnotationsToChatInput();
                    window.setTimeout(() => {
                      setIsAnnotationsMenuOpen(false);
                    }, 0);
                  }
                  : null}
              />
            )}
          </div>
        )}

        {showVisualHtmlAction && onOpenVisualHtmlEditor && (
          <button
            type="button"
            onClick={onOpenVisualHtmlEditor}
            className="px-2 py-1 text-xs font-medium text-gray-600 rounded-md border transition-colors border-border hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
            title="可视化编辑"
          >
            可视化编辑
          </button>
        )}

        {!isMarkdownPreviewMode && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center justify-center rounded-md p-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
            title={labels.settings}
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
        )}

        {isMarkdownPreviewMode && onDownloadAsMarkdown && onDownloadAsDoc ? (
          <div
            className="relative"
            ref={downloadMenuRef}
          >
            <button
              type="button"
              onClick={() => setIsDownloadMenuOpen((previous) => !previous)}
              aria-expanded={isDownloadMenuOpen}
              aria-haspopup="menu"
              className="flex items-center justify-center rounded-md p-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
              title={labels.download}
            >
              <Download className="w-4 h-4" />
            </button>
            {isDownloadMenuOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 min-w-36 rounded-md border border-border bg-background p-1 shadow-lg">
                <button
                  type="button"
                  className="flex w-full rounded px-2 py-1.5 text-left text-xs text-foreground hover:bg-muted"
                  onClick={() => {
                    onDownloadAsMarkdown();
                    setIsDownloadMenuOpen(false);
                  }}
                >
                  {labels.downloadMarkdown}
                </button>
                <button
                  type="button"
                  className="flex w-full rounded px-2 py-1.5 text-left text-xs text-foreground hover:bg-muted"
                  onClick={() => {
                    onDownloadAsDoc();
                    setIsDownloadMenuOpen(false);
                  }}
                >
                  {labels.downloadDoc}
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={onDownload}
            className="flex items-center justify-center rounded-md p-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
            title={labels.download}
          >
            <Download className="w-4 h-4" />
          </button>
        )}

        {!isMarkdownPreviewMode && (
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className={`flex items-center justify-center rounded-md p-1.5 transition-colors disabled:opacity-50 ${
              saveSuccess
                ? 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white'
            }`}
            title={saveTitle}
          >
            {saveSuccess ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <Save className="w-4 h-4" />
            )}
          </button>
        )}

        {showPreviewFullscreen && (
          <button
            type="button"
            onClick={onToggleFullscreen}
            className="flex items-center justify-center rounded-md p-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
            title={isFullscreen ? labels.exitFullscreen : labels.fullscreen}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        )}

        {!isSidebar && !isMarkdownPreviewMode && (
          <button
            type="button"
            onClick={onToggleFullscreen}
            className="flex items-center justify-center rounded-md p-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
            title={isFullscreen ? labels.exitFullscreen : labels.fullscreen}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center rounded-md p-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
          title={labels.close}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
