type CommandMenuGroup = 'frequent' | 'claude-runtime' | 'local-ui' | 'skills' | 'other';

interface SlashCommand {
  sourceType?: string;
  type?: string;
  namespace?: string;
  metadata?: {
    group?: string;
    [key: string]: unknown;
  };
}

export const COMMAND_MENU_GROUP_LABELS: Record<CommandMenuGroup, string> = {
  frequent: '常用命令',
  'claude-runtime': 'Claude 运行时命令',
  'local-ui': '本地命令',
  skills: 'Skill 命令',
  other: '其他命令',
};

export const COMMAND_MENU_GROUP_ICONS: Record<CommandMenuGroup, string> = {
  frequent: '常用',
  'claude-runtime': '运行时',
  'local-ui': '本地',
  skills: 'Skill',
  other: '其他',
};

export const COMMAND_MENU_GROUP_ORDER: string[] = ['frequent', 'skills', 'claude-runtime', 'local-ui', 'other'];

export function getCommandMenuGroup(command: SlashCommand): CommandMenuGroup | string {
  const isLocalUiCommand =
    command?.sourceType === 'local-ui' ||
    command?.type === 'local-ui' ||
    command?.namespace === 'local-ui';

  if (isLocalUiCommand && (command.metadata?.group === 'project' || command.metadata?.group === 'user')) {
    return 'local-ui';
  }

  if (command.metadata?.group) {
    return command.metadata.group;
  }
  return command.namespace || command.type || 'other';
}
