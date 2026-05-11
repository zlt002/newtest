import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import mcpRouter, { collectConfiguredMcpServers } from './mcp.js';

function createMockFs(files) {
  return {
    async readFile(filepath, encoding) {
      assert.equal(encoding, 'utf8');
      if (!(filepath in files)) {
        throw new Error(`ENOENT: ${filepath}`);
      }
      return files[filepath];
    },
  };
}

async function withMcpTestServer(fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/mcp', mcpRouter);
  const server = app.listen(0, '127.0.0.1');

  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('collectConfiguredMcpServers includes project .mcp.json entries even without user Claude config', async () => {
  const homeDir = '/tmp/home';
  const projectPath = '/workspace/html';
  const projectConfigPath = `${projectPath}/.mcp.json`;
  const mockFs = createMockFs({
    [projectConfigPath]: JSON.stringify({
      mcpServers: {
        context7: {
          command: 'npx',
          args: ['-y', '@upstash/context7-mcp'],
        },
      },
    }),
  });

  const result = await collectConfiguredMcpServers({
    homeDir,
    projectPath,
    fileSystem: mockFs,
  });

  assert.equal(result.hasClaudeConfig, false);
  assert.equal(result.projectConfigPath, projectConfigPath);
  assert.equal(result.servers.length, 1);
  assert.deepEqual(result.servers[0], {
    id: `project:context7:${projectConfigPath}`,
    name: 'context7',
    type: 'stdio',
    scope: 'project',
    projectPath,
    sourcePath: projectConfigPath,
    config: {
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp'],
      env: {},
    },
    raw: {
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp'],
    },
  });
});

test('collectConfiguredMcpServers merges user, local, and project-scoped MCP servers', async () => {
  const homeDir = '/tmp/home';
  const projectPath = '/workspace/html';
  const userConfigPath = `${homeDir}/.claude.json`;
  const projectConfigPath = `${projectPath}/.mcp.json`;
  const mockFs = createMockFs({
    [userConfigPath]: JSON.stringify({
      mcpServers: {
        zread: {
          url: 'https://example.com/mcp',
          transport: 'http',
        },
      },
      projects: {
        [projectPath]: {
          mcpServers: {
            localtool: {
              command: 'node',
              args: ['server.js'],
            },
          },
        },
      },
    }),
    [projectConfigPath]: JSON.stringify({
      mcpServers: {
        context7: {
          command: 'npx',
          args: ['-y', '@upstash/context7-mcp'],
        },
      },
    }),
  });

  const result = await collectConfiguredMcpServers({
    homeDir,
    projectPath,
    fileSystem: mockFs,
  });

  assert.equal(result.hasClaudeConfig, true);
  assert.equal(result.servers.length, 3);
  assert.deepEqual(
    result.servers.map((server) => ({ id: server.id, scope: server.scope, name: server.name })),
    [
      { id: `user:zread:${userConfigPath}`, scope: 'user', name: 'zread' },
      { id: `local:localtool:${userConfigPath}`, scope: 'local', name: 'localtool' },
      { id: `project:context7:${projectConfigPath}`, scope: 'project', name: 'context7' },
    ],
  );
});

test('collectConfiguredMcpServers merges user MCP servers from legacy and settings files', async () => {
  const homeDir = '/tmp/home';
  const projectPath = '/workspace/html';
  const legacyConfigPath = `${homeDir}/.claude.json`;
  const settingsConfigPath = `${homeDir}/.claude/settings.json`;
  const mockFs = createMockFs({
    [legacyConfigPath]: JSON.stringify({
      mcpServers: {
        shared: {
          command: 'node',
          args: ['legacy.js'],
        },
        legacyOnly: {
          command: 'node',
          args: ['legacy-only.js'],
        },
      },
    }),
    [settingsConfigPath]: JSON.stringify({
      mcpServers: {
        shared: {
          command: 'node',
          args: ['settings.js'],
        },
        settingsOnly: {
          command: 'node',
          args: ['settings-only.js'],
        },
      },
    }),
  });

  const result = await collectConfiguredMcpServers({
    homeDir,
    projectPath,
    fileSystem: mockFs,
  });

  assert.equal(result.hasClaudeConfig, true);
  assert.equal(result.configPath, legacyConfigPath);
  assert.deepEqual(
    result.servers.map((server) => ({
      id: server.id,
      name: server.name,
      scope: server.scope,
      sourcePath: server.sourcePath,
      command: server.config.command,
      args: server.config.args,
    })),
    [
      {
        id: `user:shared:${legacyConfigPath}`,
        name: 'shared',
        scope: 'user',
        sourcePath: legacyConfigPath,
        command: 'node',
        args: ['legacy.js'],
      },
      {
        id: `user:legacyOnly:${legacyConfigPath}`,
        name: 'legacyOnly',
        scope: 'user',
        sourcePath: legacyConfigPath,
        command: 'node',
        args: ['legacy-only.js'],
      },
      {
        id: `user:shared:${settingsConfigPath}`,
        name: 'shared',
        scope: 'user',
        sourcePath: settingsConfigPath,
        command: 'node',
        args: ['settings.js'],
      },
      {
        id: `user:settingsOnly:${settingsConfigPath}`,
        name: 'settingsOnly',
        scope: 'user',
        sourcePath: settingsConfigPath,
        command: 'node',
        args: ['settings-only.js'],
      },
    ],
  );
});

test('GET /config/read includes user MCP servers from both legacy and settings files', async () => {
  const originalHome = process.env.HOME;
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-home-'));
  const legacyConfigPath = path.join(homeDir, '.claude.json');
  const settingsConfigPath = path.join(homeDir, '.claude', 'settings.json');

  await fs.mkdir(path.dirname(settingsConfigPath), { recursive: true });
  await fs.writeFile(legacyConfigPath, JSON.stringify({
    mcpServers: {
      shared: {
        command: 'node',
        args: ['legacy.js'],
      },
    },
  }), 'utf8');
  await fs.writeFile(settingsConfigPath, JSON.stringify({
    mcpServers: {
      shared: {
        command: 'node',
        args: ['settings.js'],
      },
      settingsOnly: {
        command: 'node',
        args: ['settings-only.js'],
      },
    },
  }), 'utf8');

  process.env.HOME = homeDir;
  try {
    await withMcpTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/mcp/config/read`);
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.success, true);
      assert.deepEqual(
        body.servers.map((server) => ({
          id: server.id,
          name: server.name,
          scope: server.scope,
          sourcePath: server.sourcePath,
          duplicateName: server.duplicateName,
          command: server.config.command,
          args: server.config.args,
        })),
        [
          {
            id: `user:shared:${legacyConfigPath}`,
            name: 'shared',
            scope: 'user',
            sourcePath: legacyConfigPath,
            duplicateName: true,
            command: 'node',
            args: ['legacy.js'],
          },
          {
            id: `user:shared:${settingsConfigPath}`,
            name: 'shared',
            scope: 'user',
            sourcePath: settingsConfigPath,
            duplicateName: true,
            command: 'node',
            args: ['settings.js'],
          },
          {
            id: `user:settingsOnly:${settingsConfigPath}`,
            name: 'settingsOnly',
            scope: 'user',
            sourcePath: settingsConfigPath,
            duplicateName: undefined,
            command: 'node',
            args: ['settings-only.js'],
          },
        ],
      );
    });
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    await fs.rm(homeDir, { recursive: true, force: true });
  }
});

test('PATCH and DELETE /config/:name reject unmanaged sourcePath without writing files', async () => {
  const originalHome = process.env.HOME;
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-home-'));
  const evilPath = path.join(homeDir, 'tmp', 'evil.json');

  process.env.HOME = homeDir;
  try {
    await withMcpTestServer(async (baseUrl) => {
      const patchResponse = await fetch(`${baseUrl}/api/mcp/config/example`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          scope: 'user',
          sourcePath: evilPath,
          config: {
            type: 'stdio',
            command: 'node',
          },
        }),
      });
      const patchBody = await patchResponse.json();
      assert.equal(patchResponse.status, 400);
      assert.equal(patchBody.success, false);
      assert.equal(typeof patchBody.message, 'string');
      assert.equal(typeof patchBody.error, 'string');
      await assert.rejects(fs.access(evilPath));

      const deleteResponse = await fetch(`${baseUrl}/api/mcp/config/example`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          scope: 'user',
          sourcePath: evilPath,
        }),
      });
      const deleteBody = await deleteResponse.json();
      assert.equal(deleteResponse.status, 400);
      assert.equal(deleteBody.success, false);
      assert.equal(typeof deleteBody.message, 'string');
      assert.equal(typeof deleteBody.error, 'string');
      await assert.rejects(fs.access(evilPath));
    });
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    await fs.rm(homeDir, { recursive: true, force: true });
  }
});

test('PATCH /config/:name rejects projectPath outside server-managed projects', async () => {
  const originalHome = process.env.HOME;
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-home-'));
  const allowedProjectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-allowed-project-'));
  const unmanagedProjectPath = path.join(homeDir, 'unmanaged-project');
  const unmanagedSourcePath = path.join(unmanagedProjectPath, '.mcp.json');
  const projectConfigPath = path.join(homeDir, '.claude', 'project-config.json');

  await fs.mkdir(path.dirname(projectConfigPath), { recursive: true });
  await fs.writeFile(projectConfigPath, JSON.stringify({
    allowed: {
      manuallyAdded: true,
      originalPath: allowedProjectPath,
    },
  }), 'utf8');

  process.env.HOME = homeDir;
  try {
    await withMcpTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/mcp/config/context7`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          scope: 'project',
          projectPath: unmanagedProjectPath,
          sourcePath: unmanagedSourcePath,
          config: {
            type: 'stdio',
            command: 'node',
          },
        }),
      });
      const body = await response.json();
      assert.equal(response.status, 400);
      assert.equal(body.success, false);
      assert.match(body.message, /projectPath is not a managed project path/);
      await assert.rejects(fs.access(unmanagedSourcePath));
    });
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    await fs.rm(homeDir, { recursive: true, force: true });
    await fs.rm(allowedProjectPath, { recursive: true, force: true });
  }
});

