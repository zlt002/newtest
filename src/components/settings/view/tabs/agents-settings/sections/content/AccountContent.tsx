import { LogIn } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button } from '../../../../../../../shared/view/ui';
import { authenticatedFetch } from '../../../../../../../utils/api';
import SessionProviderLogo from '../../../../../../llm-logo-provider/SessionProviderLogo';
import type { AuthStatus } from '../../../../../types/types';
import type { AgentProvider } from '../../types';

type AccountContentProps = {
  agent: AgentProvider;
  authStatus: AuthStatus;
  onLogin: () => void;
  onConfigured?: () => void;
};

type AgentVisualConfig = {
  name: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  subtextClass: string;
  buttonClass: string;
  description?: string;
};

const agentConfig: Record<AgentProvider, AgentVisualConfig> = {
  claude: {
    name: 'Claude',
    bgClass: 'bg-blue-50 dark:bg-blue-900/20',
    borderClass: 'border-blue-200 dark:border-blue-800',
    textClass: 'text-blue-900 dark:text-blue-100',
    subtextClass: 'text-blue-700 dark:text-blue-300',
    buttonClass: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800',
  },
  cursor: {
    name: 'Cursor',
    bgClass: 'bg-purple-50 dark:bg-purple-900/20',
    borderClass: 'border-purple-200 dark:border-purple-800',
    textClass: 'text-purple-900 dark:text-purple-100',
    subtextClass: 'text-purple-700 dark:text-purple-300',
    buttonClass: 'bg-purple-600 hover:bg-purple-700 active:bg-purple-800',
  },
  codex: {
    name: 'Codex',
    bgClass: 'bg-muted/50',
    borderClass: 'border-gray-300 dark:border-gray-600',
    textClass: 'text-gray-900 dark:text-gray-100',
    subtextClass: 'text-gray-700 dark:text-gray-300',
    buttonClass: 'bg-gray-800 hover:bg-gray-900 active:bg-gray-950 dark:bg-gray-700 dark:hover:bg-gray-600 dark:active:bg-gray-500',
  },
  gemini: {
    name: 'Gemini',
    description: 'Google Gemini AI assistant',
    bgClass: 'bg-indigo-50 dark:bg-indigo-900/20',
    borderClass: 'border-indigo-200 dark:border-indigo-800',
    textClass: 'text-indigo-900 dark:text-indigo-100',
    subtextClass: 'text-indigo-700 dark:text-indigo-300',
    buttonClass: 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800',
  },
};

