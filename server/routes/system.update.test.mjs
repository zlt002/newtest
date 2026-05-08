import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

test('system update routes use generic Lite update helper names', () => {
  const source = readFileSync(path.join(currentDir, 'system.js'), 'utf8');

  assert.match(source, /getLiteUpdateStatus/);
  assert.match(source, /prepareLiteUpdate/);
  assert.match(source, /launchLiteUpdater/);
  assert.equal(source.includes('getWindowsLiteUpdateStatus'), false);
  assert.equal(source.includes('prepareWindowsLiteUpdate'), false);
  assert.equal(source.includes('launchWindowsLiteUpdater'), false);
});

test('system update response says the updater was launched instead of completed', () => {
  const source = readFileSync(path.join(currentDir, 'system.js'), 'utf8');

  assert.match(source, /Lite update package downloaded\. The application will restart to apply the update\./);
  assert.equal(source.includes('Windows Lite update package downloaded'), false);
});
