import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { CLAUDE_MODELS } from '../../shared/modelConstants.js';
import {
  findBuiltInCommand,
  getBuiltInCommands,
} from '../../shared/claudeCommandRegistry.js';
import { defaultAgentV2Runtime } from '../services/agent/default-services.js';
import { parseFrontmatter } from '../utils/frontmatter.js';

async function getAllMCPServers() {
  try {
    const homeDir = os.homedir();
    const configPaths = [
      path.join(homeDir, '.claude.json'),
      path.join(homeDir, '.claude', 'settings.json'),
    ];

    for (const filepath of configPaths) {
      try {
        const fileContent = await fs.readFile(filepath, 'utf8');
        const configData = JSON.parse(fileContent);
        return {
          hasConfig: true,
          configPath: filepath,
          servers: configData.mcpServers || {},
          projectServers: configData.projects || {},
        };
      } catch {
        continue;
      }
    }

    return { hasConfig: false, servers: {}, projectServers: {} };
  } catch {
    return { hasConfig: false, servers: {}, projectServers: {} };
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

/**
 * Recursively scan directory for command files (.md)
 * @param {string} dir - Directory to scan
 * @param {string} baseDir - Base directory for relative paths
 * @param {string} namespace - Namespace for commands (e.g., 'project', 'user')
 * @returns {Promise<Array>} Array of command objects
 */
async function scanCommandsDirectory(dir, baseDir, namespace) {
  const commands = [];

  try {
    // Check if directory exists
    await fs.access(dir);

    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        const subCommands = await scanCommandsDirectory(fullPath, baseDir, namespace);
        commands.push(...subCommands);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // Parse markdown file for metadata
        try {
          const content = await fs.readFile(fullPath, 'utf8');
          const { data: frontmatter, content: commandContent } = parseFrontmatter(content);

          // Calculate relative path from baseDir for command name
          const relativePath = path.relative(baseDir, fullPath);
          // Remove .md extension and convert to command name
          const commandName = '/' + relativePath.replace(/\.md$/, '').replace(/\\/g, '/');

          // Extract description from frontmatter or first line of content
          let description = frontmatter.description || '';
          if (!description) {
            const firstLine = commandContent.trim().split('\n')[0];
            description = firstLine.replace(/^#+\s*/, '').trim();
          }

          commands.push({
            name: commandName,
            path: fullPath,
            relativePath,
            description,
            namespace,
            metadata: frontmatter
          });
        } catch (err) {
          console.error(`Error parsing command file ${fullPath}:`, err.message);
        }
      }
    }
  } catch (err) {
    // Directory doesn't exist or can't be accessed - this is okay
    if (err.code !== 'ENOENT' && err.code !== 'EACCES') {
      console.error(`Error scanning directory ${dir}:`, err.message);
    }
  }

  return commands;
}

const builtInCommands = getBuiltInCommands().filter((command) => command.metadata?.type !== 'skill');
const claudeModelValues = CLAUDE_MODELS.OPTIONS.map((option) => option.value);
const claudeModelValueSet = new Set(claudeModelValues);
const localExecutableCommandNames = new Set(['/model']);

const isLocallyExecutableCommand = (commandName) => localExecutableCommandNames.has(commandName);

const formatCommandTable = (commands) =>
  commands
    .map((command) => {
      const aliasSuffix =
        command.metadata?.aliases?.length > 0
          ? ` Aliases: ${command.metadata.aliases.join(', ')}`
          : '';
      return `### ${command.name}
${command.description}.${aliasSuffix}`;
    })
    .join('\n\n');

const formatBulletList = (items) => (items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : '- None found');

const buildSkillPrompt = (title, body, args = []) => {
  const suffix = args.join(' ').trim();
  return `Use the Claude Code workflow for **${title}**.

${body}

${suffix ? `User input: ${suffix}` : 'Use the current conversation and repository context to determine the next best step.'}`;
};

/**
 * Built-in command handlers
 * Each handler returns { type: 'builtin', action: string, data: any }
 */
const builtInHandlers = {
  '/add-dir': async (args) => {
    const targetPath = args.join(' ').trim().replace(/^['"]|['"]$/g, '');
    return {
      type: 'builtin',
      action: 'add_project_directory',
      data: {
        path: targetPath,
        hasPath: Boolean(targetPath),
        message: targetPath
          ? `Adding project directory: ${targetPath}`
          : 'Usage: /add-dir <absolute-or-relative-path>',
      },
    };
  },

  '/help': async (args, context) => {
    const helpText = `# Local UI Commands

${formatCommandTable(builtInCommands)}

## Claude Runtime Commands

Claude-native slash commands such as \`/compact\`, \`/context\`, or custom runtime commands are not executed through this local route.

- Use the slash command menu to discover currently available Claude runtime commands
- Selecting a Claude runtime command only inserts the raw \`/command\`
- Submitting it sends the original slash command text directly to the Claude session

## Filesystem Custom Commands

Custom markdown commands can be created in:
- Project: \`.claude/commands/\` (project-specific)
- User: \`~/.claude/commands/\` (available in all projects)

### Command Syntax

- **Arguments**: Use \`$ARGUMENTS\` for all args or \`$1\`, \`$2\`, etc. for positional
- **File Includes**: Use \`@filename\` to include file contents
- **Bash Commands**: Use \`!command\` to execute bash commands

### Example

\`\`\`markdown
/mycommand arg1 arg2
\`\`\`
`;

    return {
      type: 'builtin',
      action: 'help',
      data: {
        content: helpText,
        format: 'markdown'
      }
    };
  },

  '/agents': async () => ({
    type: 'builtin',
    action: 'open_settings_tab',
    data: {
      tab: 'agents',
      section: 'account',
      content: `# Agents

Use this settings area to manage Claude-related permissions and compatibility settings for the current UI.`,
      format: 'markdown',
      message: 'Opening agent configurations...',
    },
  }),

  '/batch': async (args) => ({
    type: 'builtin',
    action: 'skill_prompt',
    data: {
      message: 'Starting batch planning workflow...',
      prompt: buildSkillPrompt(
        '/batch',
        'Research the codebase, decompose the requested work into independent chunks when appropriate, present a practical plan, and only execute after the user approves the approach.',
        args,
      ),
    },
  }),

  '/claude-api': async (args) => ({
    type: 'builtin',
    action: 'skill_prompt',
    data: {
      message: 'Loading Claude API workflow...',
      prompt: buildSkillPrompt(
        '/claude-api',
        'Focus on official Claude API usage, the most relevant integration patterns, and the concrete implementation guidance needed for this repository.',
        args,
      ),
    },
  }),

  '/clear': async (args, context) => {
    return {
      type: 'builtin',
      action: 'clear',
      data: {
        message: 'Conversation history cleared'
      }
    };
  },

  '/compact': async (args) => {
    const focus = args.join(' ').trim();
    const prompt = focus
      ? `Summarize the conversation so far with special focus on: ${focus}. Preserve decisions, open questions, files changed, and next steps in a concise handoff note.`
      : 'Summarize the conversation so far into a concise handoff note. Preserve decisions, open questions, files changed, and next steps.';

    return {
      type: 'builtin',
      action: 'compact',
      data: {
        prompt,
        message: focus
          ? `Preparing a compact summary focused on: ${focus}`
          : 'Preparing a compact summary for this conversation',
      },
    };
  },

  '/config': async () => ({
    type: 'builtin',
    action: 'open_settings_tab',
    data: {
      tab: 'appearance',
      message: 'Opening settings...',
    },
  }),

  '/copy': async (args) => ({
    type: 'builtin',
    action: 'copy_transcript',
    data: {
      text: args.join(' ').trim(),
      hasExplicitText: args.length > 0,
      message: args.length > 0 ? 'Copying provided text to clipboard...' : 'Copying conversation transcript...',
    },
  }),

  '/context': async (args, context) => {
    const tokenUsage = context?.tokenUsage || {};
    const used = Number(tokenUsage.used ?? tokenUsage.totalUsed ?? tokenUsage.total_tokens ?? 0) || 0;
    const total =
      Number(
        tokenUsage.total ??
          tokenUsage.contextWindow ??
          parseInt(process.env.CONTEXT_WINDOW || '160000', 10),
      ) || 160000;
    const percentage = total > 0 ? Number(((used / total) * 100).toFixed(1)) : 0;

    let status = 'healthy';
    let suggestion = 'Context usage looks comfortable.';
    if (percentage >= 85) {
      status = 'critical';
      suggestion = 'Consider /compact or /clear soon to avoid running out of context.';
    } else if (percentage >= 65) {
      status = 'warning';
      suggestion = 'Context is getting heavy. Compacting may help before a large task.';
    }

    return {
      type: 'builtin',
      action: 'context',
      data: {
        used,
        total,
        percentage,
        status,
        suggestion,
      },
    };
  },

  '/debug': async (args) => ({
    type: 'builtin',
    action: 'skill_prompt',
    data: {
      message: 'Starting debug workflow...',
      prompt: buildSkillPrompt(
        '/debug',
        'Investigate the issue systematically, reproduce it when possible, identify the most likely causes, and propose or apply the smallest reliable fix.',
        args,
      ),
    },
  }),

  '/model': async (args, context) => {
    const requestedModel = (args[0] || '').trim();
    const currentProvider = context?.provider || 'claude';
    const currentModel = context?.model || CLAUDE_MODELS.DEFAULT;
    const selectedModel = requestedModel || currentModel;

    if (requestedModel && !claudeModelValueSet.has(requestedModel)) {
      return {
        type: 'builtin',
        action: 'model',
        statusCode: 400,
        error: 'Invalid model name',
        message: `Unknown Claude model: ${requestedModel}`,
      };
    }

    return {
      type: 'builtin',
      action: 'model',
      data: {
        current: {
          provider: currentProvider,
          model: selectedModel,
        },
        available: {
          claude: claudeModelValues,
        },
        message: requestedModel
          ? `Switching to model: ${requestedModel}`
          : `Current model: ${currentModel}`,
      },
    };
  },

  '/cost': async (args, context) => {
    const tokenUsage = context?.tokenUsage || {};
    const provider = context?.provider || 'claude';
    const model = context?.model || CLAUDE_MODELS.DEFAULT;

    const used = Number(tokenUsage.used ?? tokenUsage.totalUsed ?? tokenUsage.total_tokens ?? 0) || 0;
    const total =
      Number(
        tokenUsage.total ??
          tokenUsage.contextWindow ??
          parseInt(process.env.CONTEXT_WINDOW || '160000', 10),
      ) || 160000;
    const percentage = total > 0 ? Number(((used / total) * 100).toFixed(1)) : 0;

    const inputTokensRaw =
      Number(
        tokenUsage.inputTokens ??
          tokenUsage.input ??
          tokenUsage.cumulativeInputTokens ??
          tokenUsage.promptTokens ??
          0,
      ) || 0;
    const outputTokens =
      Number(
        tokenUsage.outputTokens ??
          tokenUsage.output ??
          tokenUsage.cumulativeOutputTokens ??
          tokenUsage.completionTokens ??
          0,
      ) || 0;
    const cacheTokens =
      Number(
        tokenUsage.cacheReadTokens ??
          tokenUsage.cacheCreationTokens ??
          tokenUsage.cacheTokens ??
          tokenUsage.cachedTokens ??
          0,
      ) || 0;

    // If we only have total used tokens, treat them as input for display/estimation.
    const inputTokens =
      inputTokensRaw > 0 || outputTokens > 0 || cacheTokens > 0 ? inputTokensRaw + cacheTokens : used;

    // Rough default rates by provider (USD / 1M tokens).
    const pricingByProvider = {
      claude: { input: 3, output: 15 }
    };
    const rates = pricingByProvider[provider] || pricingByProvider.claude;

    const inputCost = (inputTokens / 1_000_000) * rates.input;
    const outputCost = (outputTokens / 1_000_000) * rates.output;
    const totalCost = inputCost + outputCost;

    return {
      type: 'builtin',
      action: 'cost',
      data: {
        tokenUsage: {
          used,
          total,
          percentage,
        },
        cost: {
          input: inputCost.toFixed(4),
          output: outputCost.toFixed(4),
          total: totalCost.toFixed(4),
        },
        model,
      },
    };
  },

  '/status': async (args, context) => {
    // Read version from package.json
    const packageJsonPath = path.join(path.dirname(__dirname), '..', 'package.json');
    let version = 'unknown';
    let packageName = 'claude-code-ui';

    try {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
      version = packageJson.version;
      packageName = packageJson.name;
    } catch (err) {
      console.error('Error reading package.json:', err);
    }

    const uptime = process.uptime();
    const uptimeMinutes = Math.floor(uptime / 60);
    const uptimeHours = Math.floor(uptimeMinutes / 60);
    const uptimeFormatted = uptimeHours > 0
      ? `${uptimeHours}h ${uptimeMinutes % 60}m`
      : `${uptimeMinutes}m`;

    return {
      type: 'builtin',
      action: 'status',
      data: {
        version,
        packageName,
        uptime: uptimeFormatted,
        uptimeSeconds: Math.floor(uptime),
        model: context?.model || 'claude-sonnet-4.5',
        provider: context?.provider || 'claude',
        nodeVersion: process.version,
        platform: process.platform
      }
    };
  },

  '/memory': async (args, context) => {
    const target = (args[0] || '').trim().toLowerCase();
    const wantsUserMemory = target === 'user' || target === 'global';
    const wantsProjectMemory = target === 'project' || target === 'local' || target === '';
    const projectPath = context?.projectPath;

    let claudeMdPath = '';
    let targetLabel = 'project';

    if (wantsUserMemory) {
      const configPath = path.join(os.homedir(), '.config', 'claude', 'CLAUDE.md');
      const legacyPath = path.join(os.homedir(), '.claude', 'CLAUDE.md');
      targetLabel = 'user';

      try {
        await fs.access(configPath);
        claudeMdPath = configPath;
      } catch {
        claudeMdPath = legacyPath;
      }
    } else if (wantsProjectMemory && projectPath) {
      claudeMdPath = path.join(projectPath, 'CLAUDE.md');
      targetLabel = 'project';
    } else {
      return {
        type: 'builtin',
        action: 'memory',
        data: {
          error: 'No project selected',
          message: 'Usage: /memory [project|user]. Select a project first when targeting project memory.',
        }
      };
    }

    // Check if CLAUDE.md exists
    let exists = false;
    try {
      await fs.access(claudeMdPath);
      exists = true;
    } catch (err) {
      // File doesn't exist
    }

    return {
      type: 'builtin',
      action: 'memory',
      data: {
        path: claudeMdPath,
        exists,
        target: targetLabel,
        message: exists
          ? `Opening ${targetLabel} CLAUDE.md at ${claudeMdPath}`
          : `${targetLabel === 'user' ? 'User' : 'Project'} CLAUDE.md not found at ${claudeMdPath}. Create it to store reusable instructions.`
      }
    };
  },

  '/mcp': async () => {
    const mcpData = await getAllMCPServers();
    const globalServers = Object.entries(mcpData.servers || {}).map(([name, config]) => {
      const serverType = config?.command ? 'stdio' : config?.url ? 'remote' : 'unknown';
      return `\`${name}\` (${serverType}, user scope)`;
    });
    const localServers = Object.entries(mcpData.projectServers || {}).flatMap(([projectPath, projectConfig]) =>
      Object.keys(projectConfig?.mcpServers || {}).map(
        (name) => `\`${name}\` (local scope, ${projectPath})`,
      ),
    );

    return {
      type: 'builtin',
      action: 'open_settings_tab',
      data: {
        tab: 'agents',
        content: `# MCP Servers

## User Scope
${formatBulletList(globalServers)}

## Local Scope
${formatBulletList(localServers)}
`,
        format: 'markdown',
        message: 'Opening MCP settings...',
        section: 'mcp',
      },
    };
  },

  '/permissions': async () => ({
    type: 'builtin',
    action: 'open_settings_tab',
    data: {
      tab: 'agents',
      content: `# Tool Permissions

Manage allow, ask, and deny behavior for Claude-compatible tools in this UI.`,
      format: 'markdown',
      message: 'Opening tool permissions...',
      section: 'permissions',
    },
  }),

  '/loop': async (args) => ({
    type: 'builtin',
    action: 'skill_prompt',
    data: {
      message: 'Preparing loop workflow...',
      prompt: buildSkillPrompt(
        '/loop',
        'Create a repeated maintenance or checking workflow for this session. If the user supplied an interval or repeated task, incorporate it directly into the workflow.',
        args,
      ),
    },
  }),

  '/skills': async (args, context) => {
    const customCommands = [];
    if (context?.projectPath) {
      const projectCommandsDir = path.join(context.projectPath, '.claude', 'commands');
      customCommands.push(
        ...(await scanCommandsDirectory(projectCommandsDir, projectCommandsDir, 'project')),
      );
    }

    const userCommandsDir = path.join(os.homedir(), '.claude', 'commands');
    customCommands.push(...(await scanCommandsDirectory(userCommandsDir, userCommandsDir, 'user')));

    const grouped = {
      project: customCommands.filter((command) => command.namespace === 'project'),
      user: customCommands.filter((command) => command.namespace === 'user'),
    };

    const renderGroup = (title, commands) =>
      commands.length > 0
        ? `## ${title}\n\n${commands
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((command) => `- \`${command.name}\` - ${command.description}`)
            .join('\n')}`
        : `## ${title}\n\n- None found`;

    return {
      type: 'builtin',
      action: 'help',
      data: {
        content: `# Skills and Custom Commands

Bundled Claude Code style skills are surfaced as built-in compatible commands in this UI. Custom project and user commands are listed below.

${renderGroup('Project Commands', grouped.project)}

${renderGroup('User Commands', grouped.user)}`,
        format: 'markdown',
      },
    };
  },

  '/statusline': async () => ({
    type: 'builtin',
    action: 'help',
    data: {
      content: `# Status Line

This UI does not have Claude Code's terminal prompt bar, so \`/statusline\` is mapped to guidance instead of a shell statusline editor.

- Use \`/status\` to inspect runtime details
- Use \`/context\` to inspect context pressure
- Use \`/config\` to adjust UI preferences`,
      format: 'markdown',
    },
  }),

  '/simplify': async (args) => ({
    type: 'builtin',
    action: 'skill_prompt',
    data: {
      message: 'Starting simplify workflow...',
      prompt: buildSkillPrompt(
        '/simplify',
        'Review the most relevant changed files for duplication, readability, and maintainability issues, then apply the best focused improvements.',
        args,
      ),
    },
  }),

  '/doctor': async (args, context) => {
    const mcpData = await getAllMCPServers();
    const projectPath = context?.projectPath || null;

    return {
      type: 'builtin',
      action: 'help',
      data: {
        content: `# Doctor

- Project path: ${projectPath || 'No project selected'}
- Provider: ${context?.provider || 'claude'}
- Model: ${context?.model || CLAUDE_MODELS.DEFAULT}
- MCP servers (user scope): ${Object.keys(mcpData.servers || {}).length}
- MCP servers (local scope): ${Object.values(mcpData.projectServers || {}).reduce((count, projectConfig) => count + Object.keys(projectConfig?.mcpServers || {}).length, 0)}

Use \`/status\`, \`/context\`, and \`/mcp\` for deeper inspection.`,
        format: 'markdown',
      },
    };
  },

  '/export': async () => ({
    type: 'builtin',
    action: 'export_transcript',
    data: {
      format: 'markdown',
      message: 'Exporting conversation transcript...',
    },
  }),

  '/ide': async () => ({
    type: 'builtin',
    action: 'open_settings_tab',
    data: {
      tab: 'appearance',
      content: `# IDE Integration

This web UI does not launch external IDE integrations directly from slash commands, so \`/ide\` is mapped to the closest in-app editor and appearance settings.

- Use the Files tab for project navigation
- Use the built-in editor for file editing
- Use plugin settings for extra integrations`,
      format: 'markdown',
      message: 'Opening IDE-related settings...',
    },
  }),

  '/usage': async (args, context) => {
    const tokenUsage = context?.tokenUsage || {};
    const used = Number(tokenUsage.used ?? tokenUsage.totalUsed ?? tokenUsage.total_tokens ?? 0) || 0;
    const total =
      Number(
        tokenUsage.total ??
          tokenUsage.contextWindow ??
          parseInt(process.env.CONTEXT_WINDOW || '160000', 10),
      ) || 160000;
    const percentage = total > 0 ? Number(((used / total) * 100).toFixed(1)) : 0;

    const inputTokens =
      Number(
        tokenUsage.inputTokens ??
          tokenUsage.input ??
          tokenUsage.cumulativeInputTokens ??
          tokenUsage.promptTokens ??
          0,
      ) || 0;
    const outputTokens =
      Number(
        tokenUsage.outputTokens ??
          tokenUsage.output ??
          tokenUsage.cumulativeOutputTokens ??
          tokenUsage.completionTokens ??
          0,
      ) || 0;

    return {
      type: 'builtin',
      action: 'help',
      data: {
        content: `# Usage

- Context used: ${used.toLocaleString()} / ${total.toLocaleString()} (${percentage}%)
- Input tokens: ${inputTokens.toLocaleString()}
- Output tokens: ${outputTokens.toLocaleString()}
- Estimated total tokens: ${(inputTokens + outputTokens).toLocaleString()}

Use \`/cost\` for price estimation and \`/context\` for context pressure guidance.`,
        format: 'markdown',
      },
    };
  },

  '/rewind': async (args, context) => {
    const steps = args[0] ? parseInt(args[0]) : 1;

    if (isNaN(steps) || steps < 1) {
      return {
        type: 'builtin',
        action: 'rewind',
        data: {
          error: 'Invalid steps parameter',
          message: 'Usage: /rewind [number] - Rewind conversation by N steps (default: 1)'
        }
      };
    }

    return {
      type: 'builtin',
      action: 'rewind',
      data: {
        steps,
        message: `Rewinding conversation by ${steps} step${steps > 1 ? 's' : ''}...`
      }
    };
  }
};

/**
 * POST /api/commands/list
 * List local UI commands plus runtime command catalog entries
 */
router.post('/list', async (req, res) => {
  try {
    const { projectPath, sessionId, toolsSettings } = req.body;
    const runtimeCatalog = (sessionId || projectPath)
      ? await defaultAgentV2Runtime.getCommandCatalog(sessionId || null, { projectPath, toolsSettings })
      : { localUi: [], runtime: [], skills: [] };
    const runtimeCommands = Array.isArray(runtimeCatalog.runtime) ? runtimeCatalog.runtime : [];
    const runtimeSkills = Array.isArray(runtimeCatalog.skills) ? runtimeCatalog.skills : [];
    const localUiCommands = [...builtInCommands];

    if (projectPath) {
      const projectCommandsDir = path.join(projectPath, '.claude', 'commands');
      const projectCommands = await scanCommandsDirectory(
        projectCommandsDir,
        projectCommandsDir,
        'project',
      );
      projectCommands.forEach((command) => {
        command.metadata = {
          ...(command.metadata || {}),
          group: 'project',
        };
      });
      localUiCommands.push(...projectCommands);
    }

    const homeDir = os.homedir();
    const userCommandsDir = path.join(homeDir, '.claude', 'commands');
    const userCommands = await scanCommandsDirectory(
      userCommandsDir,
      userCommandsDir,
      'user',
    );
    userCommands.forEach((command) => {
      command.metadata = {
        ...(command.metadata || {}),
        group: 'user',
      };
    });
    localUiCommands.push(...userCommands);

    res.json({
      localUi: localUiCommands,
      runtime: runtimeCommands,
      skills: runtimeSkills,
      count: localUiCommands.length + runtimeCommands.length + runtimeSkills.length,
    });
  } catch (error) {
    console.error('Error listing commands:', error);
    res.status(500).json({
      error: 'Failed to list commands',
      message: error.message
    });
  }
});

/**
 * POST /api/commands/load
 * Load a specific command file and return its content and metadata
 */
router.post('/load', async (req, res) => {
  try {
    const { commandPath } = req.body;

    if (!commandPath) {
      return res.status(400).json({
        error: 'Command path is required'
      });
    }

    // Security: Prevent path traversal
    const resolvedPath = path.resolve(commandPath);
    if (!resolvedPath.startsWith(path.resolve(os.homedir())) &&
        !resolvedPath.includes('.claude/commands')) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Command must be in .claude/commands directory'
      });
    }

    // Read and parse the command file
    const content = await fs.readFile(commandPath, 'utf8');
    const { data: metadata, content: commandContent } = parseFrontmatter(content);

    res.json({
      path: commandPath,
      metadata,
      content: commandContent
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({
        error: 'Command not found',
        message: `Command file not found: ${req.body.commandPath}`
      });
    }

    console.error('Error loading command:', error);
    res.status(500).json({
      error: 'Failed to load command',
      message: error.message
    });
  }
});

