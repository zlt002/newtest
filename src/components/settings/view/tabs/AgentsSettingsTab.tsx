import { useCallback, useEffect, useMemo, useState } from 'react';
import { authenticatedFetch } from '../../../../utils/api';
import type { AgentCategory, AuthStatus, ClaudePermissionsState, SettingsProject } from '../../types/types';
import ClaudeLoginModal from '../../../onboarding/view/subcomponents/ClaudeLoginModal';
import AccountContent from './agents-settings/sections/content/AccountContent';
import CapabilityManagementSection from './agents-settings/sections/content/CapabilityManagementSection';
import ClaudeRuntimeSettingsSection from './agents-settings/sections/content/ClaudeRuntimeSettingsSection';
import HooksEntrySection from './agents-settings/sections/content/HooksEntrySection';
import McpManagementSection from './agents-settings/sections/content/McpManagementSection';
import PermissionsContent from './agents-settings/sections/content/PermissionsContent';
import PluginManagementSection from './agents-settings/sections/content/PluginManagementSection';

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
  value === 'account'
  || value === 'permissions'
  || value === 'mcp'
  || value === 'plugins'
  || value === 'skills'
  || value === 'commands'
  || value === 'hooks';

export default function AgentsSettingsTab({
  claudePermissions,
  onClaudePermissionsChange,
  selectedProjectPath = null,
  initialCategory,
  projects = [],
}: AgentsSettingsTabProps) {
  const selectedCategory = useMemo<AgentCategory>(
    () => (isAgentCategory(initialCategory) ? initialCategory : 'permissions'),
    [initialCategory],
  );
  const [authStatus, setAuthStatus] = useState<AuthStatus>(DEFAULT_AUTH_STATUS);
  const [showLoginModal, setShowLoginModal] = useState(false);

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
        cliInstalled: Boolean(payload?.cliInstalled),
      });
    } catch (error) {
      setAuthStatus({
        authenticated: false,
        email: null,
        loading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        cliInstalled: false,
      });
    }
  }, []);

  useEffect(() => {
    void loadClaudeAuthStatus();
  }, [loadClaudeAuthStatus]);

  const selectedProject = projects[0]
    ? {
      name: projects[0].name || 'default',
      displayName: projects[0].displayName || 'default',
      fullPath: projects[0].fullPath || '',
      path: projects[0].path || '',
    }
    : { name: 'default', displayName: 'default', fullPath: '', path: '' };

  return (
    <div className="space-y-6">
      {selectedCategory === 'account' && (
        <div className="space-y-4">
          <ClaudeRuntimeSettingsSection />
          <AccountContent
            agent="claude"
            authStatus={authStatus}
            onLogin={() => setShowLoginModal(true)}
            onConfigured={() => { void loadClaudeAuthStatus(); }}
          />
        </div>
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
        <McpManagementSection selectedProjectPath={selectedProjectPath} />
      )}

      {selectedCategory === 'plugins' && (
        <PluginManagementSection />
      )}

      {selectedCategory === 'skills' && (
        <CapabilityManagementSection selectedProjectPath={selectedProjectPath} type="skill" />
      )}

      {selectedCategory === 'commands' && (
        <CapabilityManagementSection selectedProjectPath={selectedProjectPath} type="command" />
      )}

      {selectedCategory === 'hooks' && (
        <HooksEntrySection selectedProjectPath={selectedProjectPath} />
      )}

      <ClaudeLoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        project={selectedProject}
        onComplete={() => {
          void loadClaudeAuthStatus();
        }}
      />
    </div>
  );
}
