import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';

import { loadClaudePluginsSync } from './claude-plugin-config.js';

test('loadClaudePluginsSync resolves enabled user plugins to SDK local plugin paths', async () => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), 'claude-plugin-config-'));
  const claudeDir = path.join(tempHome, '.claude');
  const pluginsDir = path.join(claudeDir, 'plugins');

  await mkdir(pluginsDir, { recursive: true });
  await writeFile(
    path.join(claudeDir, 'settings.json'),
    JSON.stringify({ enabledPlugins: { 'superpowers@claude-plugins-official': true } }),
  );
  await writeFile(
    path.join(pluginsDir, 'installed_plugins.json'),
    JSON.stringify({
      version: 2,
      plugins: {
        'superpowers@claude-plugins-official': [
          { scope: 'user', installPath: '/tmp/plugins/superpowers/5.0.7' },
        ],
      },
    }),
  );

  try {
    assert.deepEqual(loadClaudePluginsSync({ homeDir: tempHome }), [
      { type: 'local', path: '/tmp/plugins/superpowers/5.0.7' },
    ]);
  } finally {
    await rm(tempHome, { recursive: true, force: true });
  }
});

test('loadClaudePluginsSync prefers matching project installs over user installs', async () => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), 'claude-plugin-config-'));
  const tempProject = await mkdtemp(path.join(os.tmpdir(), 'claude-plugin-project-'));
  const claudeDir = path.join(tempHome, '.claude');
  const pluginsDir = path.join(claudeDir, 'plugins');

  await mkdir(pluginsDir, { recursive: true });
  await writeFile(
    path.join(claudeDir, 'settings.json'),
    JSON.stringify({ enabledPlugins: { 'superpowers@claude-plugins-official': true } }),
  );
  await writeFile(
    path.join(pluginsDir, 'installed_plugins.json'),
    JSON.stringify({
      version: 2,
      plugins: {
        'superpowers@claude-plugins-official': [
          { scope: 'project', projectPath: tempProject, installPath: '/tmp/plugins/superpowers/project' },
          { scope: 'user', installPath: '/tmp/plugins/superpowers/user' },
        ],
      },
    }),
  );

  try {
    assert.deepEqual(loadClaudePluginsSync({ homeDir: tempHome, projectPath: tempProject }), [
      { type: 'local', path: '/tmp/plugins/superpowers/project' },
    ]);
  } finally {
    await rm(tempHome, { recursive: true, force: true });
    await rm(tempProject, { recursive: true, force: true });
  }
});

test('loadClaudePluginsSync honors project-local enabledPlugins overrides', async () => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), 'claude-plugin-config-'));
  const tempProject = await mkdtemp(path.join(os.tmpdir(), 'claude-plugin-project-'));
  const claudeDir = path.join(tempHome, '.claude');
  const projectClaudeDir = path.join(tempProject, '.claude');
  const pluginsDir = path.join(claudeDir, 'plugins');

  await mkdir(pluginsDir, { recursive: true });
  await mkdir(projectClaudeDir, { recursive: true });
  await writeFile(
    path.join(claudeDir, 'settings.json'),
    JSON.stringify({
      enabledPlugins: {
        'superpowers@claude-plugins-official': false,
        'understand-anything@understand-anything': true,
      },
    }),
  );
  await writeFile(
    path.join(projectClaudeDir, 'settings.local.json'),
    JSON.stringify({
      enabledPlugins: {
        'superpowers@claude-plugins-official': true,
        'understand-anything@understand-anything': false,
      },
    }),
  );
  await writeFile(
    path.join(pluginsDir, 'installed_plugins.json'),
    JSON.stringify({
      version: 2,
      plugins: {
        'superpowers@claude-plugins-official': [
          { scope: 'user', installPath: '/tmp/plugins/superpowers/user' },
        ],
        'understand-anything@understand-anything': [
          { scope: 'user', installPath: '/tmp/plugins/understand-anything/user' },
        ],
      },
    }),
  );

  try {
    assert.deepEqual(loadClaudePluginsSync({ homeDir: tempHome, projectPath: tempProject }), [
      { type: 'local', path: '/tmp/plugins/superpowers/user' },
    ]);
  } finally {
    await rm(tempHome, { recursive: true, force: true });
    await rm(tempProject, { recursive: true, force: true });
  }
});
