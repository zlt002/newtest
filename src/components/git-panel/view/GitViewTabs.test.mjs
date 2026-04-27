import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('GitViewTabs renders text tabs without lucide tab icons', () => {
  const source = readFileSync(new URL('./GitViewTabs.tsx', import.meta.url), 'utf8');

  assert.equal(source.includes('FileText'), false);
  assert.equal(source.includes('History'), false);
  assert.equal(source.includes('GitBranch'), false);
  assert.match(source, /const tabs:\s*\{\s*id:\s*GitPanelView;\s*label:\s*string\s*\}\[]/);
  assert.match(source, /<span>\{label\}<\/span>/);
});
