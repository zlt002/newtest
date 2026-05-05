import { X } from 'lucide-react';

type ClaudeLoginModalProps = {
  isOpen: boolean;
  onClose: () => void;
  project: {
    name: string;
    displayName: string;
    fullPath: string;
    path: string;
  };
  onComplete?: (exitCode: number) => void;
};

export default function ClaudeLoginModal({
  isOpen,
  onClose,
  onComplete,
}: ClaudeLoginModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative flex w-full max-w-md flex-col rounded-lg border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Claude CLI Login</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          请在终端中运行 <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">claude login</code> 完成登录。
        </p>
        <div className="mt-6 flex justify-end">
          <button
            onClick={() => {
              onComplete?.(0);
              onClose();
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            已完成登录
          </button>
        </div>
      </div>
    </div>
  );
}
