import { GitBranch, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button } from '../../../../../../../shared/view/ui';
import { authenticatedFetch } from '../../../../../../../utils/api';

type HookSource = {
  id?: string;
  kind?: string;
  label?: string;
  path?: string;
  writable?: boolean;
};

export default function HooksEntrySection({ selectedProjectPath }: { selectedProjectPath?: string | null }) {
  const [sources, setSources] = useState<HookSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHooks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = selectedProjectPath ? `?projectPath=${encodeURIComponent(selectedProjectPath)}` : '';
      const response = await authenticatedFetch(`/api/hooks/overview${query}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || '读取 Hooks 失败');
      }
      setSources(Array.isArray(payload.sources) ? payload.sources : []);
    } catch (loadError) {
      setSources([]);
      setError(loadError instanceof Error ? loadError.message : '读取 Hooks 失败');
    } finally {
      setLoading(false);
    }
  }, [selectedProjectPath]);

  useEffect(() => {
    void loadHooks();
  }, [loadHooks]);

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <GitBranch className="h-5 w-5 text-rose-600" />
          <h3 className="text-lg font-medium text-foreground">Hooks 入口</h3>
        </div>
        <Button size="sm" variant="outline" onClick={() => { void loadHooks(); }} disabled={loading}>
          <RefreshCw className="h-4 w-4" />
          刷新
        </Button>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="space-y-2">
        {sources.map((source) => (
          <div key={source.id || source.path || source.label} className="rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{source.label || source.id || source.kind}</span>
              <Badge variant="outline">{source.kind || 'source'}</Badge>
              <Badge variant={source.writable ? 'outline' : 'secondary'}>{source.writable ? '可写' : '只读'}</Badge>
            </div>
            {source.path && <div className="mt-1 truncate text-xs text-muted-foreground">{source.path}</div>}
          </div>
        ))}
        {!loading && sources.length === 0 && (
          <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">暂无 Hooks 来源</div>
        )}
      </div>
    </section>
  );
}