test('config write routes include message in error responses', async () => {
  await withMcpTestServer(async (baseUrl) => {
    const postResponse = await fetch(`${baseUrl}/api/mcp/config`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        config: {
          type: 'stdio',
          command: 'node',
        },
      }),
    });
    const postBody = await postResponse.json();
    assert.equal(postResponse.status, 400);
    assert.equal(postBody.message, 'MCP server name is required');

    const patchResponse = await fetch(`${baseUrl}/api/mcp/config/example`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        config: {
          type: 'stdio',
          command: 'node',
        },
      }),
    });
    const patchBody = await patchResponse.json();
    assert.equal(patchResponse.status, 400);
    assert.equal(patchBody.message, 'sourcePath is required');

    const deleteResponse = await fetch(`${baseUrl}/api/mcp/config/example`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const deleteBody = await deleteResponse.json();
    assert.equal(deleteResponse.status, 400);
    assert.equal(deleteBody.message, 'sourcePath is required');
  });
});

test('POST /config/validate returns success true and normalized server', async () => {
  await withMcpTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/mcp/config/validate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: ' remote ',
        config: {
          type: 'http',
          url: 'https://example.com/mcp',
        },
      }),
    });

    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      success: true,
      server: {
        name: 'remote',
        config: {
          type: 'http',
          url: 'https://example.com/mcp',
        },
      },
    });
  });
});
