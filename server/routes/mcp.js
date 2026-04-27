import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { spawn } from 'child_process';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toServerRecord(name, config, scope, options = {}) {
  const server = {
    id: scope === 'project' ? `project:${name}` : scope === 'local' ? `local:${name}` : name,
    name,
    type: 'stdio',
    scope,
    config: {},
    raw: config,
    ...(options.projectPath ? { projectPath: options.projectPath } : {}),
    ...(options.sourcePath ? { sourcePath: options.sourcePath } : {}),
  };

  if (config?.command) {
    server.type = 'stdio';
    server.config.command = config.command;
    server.config.args = Array.isArray(config.args) ? config.args : [];
    server.config.env = isObject(config.env) ? config.env : {};
  } else if (config?.url) {
    server.type = config.transport || config.type || 'http';
    server.config.url = config.url;
    server.config.headers = isObject(config.headers) ? config.headers : {};
  }

  return server;
}

export async function readJsonFileIfExists(filepath, fileSystem = fs) {
  try {
    const fileContent = await fileSystem.readFile(filepath, 'utf8');
    return JSON.parse(fileContent);
  } catch {
    return null;
  }
}

export async function collectConfiguredMcpServers({
  homeDir = os.homedir(),
  projectPath = null,
  fileSystem = fs,
} = {}) {
  const configPaths = [
    path.join(homeDir, '.claude.json'),
    path.join(homeDir, '.claude', 'settings.json'),
  ];

  let configData = null;
  let configPath = null;

  for (const filepath of configPaths) {
    const parsed = await readJsonFileIfExists(filepath, fileSystem);
    if (parsed) {
      configData = parsed;
      configPath = filepath;
      console.log(`✅ Found Claude config at: ${filepath}`);
      break;
    }
    console.log(`ℹ️ Config not found or invalid at: ${filepath}`);
  }

  const servers = [];

  if (isObject(configData?.mcpServers)) {
    const names = Object.keys(configData.mcpServers);
    if (names.length > 0) {
      console.log('🔍 Found user-scoped MCP servers:', names);
      for (const [name, config] of Object.entries(configData.mcpServers)) {
        servers.push(toServerRecord(name, config, 'user', { sourcePath: configPath }));
      }
    }
  }

  const normalizedProjectPath = typeof projectPath === 'string' && projectPath.trim()
    ? projectPath.trim()
    : null;

  if (normalizedProjectPath && isObject(configData?.projects?.[normalizedProjectPath]?.mcpServers)) {
    const projectConfig = configData.projects[normalizedProjectPath];
    const names = Object.keys(projectConfig.mcpServers);
    if (names.length > 0) {
      console.log(`🔍 Found local-scoped MCP servers for ${normalizedProjectPath}:`, names);
      for (const [name, config] of Object.entries(projectConfig.mcpServers)) {
        servers.push(toServerRecord(name, config, 'local', {
          projectPath: normalizedProjectPath,
          sourcePath: configPath,
        }));
      }
    }
  }

  let projectConfigPath = null;
  let hasProjectConfig = false;
  if (normalizedProjectPath) {
    projectConfigPath = path.join(normalizedProjectPath, '.mcp.json');
    const projectConfigData = await readJsonFileIfExists(projectConfigPath, fileSystem);
    if (isObject(projectConfigData?.mcpServers)) {
      hasProjectConfig = true;
      const names = Object.keys(projectConfigData.mcpServers);
      if (names.length > 0) {
        console.log(`🔍 Found project-scoped MCP servers in ${projectConfigPath}:`, names);
        for (const [name, config] of Object.entries(projectConfigData.mcpServers)) {
          servers.push(toServerRecord(name, config, 'project', {
            projectPath: normalizedProjectPath,
            sourcePath: projectConfigPath,
          }));
        }
      }
    }
  }

  return {
    hasClaudeConfig: Boolean(configData),
    hasProjectConfig,
    configPath,
    projectConfigPath,
    projectPath: normalizedProjectPath,
    servers,
  };
}

// Claude CLI command routes

