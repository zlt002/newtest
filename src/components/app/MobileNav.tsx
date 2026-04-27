import type { Dispatch, SetStateAction } from 'react';
import { MessageSquare, type LucideIcon } from 'lucide-react';
import { AppTab } from '../../types/app';

type CoreTabId = Exclude<AppTab, 'preview'>;

type CoreNavItem = {
  id: CoreTabId;
  icon: LucideIcon;
  label: string;
};

type MobileNavProps = {
  activeTab: AppTab;
  setActiveTab: Dispatch<SetStateAction<AppTab>>;
  isInputFocused: boolean;
};

export default function MobileNav({ activeTab, setActiveTab, isInputFocused }: MobileNavProps) {
  const coreItems: CoreNavItem[] = [
    { id: 'chat', icon: MessageSquare, label: 'Chat' },
  ];
  const currentTab = activeTab === 'preview' ? 'chat' : activeTab;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 transform px-3 pb-[max(8px,env(safe-area-inset-bottom))] transition-transform duration-300 ease-in-out ${
        isInputFocused ? 'translate-y-full' : 'translate-y-0'
      }`}
    >
      <div className="nav-glass mobile-nav-float rounded-2xl border border-border/30">
        <div className="flex items-center justify-around gap-0.5 px-1 py-1.5">
          {coreItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setActiveTab(item.id);
                }}
                className={`relative flex flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-2 transition-all duration-200 active:scale-95 ${
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
              >
                {isActive && <div className="bg-primary/8 dark:bg-primary/12 absolute inset-0 rounded-xl" />}
                <Icon
                  className={`relative z-10 transition-all duration-200 ${isActive ? 'h-5 w-5' : 'h-[18px] w-[18px]'}`}
                  strokeWidth={isActive ? 2.4 : 1.8}
                />
                <span className={`relative z-10 text-[10px] font-medium transition-all duration-200 ${isActive ? 'opacity-100' : 'opacity-60'}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
