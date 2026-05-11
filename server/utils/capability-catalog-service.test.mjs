import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';

import {
  createCapability,
  deleteCapability,
  listCapabilities,
  updateCapability,
} from './capability-catalog-service.js';

async function writeText(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

function encodeCapabilityId(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

test('listCapabilities scans user project and plugin skills', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'ccui-cap-home-'));
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'ccui-cap-project-'));
  const pluginPath = await mkdtemp(path.join(os.tmpdir(), 'ccui-cap-plugin-'));

  try {
    await writeText(
      path.join(homeDir, '.claude', 'skills', 'user-skill', 'SKILL.md'),
      '---\ndescription: User skill description\n---\n# User Skill\n',
    );
    await writeText(
      path.join(projectPath, '.claude', 'skills', 'project-skill', 'SKILL.md'),
      '# Project Skill\nProject body description\n',
    );
    await writeText(
      path.join(pluginPath, 'skills', 'plugin-skill', 'SKILL.md'),
      '# Plugin Skill\nPlugin body description\n',
    );

    const capabilities = await listCapabilities({
      type: 'skill',
      homeDir,
      projectPath,
      pluginPaths: [pluginPath],
    });

    assert.deepEqual(capabilities.map((capability) => capability.name), [
      'user-skill',
      'project-skill',
      'plugin-skill',
    ]);
    assert.deepEqual(capabilities.map((capability) => capability.source.kind), [
      'user',
      'project',
      'plugin',
    ]);
    assert.deepEqual(capabilities.map((capability) => capability.editable), [
      true,
      true,
      false,
    ]);
    assert.equal(capabilities[0].description, 'User skill description');
    assert.equal(capabilities[1].description, 'Project body description');
    assert.equal(capabilities[2].source.path, pluginPath);
    assert.deepEqual(capabilities[2].source, {
      kind: 'plugin',
      path: pluginPath,
      writable: false,
      reason: '插件来源为只读',
    });
    assert.equal(capabilities[0].enabled, true);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
    await rm(projectPath, { recursive: true, force: true });
    await rm(pluginPath, { recursive: true, force: true });
  }
});

test('listCapabilities tolerates malformed frontmatter in capability files', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'ccui-cap-home-'));

  try {
    await writeText(
      path.join(homeDir, '.claude', 'skills', 'bad-frontmatter', 'SKILL.md'),
      '---\ndescription: broken: yaml: value\n---\n# Bad\nFallback description\n',
    );

    const [capability] = await listCapabilities({ type: 'skill', homeDir });

    assert.equal(capability.name, 'bad-frontmatter');
    assert.equal(capability.description, 'Fallback description');
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('create update delete user command markdown files', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'ccui-cap-home-'));

  try {
    const created = await createCapability({
      type: 'command',
      scope: 'user',
      homeDir,
      name: 'Deploy: Today!',
      content: '# Deploy\nInitial body',
    });
    const commandPath = path.join(homeDir, '.claude', 'commands', 'Deploy-Today-.md');

    assert.equal(created.type, 'command');
    assert.equal(created.name, 'Deploy-Today-');
    assert.equal(created.path, commandPath);
    assert.equal(await readFile(commandPath, 'utf8'), '# Deploy\nInitial body\n');

    const updated = await updateCapability({
      id: created.id,
      homeDir,
      content: '# Deploy\nUpdated body',
    });

    assert.equal(updated.description, 'Updated body');
    assert.equal(await readFile(commandPath, 'utf8'), '# Deploy\nUpdated body\n');

    const deleted = await deleteCapability({ id: created.id, homeDir });
    assert.deepEqual(deleted, { deleted: true });

    await assert.rejects(() => stat(commandPath), { code: 'ENOENT' });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('plugin capability update and delete return 403', async () => {
  const pluginPath = await mkdtemp(path.join(os.tmpdir(), 'ccui-cap-plugin-'));

  try {
    await writeText(
      path.join(pluginPath, 'commands', 'readonly.md'),
      '# Readonly\nPlugin command\n',
    );
    const [capability] = await listCapabilities({
      type: 'command',
      pluginPaths: [pluginPath],
    });

    await assert.rejects(
      () => updateCapability({ id: capability.id, content: 'changed' }),
      { statusCode: 403 },
    );
    await assert.rejects(
      () => deleteCapability({ id: capability.id }),
      { statusCode: 403 },
    );
  } finally {
    await rm(pluginPath, { recursive: true, force: true });
  }
});

test('createCapability rejects dot path segment names', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'ccui-cap-home-'));

  try {
    await assert.rejects(
      () => createCapability({
        type: 'skill',
        scope: 'user',
        homeDir,
        name: '..',
        content: '# Unsafe\n',
      }),
      { statusCode: 400 },
    );
    await assert.rejects(() => stat(path.join(homeDir, '.claude', 'SKILL.md')), { code: 'ENOENT' });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('updateCapability rejects forged writable ids outside managed roots', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'ccui-cap-home-'));
  const pluginPath = await mkdtemp(path.join(os.tmpdir(), 'ccui-cap-plugin-'));
  const pluginCommandPath = path.join(pluginPath, 'commands', 'readonly.md');

  try {
    await writeText(pluginCommandPath, '# Readonly\nPlugin command\n');
    const forgedUserId = encodeCapabilityId({
      type: 'command',
      sourceKind: 'user',
      filepath: pluginCommandPath,
    });

    await assert.rejects(
      () => updateCapability({
        id: forgedUserId,
        homeDir,
        content: '# Changed\n',
      }),
      { statusCode: 403 },
    );
    assert.equal(await readFile(pluginCommandPath, 'utf8'), '# Readonly\nPlugin command\n');
  } finally {
    await rm(homeDir, { recursive: true, force: true });
    await rm(pluginPath, { recursive: true, force: true });
  }
});

test('deleteCapability rejects forged project ids outside the provided project root', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'ccui-cap-project-'));
  const otherPath = await mkdtemp(path.join(os.tmpdir(), 'ccui-cap-other-'));
  const otherCommandPath = path.join(otherPath, '.claude', 'commands', 'outside.md');

  try {
    await writeText(otherCommandPath, '# Outside\n');
    const forgedProjectId = encodeCapabilityId({
      type: 'command',
      sourceKind: 'project',
      filepath: otherCommandPath,
    });

    await assert.rejects(
      () => deleteCapability({
        id: forgedProjectId,
        projectPath,
      }),
      { statusCode: 403 },
    );
    assert.equal(await readFile(otherCommandPath, 'utf8'), '# Outside\n');
  } finally {
    await rm(projectPath, { recursive: true, force: true });
    await rm(otherPath, { recursive: true, force: true });
  }
});

test('project scope requires projectPath', async () => {
  await assert.rejects(
    () => createCapability({
      type: 'skill',
      scope: 'project',
      homeDir: os.tmpdir(),
      name: 'missing-project',
      content: '# Missing Project\n',
    }),
    { statusCode: 400 },
  );
});
