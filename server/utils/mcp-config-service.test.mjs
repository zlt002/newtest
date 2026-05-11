import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createMcpServerConfig,
  deleteMcpServerConfig,
  toManagedMcpServers,
  updateMcpServerConfig,
  validateMcpServerConfig,
} from './mcp-config-service.js';

function createMemoryFs(initialFiles = {}) {
  const files = { ...initialFiles };
  const mkdirCalls = [];
  return {
    files,
    mkdirCalls,
    async readFile(filepath, encoding) {
      assert.equal(encoding, 'utf8');
      if (!(filepath in files)) {
        const error = new Error(`ENOENT: ${filepath}`);
        error.code = 'ENOENT';
        throw error;
      }
      return files[filepath];
    },
    async mkdir(filepath, options) {
      mkdirCalls.push({ filepath, options });
    },
    async writeFile(filepath, content, encoding) {
      assert.equal(encoding, 'utf8');
      files[filepath] = content;
    },
  };
}

test('validateMcpServerConfig accepts stdio and http configs', () => {
  assert.deepEqual(
    validateMcpServerConfig({
      name: ' context7 ',
      config: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@upstash/context7-mcp'],
      },
    }),
    {
      name: 'context7',
      config: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@upstash/context7-mcp'],
      },
    },
  );

  assert.deepEqual(
    validateMcpServerConfig({
      name: 'remote',
      config: {
        type: 'http',
        url: 'https://example.com/mcp',
      },
    }),
    {
      name: 'remote',
      config: {
        type: 'http',
        url: 'https://example.com/mcp',
      },
    },
  );
});

test('validateMcpServerConfig rejects missing command or url', () => {
  assert.throws(
    () => validateMcpServerConfig({
      name: 'stdio-tool',
      config: { type: 'stdio' },
    }),
    /requires command/,
  );

  assert.throws(
    () => validateMcpServerConfig({
      name: 'http-tool',
      config: { type: 'http' },
    }),
    /requires url/,
  );
});

test('toManagedMcpServers marks duplicate names across scopes', () => {
  const servers = [
    {
      name: 'context7',
      scope: 'user',
      sourcePath: '/home/me/.claude.json',
      enabled: false,
    },
    {
      name: 'context7',
      scope: 'project',
      sourcePath: '/workspace/app/.mcp.json',
    },
    {
      name: 'unique',
      scope: 'local',
    },
  ];

  assert.deepEqual(toManagedMcpServers(servers), [
    {
      name: 'context7',
      scope: 'user',
      sourcePath: '/home/me/.claude.json',
      enabled: false,
      duplicateName: true,
      source: {
        kind: 'user',
        path: '/home/me/.claude.json',
        writable: true,
      },
    },
    {
      name: 'context7',
      scope: 'project',
      sourcePath: '/workspace/app/.mcp.json',
      enabled: true,
      duplicateName: true,
      source: {
        kind: 'project',
        path: '/workspace/app/.mcp.json',
        writable: true,
      },
    },
    {
      name: 'unique',
      scope: 'local',
      enabled: true,
      source: {
        kind: 'local',
        path: '',
        writable: false,
      },
    },
  ]);
});

test('createMcpServerConfig writes project .mcp.json mcpServers', async () => {
  const projectPath = '/workspace/app';
  const sourcePath = `${projectPath}/.mcp.json`;
  const fs = createMemoryFs();

  const result = await createMcpServerConfig({
    scope: 'project',
    projectPath,
    fileSystem: fs,
    name: 'context7',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp'],
    },
  });

  assert.equal(result.sourcePath, sourcePath);
  assert.deepEqual(result.data, {
    mcpServers: {
      context7: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@upstash/context7-mcp'],
      },
    },
  });
  assert.equal(
    fs.files[sourcePath],
    `${JSON.stringify(result.data, null, 2)}\n`,
  );
});

