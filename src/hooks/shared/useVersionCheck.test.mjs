import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

test('useVersionCheck calls the protected update-info endpoint with authenticatedFetch', () => {
  const source = readFileSync(path.join(currentDir, 'useVersionCheck.ts'), 'utf8');

  assert.match(source, /import \{ authenticatedFetch \} from '..\/..\/utils\/api';/);
  assert.match(source, /authenticatedFetch\('\/api\/system\/update-info'\)/);
  assert.equal(source.includes("fetch('/api/system/update-info')"), false);
});

test('useVersionCheck uses generic Lite naming for update metadata', () => {
  const source = readFileSync(path.join(currentDir, 'useVersionCheck.ts'), 'utf8');

  assert.match(source, /const LITE_VERSION_CHECK_KEY = 'lite';/);
  assert.match(source, /title: 'Lite 更新包已准备就绪'/);
  assert.equal(source.includes('WINDOWS_LITE_VERSION_CHECK_KEY'), false);
});
