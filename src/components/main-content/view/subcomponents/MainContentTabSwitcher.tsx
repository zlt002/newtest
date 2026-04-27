import { MessageSquare, type LucideIcon } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip, PillBar, Pill } from '../../../../shared/view/ui';
import type { AppTab } from '../../../../types/app';

type MainContentTabSwitcherProps = {
  activeTab: AppTab;
  setActiveTab: Dispatch<SetStateAction<AppTab>>;
  className?: string;
};

type BuiltInTab = {
  id: AppTab;
  labelKey: string;
  icon: LucideIcon;
};

const BASE_TABS: BuiltInTab[] = [
  { id: 'chat', labelKey: 'tabs.chat', icon: MessageSquare },
];

export default function MainContentTabSwitcher({
  activeTab,
  setActiveTab,
  className,
}: MainContentTabSwitcherProps) {
  const { t } = useTranslation();
  const tabs: BuiltInTab[] = BASE_TABS;
  const currentTab = activeTab === 'preview' ? 'chat' : activeTab;

  return (
    <PillBar className={className}>
      {tabs.map((tab) => {
        const isActive = tab.id === currentTab;
        const displayLabel = t(tab.labelKey);

        return (
          <Tooltip key={tab.id} content={displayLabel} position="bottom">
            <Pill
              isActive={isActive}
              onClick={() => setActiveTab(tab.id)}
              className="px-2.5 py-[5px]"
            >
              <tab.icon className="h-3.5 w-3.5" strokeWidth={isActive ? 2.2 : 1.8} />
              <span className="hidden lg:inline">{displayLabel}</span>
            </Pill>
          </Tooltip>
        );
      })}
    </PillBar>
  );
}
