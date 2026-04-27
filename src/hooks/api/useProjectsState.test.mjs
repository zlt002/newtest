import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('useProjectsState.ts suspends route-driven selection while switching to a new project session', async () => {
  const sourcePath = path.join(process.cwd(), 'src/hooks/useProjectsState.ts');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /const suspendRouteSelectionRef = useRef\(false\);/);
  assert.match(source, /if \(suspendRouteSelectionRef\.current\) \{/);
  assert.match(source, /suspendRouteSelectionRef\.current = true;/);
  assert.match(source, /if \(!sessionId\) \{\s*suspendRouteSelectionRef\.current = false;/);
});

test('useProjectsState.ts falls back to sessionLookup when the routed session is outside the preloaded sidebar page', async () => {
  const sourcePath = path.join(process.cwd(), 'src/hooks/useProjectsState.ts');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /api\.sessionLookup\(sessionId\)/);
  assert.match(source, /mergeResolvedRouteSessionIntoProjects/);
  assert.match(source, /if \(routeSelection\.project && routeSelection\.session\) \{/);
});

test('useProjectsState.ts skips sessionLookup for temporary new-session route ids', async () => {
  const sourcePath = path.join(process.cwd(), 'src/hooks/useProjectsState.ts');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /const isTemporarySessionRouteId = \(sessionId\?: string \| null\) =>/);
  assert.match(source, /sessionId\.startsWith\('new-session-'\)/);
  assert.match(source, /if \(!sessionId \|\| projects\.length === 0 \|\| suspendRouteSelectionRef\.current \|\| isTemporarySessionRouteId\(sessionId\)\) \{/);
});

test('useProjectsState.ts routes new-session drafts to a project-scoped session route instead of home', async () => {
  const sourcePath = path.join(process.cwd(), 'src/hooks/useProjectsState.ts');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /createDraftSessionRouteId/);
  assert.match(source, /navigate\(`\/session\/\$\{createDraftSessionRouteId\(project\.name\)\}`\)/);
});

test('useProjectsState.ts treats draft session routes as project-only selections', async () => {
  const sourcePath = path.join(process.cwd(), 'src/hooks/useProjectsState.ts');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /if \(routeSelection\.isDraftSessionRoute\) \{/);
  assert.match(source, /if \(selectedSession\) \{\s*setSelectedSession\(null\);/);
});
