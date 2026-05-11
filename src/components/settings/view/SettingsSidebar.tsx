import { FileCode2, GitBranch, KeyRound, Package, Palette, Server, ShieldCheck, TerminalSquare, Webhook } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/utils';
import { PillBar, Pill } from '../../../shared/view/ui';
import type { SettingsTabId } from '../types/types';

type SettingsSidebarProps = {
  activeTab: SettingsTabId;
  onChange: (tab: SettingsTabId) => void;
};

type NavItem = {
  id: SettingsTabId;
  labelKey: string;
  icon: typeof Palette;
};

const NAV_ITEMS: NavItem[] = [
  { id: 'agents:account', labelKey: 'tabs.account', icon: KeyRound },
  { id: 'agents:permissions', labelKey: 'tabs.permissions', icon: ShieldCheck },
  { id: 'agents:mcp', labelKey: 'tabs.mcpServers', icon: Server },
  { id: 'agents:plugins', labelKey: 'tabs.plugins', icon: Package },
  { id: 'agents:skills', labelKey: 'tabs.skills', icon: FileCode2 },
  { id: 'agents:commands', labelKey: 'tabs.commands', icon: TerminalSquare },
  { id: 'agents:hooks', labelKey: 'tabs.hooks', icon: Webhook },
  { id: 'appearance', labelKey: 'mainTabs.appearance', icon: Palette },
  { id: 'git', labelKey: 'mainTabs.git', icon: GitBranch },
];

export default function SettingsSidebar({ activeTab, onChange }: SettingsSidebarProps) {
  const { t } = useTranslation('settings');

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-56 flex-shrink-0 border-r border-border bg-muted/30 md:flex md:flex-col">
        <nav className="flex flex-col gap-1 p-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onChange(item.id)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors duration-150',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground active:bg-accent/50',
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {t(item.labelKey)}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Mobile horizontal nav — pill bar */}
      <div className="flex-shrink-0 border-b border-border px-3 py-2 md:hidden">
        <PillBar className="scrollbar-hide w-full overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;

            return (
              <Pill
                key={item.id}
                isActive={activeTab === item.id}
                onClick={() => onChange(item.id)}
                className="flex-shrink-0"
              >
                <Icon className="h-3.5 w-3.5" />
                {t(item.labelKey)}
              </Pill>
            );
          })}
        </PillBar>
      </div>
    </>
  );
}
