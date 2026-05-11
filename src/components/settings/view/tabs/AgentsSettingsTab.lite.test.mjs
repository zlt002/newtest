import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('AgentsSettingsTab uses read-only MCP config and plugin settings endpoints', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/settings/view/tabs/AgentsSettingsTab.tsx');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /authenticatedFetch\(`\/api\/mcp\/config\/read\$\{query\}`\)/);
  assert.match(source, /encodeURIComponent\(selectedProjectPath\)/);
  assert.match(source, /\}, \[selectedProjectPath\]\);/);
  assert.doesNotMatch(source, /\/api\/mcp\/cli\/add/);
  assert.doesNotMatch(source, /\/api\/mcp\/cli\/remove/);
  assert.match(source, /authenticatedFetch\('\/api\/plugins'\)/);
  assert.match(source, /setSdkPlugins\(Array\.isArray\(payload\?\.sdkPlugins\) \? payload\.sdkPlugins : \[\]\)/);
  assert.match(source, /authenticatedFetch\('\/api\/plugins\/reload',\s*\{\s*method:\s*'POST'/);
  assert.match(source, /t\('mcpServers\.plugins\.title'\)/);
  assert.match(source, /t\('mcpServers\.plugins\.reloadButton'\)/);
  assert.match(source, /t\('mcpServers\.plugins\.sdkResolved'\)/);
});
