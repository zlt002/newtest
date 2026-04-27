import { MessageSquarePlus, Pencil, SendHorizontal, Trash2 } from 'lucide-react';
import { Badge } from '../../../../shared/view/ui/Badge';

export type MarkdownToolbarAnnotationItem = {
  id: string;
  selectedText: string;
  note: string;
  isValid: boolean;
};

type MarkdownAnnotationToolbarMenuProps = {
  items: MarkdownToolbarAnnotationItem[];
  onEdit: (annotationId: string) => void;
  onDelete: (annotationId: string) => void;
  onSend: (annotationId: string) => void;
  onSendAll?: (() => void) | null;
};

const truncate = (value: string, length: number) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= length) {
    return normalized;
  }

  return `${normalized.slice(0, length - 1)}...`;
};

export default function MarkdownAnnotationToolbarMenu({
  items,
  onEdit,
  onDelete,
  onSend,
  onSendAll = null,
}: MarkdownAnnotationToolbarMenuProps) {
  const handleCardEdit = (annotationId: string) => {
    onEdit(annotationId);
  };

  return (
    <div className="absolute right-0 top-full z-30 mt-2 w-[360px] rounded-xl border border-border bg-background p-2 shadow-xl">
      <div className="mb-2 flex items-center justify-between gap-2 px-2 py-1">
        <p className="text-sm font-medium text-foreground">当前文件标注</p>
        <button
          type="button"
          onClick={onSendAll ?? undefined}
          disabled={!onSendAll || items.filter((item) => item.isValid).length === 0}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          title="将当前文件的有效标注全部追加到聊天输入框"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          全部发送
        </button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
          还没有保存的标注
        </div>
      ) : (
        <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
          {items.map((item) => (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onMouseDown={(event) => {
                event.preventDefault();
                handleCardEdit(item.id);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleCardEdit(item.id);
                }
              }}
              className="group relative w-full rounded-lg border border-border p-3 pr-24 transition-colors hover:border-blue-300 hover:bg-accent/30"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground" title={item.selectedText}>
                  {truncate(item.selectedText, 48)}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground" title={item.note}>
                  {item.note}
                </p>
              </div>
              <div className="absolute right-3 top-3 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onEdit(item.id);
                  }}
                  className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="编辑该标注"
                  aria-label="编辑该标注"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onDelete(item.id);
                  }}
                  className="inline-flex items-center justify-center rounded-md p-1.5 text-red-600 transition-colors hover:bg-red-50 hover:text-red-700"
                  title="删除该标注"
                  aria-label="删除该标注"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onSend(item.id);
                  }}
                  disabled={!item.isValid}
                  className="inline-flex items-center justify-center rounded-md p-1.5 text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  title={item.isValid ? '将该标注追加到聊天输入框' : '失效标注不能直接发送'}
                  aria-label={item.isValid ? '将该标注追加到聊天输入框' : '失效标注不能直接发送'}
                >
                  <SendHorizontal className="h-3.5 w-3.5" />
                </button>
              </div>
              {!item.isValid && (
                <Badge
                  variant="outline"
                  className="mt-2 border-amber-300 text-amber-700"
                >
                  已失效
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
