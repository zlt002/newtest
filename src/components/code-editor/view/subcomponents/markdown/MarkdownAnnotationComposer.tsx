import { useEffect, useRef, useState, type ChangeEvent } from 'react';

const PREVIEW_MAX_HEIGHT = 420;

type MarkdownAnnotationComposerProps = {
  isOpen: boolean;
  position: {
    x: number;
    y: number;
  };
  selectedText: string;
  note: string;
  saving?: boolean;
  error?: string | null;
  onNoteChange: (value: string) => void;
  onSendToChatInput?: (() => void) | null;
  onSave: () => void;
  onCancel: () => void;
};

export default function MarkdownAnnotationComposer({
  isOpen,
  position,
  selectedText,
  note,
  saving = false,
  error = null,
  onNoteChange,
  onSendToChatInput = null,
  onSave,
  onCancel,
}: MarkdownAnnotationComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isSelectedTextPreviewOpen, setIsSelectedTextPreviewOpen] = useState(false);
  const canExpandSelectedText =
    selectedText.length > 140 || selectedText.split(/\r?\n/).length > 3;

  useEffect(() => {
    if (isOpen) {
      textareaRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setIsSelectedTextPreviewOpen(false);
    }
  }, [isOpen, selectedText]);

  if (!isOpen) {
    return null;
  }

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onNoteChange(event.target.value);
  };

  return (
    <>
      <div
        data-markdown-annotation-overlay="true"
        style={{ position: 'fixed', left: position.x, top: position.y, zIndex: 10000 }}
        className="w-[min(360px,calc(100vw-32px))] rounded-xl border border-border bg-background p-3 shadow-xl"
      >
        <div className="mb-2">
          <p className="px-2 py-1 text-xs whitespace-pre-wrap break-words rounded-md line-clamp-3 bg-muted text-muted-foreground">
            {selectedText}
          </p>
          {canExpandSelectedText ? (
            <button
              type="button"
              onClick={() => {
                setIsSelectedTextPreviewOpen(true);
              }}
              className="mt-1 text-xs transition-opacity text-primary hover:opacity-80"
            >
              查看全部
            </button>
          ) : null}
        </div>
        <textarea
          ref={textareaRef}
          value={note}
          onChange={handleChange}
          placeholder="输入标注内容"
          rows={4}
          className="min-h-[96px] w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring"
        />
        {error ? <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
        <div className="flex gap-2 justify-end items-center mt-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSendToChatInput ?? undefined}
            disabled={!onSendToChatInput || note.trim().length === 0}
            className="rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            发送到对话
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || note.trim().length === 0}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
      {isSelectedTextPreviewOpen ? (
        <div
          data-markdown-annotation-overlay="true"
          style={{ position: 'fixed', inset: 0, zIndex: 10001 }}
          className="flex items-center justify-center bg-black/20 p-4 backdrop-blur-[1px]"
        >
          <div className="w-[min(560px,calc(100vw-32px))] rounded-xl border border-border bg-background p-5 shadow-2xl">
            <div className="flex gap-3 justify-between items-center mb-3">
              <p className="m-0 text-base font-medium text-foreground">完整选中内容</p>
              <button
                type="button"
                onClick={() => {
                  setIsSelectedTextPreviewOpen(false);
                }}
                className="text-sm transition-opacity text-muted-foreground hover:opacity-80"
              >
                关闭
              </button>
            </div>
            <div className="max-h-[420px] overflow-y-auto rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground whitespace-pre-wrap break-words">
              {selectedText}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
