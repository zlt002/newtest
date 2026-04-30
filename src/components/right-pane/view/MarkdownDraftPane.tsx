import type { RightPaneMarkdownDraftTarget } from '../types';

type MarkdownDraftPaneProps = {
  target: RightPaneMarkdownDraftTarget;
  onClosePane: () => void;
};

export default function MarkdownDraftPane({
  target,
  onClosePane,
}: MarkdownDraftPaneProps) {
  const statusText = String(target.statusText || '').trim() || '正在起草...';
  const content = typeof target.content === 'string' ? target.content : '';
  const hasContent = Boolean(content.trim());

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-background"
      data-right-pane-view="markdown-draft"
      data-markdown-draft-pane="true"
      data-right-pane-file-path={target.filePath}
      data-markdown-file-name={target.fileName}
      data-markdown-draft-status-text={statusText}
    >
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{target.fileName}</div>
          <div className="truncate text-xs text-muted-foreground">{statusText}</div>
        </div>
        <button
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          data-right-pane-close="true"
          onClick={onClosePane}
          type="button"
        >
          Close
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        {hasContent ? (
          <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{content}</pre>
        ) : (
          <div className="space-y-3 text-sm text-muted-foreground">
            <div>{statusText}</div>
            <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-3">
              右侧会先显示草稿进度，等真实 markdown 开始写入后会自动切换到文件预览。
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
