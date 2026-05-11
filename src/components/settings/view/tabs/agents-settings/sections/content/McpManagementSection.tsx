import { Edit3, Plus, Server, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Input, Select } from '../../../../../../../shared/view/ui';
import { authenticatedFetch } from '../../../../../../../utils/api';

type McpServerItem = {
  id?: string;
  name: string;
  scope?: string;
  type?: string;
  sourcePath?: string;
  projectPath?: string;
  duplicateName?: boolean;
  config?: {
    command?: string;
    args?: string[];
    url?: string;
  };
};

type McpDraft = {
  name: string;
  scope: string;
  type: string;
  command: string;
  args: string;
  url: string;
};

const EMPTY_DRAFT: McpDraft = {
  name: '',
  scope: 'user',
  type: 'stdio',
  command: '',
  args: '',
  url: '',
};

const scopeOptions = [
  { value: 'user', label: '用户' },
  { value: 'project', label: '项目' },
  { value: 'local', label: '本地' },
];

const typeOptions = [
  { value: 'stdio', label: 'stdio' },
  { value: 'http', label: 'http' },
  { value: 'sse', label: 'sse' },
];

function toConfig(draft: McpDraft) {
  if (draft.type === 'stdio') {
    return {
      type: 'stdio',
      command: draft.command,
      args: draft.args.split(/\s+/).filter(Boolean),
    };
  }
  return { type: draft.type, url: draft.url };
}

export default function McpManagementSection({ selectedProjectPath }: { selectedProjectPath?: string | null }) {
  const [servers, setServers] = useState<McpServerItem[]>([]);
  const [draft, setDraft] = useState<McpDraft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState<McpServerItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadServers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = selectedProjectPath ? `?projectPath=${encodeURIComponent(selectedProjectPath)}` : '';
      const response = await authenticatedFetch(`/api/mcp/config/read${query}`);
      const payload = await response.json();
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.message || payload?.error || payload?.details || '读取 MCP 失败');
      }
      setServers(Array.isArray(payload.servers) ? payload.servers : []);
    } catch (loadError) {
      setServers([]);
      setError(loadError instanceof Error ? loadError.message : '读取 MCP 失败');
    } finally {
      setLoading(false);
    }
  }, [selectedProjectPath]);

  useEffect(() => {
    void loadServers();
  }, [loadServers]);

  const saveServer = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const config = toConfig(draft);
      const validateResponse = await authenticatedFetch('/api/mcp/config/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draft.name, config }),
      });
      const validatePayload = await validateResponse.json();
      if (!validateResponse.ok || validatePayload?.success === false) {
        throw new Error(validatePayload?.message || validatePayload?.error || 'MCP 配置校验失败');
      }

      const body = {
        name: draft.name,
        scope: draft.scope,
        projectPath: selectedProjectPath,
        sourcePath: editing?.sourcePath,
        config,
      };
      const response = await authenticatedFetch(
        editing ? `/api/mcp/config/${encodeURIComponent(editing.name)}` : '/api/mcp/config',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const payload = await response.json();
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.message || payload?.error || payload?.details || '保存 MCP 失败');
      }
      setDraft(EMPTY_DRAFT);
      setEditing(null);
      setMessage('MCP 已保存');
      await loadServers();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存 MCP 失败');
    } finally {
      setLoading(false);
    }
  }, [draft, editing, loadServers, selectedProjectPath]);

  const removeServer = useCallback(async (server: McpServerItem) => {
    setError(null);
    setMessage(null);
    const response = await authenticatedFetch(`/api/mcp/config/${encodeURIComponent(server.name)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: server.scope,
        projectPath: server.projectPath || selectedProjectPath,
        sourcePath: server.sourcePath,
      }),
    });
    const payload = await response.json();
    if (!response.ok || payload?.success === false) {
      setError(payload?.message || payload?.error || payload?.details || '删除 MCP 失败');
      return;
    }
    setMessage('MCP 已删除');
    await loadServers();
  }, [loadServers, selectedProjectPath]);

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Server className="h-5 w-5 text-violet-600" />
          <h3 className="text-lg font-medium text-foreground">MCP 管理</h3>
        </div>
        <Button size="sm" variant="outline" onClick={() => { void loadServers(); }} disabled={loading}>
          刷新
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Input placeholder="名称" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
        <Select value={draft.scope} options={scopeOptions} onValueChange={(value) => setDraft((current) => ({ ...current, scope: value }))} />
        <Select value={draft.type} options={typeOptions} onValueChange={(value) => setDraft((current) => ({ ...current, type: value }))} />
        {draft.type === 'stdio' ? (
          <>
            <Input placeholder="command" value={draft.command} onChange={(event) => setDraft((current) => ({ ...current, command: event.target.value }))} />
            <Input placeholder="args" value={draft.args} onChange={(event) => setDraft((current) => ({ ...current, args: event.target.value }))} />
          </>
        ) : (
          <Input placeholder="url" value={draft.url} onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))} />
        )}
      </div>

      <Button size="sm" onClick={() => { void saveServer(); }} disabled={loading}>
        <Plus className="h-4 w-4" />
        {editing ? '保存 MCP' : '新增 MCP'}
      </Button>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

      <div className="space-y-2">
        {servers.map((server) => (
          <div key={server.id || `${server.scope}:${server.name}:${server.sourcePath || ''}`} className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{server.name}</span>
                <Badge variant="outline">{server.scope || 'user'}</Badge>
                <Badge variant="outline">{server.type || server.config?.url ? server.type || 'http' : 'stdio'}</Badge>
                {server.duplicateName && <Badge variant="secondary">重名</Badge>}
              </div>
              <div className="truncate text-xs text-muted-foreground">{server.sourcePath}</div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="icon" variant="outline" aria-label="编辑 MCP" onClick={() => {
                setEditing(server);
                setDraft({
                  name: server.name,
                  scope: server.scope || 'user',
                  type: server.type || (server.config?.url ? 'http' : 'stdio'),
                  command: server.config?.command || '',
                  args: Array.isArray(server.config?.args) ? server.config.args.join(' ') : '',
                  url: server.config?.url || '',
                });
              }}>
                <Edit3 className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="outline" aria-label="删除 MCP" onClick={() => { void removeServer(server); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
