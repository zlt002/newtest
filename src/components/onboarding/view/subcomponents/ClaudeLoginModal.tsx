import { X } from 'lucide-react';
import StandaloneShell from '../../../standalone-shell/view/StandaloneShell';

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
  project,
  onComplete,
}: ClaudeLoginModalProps) {
  if (!isOpen) {
    return null;
  }

  const handleComplete = (exitCode: number) => {
    onComplete?.(exitCode);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative flex h-[600px] w-full max-w-2xl flex-col rounded-lg border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-lg font-medium">Claude CLI Login</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <StandaloneShell
            project={project}
            command="claude --dangerously-skip-permissions /login"
            onComplete={handleComplete}
            minimal={true}
          />
        </div>
      </div>
    </div>
  );
}
