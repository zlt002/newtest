import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('Claude permissions settings expose permissionMode and no longer render skipPermissions controls', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/settings/view/tabs/agents-settings/sections/content/PermissionsContent.tsx');
  const source = await fs.readFile(sourcePath, 'utf8');
  const claudePropsBlock = source.match(/type ClaudePermissionsProps = \{[\s\S]*?\n\};/)?.[0] ?? '';
  const claudeComponentHead = source.match(/function ClaudePermissions\([\s\S]*?\) \{/ )?.[0] ?? '';

  assert.match(source, /permissionMode: ClaudePermissionMode/);
  assert.match(source, /onPermissionModeChange: \(value: ClaudePermissionMode\) => void/);
  assert.match(source, /permissions\.claude\.permissionMode/);
  assert.doesNotMatch(claudePropsBlock, /skipPermissions/);
  assert.doesNotMatch(claudeComponentHead, /onSkipPermissionsChange/);
});

test('chat provider falls back to global Claude permissionMode when a session has no override', async () => {
  const sourcePath = path.join(process.cwd(), 'src/hooks/chat/useChatProviderState.ts');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /claude-settings/);
  assert.match(source, /permissionMode/);
  assert.match(source, /selectedSession\?\.id/);
  assert.match(source, /setPermissionMode\(readDefaultPermissionMode\(\)\)/);
});
