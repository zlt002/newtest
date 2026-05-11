import { FolderPlus, Package, Power, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Input } from '../../../../../../../shared/view/ui';
import { authenticatedFetch } from '../../../../../../../utils/api';

type PluginItem = {
  id: string;
  name?: string;
  version?: string;
  path?: string;
  enabled?: boolean;
  removable?: boolean;
  sdkResolved?: boolean;
  source?: {
    kind?: string;
    writable?: boolean;
  };
};

export default function PluginManagementSection() {
  const [plugins, setPlugins] = useState<PluginItem[]>([]);
  const [directory, setDirectory] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPlugins = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authenticatedFetch('/api/plugins');
      const payload = await response.json();
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.message || payload?.error || payload?.details || '读取插件失败');
      }
      setPlugins(Array.isArray(payload.plugins) ? payload.plugins : []);
    } catch (loadError) {
      setPlugins([]);
      setError(loadError instanceof Error ? loadError.message : '读取插件失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlugins();
  }, [loadPlugins]);

  const importDirectory = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await authenticatedFetch('/api/plugins/import-directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: directory }),
      });
      const payload = await response.json();
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.message || payload?.error || payload?.details || '导入插件失败');
      }
      setDirectory('');
      setMessage('插件已导入');
      await loadPlugins();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : '导入插件失败');
    } finally {
      setLoading(false);
    }
  }, [directory, loadPlugins]);

  const reloadPlugins = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await authenticatedFetch('/api/plugins/reload', { method: 'POST' });
      const payload = await response.json();
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.message || payload?.error || payload?.details || '重新加载插件失败');
      }
      setMessage('插件已重新加载');
      await loadPlugins();
    } catch (reloadError) {
      setError(reloadError instanceof Error ? reloadError.message : '重新加载插件失败');
    } finally {
      setLoading(false);
    }
  }, [loadPlugins]);

  const setEnabled = useCallback(async (plugin: PluginItem, enabled: boolean) => {
    setError(null);
    setMessage(null);
    const response = await authenticatedFetch(`/api/plugins/${encodeURIComponent(plugin.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled, sourceKind: plugin.source?.kind || 'lite' }),
    });
    const payload = await response.json();
    if (!response.ok || payload?.success === false) {
      setError(payload?.message || payload?.error || payload?.details || '更新插件失败');
      return;
    }
    setMessage(enabled ? '插件已启用' : '插件已停用');
    await loadPlugins();
  }, [loadPlugins]);

  const removePlugin = useCallback(async (plugin: PluginItem) => {
    setError(null);
    setMessage(null);
    const sourceKind = plugin.source?.kind || 'lite';
    const response = await authenticatedFetch(`/api/plugins/${encodeURIComponent(plugin.id)}?sourceKind=${encodeURIComponent(sourceKind)}`, {
      method: 'DELETE',
    });
    const payload = await response.json();
    if (!response.ok || payload?.success === false) {
      setError(payload?.message || payload?.error || payload?.details || '移除插件失败');
      return;
    }
    setMessage(sourceKind === 'cli' ? 'CLI 插件已停用' : '插件已移除');
    await loadPlugins();
  }, [loadPlugins]);

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Package className="h-5 w-5 text-sky-600" />
          <h3 className="text-lg font-medium text-foreground">插件管理</h3>
        </div>
        <Button size="sm" variant="outline" onClick={() => { void reloadPlugins(); }} disabled={loading}>
          <RefreshCw className="h-4 w-4" />
          重新加载
        </Button>
      </div>

      <div className="flex flex-col gap-2 md:flex-row">
        <Input value={directory} placeholder="本地插件目录绝对路径" onChange={(event) => setDirectory(event.target.value)} />
        <Button onClick={() => { void importDirectory(); }} disabled={loading || !directory.trim()}>
          <FolderPlus className="h-4 w-4" />
          导入目录
        </Button>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

      <div className="space-y-2">
        {plugins.map((plugin) => {
          const sourceKind = plugin.source?.kind || 'lite';
          return (
            <div key={`${sourceKind}:${plugin.id}`} className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{plugin.name || plugin.id}</span>
                  <Badge variant="outline">{sourceKind}</Badge>
                  <Badge variant={plugin.enabled === false ? 'secondary' : 'outline'}>
                    {plugin.enabled === false ? '停用' : '启用'}
                  </Badge>
                  {plugin.sdkResolved && <Badge variant="outline">SDK 已加载</Badge>}
                </div>
                {plugin.path && <div className="truncate text-xs text-muted-foreground">{plugin.path}</div>}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="icon" variant="outline" aria-label="切换插件" onClick={() => { void setEnabled(plugin, plugin.enabled === false); }}>
                  <Power className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="outline" aria-label="移除插件" onClick={() => { void removePlugin(plugin); }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
        {!loading && plugins.length === 0 && (
          <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">暂无插件</div>
        )}
      </div>
    </section>
  );
}
