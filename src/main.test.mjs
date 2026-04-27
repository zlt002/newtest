import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('main.jsx disables StrictMode in local development to avoid duplicate mount work', async () => {
  const sourcePath = path.join(process.cwd(), 'src/main.jsx');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /const appTree = import\.meta\.env\.DEV\s*\?\s*<App \/>\s*:/s);
  assert.match(source, /<React\.StrictMode>\s*<App \/>\s*<\/React\.StrictMode>/s);
  assert.match(source, /ReactDOM\.createRoot\(document\.getElementById\('root'\)\)\.render\(appTree\)/s);
});
