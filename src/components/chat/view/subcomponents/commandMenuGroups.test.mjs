import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMAND_MENU_GROUP_ICONS,
  COMMAND_MENU_GROUP_LABELS,
  COMMAND_MENU_GROUP_ORDER,
  getCommandMenuGroup,
} from './commandMenuGroups.ts';

test('command menu prefers metadata group over namespace', () => {
  assert.equal(
    getCommandMenuGroup({
      namespace: 'local-ui',
      metadata: { group: 'frequent' },
    }),
    'frequent',
  );
});

test('command menu falls back to namespace and type when metadata group is absent', () => {
  assert.equal(getCommandMenuGroup({ namespace: 'local-ui' }), 'local-ui');
  assert.equal(getCommandMenuGroup({ type: 'claude-runtime' }), 'claude-runtime');
  assert.equal(getCommandMenuGroup({}), 'other');
});

test('command menu keeps local UI commands in local-ui even when legacy metadata groups say project or user', () => {
  assert.equal(
    getCommandMenuGroup({
      type: 'local-ui',
      metadata: { group: 'project' },
    }),
    'local-ui',
  );
  assert.equal(
    getCommandMenuGroup({
      sourceType: 'local-ui',
      metadata: { group: 'user' },
    }),
    'local-ui',
  );
});

test('command menu exposes runtime and local UI labels in the preferred order', () => {
  assert.equal(COMMAND_MENU_GROUP_LABELS['claude-runtime'], 'Claude 运行时命令');
  assert.equal(COMMAND_MENU_GROUP_LABELS['local-ui'], '本地命令');
  assert.equal(COMMAND_MENU_GROUP_LABELS.skills, 'Skill 命令');
  assert.deepEqual(COMMAND_MENU_GROUP_ORDER.slice(0, 5), ['frequent', 'skills', 'claude-runtime', 'local-ui', 'other']);
  assert.equal(COMMAND_MENU_GROUP_ICONS['claude-runtime'], '运行时');
  assert.equal(COMMAND_MENU_GROUP_ICONS['local-ui'], '本地');
  assert.equal(COMMAND_MENU_GROUP_ICONS.skills, 'Skill');
});
