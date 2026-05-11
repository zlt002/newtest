import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('phase2 settings surface wires runtime mcp plugins capabilities and hooks sections', async () => {
  const source = await readFile('src/components/settings/view/tabs/AgentsSettingsTab.tsx', 'utf8');

  assert.match(source, /ClaudeRuntimeSettingsSection/);
  assert.match(source, /McpManagementSection/);
  assert.match(source, /PluginManagementSection/);
  assert.match(source, /CapabilityManagementSection/);
  assert.match(source, /HooksEntrySection/);
});

test('phase2 settings separates claude runtime capabilities into individual tabs', async () => {
  const sidebarSource = await readFile('src/components/settings/view/SettingsSidebar.tsx', 'utf8');
  const pageSource = await readFile('src/components/settings/view/tabs/AgentsSettingsTab.tsx', 'utf8');
  const settingsSource = await readFile('src/components/settings/view/Settings.tsx', 'utf8');

  assert.match(sidebarSource, /'agents:account'/);
  assert.match(sidebarSource, /'agents:permissions'/);
  assert.match(sidebarSource, /'agents:mcp'/);
  assert.match(sidebarSource, /'agents:plugins'/);
  assert.match(sidebarSource, /'agents:skills'/);
  assert.match(sidebarSource, /'agents:commands'/);
  assert.match(sidebarSource, /'agents:hooks'/);
  assert.match(sidebarSource, /'appearance'/);
  assert.match(sidebarSource, /'git'/);

  assert.doesNotMatch(pageSource, /AgentCategoryTabsSection/);
  assert.match(settingsSource, /activeTab\.startsWith\('agents:'\)/);
  assert.match(settingsSource, /initialCategory=\{activeTab\.slice\('agents:'\.length\)\}/);
  assert.match(pageSource, /selectedCategory === 'mcp'[\s\S]*McpManagementSection/);
  assert.match(pageSource, /selectedCategory === 'plugins'[\s\S]*PluginManagementSection/);
  assert.match(pageSource, /selectedCategory === 'skills'[\s\S]*CapabilityManagementSection[\s\S]*type="skill"/);
  assert.match(pageSource, /selectedCategory === 'commands'[\s\S]*CapabilityManagementSection[\s\S]*type="command"/);
  assert.match(pageSource, /selectedCategory === 'hooks'[\s\S]*HooksEntrySection/);
});

test('runtime settings section uses runtime config api without echoing secret values', async () => {
  const source = await readFile('src/components/settings/view/tabs/agents-settings/sections/content/ClaudeRuntimeSettingsSection.tsx', 'utf8');

  assert.match(source, /\/api\/claude-config\/runtime/);
  assert.match(source, /ANTHROPIC_MODEL/);
  assert.match(source, /ANTHROPIC_AUTH_TOKEN/);
  assert.match(source, /value=\{secrets\[key\]/);
});

test('mcp management section exposes validate create update and delete actions', async () => {
  const source = await readFile('src/components/settings/view/tabs/agents-settings/sections/content/McpManagementSection.tsx', 'utf8');

  assert.match(source, /\/api\/mcp\/config\/validate/);
  assert.match(source, /\/api\/mcp\/config/);
  assert.match(source, /method:\s*'POST'/);
  assert.match(source, /'PATCH'/);
  assert.match(source, /method:\s*'DELETE'/);
});

test('plugin management section exposes import toggle delete and reload actions', async () => {
  const source = await readFile('src/components/settings/view/tabs/agents-settings/sections/content/PluginManagementSection.tsx', 'utf8');

  assert.match(source, /\/api\/plugins\/import-directory/);
  assert.match(source, /\/api\/plugins\/reload/);
  assert.match(source, /\/api\/plugins\/\$\{encodeURIComponent\(plugin\.id\)\}/);
  assert.match(source, /method:\s*'PATCH'/);
  assert.match(source, /method:\s*'DELETE'/);
});

test('capability and hooks sections call their phase2 APIs', async () => {
  const capabilitySource = await readFile('src/components/settings/view/tabs/agents-settings/sections/content/CapabilityManagementSection.tsx', 'utf8');
  const hooksSource = await readFile('src/components/settings/view/tabs/agents-settings/sections/content/HooksEntrySection.tsx', 'utf8');

  assert.match(capabilitySource, /\/api\/capabilities/);
  assert.match(capabilitySource, /loadCapabilityDetail/);
  assert.match(capabilitySource, /能力列表/);
  assert.match(capabilitySource, /编辑区/);
  assert.match(capabilitySource, /Markdown 原文/);
  assert.match(capabilitySource, /previewContent/);
  assert.match(capabilitySource, /xl:grid-cols-\[minmax\(18rem,0\.42fr\)_minmax\(0,1fr\)\]/);
  assert.match(capabilitySource, /'POST'/);
  assert.match(capabilitySource, /'PATCH'/);
  assert.match(capabilitySource, /method:\s*'DELETE'/);
  assert.match(hooksSource, /\/api\/hooks\/overview/);
});

test('settings dialog uses a near fullscreen layout', async () => {
  const settingsSource = await readFile('src/components/settings/view/Settings.tsx', 'utf8');

  assert.match(settingsSource, /md:h-\[94vh\]/);
  assert.match(settingsSource, /md:w-\[96vw\]/);
  assert.match(settingsSource, /md:max-w-none/);
});
