import { useTranslation } from 'react-i18next';
import { cn } from '../../../../../../lib/utils';
import type { AgentCategory } from '../../../../types/types';
import type { AgentCategoryTabsSectionProps } from '../types';

export const DEFAULT_AGENT_CATEGORIES: AgentCategory[] = ['account', 'permissions', 'mcp'];
export const CLAUDE_RUNTIME_CATEGORIES: AgentCategory[] = [
  'account',
  'permissions',
  'mcp',
  'plugins',
  'skills',
  'commands',
  'hooks',
];

function getCategoryLabel(category: AgentCategory, t: (key: string) => string) {
  const labels: Record<AgentCategory, string> = {
    account: t('tabs.account'),
    permissions: t('tabs.permissions'),
    mcp: t('tabs.mcpServers'),
    plugins: t('tabs.plugins'),
    skills: t('tabs.skills'),
    commands: t('tabs.commands'),
    hooks: t('tabs.hooks'),
  };
  return labels[category];
}

export default function AgentCategoryTabsSection({
  selectedCategory,
  onSelectCategory,
  categories = DEFAULT_AGENT_CATEGORIES,
}: AgentCategoryTabsSectionProps) {
  const { t } = useTranslation('settings');

  return (
    <div className="flex-shrink-0 border-b border-border">
      <div role="tablist" className="flex overflow-x-auto px-2 md:px-4">
        {categories.map((category) => (
          <button
            key={category}
            role="tab"
            aria-selected={selectedCategory === category}
            onClick={() => onSelectCategory(category)}
            className={cn(
              'whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium touch-manipulation transition-colors duration-150',
              selectedCategory === category
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {getCategoryLabel(category, t)}
          </button>
        ))}
      </div>
    </div>
  );
}
