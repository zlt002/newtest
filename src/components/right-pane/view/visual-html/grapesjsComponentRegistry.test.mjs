import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('grapesjsComponentRegistry source adds configurable form component types with traits', async () => {
  const source = await readFile(new URL('./grapesjsComponentRegistry.ts', import.meta.url), 'utf8');

  assert.match(source, /editor\.DomComponents\.addType\('ccui-form-input'/);
  assert.match(source, /editor\.DomComponents\.addType\('ccui-form-select'/);
  assert.match(source, /editor\.DomComponents\.addType\('ccui-form-checkbox-group'/);
  assert.match(source, /editor\.DomComponents\.addType\('ccui-form-radio-group'/);
  assert.match(source, /traitFactory\.label/);
  assert.match(source, /traitFactory\.name/);
  assert.match(source, /traitFactory\.required/);
  assert.match(source, /traitFactory\.placeholder/);
  assert.match(source, /traitFactory\.options/);
  assert.match(source, /changeProp: true/);
});