test('createMcpServerConfig writes local scope to .claude.json project mcpServers', async () => {
  const homeDir = '/home/me';
  const projectPath = '/workspace/app';
  const sourcePath = `${homeDir}/.claude.json`;
  const fs = createMemoryFs({
    [sourcePath]: JSON.stringify({
      env: { ANTHROPIC_MODEL: 'sonnet' },
      projects: {
        '/workspace/other': {
          allowedTools: ['Read'],
          mcpServers: {
            other: {
              command: 'node',
              args: ['other.js'],
            },
          },
        },
        [projectPath]: {
          allowedTools: ['Bash'],
          unknownField: true,
          mcpServers: {
            keep: {
              command: 'node',
              args: ['keep.js'],
            },
          },
        },
      },
      unknownRoot: 'preserve',
    }),
  });

  const result = await createMcpServerConfig({
    scope: 'local',
    homeDir,
    projectPath,
    fileSystem: fs,
    name: 'localtool',
    config: {
      type: 'stdio',
      command: 'node',
      args: ['server.js'],
    },
  });

  assert.equal(result.sourcePath, sourcePath);
  assert.deepEqual(result.data, {
    env: { ANTHROPIC_MODEL: 'sonnet' },
    projects: {
      '/workspace/other': {
        allowedTools: ['Read'],
        mcpServers: {
          other: {
            command: 'node',
            args: ['other.js'],
          },
        },
      },
      [projectPath]: {
        allowedTools: ['Bash'],
        unknownField: true,
        mcpServers: {
          keep: {
            command: 'node',
            args: ['keep.js'],
          },
          localtool: {
            type: 'stdio',
            command: 'node',
            args: ['server.js'],
          },
        },
      },
    },
    unknownRoot: 'preserve',
  });
  assert.equal(
    fs.files[sourcePath],
    `${JSON.stringify(result.data, null, 2)}\n`,
  );
});

test('updateMcpServerConfig only edits named server in sourcePath', async () => {
  const homeDir = '/home/me';
  const sourcePath = '/home/me/.claude/settings.json';
  const fs = createMemoryFs({
    [sourcePath]: JSON.stringify({
      permissions: { allow: ['Read(*)'] },
      mcpServers: {
        keep: {
          command: 'node',
          args: ['keep.js'],
        },
        edit: {
          command: 'old-command',
          args: ['old.js'],
        },
      },
    }),
  });

  const result = await updateMcpServerConfig({
    scope: 'user',
    homeDir,
    sourcePath,
    fileSystem: fs,
    name: 'edit',
    config: {
      type: 'http',
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer token' },
    },
  });

  assert.deepEqual(result.data, {
    permissions: { allow: ['Read(*)'] },
    mcpServers: {
      keep: {
        command: 'node',
        args: ['keep.js'],
      },
      edit: {
        type: 'http',
        url: 'https://example.com/mcp',
        headers: { Authorization: 'Bearer token' },
      },
    },
  });
});

test('updateMcpServerConfig updates local scope project mcpServers only', async () => {
  const homeDir = '/home/me';
  const projectPath = '/workspace/app';
  const sourcePath = `${homeDir}/.claude.json`;
  const fs = createMemoryFs({
    [sourcePath]: JSON.stringify({
      mcpServers: {
        legacyKeep: {
          command: 'node',
          args: ['legacy.js'],
        },
      },
      projects: {
        [projectPath]: {
          env: { PROJECT_ENV: '1' },
          mcpServers: {
            keep: {
              command: 'node',
              args: ['keep.js'],
            },
            edit: {
              command: 'old-command',
              args: ['old.js'],
            },
          },
        },
      },
    }),
  });

  const result = await updateMcpServerConfig({
    scope: 'local',
    homeDir,
    projectPath,
    sourcePath,
    fileSystem: fs,
    name: 'edit',
    config: {
      type: 'http',
      url: 'https://example.com/mcp',
    },
  });

  assert.deepEqual(result.data, {
    mcpServers: {
      legacyKeep: {
        command: 'node',
        args: ['legacy.js'],
      },
    },
    projects: {
      [projectPath]: {
        env: { PROJECT_ENV: '1' },
        mcpServers: {
          keep: {
            command: 'node',
            args: ['keep.js'],
          },
          edit: {
            type: 'http',
            url: 'https://example.com/mcp',
          },
        },
      },
    },
  });
});

test('deleteMcpServerConfig only deletes named server and preserves env and other servers', async () => {
  const homeDir = '/home/me';
  const sourcePath = '/home/me/.claude/settings.json';
  const fs = createMemoryFs({
    [sourcePath]: JSON.stringify({
      env: { ANTHROPIC_MODEL: 'sonnet' },
      mcpServers: {
        remove: {
          command: 'node',
          args: ['remove.js'],
        },
        keep: {
          url: 'https://example.com/sse',
          type: 'sse',
        },
      },
    }),
  });

  const result = await deleteMcpServerConfig({
    scope: 'user',
    homeDir,
    sourcePath,
    fileSystem: fs,
    name: 'remove',
  });

  assert.deepEqual(result.data, {
    env: { ANTHROPIC_MODEL: 'sonnet' },
    mcpServers: {
      keep: {
        url: 'https://example.com/sse',
        type: 'sse',
      },
    },
  });
});

