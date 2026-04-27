import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSlashCommandsFromResponse, normalizeSlashCommandData } from './slashCommandData.ts';

test('normalizeSlashCommandData preserves skills alongside slash command catalogs', () => {
  const normalized = normalizeSlashCommandData({
    localUi: [{ name: '/help', sourceType: 'local-ui' }],
    runtime: [{ name: '/brainstorming', sourceType: 'claude-runtime' }],
    skills: ['analysis', { name: 'planning', description: 'Plan work' }],
  });

  assert.deepEqual(normalized, {
    localUi: [{ name: '/help', sourceType: 'local-ui' }],
    runtime: [{ name: '/brainstorming', sourceType: 'claude-runtime' }],
    skills: [{ name: 'analysis' }, { name: 'planning', description: 'Plan work' }],
  });
});

test('buildSlashCommandsFromResponse keeps local UI, runtime commands, and skills visible to the menu', () => {
  const commands = buildSlashCommandsFromResponse({
    localUi: [{ name: '/help', sourceType: 'local-ui' }],
    runtime: [{ name: '/brainstorming', sourceType: 'claude-runtime' }],
    skills: [{ name: 'analysis', description: 'Analyze a codebase' }],
  });

  assert.deepEqual(
    commands.map((command) => ({ name: command.name, type: command.type })),
    [
      { name: '/help', type: 'local-ui' },
      { name: '/brainstorming', type: 'claude-runtime' },
      { name: '/analysis', type: 'claude-runtime' },
    ],
  );
  assert.deepEqual(commands[2].metadata, {
    type: 'skill',
    group: 'skills',
    skillName: 'analysis',
  });
});

test('buildSlashCommandsFromResponse marks runtime commands as skills when SDK exposes them only through runtime catalog', () => {
  const commands = buildSlashCommandsFromResponse({
    runtime: [
      { name: '/pmd-prd', description: '需求编写工作台，生成结构化 PRD。 (user)' },
      { name: '/cost', description: 'Show the total cost and duration of the current session' },
    ],
  });

  assert.deepEqual(
    commands.map((command) => ({
      name: command.name,
      group: command.metadata?.group || null,
      type: command.metadata?.type || null,
    })),
    [
      { name: '/pmd-prd', group: 'skills', type: 'skill' },
      { name: '/cost', group: null, type: null },
    ],
  );
});

test('buildSlashCommandsFromResponse does not duplicate skills that already exist in runtime catalog', () => {
  const commands = buildSlashCommandsFromResponse({
    runtime: [
      { name: '/analysis', description: 'Analyze the codebase. (user)' },
    ],
    skills: [
      { name: 'analysis', description: 'Analyze the codebase' },
    ],
  });

  assert.equal(commands.length, 1);
  assert.equal(commands[0].name, '/analysis');
  assert.deepEqual(commands[0].metadata, {
    type: 'skill',
    group: 'skills',
    skillName: 'analysis',
  });
});

test('buildSlashCommandsFromResponse keeps runtime /model commands in runtime shape when SDK exposes them', () => {
  const commands = buildSlashCommandsFromResponse({
    runtime: [
      {
        name: '/model',
        metadata: {
          group: 'claude-runtime',
          executeLocally: true,
          injected: true,
        },
      },
    ],
  });

  assert.equal(commands.length, 1);
  assert.deepEqual(commands[0], {
    name: '/model',
    metadata: {
      group: 'claude-runtime',
      executeLocally: true,
      injected: true,
    },
    type: 'claude-runtime',
    sourceType: 'claude-runtime',
  });
});
