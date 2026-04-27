import test from 'node:test';
import assert from 'node:assert/strict';

import { collectConfiguredMcpServers } from './mcp.js';

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
    id: 'project:context7',
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
      { id: 'zread', scope: 'user', name: 'zread' },
      { id: 'local:localtool', scope: 'local', name: 'localtool' },
      { id: 'project:context7', scope: 'project', name: 'context7' },
    ],
  );
});
