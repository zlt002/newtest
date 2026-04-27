import { RefreshCw, Server } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedFetch } from '../../../../utils/api';
import { Button, Badge } from '../../../../shared/view/ui';
import type { AgentCategory, AuthStatus, ClaudePermissionsState, McpServer, SettingsProject } from '../../types/types';
import ClaudeLoginModal from '../../../onboarding/view/subcomponents/ClaudeLoginModal';
import AccountContent from './agents-settings/sections/content/AccountContent';
import PermissionsContent from './agents-settings/sections/content/PermissionsContent';
import AgentCategoryTabsSection from './agents-settings/sections/AgentCategoryTabsSection';

type AgentsSettingsTabProps = {
  claudePermissions: ClaudePermissionsState;
  onClaudePermissionsChange: (value: ClaudePermissionsState) => void;
  selectedProjectPath?: string | null;
  initialCategory?: string | null;
  projects?: SettingsProject[];
};

const DEFAULT_AUTH_STATUS: AuthStatus = {
  authenticated: false,
  email: null,
  loading: true,
  error: null,
};

const isAgentCategory = (value: string | null | undefined): value is AgentCategory =>
  value === 'account' || value === 'permissions' || value === 'mcp';

export default function AgentsSettingsTab({
  claudePermissions,
  onClaudePermissionsChange,
  selectedProjectPath = null,
  initialCategory,
  projects = [],
}: AgentsSettingsTabProps) {
  const { t } = useTranslation('settings');
  const [selectedCategory, setSelectedCategory] = useState<AgentCategory>(
    isAgentCategory(initialCategory) ? initialCategory : 'permissions',
  );
  const [authStatus, setAuthStatus] = useState<AuthStatus>(DEFAULT_AUTH_STATUS);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [mcpLoading, setMcpLoading] = useState(true);
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);

  useEffect(() => {
    if (isAgentCategory(initialCategory)) {
      setSelectedCategory(initialCategory);
    }
  }, [initialCategory]);

  const loadClaudeAuthStatus = useCallback(async () => {
    setAuthStatus((previous) => ({ ...previous, loading: true, error: null }));
    try {
      const response = await authenticatedFetch('/api/cli/claude/status');
      const payload = await response.json();
      setAuthStatus({
        authenticated: Boolean(payload?.authenticated),
        email: payload?.email || null,
        loading: false,
        error: payload?.error || null,
        method: payload?.method,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setAuthStatus({
        authenticated: false,
        email: null,
        loading: false,
        error: message,
      });
    }
  }, []);

  const loadClaudeMcpServers = useCallback(async () => {
    setMcpLoading(true);
    setMcpError(null);
    try {
      const query = selectedProjectPath
        ? `?projectPath=${encodeURIComponent(selectedProjectPath)}`
        : '';
      const response = await authenticatedFetch(`/api/mcp/config/read${query}`);
      const payload = await response.json();
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.details || payload?.message || payload?.error || 'Failed to load MCP servers');
      }
      setMcpServers(Array.isArray(payload?.servers) ? payload.servers : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setMcpError(message);
      setMcpServers([]);
    } finally {
      setMcpLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClaudeAuthStatus();
    void loadClaudeMcpServers();
  }, [loadClaudeAuthStatus, loadClaudeMcpServers]);

  const handleClaudeLogin = useCallback(() => {
    setShowLoginModal(true);
  }, []);

  const sortedMcpServers = useMemo(
    () =>
      [...mcpServers].sort((left, right) => {
        const scopeCompare = String(left.scope || '').localeCompare(String(right.scope || ''));
        return scopeCompare !== 0 ? scopeCompare : left.name.localeCompare(right.name);
      }),
    [mcpServers],
  );

  return (
    <div className="space-y-6">
      <AgentCategoryTabsSection
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
      />

      {selectedCategory === 'account' && (
        <AccountContent agent="claude" authStatus={authStatus} onLogin={handleClaudeLogin} />
      )}

      {selectedCategory === 'permissions' && (
        <PermissionsContent
          agent="claude"
          permissionMode={claudePermissions.permissionMode}
          onPermissionModeChange={(value) => {
            onClaudePermissionsChange({
              ...claudePermissions,
              permissionMode: value,
            });
          }}
          allowedTools={claudePermissions.allowedTools}
          onAllowedToolsChange={(value) => {
            onClaudePermissionsChange({
              ...claudePermissions,
              allowedTools: value,
            });
          }}
          disallowedTools={claudePermissions.disallowedTools}
          onDisallowedToolsChange={(value) => {
            onClaudePermissionsChange({
              ...claudePermissions,
              disallowedTools: value,
            });
          }}
        />
      )}

      {selectedCategory === 'mcp' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Server className="h-5 w-5 text-purple-500" />
              <div>
                <h3 className="text-lg font-medium text-foreground">{t('mcpServers.title')}</h3>
                <p className="text-sm text-muted-foreground">{t('mcpServers.readOnlyDescription')}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => { void loadClaudeMcpServers(); }}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t('mcpServers.refreshButton')}
            </Button>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            <p>{t('mcpServers.readOnlyHelp.line1')}</p>
            <p className="mt-2">{t('mcpServers.readOnlyHelp.line2')}</p>
          </div>

          {mcpError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-900/20 dark:text-red-200">
              {mcpError}
            </div>
          )}

          {mcpLoading ? (
            <div className="rounded-lg border border-border bg-card/50 p-4 text-sm text-muted-foreground">
              Loading MCP servers...
            </div>
          ) : sortedMcpServers.length === 0 ? (
            <div className="rounded-lg border border-border bg-card/50 p-4 text-sm text-muted-foreground">
              {t('mcpServers.empty')}
            </div>
          ) : (
            <div className="space-y-3">
              {sortedMcpServers.map((server) => {
                const serverId = server.id || `${server.scope}:${server.name}`;
                return (
                  <div key={serverId} className="rounded-lg border border-border bg-card/50 p-4">
                    <div className="mb-2 flex items-start justify-between gap-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">{server.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {server.type || 'stdio'}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {server.scope === 'local'
                            ? t('mcpServers.scope.local')
                            : server.scope === 'user'
                            ? t('mcpServers.scope.user')
                            : server.scope || 'unknown'}
                        </Badge>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {t('mcpServers.readOnlyBadge')}
                      </Badge>
                    </div>

                    <div className="space-y-1 text-sm text-muted-foreground">
                      {server.config?.command && (
                        <div>
                          {t('mcpServers.config.command')}: <code className="rounded bg-muted px-1 text-xs">{server.config.command}</code>
                        </div>
                      )}
                      {server.config?.url && (
                        <div>
                          {t('mcpServers.config.url')}: <code className="rounded bg-muted px-1 text-xs">{server.config.url}</code>
                        </div>
                      )}
                      {server.config?.args && server.config.args.length > 0 && (
                        <div>
                          {t('mcpServers.config.args')}: <code className="rounded bg-muted px-1 text-xs">{server.config.args.join(' ')}</code>
                        </div>
                      )}
                      {server.projectPath && (
                        <div>
                          Project: <code className="rounded bg-muted px-1 text-xs">{server.projectPath}</code>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <ClaudeLoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        project={projects[0] ? { name: projects[0].name || 'default', displayName: projects[0].displayName || 'default', fullPath: projects[0].fullPath || '', path: projects[0].path || '' } : { name: 'default', displayName: 'default', fullPath: '', path: '' }}
        onComplete={() => {
          void loadClaudeAuthStatus();
        }}
      />
    </div>
  );
}
