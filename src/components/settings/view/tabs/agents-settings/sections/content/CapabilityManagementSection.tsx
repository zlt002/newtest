import { FileCode2, Plus, Save, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Input, Select } from '../../../../../../../shared/view/ui';
import { authenticatedFetch } from '../../../../../../../utils/api';

type CapabilityType = 'skill' | 'command';

type Capability = {
  id: string;
  type: CapabilityType;
  name: string;
  description?: string;
  path?: string;
  editable?: boolean;
  source?: {
    kind?: string;
    path?: string;
    writable?: boolean;
    reason?: string;
  };
};

const scopeOptions = [
  { value: 'user', label: '用户' },
  { value: 'project', label: '项目' },
];

type CapabilityManagementSectionProps = {
  selectedProjectPath?: string | null;
  type: CapabilityType;
};

const labels: Record<CapabilityType, { title: string; noun: string; namePlaceholder: string; empty: string; created: string; deleted: string }> = {
  skill: {
    title: '技能管理',
    noun: '技能',
    namePlaceholder: 'skill 名称',
    empty: '暂无技能',
    created: '技能已创建',
    deleted: '技能已删除',
  },
  command: {
    title: '命令管理',
    noun: '命令',
    namePlaceholder: 'command 名称',
    empty: '暂无命令',
    created: '命令已创建',
    deleted: '命令已删除',
  },
};