// GET /api/mcp/cli/list - List MCP servers using Claude CLI
router.get('/cli/list', async (req, res) => {
  try {
    console.log('📋 Listing MCP servers using Claude CLI');
    
    const { spawn } = await import('child_process');
    const { promisify } = await import('util');
    const exec = promisify(spawn);
    
    const process = spawn('claude', ['mcp', 'list'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        res.json({ success: true, output: stdout, servers: parseClaudeListOutput(stdout) });
      } else {
        console.error('Claude CLI error:', stderr);
        res.status(500).json({ error: 'Claude CLI command failed', details: stderr });
      }
    });
    
    process.on('error', (error) => {
      console.error('Error running Claude CLI:', error);
      res.status(500).json({ error: 'Failed to run Claude CLI', details: error.message });
    });
  } catch (error) {
    console.error('Error listing MCP servers via CLI:', error);
    res.status(500).json({ error: 'Failed to list MCP servers', details: error.message });
  }
});

// POST /api/mcp/cli/add - Add MCP server using Claude CLI
router.post('/cli/add', async (req, res) => {
  try {
    const { name, type = 'stdio', command, args = [], url, headers = {}, env = {}, scope = 'user', projectPath } = req.body;
    
    console.log(`➕ Adding MCP server using Claude CLI (${scope} scope):`, name);
    
    const { spawn } = await import('child_process');
    
    let cliArgs = ['mcp', 'add'];
    
    // Add scope flag
    cliArgs.push('--scope', scope);
    
    if (type === 'http') {
      cliArgs.push('--transport', 'http', name, url);
      // Add headers if provided
      Object.entries(headers).forEach(([key, value]) => {
        cliArgs.push('--header', `${key}: ${value}`);
      });
    } else if (type === 'sse') {
      cliArgs.push('--transport', 'sse', name, url);
      // Add headers if provided
      Object.entries(headers).forEach(([key, value]) => {
        cliArgs.push('--header', `${key}: ${value}`);
      });
    } else {
      // stdio (default): claude mcp add --scope user <name> <command> [args...]
      cliArgs.push(name);
      // Add environment variables
      Object.entries(env).forEach(([key, value]) => {
        cliArgs.push('-e', `${key}=${value}`);
      });
      cliArgs.push(command);
      if (args && args.length > 0) {
        cliArgs.push(...args);
      }
    }
    
    console.log('🔧 Running Claude CLI command:', 'claude', cliArgs.join(' '));
    
    // For local scope, we need to run the command in the project directory
    const spawnOptions = {
      stdio: ['pipe', 'pipe', 'pipe']
    };
    
    if (scope === 'local' && projectPath) {
      spawnOptions.cwd = projectPath;
      console.log('📁 Running in project directory:', projectPath);
    }
    
    const process = spawn('claude', cliArgs, spawnOptions);
    
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        res.json({ success: true, output: stdout, message: `MCP server "${name}" added successfully` });
      } else {
        console.error('Claude CLI error:', stderr);
        res.status(400).json({ error: 'Claude CLI command failed', details: stderr });
      }
    });
    
    process.on('error', (error) => {
      console.error('Error running Claude CLI:', error);
      res.status(500).json({ error: 'Failed to run Claude CLI', details: error.message });
    });
  } catch (error) {
    console.error('Error adding MCP server via CLI:', error);
    res.status(500).json({ error: 'Failed to add MCP server', details: error.message });
  }
});

