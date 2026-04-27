export const CLAUDE_COMMAND_GROUPS = {
  localUi: 'local-ui',
  project: 'project',
  user: 'user',
};

const localUi = (name, description, order, extra = {}) => ({
  name,
  description,
  namespace: 'local-ui',
  order,
  metadata: {
    type: 'local-ui',
    group: CLAUDE_COMMAND_GROUPS.localUi,
    ...extra,
  },
});

const skill = (name, description, order, extra = {}) => ({
  name,
  description,
  namespace: 'builtin',
  order,
  metadata: {
    type: 'skill',
    group: 'claude-runtime',
    ...extra,
  },
});

export const BUILT_IN_COMMANDS = [
  localUi('/add-dir', 'Add an additional project directory to the workspace list', 5),
  localUi('/agents', 'Manage agent configurations', 10),
  localUi('/clear', 'End the current chat view and start a fresh local conversation', 20, {
    aliases: ['/reset', '/new'],
  }),
  localUi('/config', 'Open settings and preferences', 30, {
    aliases: ['/settings'],
  }),
  localUi('/copy', 'Copy the current conversation transcript or provided text to the clipboard', 40),
  localUi('/doctor', 'Run a local diagnostic summary for the current CC UI environment', 50),
  localUi('/export', 'Export the current conversation transcript to a local markdown file', 60),
  localUi('/help', 'Show local UI command help', 70),
  localUi('/ide', 'Open the closest IDE and editor integration settings for this UI', 80),
  localUi('/mcp', 'Manage MCP server connections and authentication', 90),
];

export const BUILT_IN_SKILL_COMMANDS = [
  skill('/batch', 'Research the codebase, decompose a large task, and prepare a parallel work plan', 15),
  skill('/claude-api', 'Load Claude API reference material and apply it to the current project', 16),
  skill('/debug', 'Start a focused debugging workflow for the current issue', 55),
  skill('/loop', 'Run a repeated maintenance or check prompt in this session', 65),
  skill('/simplify', 'Review recent changes for cleanup opportunities and then improve them', 110),
];

const aliasToCanonicalName = new Map();
for (const command of [...BUILT_IN_COMMANDS, ...BUILT_IN_SKILL_COMMANDS]) {
  aliasToCanonicalName.set(command.name, command.name);
  for (const alias of command.metadata.aliases || []) {
    aliasToCanonicalName.set(alias, command.name);
  }
}

export function getBuiltInCommands() {
  return BUILT_IN_COMMANDS.map((command) => ({
    ...command,
    metadata: {
      ...command.metadata,
      aliases: [...(command.metadata.aliases || [])],
    },
  }));
}

export function findBuiltInCommand(commandName) {
  const canonicalName = aliasToCanonicalName.get(commandName);
  if (!canonicalName) {
    return null;
  }

  return [...BUILT_IN_COMMANDS, ...BUILT_IN_SKILL_COMMANDS].find((command) => command.name === canonicalName) || null;
}

export function getCommandGroup(command) {
  if (command?.namespace === 'project') {
    return CLAUDE_COMMAND_GROUPS.project;
  }
  if (command?.namespace === 'user') {
    return CLAUDE_COMMAND_GROUPS.user;
  }
  return command?.metadata?.group || CLAUDE_COMMAND_GROUPS.localUi;
}
