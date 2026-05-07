import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('NumberField commits blank input on blur so inline styles can be deleted', async () => {
  const source = await readFile(new URL('./NumberField.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /if \(!draft\.trim\(\)\) \{/);
  assert.doesNotMatch(source, /setDraft\(String\(value\.value \?\? ''\)\)/);
  assert.match(source, /onCommit\(normalizeNumberFieldCommit\(draft, unit, units, keywordOptions\)\);/);
  assert.match(source, /function normalizeNumberFieldCommit/);
  assert.match(source, /isCssKeywordValue/);
});