// POST /api/mcp/cli/add-json - Add MCP server using JSON format
router.post('/cli/add-json', async (req, res) => {
  try {
    const { name, jsonConfig, scope = 'user', projectPath } = req.body;
    
    console.log('➕ Adding MCP server using JSON format:', name);
    
    // Validate and parse JSON config
    let parsedConfig;
    try {
      parsedConfig = typeof jsonConfig === 'string' ? JSON.parse(jsonConfig) : jsonConfig;
    } catch (parseError) {
      return res.status(400).json({ 
        error: 'Invalid JSON configuration', 
        details: parseError.message 
      });
    }
    
    // Validate required fields
    if (!parsedConfig.type) {
      return res.status(400).json({ 
        error: 'Invalid configuration', 
        details: 'Missing required field: type' 
      });
    }
    
    if (parsedConfig.type === 'stdio' && !parsedConfig.command) {
      return res.status(400).json({ 
        error: 'Invalid configuration', 
        details: 'stdio type requires a command field' 
      });
    }
    
    if ((parsedConfig.type === 'http' || parsedConfig.type === 'sse') && !parsedConfig.url) {
      return res.status(400).json({ 
        error: 'Invalid configuration', 
        details: `${parsedConfig.type} type requires a url field` 
      });
    }
    
    const { spawn } = await import('child_process');
    
    // Build the command: claude mcp add-json --scope <scope> <name> '<json>'
    const cliArgs = ['mcp', 'add-json', '--scope', scope, name];
    
    // Add the JSON config as a properly formatted string
    const jsonString = JSON.stringify(parsedConfig);
    cliArgs.push(jsonString);
    
    console.log('🔧 Running Claude CLI command:', 'claude', cliArgs[0], cliArgs[1], cliArgs[2], cliArgs[3], cliArgs[4], jsonString);
    
    // For local scope, we need to run the command in the project directory
    const spawnOptions = {
      stdio: ['pipe', 'pipe', 'pipe']
    };
    
    if (scope === 'local' && projectPath) {
      spawnOptions.cwd = projectPath;
      console.log('📁 Running in project directory:', projectPath);
    }
    
    const process = spawn('claude', cliArgs, spawnOptions);
    
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        res.json({ success: true, output: stdout, message: `MCP server "${name}" added successfully via JSON` });
      } else {
        console.error('Claude CLI error:', stderr);
        res.status(400).json({ error: 'Claude CLI command failed', details: stderr });
      }
    });
    
    process.on('error', (error) => {
      console.error('Error running Claude CLI:', error);
      res.status(500).json({ error: 'Failed to run Claude CLI', details: error.message });
    });
  } catch (error) {
    console.error('Error adding MCP server via JSON:', error);
    res.status(500).json({ error: 'Failed to add MCP server', details: error.message });
  }
});

// DELETE /api/mcp/cli/remove/:name - Remove MCP server using Claude CLI
router.delete('/cli/remove/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { scope } = req.query; // Get scope from query params
    
    // Handle the ID format (remove scope prefix if present)
    let actualName = name;
    let actualScope = scope;
    
    // If the name includes a scope prefix like "local:test", extract it
    if (name.includes(':')) {
      const [prefix, serverName] = name.split(':');
      actualName = serverName;
      actualScope = actualScope || prefix; // Use prefix as scope if not provided in query
    }
    
    console.log('🗑️ Removing MCP server using Claude CLI:', actualName, 'scope:', actualScope);
    
    const { spawn } = await import('child_process');
    
    // Build command args based on scope
    let cliArgs = ['mcp', 'remove'];
    
    // Add scope flag if it's local scope
    if (actualScope === 'local') {
      cliArgs.push('--scope', 'local');
    } else if (actualScope === 'user' || !actualScope) {
      // User scope is default, but we can be explicit
      cliArgs.push('--scope', 'user');
    }
    
    cliArgs.push(actualName);
    
    console.log('🔧 Running Claude CLI command:', 'claude', cliArgs.join(' '));
    
    const process = spawn('claude', cliArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        res.json({ success: true, output: stdout, message: `MCP server "${name}" removed successfully` });
      } else {
        console.error('Claude CLI error:', stderr);
        res.status(400).json({ error: 'Claude CLI command failed', details: stderr });
      }
    });
    
    process.on('error', (error) => {
      console.error('Error running Claude CLI:', error);
      res.status(500).json({ error: 'Failed to run Claude CLI', details: error.message });
    });
  } catch (error) {
    console.error('Error removing MCP server via CLI:', error);
    res.status(500).json({ error: 'Failed to remove MCP server', details: error.message });
  }
});

