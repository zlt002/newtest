import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

test('git panel translations are registered in i18n resources', () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const resourcesPath = path.resolve(currentDir, '../../../i18n/resources.ts');
  const resourceFile = readFileSync(resourcesPath, 'utf8');

  assert.match(resourceFile, /import gitPanel from '\.\/locales\/zh-CN\/gitPanel\.json';/);
  assert.match(resourceFile, /gitPanel,/);
});
