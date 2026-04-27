import type { CliProvider, ProviderStatusMap } from '../types';
import AgentConnectionCard from './AgentConnectionCard';

type AgentConnectionsStepProps = {
  providerStatuses: ProviderStatusMap;
  onOpenProviderLogin: (provider: CliProvider) => void;
};

export default function AgentConnectionsStep({
  providerStatuses,
  onOpenProviderLogin,
}: AgentConnectionsStepProps) {
  return (
    <div className="space-y-6">
      <div className="mb-6 text-center">
        <h2 className="mb-2 text-2xl font-bold text-foreground">Connect Claude</h2>
        <p className="text-muted-foreground">
          Login to Claude Code CLI to start using the assistant.
        </p>
      </div>

      <div className="space-y-3">
        <AgentConnectionCard
          provider="claude"
          title="Claude Code"
          status={providerStatuses['claude']}
          connectedClassName="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
          iconContainerClassName="bg-blue-100 dark:bg-blue-900/30"
          loginButtonClassName="bg-blue-600 hover:bg-blue-700"
          onLogin={() => onOpenProviderLogin('claude')}
        />
      </div>

      <div className="pt-2 text-center text-sm text-muted-foreground">
        <p>You can configure this later in Settings.</p>
      </div>
    </div>
  );
}
