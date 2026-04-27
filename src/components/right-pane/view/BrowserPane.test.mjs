import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('BrowserPane source renders browser chrome controls with the external sandbox', async () => {
  const source = await readFile(new URL('./BrowserPane.tsx', import.meta.url), 'utf8');

  assert.match(source, /data-right-pane-view="browser"/);
  assert.match(source, /data-browser-back="true"/);
  assert.match(source, /data-browser-forward="true"/);
  assert.match(source, /data-browser-refresh="true"/);
  assert.match(source, /data-browser-address-bar="true"/);
  assert.match(source, /getBrowserIframeSandbox\(\)/);
  assert.doesNotMatch(source, /file-html/);
});

test('RightPaneContentRouter source still routes browser targets to BrowserPane', async () => {
  const source = await readFile(new URL('./RightPaneContentRouter.tsx', import.meta.url), 'utf8');

  assert.match(source, /<BrowserPane/);
  assert.match(source, /target\.type === 'browser'/);
});
