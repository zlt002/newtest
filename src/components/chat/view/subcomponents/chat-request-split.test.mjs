import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('permission banner no longer owns AskUserQuestion rendering', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/chat/view/subcomponents/PermissionRequestsBanner.tsx');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.doesNotMatch(source, /AskUserQuestionPanel/);
  assert.doesNotMatch(source, /registerPermissionPanel\('AskUserQuestion'/);
  assert.match(source, /isPendingToolApprovalRequest/);
});

test('interactive banner owns AskUserQuestion rendering', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/chat/view/subcomponents/InteractiveRequestsBanner.tsx');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /QuestionRequestCard/);
  assert.doesNotMatch(source, /AskUserQuestionPanel/);
  assert.doesNotMatch(source, /getInteractivePanel/);
  assert.match(source, /QuestionRequestCard/);
  assert.match(source, /inStreamRenderingEnabled/);
});

test('question and approval cards exist as dedicated rendering surfaces', async () => {
  const questionCardPath = path.join(process.cwd(), 'src/components/chat/components/QuestionRequestCard.tsx');
  const approvalCardPath = path.join(process.cwd(), 'src/components/chat/components/ToolApprovalCard.tsx');

  const [questionCardSource, approvalCardSource] = await Promise.all([
    fs.readFile(questionCardPath, 'utf8'),
    fs.readFile(approvalCardPath, 'utf8'),
  ]);

  assert.match(questionCardSource, /export function QuestionRequestCard/);
  assert.match(questionCardSource, /AskUserQuestionPanel/);
  assert.match(approvalCardSource, /export function ToolApprovalCard/);
  assert.match(approvalCardSource, /allowOnce|allowRemember|deny/i);
});

test('composer gates the input on interactive_prompt requests instead of permission-only requests', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/chat/view/subcomponents/ChatComposer.tsx');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /isPendingQuestionRequest/);
  assert.doesNotMatch(source, /toolName === 'AskUserQuestion'/);
  assert.doesNotMatch(source, /InteractiveRequestsBanner/);
  assert.doesNotMatch(source, /PermissionRequestsBanner/);
  assert.match(source, /data-chat-v2-composer-blocked/);
});

test('decision banners are compatibility wrappers rather than primary rendering surfaces', async () => {
  const permissionSource = await fs.readFile(
    path.join(process.cwd(), 'src/components/chat/view/subcomponents/PermissionRequestsBanner.tsx'),
    'utf8',
  );
  const interactiveSource = await fs.readFile(
    path.join(process.cwd(), 'src/components/chat/view/subcomponents/InteractiveRequestsBanner.tsx'),
    'utf8',
  );

  assert.match(permissionSource, /inStreamRenderingEnabled/);
  assert.match(interactiveSource, /inStreamRenderingEnabled/);
  assert.match(permissionSource, /embedded/);
  assert.match(interactiveSource, /embedded/);
  assert.match(permissionSource, /ToolApprovalCard/);
  assert.match(interactiveSource, /QuestionRequestCard/);
});

test('run card interaction wrapper embeds the decision banners inside the card surface', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/chat/components/RunCardInteraction.tsx');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /data-chat-v2-run-card-interaction="true"/);
  assert.match(source, /InteractiveRequestsBanner/);
  assert.match(source, /PermissionRequestsBanner/);
  assert.match(source, /embedded/);
});

test('chat interface adds a standalone fallback run card when pending requests are not anchored yet', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/chat/view/ChatInterface.tsx');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /function mergePendingRequestsIntoRunCards\(/);
  assert.match(source, /const runCardsWithPendingFallback = React\.useMemo\(/);
  assert.match(source, /buildFallbackRunCard/);
  assert.match(source, /pendingDecisionRequests/);
  assert.match(source, /activeInteraction\?\.requestId/);
  assert.match(source, /headline: kind === 'interactive_prompt' \? '等待你的回答' : '等待授权'/);
  assert.match(source, /runCards=\{conversationTurns\.length > 0 \? \[\] : runCardsWithPendingFallback\}/);
});

test('chat interface skips live run cards entirely when there are no realtime events', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/chat/view/ChatInterface.tsx');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /const realtimeEvents = listAgentRealtimeEvents\(activeAgentSessionId\);/);
  assert.match(source, /if \(realtimeEvents\.length === 0\) \{\n\s+return \[\];\n\s+\}/);
  assert.match(source, /events: realtimeEvents/);
});

test('permission banner reads labels from chat i18n instead of hardcoded English copy', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/chat/components/ToolApprovalCard.tsx');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /useTranslation\('chat'\)/);
  assert.match(source, /t\('permissionRequests\.title'\)/);
  assert.match(source, /t\('permissionRequests\.actions\.allowOnce'\)/);
  assert.doesNotMatch(source, /Permission required/);
  assert.doesNotMatch(source, /Allow once/);
});

test('AskUserQuestion panel reads chrome copy from chat i18n instead of hardcoded English text', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/chat/tools/components/InteractiveRenderers/AskUserQuestionPanel.tsx');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /useTranslation\('chat'\)/);
  assert.match(source, /t\('interactivePrompt\.title'\)/);
  assert.match(source, /t\('interactivePrompt\.actions\.submit'\)/);
  assert.doesNotMatch(source, /Claude needs your input/);
  assert.doesNotMatch(source, /Select all that apply/);
  assert.doesNotMatch(source, /Type your answer/);
});

test('composer context bar no longer renders raw English runtime status tokens', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/chat/components/ComposerContextBar.ts');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /useTranslation\('chat'\)/);
  assert.match(source, /composerContext\.statuses\.\$\{status\}/);
  assert.doesNotMatch(source, /React\.createElement\('span', \{ className: 'font-medium' \}, status\)/);
});