test('deleteMcpServerConfig deletes local scope server and preserves project fields', async () => {
  const homeDir = '/home/me';
  const projectPath = '/workspace/app';
  const sourcePath = `${homeDir}/.claude.json`;
  const fs = createMemoryFs({
    [sourcePath]: JSON.stringify({
      env: { ANTHROPIC_MODEL: 'sonnet' },
      projects: {
        [projectPath]: {
          allowedTools: ['Read'],
          mcpServers: {
            remove: {
              command: 'node',
              args: ['remove.js'],
            },
            keep: {
              url: 'https://example.com/sse',
              type: 'sse',
            },
          },
        },
        '/workspace/other': {
          mcpServers: {
            other: {
              command: 'node',
              args: ['other.js'],
            },
          },
        },
      },
    }),
  });

  const result = await deleteMcpServerConfig({
    scope: 'local',
    homeDir,
    projectPath,
    sourcePath,
    fileSystem: fs,
    name: 'remove',
  });

  assert.deepEqual(result.data, {
    env: { ANTHROPIC_MODEL: 'sonnet' },
    projects: {
      [projectPath]: {
        allowedTools: ['Read'],
        mcpServers: {
          keep: {
            url: 'https://example.com/sse',
            type: 'sse',
          },
        },
      },
      '/workspace/other': {
        mcpServers: {
          other: {
            command: 'node',
            args: ['other.js'],
          },
        },
      },
    },
  });
});

test('updateMcpServerConfig rejects unmanaged sourcePath without writing files', async () => {
  const fs = createMemoryFs();

  await assert.rejects(
    () => updateMcpServerConfig({
      scope: 'user',
      homeDir: '/home/me',
      sourcePath: '/tmp/evil.json',
      fileSystem: fs,
      name: 'evil',
      config: {
        type: 'stdio',
        command: 'node',
      },
    }),
    /sourcePath is not a managed MCP config path/,
  );

  assert.equal(fs.files['/tmp/evil.json'], undefined);
});

test('deleteMcpServerConfig rejects unmanaged sourcePath without writing files', async () => {
  const fs = createMemoryFs();

  await assert.rejects(
    () => deleteMcpServerConfig({
      scope: 'user',
      homeDir: '/home/me',
      sourcePath: '/tmp/evil.json',
      fileSystem: fs,
      name: 'evil',
    }),
    /sourcePath is not a managed MCP config path/,
  );

  assert.equal(fs.files['/tmp/evil.json'], undefined);
});

test('updateMcpServerConfig rejects project scope sourcePath that does not match projectPath', async () => {
  const projectPath = '/workspace/app';
  const wrongSourcePath = '/workspace/other/.mcp.json';
  const fs = createMemoryFs({
    [wrongSourcePath]: JSON.stringify({ mcpServers: {} }),
  });

  await assert.rejects(
    () => updateMcpServerConfig({
      scope: 'project',
      projectPath,
      sourcePath: wrongSourcePath,
      fileSystem: fs,
      name: 'context7',
      config: {
        type: 'stdio',
        command: 'node',
      },
    }),
    /sourcePath is not a managed MCP config path for project scope/,
  );

  assert.equal(fs.files[wrongSourcePath], JSON.stringify({ mcpServers: {} }));
});

test('updateMcpServerConfig rejects projectPath outside allowed project paths', async () => {
  const allowedProjectPath = '/workspace/app';
  const requestedProjectPath = '/workspace/other';
  const sourcePath = `${requestedProjectPath}/.mcp.json`;
  const originalContent = JSON.stringify({
    mcpServers: {
      context7: {
        command: 'node',
      },
    },
  });
  const fs = createMemoryFs({
    [sourcePath]: originalContent,
  });

  await assert.rejects(
    () => updateMcpServerConfig({
      scope: 'project',
      projectPath: requestedProjectPath,
      allowedProjectPaths: [allowedProjectPath],
      sourcePath,
      fileSystem: fs,
      name: 'context7',
      config: {
        type: 'stdio',
        command: 'npx',
      },
    }),
    /projectPath is not a managed project path/,
  );

  assert.equal(fs.files[sourcePath], originalContent);
});

test('deleteMcpServerConfig rejects local scope without projectPath before writing', async () => {
  const homeDir = '/home/me';
  const sourcePath = `${homeDir}/.claude/settings.json`;
  const originalContent = JSON.stringify({
    projects: {
      '/workspace/app': {
        mcpServers: {
          remove: {
            command: 'node',
          },
        },
      },
    },
  });
  const fs = createMemoryFs({
    [sourcePath]: originalContent,
  });

  await assert.rejects(
    () => deleteMcpServerConfig({
      scope: 'local',
      homeDir,
      sourcePath,
      fileSystem: fs,
      name: 'remove',
    }),
    /projectPath is required for local scope/,
  );

  assert.equal(fs.files[sourcePath], originalContent);
});