export default function AccountContent({ agent, authStatus, onLogin, onConfigured }: AccountContentProps) {
  const { t } = useTranslation('settings');
  const config = agentConfig[agent];
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [haikuModel, setHaikuModel] = useState('');
  const [sonnetModel, setSonnetModel] = useState('');
  const [opusModel, setOpusModel] = useState('');
  const [reasoningModel, setReasoningModel] = useState('');
  const [hasSavedApiKey, setHasSavedApiKey] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  useEffect(() => {
    if (agent !== 'claude') return;

    let isMounted = true;

    const loadClaudeSettings = async () => {
      setIsLoadingSettings(true);
      setSettingsError(null);

      try {
        const response = await authenticatedFetch('/api/cli/claude/settings');
        const payload = await response.json();

        if (!response.ok || payload?.success === false) {
          throw new Error(payload?.error || 'Failed to load Claude settings');
        }

        if (!isMounted) return;

        const env = payload?.env && typeof payload.env === 'object' ? payload.env : {};
        setBaseUrl(typeof env.ANTHROPIC_BASE_URL === 'string' ? env.ANTHROPIC_BASE_URL : '');
        setModel(typeof env.ANTHROPIC_MODEL === 'string' ? env.ANTHROPIC_MODEL : '');
        setHaikuModel(typeof env.ANTHROPIC_DEFAULT_HAIKU_MODEL === 'string' ? env.ANTHROPIC_DEFAULT_HAIKU_MODEL : '');
        setSonnetModel(typeof env.ANTHROPIC_DEFAULT_SONNET_MODEL === 'string' ? env.ANTHROPIC_DEFAULT_SONNET_MODEL : '');
        setOpusModel(typeof env.ANTHROPIC_DEFAULT_OPUS_MODEL === 'string' ? env.ANTHROPIC_DEFAULT_OPUS_MODEL : '');
        setReasoningModel(typeof env.ANTHROPIC_REASONING_MODEL === 'string' ? env.ANTHROPIC_REASONING_MODEL : '');
        setHasSavedApiKey(Array.isArray(payload?.configuredSecretKeys)
          && payload.configuredSecretKeys.includes('ANTHROPIC_API_KEY'));
      } catch (error) {
        if (isMounted) {
          setSettingsError(error instanceof Error ? error.message : 'Unknown error');
        }
      } finally {
        if (isMounted) {
          setIsLoadingSettings(false);
        }
      }
    };

    loadClaudeSettings();

    return () => {
      isMounted = false;
    };
  }, [agent]);

  const handleSaveClaudeSettings = async () => {
    setIsSavingSettings(true);
    setSettingsMessage(null);
    setSettingsError(null);

    try {
      const env: Record<string, string> = {};
      if (apiKey.trim()) env.ANTHROPIC_API_KEY = apiKey.trim();
      if (baseUrl.trim()) env.ANTHROPIC_BASE_URL = baseUrl.trim();
      if (model.trim()) env.ANTHROPIC_MODEL = model.trim();
      if (haikuModel.trim()) env.ANTHROPIC_DEFAULT_HAIKU_MODEL = haikuModel.trim();
      if (sonnetModel.trim()) env.ANTHROPIC_DEFAULT_SONNET_MODEL = sonnetModel.trim();
      if (opusModel.trim()) env.ANTHROPIC_DEFAULT_OPUS_MODEL = opusModel.trim();
      if (reasoningModel.trim()) env.ANTHROPIC_REASONING_MODEL = reasoningModel.trim();

      const response = await authenticatedFetch('/api/cli/claude/settings', {
        method: 'POST',
        body: JSON.stringify({ env }),
      });
      const payload = await response.json();

      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || 'Failed to save Claude settings');
      }

      setApiKey('');
      if (env.ANTHROPIC_API_KEY) {
        setHasSavedApiKey(true);
      }
      setSettingsMessage(`已写入 ${payload.configuredKeys?.length || 0} 项配置到 ${payload.settingsPath || '~/.claude/settings.json'}`);
      onConfigured?.();
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsSavingSettings(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="mb-4 flex items-center gap-3">
        <SessionProviderLogo provider={agent} className="h-6 w-6" />
        <div>
          <h3 className="text-lg font-medium text-foreground">{config.name}</h3>
          <p className="text-sm text-muted-foreground">{t(`agents.account.${agent}.description`)}</p>
        </div>
      </div>

      <div className={`${config.bgClass} border ${config.borderClass} rounded-lg p-4`}>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className={`font-medium ${config.textClass}`}>
                {t('agents.connectionStatus')}
              </div>
              <div className={`text-sm ${config.subtextClass}`}>
                {authStatus.loading ? (
                  t('agents.authStatus.checkingAuth')
                ) : authStatus.authenticated ? (
                  t('agents.authStatus.loggedInAs', {
                    email: authStatus.email || t('agents.authStatus.authenticatedUser'),
                  })
                ) : (
                  t('agents.authStatus.notConnected')
                )}
              </div>
            </div>
            <div>
              {authStatus.loading ? (
                <Badge variant="secondary" className="bg-muted">
                  {t('agents.authStatus.checking')}
                </Badge>
              ) : authStatus.authenticated ? (
                <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                  {t('agents.authStatus.connected')}
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
                  {t('agents.authStatus.disconnected')}
                </Badge>
              )}
            </div>
          </div>

          {agent === 'claude' && (
            <div className="border-t border-border/50 pt-4">
              <div className="space-y-3">
                <div>
                  <div className={`font-medium ${config.textClass}`}>
                    {authStatus.authenticated ? '重新配置 Claude 运行环境' : '直接配置 Claude 运行环境'}
                  </div>
                  <div className={`text-sm ${config.subtextClass}`}>
                    {authStatus.cliInstalled === false
                      ? '未检测到 Claude Code CLI，可写入 API 配置后直接使用 Lite 包。'
                      : '保存后会覆盖 ~/.claude/settings.json 中对应的 Claude API 配置。'}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <label className="space-y-1 text-xs font-medium text-muted-foreground">
                    API Key
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      placeholder={hasSavedApiKey ? '已配置，留空不覆盖' : 'sk-ant-...'}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-400"
                    />
                  </label>
                  <label className="space-y-1 text-xs font-medium text-muted-foreground">
                    Base URL
                    <input
                      type="url"
                      value={baseUrl}
                      onChange={(event) => setBaseUrl(event.target.value)}
                      placeholder="https://api.anthropic.com"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-400"
                    />
                  </label>
                  <label className="space-y-1 text-xs font-medium text-muted-foreground">
                    默认模型
                    <input
                      type="text"
                      value={model}
                      onChange={(event) => setModel(event.target.value)}
                      placeholder="sonnet"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-400"
                    />
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <label className="space-y-1 text-xs font-medium text-muted-foreground">
                    Haiku 默认模型
                    <input
                      type="text"
                      value={haikuModel}
                      onChange={(event) => setHaikuModel(event.target.value)}
                      placeholder="haiku"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-400"
                    />
                  </label>
                  <label className="space-y-1 text-xs font-medium text-muted-foreground">
                    Sonnet 默认模型
                    <input
                      type="text"
                      value={sonnetModel}
                      onChange={(event) => setSonnetModel(event.target.value)}
                      placeholder="sonnet"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-400"
                    />
                  </label>
                  <label className="space-y-1 text-xs font-medium text-muted-foreground">
                    Opus 默认模型
                    <input
                      type="text"
                      value={opusModel}
                      onChange={(event) => setOpusModel(event.target.value)}
                      placeholder="opus"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-400"
                    />
                  </label>
                  <label className="space-y-1 text-xs font-medium text-muted-foreground">
                    推理模型
                    <input
                      type="text"
                      value={reasoningModel}
                      onChange={(event) => setReasoningModel(event.target.value)}
                      placeholder="opus"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-400"
                    />
                  </label>
                </div>

                <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-100">
                  <div><strong>默认模型</strong>：未指定具体档位时使用。</div>
                  <div><strong>Haiku / Sonnet / Opus</strong>：当界面选择对应档位时映射到的实际模型名。</div>
                  <div><strong>推理模型</strong>：需要更强推理或 reasoning 路径时使用；你的网关不区分时可以留空。</div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="min-h-5 text-xs">
                    {isLoadingSettings && <span className="text-blue-700 dark:text-blue-300">正在读取已保存配置...</span>}
                    {settingsMessage && <span className="text-green-700 dark:text-green-300">{settingsMessage}</span>}
                    {settingsError && <span className="text-red-600 dark:text-red-400">{settingsError}</span>}
                  </div>
                  <Button
                    onClick={handleSaveClaudeSettings}
                    disabled={
                      isSavingSettings
                      || (!apiKey.trim()
                        && !baseUrl.trim()
                        && !model.trim()
                        && !haikuModel.trim()
                        && !sonnetModel.trim()
                        && !opusModel.trim()
                        && !reasoningModel.trim())
                    }
                    className={`${config.buttonClass} text-white`}
                    size="sm"
                  >
                    {isSavingSettings ? '保存中...' : authStatus.authenticated ? '覆盖配置' : '保存配置'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {authStatus.method !== 'api_key' && (
            <div className="border-t border-border/50 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className={`font-medium ${config.textClass}`}>
                    {authStatus.authenticated ? t('agents.login.reAuthenticate') : t('agents.login.title')}
                  </div>
                  <div className={`text-sm ${config.subtextClass}`}>
                    {authStatus.authenticated
                      ? t('agents.login.reAuthDescription')
                      : t('agents.login.description', { agent: config.name })}
                  </div>
                </div>
                <Button
                  onClick={onLogin}
                  className={`${config.buttonClass} text-white`}
                  size="sm"
                >
                  <LogIn className="mr-2 h-4 w-4" />
                  {authStatus.authenticated ? t('agents.login.reLoginButton') : t('agents.login.button')}
                </Button>
              </div>
            </div>
          )}

          {authStatus.error && (
            <div className="border-t border-border/50 pt-4">
              <div className="text-sm text-red-600 dark:text-red-400">
                {t('agents.error', { error: authStatus.error })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
