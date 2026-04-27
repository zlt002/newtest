import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('CodeEditorSurface source auto-follows markdown preview while draft output is streaming', async () => {
  const source = await readFile(new URL('./CodeEditorSurface.tsx', import.meta.url), 'utf8');

  assert.match(source, /shouldAutoFollowOutput\?: boolean/);
  assert.match(source, /draftPreviewOperations\?: FileDraftPreviewOperation\[]/);
  assert.match(source, /useEffect\(\(\) => \{/);
  assert.match(source, /if \(!shouldAutoFollowOutput \|\| !markdownPreview \|\| !isMarkdownFile\)/);
  assert.match(source, /previewViewportRef\.current/);
  assert.match(source, /getFirstDraftPreviewAnchorLine/);
  assert.match(source, /getClosestPreviewAnchor/);
  assert.match(source, /querySelectorAll<HTMLElement>\('\[data-source-start-line\]\[data-source-end-line\]'\)/);
  assert.match(source, /scrollIntoView\(\{\s*block: 'center'/);
  assert.match(source, /scrollTop = container\.scrollHeight/);
});

test('CodeEditorSurface constrains CodeMirror width so toolbar panels stay inside the editor pane', async () => {
  const source = await readFile(new URL('./CodeEditorSurface.tsx', import.meta.url), 'utf8');

  assert.match(source, /width: '100%'/);
  assert.match(source, /minWidth: 0/);
});
