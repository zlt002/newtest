import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('NumberField keeps blank input as a draft instead of committing deletion on blur', async () => {
  const source = await readFile(new URL('./NumberField.tsx', import.meta.url), 'utf8');

  assert.match(source, /if \(!draft\.trim\(\)\) \{/);
  assert.match(source, /setDraft\(String\(value\.value \?\? ''\)\)/);
  assert.doesNotMatch(source, /onCommit\(\{\s*value: draft,\s*unit: getDefaultUnit\(units, unit\),\s*\}\);/);
});
