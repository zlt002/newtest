import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('file sync events broadcast only reaches matching subscribers and skips the source instance', async () => {
  const {
    broadcastFileSyncEvent,
    subscribeToFileSyncEvents,
  } = await import('./fileSyncEvents.ts');

  const received = [];
  const unsubscribe = subscribeToFileSyncEvents({
    projectName: 'demo',
    filePath: '/workspace/demo/index.html',
    sourceId: 'visual-editor-1',
    onFileSync: (event) => {
      received.push(event);
    },
  });

  broadcastFileSyncEvent({
    projectName: 'demo',
    filePath: '/workspace/demo/index.html',
    sourceId: 'visual-editor-1',
    version: 'v1',
  });

  broadcastFileSyncEvent({
    projectName: 'demo',
    filePath: '/workspace/demo/index.html',
    sourceId: 'code-editor-2',
    version: 'v2',
  });

  broadcastFileSyncEvent({
    projectName: 'demo',
    filePath: '/workspace/demo/other.html',
    sourceId: 'visual-editor-3',
    version: 'v3',
  });

  unsubscribe();

  assert.equal(received.length, 1);
  assert.equal(received[0].projectName, 'demo');
  assert.equal(received[0].filePath, '/workspace/demo/index.html');
  assert.equal(received[0].sourceId, 'code-editor-2');
  assert.equal(received[0].version, 'v2');
  assert.equal(typeof received[0].updatedAt, 'number');
});

test('VisualHtmlEditor source wires eligibility, GrapesJS init, file load, save, and sync broadcast', async () => {
  const source = await readFile(new URL('../components/right-pane/view/VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /isHtmlEligibleForVisualEditing/);
  assert.match(source, /grapesjs\.init/);
  assert.match(source, /api\.readFile/);
  assert.match(source, /api\.saveFile/);
  assert.match(source, /broadcastFileSyncEvent/);
});

test('useCodeEditorDocument source subscribes to file sync events for reloads', async () => {
  const source = await readFile(new URL('../components/code-editor/hooks/useCodeEditorDocument.ts', import.meta.url), 'utf8');

  assert.match(source, /subscribeToFileSyncEvents/);
  assert.match(source, /loadFileContent/);
  assert.match(source, /projectName: fileProjectName/);
  assert.match(source, /filePath/);
});

test('AppContent source rebroadcasts committed draft preview events into file sync reloads', async () => {
  const source = await readFile(new URL('../components/app/AppContent.tsx', import.meta.url), 'utf8');

  assert.match(source, /broadcastFileSyncEvent/);
  assert.match(source, /event\.type === 'file_change_preview_committed'/);
  assert.match(source, /projectName: selectedProject\.name/);
  assert.match(source, /filePath: event\.filePath/);
});