export default function CapabilityManagementSection({ selectedProjectPath, type }: CapabilityManagementSectionProps) {
  const [scope, setScope] = useState('user');
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [selectedCapability, setSelectedCapability] = useState<Capability | null>(null);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const label = labels[type];

  const query = useMemo(() => {
    const params = new URLSearchParams({ type });
    if (selectedProjectPath) {
      params.set('projectPath', selectedProjectPath);
    }
    return params.toString();
  }, [selectedProjectPath, type]);

  const loadCapabilities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authenticatedFetch(`/api/capabilities?${query}`);
      const payload = await response.json();
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.message || payload?.error || '读取能力目录失败');
      }
      setCapabilities(Array.isArray(payload.capabilities) ? payload.capabilities : []);
    } catch (loadError) {
      setCapabilities([]);
      setError(loadError instanceof Error ? loadError.message : '读取能力目录失败');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void loadCapabilities();
    setSelectedCapability(null);
    setName('');
    setContent('');
  }, [loadCapabilities]);

  const previewContent = useMemo(() => content, [content]);

  const resetDraft = useCallback(() => {
    setSelectedCapability(null);
    setScope('user');
    setName('');
    setContent('');
    setMessage(null);
    setError(null);
  }, []);

  const loadCapabilityDetail = useCallback(async (capability: Capability) => {
    setSelectedCapability(capability);
    setName(capability.name);
    setScope(capability.source?.kind === 'project' ? 'project' : 'user');
    setDetailLoading(true);
    setMessage(null);
    setError(null);
    try {
      const params = selectedProjectPath ? `?projectPath=${encodeURIComponent(selectedProjectPath)}` : '';
      const response = await authenticatedFetch(`/api/capabilities/${encodeURIComponent(capability.id)}${params}`);
      const payload = await response.json();
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.message || payload?.error || '读取 Markdown 失败');
      }
      setContent(typeof payload.content === 'string' ? payload.content : '');
      if (payload.capability) {
        setSelectedCapability(payload.capability);
      }
    } catch (detailError) {
      setContent('');
      setError(detailError instanceof Error ? detailError.message : '读取 Markdown 失败');
    } finally {
      setDetailLoading(false);
    }
  }, [selectedProjectPath]);

  const saveCapability = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const isUpdating = Boolean(selectedCapability?.editable);
      const endpoint = isUpdating
        ? `/api/capabilities/${encodeURIComponent(selectedCapability.id)}`
        : '/api/capabilities';
      const params = selectedProjectPath ? `?projectPath=${encodeURIComponent(selectedProjectPath)}` : '';
      const response = await authenticatedFetch(`${endpoint}${isUpdating ? params : ''}`, {
        method: isUpdating ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isUpdating
          ? { projectPath: selectedProjectPath, content }
          : {
            type,
            scope,
            projectPath: selectedProjectPath,
            name,
            content,
          }),
      });
      const payload = await response.json();
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.message || payload?.error || '保存能力失败');
      }
      setMessage(isUpdating ? `${label.noun}已保存` : label.created);
      if (payload.capability) {
        setSelectedCapability(payload.capability);
        setName(payload.capability.name || name);
      } else if (!isUpdating) {
        setSelectedCapability(null);
        setName('');
        setContent('');
      }
      await loadCapabilities();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存能力失败');
    } finally {
      setLoading(false);
    }
  }, [content, label.created, label.noun, loadCapabilities, name, scope, selectedCapability, selectedProjectPath, type]);

  const deleteCapability = useCallback(async (capability: Capability) => {
    setError(null);
    setMessage(null);
    const params = selectedProjectPath ? `?projectPath=${encodeURIComponent(selectedProjectPath)}` : '';
    const response = await authenticatedFetch(`/api/capabilities/${encodeURIComponent(capability.id)}${params}`, {
      method: 'DELETE',
    });
    const payload = await response.json();
    if (!response.ok || payload?.success === false) {
      setError(payload?.message || payload?.error || '删除能力失败');
      return;
    }
    setMessage(label.deleted);
    if (selectedCapability?.id === capability.id) {
      resetDraft();
    }
    await loadCapabilities();
  }, [label.deleted, loadCapabilities, resetDraft, selectedCapability?.id, selectedProjectPath]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <FileCode2 className="h-5 w-5 text-amber-600" />
          <h3 className="text-lg font-medium text-foreground">{label.title}</h3>
        </div>
        <Button size="sm" variant="outline" onClick={() => { void loadCapabilities(); }} disabled={loading}>
          刷新
        </Button>
      </div>

      <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(18rem,0.42fr)_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium text-foreground">能力列表</div>
            <Badge variant="secondary">{capabilities.length}</Badge>
          </div>

          <div className="space-y-2">
            {capabilities.map((capability) => (
              <button
                type="button"
                key={capability.id}
                className={`w-full rounded-md border p-3 text-left transition-colors ${
                  selectedCapability?.id === capability.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card/50'
                }`}
                onClick={() => { void loadCapabilityDetail(capability); }}
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{capability.name}</span>
                    <Badge variant="outline">{capability.source?.kind || 'user'}</Badge>
                    {!capability.editable && <Badge variant="secondary">只读</Badge>}
                  </div>
                  {capability.description && <div className="text-sm text-muted-foreground">{capability.description}</div>}
                  {capability.path && <div className="truncate text-xs text-muted-foreground">{capability.path}</div>}
                </div>
              </button>
            ))}
            {!loading && capabilities.length === 0 && (
              <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">{label.empty}</div>
            )}
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          <div className="rounded-lg border border-border bg-card/50 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="font-medium text-foreground">编辑区</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {selectedCapability ? `正在查看：${selectedCapability.name}` : `新建${label.noun}`}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={resetDraft}>
                <Plus className="h-4 w-4" />
                新建
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-[12rem_1fr]">
              <Select
                value={scope}
                options={scopeOptions}
                onValueChange={setScope}
                disabled={Boolean(selectedCapability)}
              />
              <Input
                placeholder={label.namePlaceholder}
                value={name}
                disabled={Boolean(selectedCapability)}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <textarea
              className="mt-3 min-h-48 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70"
              value={content}
              disabled={Boolean(selectedCapability && !selectedCapability.editable)}
              onChange={(event) => setContent(event.target.value)}
            />

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                onClick={() => { void saveCapability(); }}
                disabled={loading || detailLoading || !content.trim() || !name.trim() || Boolean(selectedCapability && !selectedCapability.editable)}
              >
                {selectedCapability?.editable ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {selectedCapability?.editable ? '保存修改' : `新增 ${label.noun}`}
              </Button>
              {selectedCapability && !selectedCapability.editable && (
                <Badge variant="secondary">当前来源只读</Badge>
              )}
              {selectedCapability?.editable && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { void deleteCapability(selectedCapability); }}
                  disabled={loading || detailLoading}
                >
                  <Trash2 className="h-4 w-4" />
                  删除
                </Button>
              )}
            </div>
          </div>

          {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {message && <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

          <aside className="min-w-0 rounded-lg border border-border bg-card/50 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="font-medium text-foreground">Markdown 原文</div>
              {detailLoading && <Badge variant="secondary">读取中</Badge>}
            </div>
            {selectedCapability?.path && (
              <div className="mb-3 truncate text-xs text-muted-foreground">{selectedCapability.path}</div>
            )}
            <pre className="max-h-[44vh] min-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-3 font-mono text-sm leading-6 text-foreground">
              {previewContent || `在左侧选择一个${label.noun}，或在上方新建后这里会实时显示 Markdown。`}
            </pre>
          </aside>
        </div>
      </div>
    </section>
  );
}