/**
 * POST /api/commands/execute
 * Execute a command with argument replacement
 * This endpoint prepares the command content but doesn't execute bash commands yet
 * (that will be handled in the command parser utility)
 */
router.post('/execute', async (req, res) => {
  try {
    const { commandName, commandPath, args = [], context = {} } = req.body;

    if (!commandName) {
      return res.status(400).json({
        error: 'Command name is required'
      });
    }

    // Handle built-in commands
    const resolvedBuiltInCommand = findBuiltInCommand(commandName);
    const handlerName = resolvedBuiltInCommand?.name || (isLocallyExecutableCommand(commandName) ? commandName : null);
    const handler = handlerName ? builtInHandlers[handlerName] : null;
    if (handler && resolvedBuiltInCommand?.metadata?.type !== 'skill') {
      try {
        const result = await handler(args, context);
        if (result?.statusCode) {
          const { statusCode, error, message } = result;
          return res.status(statusCode).json({
            error,
            message,
          });
        }
        return res.json({
          ...result,
          command: handlerName,
        });
      } catch (error) {
        console.error(`Error executing built-in command ${commandName}:`, error);
        return res.status(500).json({
          error: 'Command execution failed',
          message: error.message,
          command: commandName
        });
      }
    }

    if (
      commandName.startsWith('/') &&
      !isLocallyExecutableCommand(commandName) &&
      (!commandPath || resolvedBuiltInCommand?.metadata?.type === 'skill')
    ) {
      return res.status(400).json({
        error: 'Runtime command must be sent through Claude session execution',
        message: `${commandName} is a Claude runtime command and cannot be executed through /api/commands/execute`,
      });
    }

    // Handle custom commands
    if (!commandPath) {
      return res.status(400).json({
        error: 'Command path is required for custom commands'
      });
    }

    // Load command content
    // Security: validate commandPath is within allowed directories
    {
      const resolvedPath = path.resolve(commandPath);
      const userBase = path.resolve(path.join(os.homedir(), '.claude', 'commands'));
      const projectBase = context?.projectPath
        ? path.resolve(path.join(context.projectPath, '.claude', 'commands'))
        : null;
      const isUnder = (base) => {
        const rel = path.relative(base, resolvedPath);
        return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
      };
      if (!(isUnder(userBase) || (projectBase && isUnder(projectBase)))) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'Command must be in .claude/commands directory'
        });
      }
    }
    const content = await fs.readFile(commandPath, 'utf8');
    const { data: metadata, content: commandContent } = parseFrontmatter(content);
    // Basic argument replacement (will be enhanced in command parser utility)
    let processedContent = commandContent;

    // Replace $ARGUMENTS with all arguments joined
    const argsString = args.join(' ');
    processedContent = processedContent.replace(/\$ARGUMENTS/g, argsString);

    // Replace $1, $2, etc. with positional arguments
    args.forEach((arg, index) => {
      const placeholder = `$${index + 1}`;
      processedContent = processedContent.replace(new RegExp(`\\${placeholder}\\b`, 'g'), arg);
    });

    res.json({
      type: 'custom',
      command: commandName,
      content: processedContent,
      metadata,
      hasFileIncludes: processedContent.includes('@'),
      hasBashCommands: processedContent.includes('!')
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({
        error: 'Command not found',
        message: `Command file not found: ${req.body.commandPath}`
      });
    }

    console.error('Error executing command:', error);
    res.status(500).json({
      error: 'Failed to execute command',
      message: error.message
    });
  }
});

export default router;
