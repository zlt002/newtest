import { createElement } from 'react';
import { GitBranch, Folder, MessageSquare } from 'lucide-react';
import type { TFunction } from 'i18next';
import Tooltip from '../../../../shared/view/ui/Tooltip';
import type { WorkspaceView } from './sidebarWorkspace.shared';

type SidebarWorkspaceTabsProps = {
  value: WorkspaceView;
  onValueChange: (view: WorkspaceView) => void;
  t: TFunction;
  className?: string;
  showLabels?: boolean;
  stretch?: boolean;
};

const WORKSPACE_TABS = [
  { value: 'projects' as const, labelKey: 'workspace.projects', icon: MessageSquare },
  { value: 'files' as const, labelKey: 'workspace.files', icon: Folder },
  { value: 'git' as const, labelKey: 'workspace.git', icon: GitBranch },
];

export default function SidebarWorkspaceTabs({
  value,
  onValueChange,
  t,
  className = '',
  showLabels = false,
  stretch = false,
}: SidebarWorkspaceTabsProps) {
  return createElement(
    'div',
    {
      role: 'tablist',
      'aria-label': t('workspace.title', '工作区视图'),
      className: `sidebar-workspace-tabs flex h-full items-center gap-1 rounded-xl ${stretch ? 'w-full justify-stretch' : ''} ${className}`.trim(),
    },
    ...WORKSPACE_TABS.map((meta) => {
      const Icon = meta.icon;
      const isActive = value === meta.value;
      const button = createElement(
        'button',
        {
          type: 'button',
          role: 'tab',
          'aria-selected': isActive,
          'aria-pressed': isActive,
          'aria-label': t(meta.labelKey),
          title: t(meta.labelKey),
          onClick: () => onValueChange(meta.value),
          className: `sidebar-workspace-tab flex h-full items-center justify-center rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
            stretch ? 'flex-1' : ''
          } ${
            showLabels ? 'gap-1.5' : ''
          } ${
            isActive
              ? 'sidebar-workspace-tab-active text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`,
        },
        createElement(Icon, {
          className: `h-3.5 w-3.5 ${isActive ? 'text-primary' : 'text-muted-foreground/80'}`,
        }),
        showLabels ? createElement('span', null, t(meta.labelKey)) : null,
      );

      if (showLabels) {
        return button;
      }

      return createElement(
        Tooltip,
        {
          key: meta.value,
          content: t(meta.labelKey),
          position: 'bottom',
          delay: 150,
          children: button,
        },
      );
    }),
  );
}