// GET /api/mcp/cli/get/:name - Get MCP server details using Claude CLI
router.get('/cli/get/:name', async (req, res) => {
  try {
    const { name } = req.params;
    
    console.log('📄 Getting MCP server details using Claude CLI:', name);
    
    const { spawn } = await import('child_process');
    
    const process = spawn('claude', ['mcp', 'get', name], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        res.json({ success: true, output: stdout, server: parseClaudeGetOutput(stdout) });
      } else {
        console.error('Claude CLI error:', stderr);
        res.status(404).json({ error: 'Claude CLI command failed', details: stderr });
      }
    });
    
    process.on('error', (error) => {
      console.error('Error running Claude CLI:', error);
      res.status(500).json({ error: 'Failed to run Claude CLI', details: error.message });
    });
  } catch (error) {
    console.error('Error getting MCP server details via CLI:', error);
    res.status(500).json({ error: 'Failed to get MCP server details', details: error.message });
  }
});

// GET /api/mcp/config/read - Read MCP servers directly from Claude config files
router.get('/config/read', async (req, res) => {
  try {
    console.log('📖 Reading MCP servers from Claude config files');

    const requestedProjectPath = typeof req.query?.projectPath === 'string' && req.query.projectPath.trim()
      ? req.query.projectPath.trim()
      : null;

    const result = await collectConfiguredMcpServers({
      homeDir: os.homedir(),
      projectPath: requestedProjectPath,
      fileSystem: fs,
    });

    if (!result.hasClaudeConfig && !result.hasProjectConfig && result.servers.length === 0) {
      return res.json({
        success: false,
        message: 'No Claude configuration file found',
        servers: [],
      });
    }

    console.log(`📋 Found ${result.servers.length} MCP servers in config`);

    res.json({
      success: true,
      configPath: result.configPath,
      projectConfigPath: result.projectConfigPath,
      projectPath: result.projectPath,
      servers: result.servers,
    });
  } catch (error) {
    console.error('Error reading Claude config:', error);
    res.status(500).json({ 
      error: 'Failed to read Claude configuration', 
      details: error.message 
    });
  }
});

// Helper functions to parse Claude CLI output
function parseClaudeListOutput(output) {
  const servers = [];
  const lines = output.split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    // Skip the header line
    if (line.includes('Checking MCP server health')) continue;
    
    // Parse lines like "test: test test - ✗ Failed to connect"
    // or "server-name: command or description - ✓ Connected"
    if (line.includes(':')) {
      const colonIndex = line.indexOf(':');
      const name = line.substring(0, colonIndex).trim();
      
      // Skip empty names
      if (!name) continue;
      
      // Extract the rest after the name
      const rest = line.substring(colonIndex + 1).trim();
      
      // Try to extract description and status
      let description = rest;
      let status = 'unknown';
      let type = 'stdio'; // default type
      
      // Check for status indicators
      if (rest.includes('✓') || rest.includes('✗')) {
        const statusMatch = rest.match(/(.*?)\s*-\s*([✓✗].*)$/);
        if (statusMatch) {
          description = statusMatch[1].trim();
          status = statusMatch[2].includes('✓') ? 'connected' : 'failed';
        }
      }
      
      // Try to determine type from description
      if (description.startsWith('http://') || description.startsWith('https://')) {
        type = 'http';
      }
      
      servers.push({
        name,
        type,
        status: status || 'active',
        description
      });
    }
  }
  
  console.log('🔍 Parsed Claude CLI servers:', servers);
  return servers;
}

function parseClaudeGetOutput(output) {
  // Parse the output from 'claude mcp get <name>' command
  // This is a simple parser - might need adjustment based on actual output format
  try {
    // Try to extract JSON if present
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    // Otherwise, parse as text
    const server = { raw_output: output };
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.includes('Name:')) {
        server.name = line.split(':')[1]?.trim();
      } else if (line.includes('Type:')) {
        server.type = line.split(':')[1]?.trim();
      } else if (line.includes('Command:')) {
        server.command = line.split(':')[1]?.trim();
      } else if (line.includes('URL:')) {
        server.url = line.split(':')[1]?.trim();
      }
    }
    
    return server;
  } catch (error) {
    return { raw_output: output, parse_error: error.message };
  }
}

export default router;
