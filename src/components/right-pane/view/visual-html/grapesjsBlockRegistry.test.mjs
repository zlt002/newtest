import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('grapesjsBlockRegistry source defines official-style Basic and Forms categories', async () => {
  const source = await readFile(new URL('./grapesjsBlockRegistry.ts', import.meta.url), 'utf8');

  assert.match(source, /const BASIC_CATEGORY = 'Basic'/);
  assert.match(source, /const FORMS_CATEGORY = 'Forms'/);
  assert.match(source, /editor\.BlockManager\.add\('1-column'/);
  assert.match(source, /editor\.BlockManager\.add\('2-columns'/);
  assert.match(source, /editor\.BlockManager\.add\('text'/);
  assert.match(source, /editor\.BlockManager\.add\('image'/);
  assert.match(source, /editor\.BlockManager\.add\('form'/);
  assert.match(source, /editor\.BlockManager\.add\('input'/);
  assert.match(source, /editor\.BlockManager\.add\('select'/);
  assert.match(source, /editor\.BlockManager\.add\('checkbox'/);
  assert.match(source, /editor\.BlockManager\.add\('radio'/);
  assert.match(source, /editor\.BlockManager\.add\('button'/);
});
