import { KeyRound, Save } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Input, Select } from '../../../../../../../shared/view/ui';
import { authenticatedFetch } from '../../../../../../../utils/api';

type RuntimeEnv = Record<string, string | { configured: boolean } | undefined>;
type RuntimeConfig = {
  settingsPath?: string;
  env?: RuntimeEnv;
  permissions?: { defaultMode?: string };
};

const MODEL_KEYS = [
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_REASONING_MODEL',
];

const permissionModeOptions = [
  { value: '', label: '不修改' },
  { value: 'default', label: '默认' },
  { value: 'acceptEdits', label: '自动接受编辑' },
  { value: 'bypassPermissions', label: '跳过权限确认' },
];

function envString(env: RuntimeEnv | undefined, key: string) {
  const value = env?.[key];
  return typeof value === 'string' ? value : '';
}

function isConfigured(env: RuntimeEnv | undefined, key: string) {
  const value = env?.[key];
  return Boolean(value && typeof value === 'object' && value.configured);
}

export default function ClaudeRuntimeSettingsSection() {
  const [config, setConfig] = useState<RuntimeConfig>({});
  const [draftEnv, setDraftEnv] = useState<Record<string, string>>({});
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [permissionMode, setPermissionMode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authenticatedFetch('/api/claude-config/runtime');
      const payload = await response.json();
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.message || payload?.error || '读取 Claude 运行配置失败');
      }
      const nextConfig = payload.config || {};
      const env = nextConfig.env || {};
      setConfig(nextConfig);
      setDraftEnv({
        ANTHROPIC_BASE_URL: envString(env, 'ANTHROPIC_BASE_URL'),
        ...Object.fromEntries(MODEL_KEYS.map((key) => [key, envString(env, key)])),
      });
      setPermissionMode(nextConfig.permissions?.defaultMode || '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '读取 Claude 运行配置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const saveConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const env = {
        ...draftEnv,
        ...Object.fromEntries(Object.entries(secrets).filter(([, value]) => value.trim())),
      };
      const response = await authenticatedFetch('/api/claude-config/runtime', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          env,
          ...(permissionMode ? { permissions: { defaultMode: permissionMode } } : {}),
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.message || payload?.error || '保存 Claude 运行配置失败');
      }
      setConfig(payload.config || {});
      setSecrets({});
      setMessage('运行配置已保存');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存 Claude 运行配置失败');
    } finally {
      setLoading(false);
    }
  }, [draftEnv, permissionMode, secrets]);

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <KeyRound className="h-5 w-5 text-emerald-600" />
          <div className="min-w-0">
            <h3 className="text-lg font-medium text-foreground">Claude 运行配置</h3>
            {config.settingsPath && (
              <p className="truncate text-xs text-muted-foreground">{config.settingsPath}</p>
            )}
          </div>
        </div>
        <Button size="sm" onClick={() => { void loadConfig(); }} disabled={loading} variant="outline">
          刷新
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {(['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY'] as const).map((key) => (
          <label key={key} className="grid gap-1 text-sm">
            <span className="flex items-center gap-2">
              {key}
              {isConfigured(config.env, key) && <Badge variant="outline">已配置</Badge>}
            </span>
            <Input
              type="password"
              value={secrets[key] || ''}
              placeholder={isConfigured(config.env, key) ? '留空则不修改' : ''}
              onChange={(event) => setSecrets((current) => ({ ...current, [key]: event.target.value }))}
            />
          </label>
        ))}

        <label className="grid gap-1 text-sm">
          <span>ANTHROPIC_BASE_URL</span>
          <Input
            value={draftEnv.ANTHROPIC_BASE_URL || ''}
            onChange={(event) => setDraftEnv((current) => ({ ...current, ANTHROPIC_BASE_URL: event.target.value }))}
          />
        </label>

        <label className="grid gap-1 text-sm">
          <span>权限默认模式</span>
          <Select value={permissionMode} options={permissionModeOptions} onValueChange={setPermissionMode} />
        </label>

        {MODEL_KEYS.map((key) => (
          <label key={key} className="grid gap-1 text-sm">
            <span>{key}</span>
            <Input
              value={draftEnv[key] || ''}
              onChange={(event) => setDraftEnv((current) => ({ ...current, [key]: event.target.value }))}
            />
          </label>
        ))}
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

      <Button onClick={() => { void saveConfig(); }} disabled={loading}>
        <Save className="h-4 w-4" />
        保存运行配置
      </Button>
    </section>
  );
}
