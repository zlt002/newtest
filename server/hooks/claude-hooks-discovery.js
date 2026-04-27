import os from 'node:os';
import path from 'node:path';

import { createHookSource } from './claude-hooks-types.js';
import { normalizeHookEntries } from './claude-hooks-normalizer.js';

function createFileSource({ id, kind, label, path: sourcePath, priority }) {
  return createHookSource({
    id,
    kind,
    label,
    path: sourcePath,
    writable: true,
    priority,
  });
}

function createReadonlySource({ id, kind, label, path: sourcePath, priority, pluginName, skillName, subagentName, description }) {
  return createHookSource({
    id,
    kind,
    label,
    path: sourcePath,
    writable: false,
    priority,
    pluginName,
    skillName,
    subagentName,
    description,
  });
}

export async function discoverClaudeHookSources({
  homeDir = os.homedir(),
  projectPath,
  settingsReader = async () => null,
  pluginSources = [],
  skillSources = [],
  subagentSources = [],
  sessionMemorySources = [],
} = {}) {
  const sources = [];
  const entries = [];

  const fileSources = [
    {
      id: 'user',
      kind: 'user',
      label: 'User settings',
      path: path.join(homeDir, '.claude', 'settings.json'),
      priority: 10,
    },
    {
      id: 'project',
      kind: 'project',
      label: 'Project settings',
      path: projectPath ? path.join(projectPath, '.claude', 'settings.json') : null,
      priority: 20,
    },
    {
      id: 'local',
      kind: 'local',
      label: 'Local project settings',
      path: projectPath ? path.join(projectPath, '.claude', 'settings.local.json') : null,
      priority: 30,
    },
  ].filter((source) => source.path);

  for (const fileSource of fileSources) {
    const source = createFileSource(fileSource);
    const payload = await settingsReader(source.path);
    sources.push(source);
    entries.push(...normalizeHookEntries({ source, hooks: payload?.hooks }));
  }

  for (const plugin of pluginSources) {
    if (!isNonEmptyString(plugin?.id)) {
      continue;
    }

    const source = createReadonlySource({
      id: plugin.id,
      kind: 'plugin',
      label: plugin.name,
      path: plugin.path,
      priority: 40,
      pluginName: plugin.name,
      description: 'Read-only hook source contributed by a Claude plugin.',
    });
    sources.push(source);
    entries.push(...normalizeHookEntries({ source, hooks: plugin.hooks }));
  }

  for (const skill of skillSources) {
    if (!isNonEmptyString(skill?.id)) {
      continue;
    }

    const source = createReadonlySource({
      id: skill.id,
      kind: 'skill',
      label: skill.name,
      path: skill.path,
      priority: 50,
      skillName: skill.name,
      description: 'Read-only hook source contributed by a Claude skill.',
    });
    sources.push(source);
    entries.push(...normalizeHookEntries({ source, hooks: skill.hooks }));
  }

  for (const subagent of subagentSources) {
    if (!isNonEmptyString(subagent?.id)) {
      continue;
    }

    const source = createReadonlySource({
      id: subagent.id,
      kind: 'subagent',
      label: subagent.name,
      path: subagent.path,
      priority: 60,
      subagentName: subagent.name,
      description: 'Read-only hook source contributed by a Claude subagent.',
    });
    sources.push(source);
    entries.push(...normalizeHookEntries({ source, hooks: subagent.hooks }));
  }

  for (const sessionMemory of sessionMemorySources) {
    if (!isNonEmptyString(sessionMemory?.sessionId)) {
      continue;
    }

    const source = createHookSource({
      id: `session-memory:${sessionMemory.sessionId}`,
      kind: 'session-memory',
      label: `Session memory ${sessionMemory.sessionId}`,
      writable: true,
      priority: 70,
      description: 'Writable hook source stored in session memory.',
    });
    sources.push(source);
    entries.push(...normalizeHookEntries({ source, hooks: sessionMemory.hooks }));
  }

  return {
    sources,
    entries,
  };
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}
