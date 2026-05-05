import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILT_IN_COMMANDS,
  CLAUDE_COMMAND_GROUPS,
  findBuiltInCommand,
  getBuiltInCommands,
} from './claudeCommandRegistry.js';

test('built-in Claude-compatible commands include the core CLI commands we surface', () => {
  const names = BUILT_IN_COMMANDS.map((command) => command.name);

  assert.deepEqual(
    names,
    ['/add-dir', '/agents', '/clear', '/config', '/copy', '/doctor', '/export', '/help', '/ide', '/mcp'],
  );
  assert.equal(names.includes('/compact'), false);
  assert.equal(names.includes('/context'), false);
  assert.equal(names.includes('/cost'), false);
});

test('aliases resolve to their canonical built-in command', () => {
  assert.equal(findBuiltInCommand('/settings')?.name, '/config');
  assert.equal(findBuiltInCommand('/reset')?.name, '/clear');
});

test('getBuiltInCommands returns cloned metadata arrays', () => {
  const commands = getBuiltInCommands();
  const configCommand = commands.find((command) => command.name === '/config');
  assert.ok(configCommand);
  configCommand.metadata.aliases.push('/unexpected');

  assert.equal(findBuiltInCommand('/unexpected'), null);
});

test('built-in skill workflows remain tagged so routes can exclude them from local UI commands', () => {
  const localUiCommands = getBuiltInCommands().filter((command) => command.metadata?.type !== 'skill');
  const names = localUiCommands.map((command) => command.name);

  assert.equal(names.includes('/batch'), false);
  assert.equal(names.includes('/debug'), false);
  assert.equal(names.includes('/help'), true);
});
