import { X, RefreshCw } from 'lucide-react';
import ReactDOM from 'react-dom';
import { Button } from '../../shared/view/ui/index.js';
import { useHooksOverview } from '../../components/hooks/hooks/useHooksOverview';
import HooksOverviewContent from './OverviewContent';

type HooksOverviewModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function HooksOverviewModal({ isOpen, onClose }: HooksOverviewModalProps) {
  const { isLoading, reload } = useHooksOverview({});

  if (!isOpen) {
    return null;
  }

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className="relative flex h-[min(88vh,900px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hooks-overview-title"
      >
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">工作区工具</div>
            <h2 id="hooks-overview-title" className="text-lg font-semibold text-foreground">钩子</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void reload();
              }}
              type="button"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              重新加载
            </Button>
            <Button variant="ghost" size="sm" className="h-9 w-9 rounded-xl p-0" onClick={onClose} aria-label="关闭钩子概览">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 p-5">
          <HooksOverviewContent embedded={true} reload={reload} isLoading={isLoading} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
