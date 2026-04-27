import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const workspaceRoot = process.cwd();
const packageJsonPath = path.join(workspaceRoot, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const patchScriptPath = path.join(
  workspaceRoot,
  'scripts',
  'patch-ask-user-question-limit.mjs',
);
const realtimeCoordinatorSource = fs.readFileSync(
  path.join(workspaceRoot, 'src/components/chat/view/agentV2Realtime.ts'),
  'utf8',
);
const realtimeHandlersSource = fs.readFileSync(
  path.join(workspaceRoot, 'src/hooks/chat/useChatRealtimeHandlers.ts'),
  'utf8',
);
const chatHandlerSource = fs.readFileSync(
  path.join(workspaceRoot, 'server/websocket/handlers/chatHandler.js'),
  'utf8',
);

test('package.json does not keep the legacy ask-user-question patch in postinstall', () => {
  assert.notEqual(
    packageJson.scripts?.postinstall,
    'node scripts/patch-ask-user-question-limit.mjs',
  );
});

test('legacy ask-user-question patch script has been removed', () => {
  assert.equal(fs.existsSync(patchScriptPath), false);
});

test('realtime coordinator source no longer emits legacy websocket transport event names', () => {
  assert.doesNotMatch(realtimeCoordinatorSource, /agent-run/);
  assert.doesNotMatch(realtimeCoordinatorSource, /claude-permission-response/);
});

test('chat realtime handlers source no longer relies on legacy websocket transport event names', () => {
  assert.doesNotMatch(realtimeHandlersSource, /agent-run/);
  assert.doesNotMatch(realtimeHandlersSource, /claude-permission-response/);
});

test('server websocket chat handler source no longer expects legacy websocket transport event names', () => {
  assert.doesNotMatch(chatHandlerSource, /agent-run/);
  assert.doesNotMatch(chatHandlerSource, /claude-permission-response/);
});
