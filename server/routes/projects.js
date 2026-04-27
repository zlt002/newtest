import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import os from 'os';
import { addProjectManually, getProjects, renameProject, deleteProject } from '../projects.js';

const router = express.Router();

export function getOpenDirectoryCommand(targetPath, platform = process.platform) {
  if (platform === 'darwin') {
    return { command: 'open', args: [targetPath] };
  }

  if (platform === 'win32') {
    return { command: 'explorer.exe', args: [targetPath] };
  }

  if (platform === 'linux') {
    return { command: 'xdg-open', args: [targetPath] };
  }

  throw new Error(`Unsupported platform: ${platform}`);
}

export function resolveOpenFileTreeTargetPath(projectRoot, { path: itemPath, type }) {
  if (!itemPath || (type !== 'file' && type !== 'directory')) {
    const error = new Error('Invalid file tree item');
    error.statusCode = 400;
    throw error;
  }

  const resolvedProjectRoot = path.resolve(projectRoot);
  const resolvedItemPath = path.resolve(projectRoot, itemPath);
  const normalizedRoot = `${resolvedProjectRoot}${path.sep}`;

  if (resolvedItemPath !== resolvedProjectRoot && !resolvedItemPath.startsWith(normalizedRoot)) {
    const error = new Error('Path must be under project root');
    error.statusCode = 403;
    throw error;
  }

  return type === 'file' ? path.dirname(resolvedItemPath) : resolvedItemPath;
}

function sanitizeGitError(message, token) {
  if (!message || !token) return message;
  return message.replace(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '***');
}

// Configure allowed workspace root (defaults to user's home directory)
export const WORKSPACES_ROOT = process.env.WORKSPACES_ROOT || os.homedir();

// System-critical paths that should never be used as workspace directories
export const FORBIDDEN_PATHS = [
  // Unix
  '/',
  '/etc',
  '/bin',
  '/sbin',
  '/usr',
  '/dev',
  '/proc',
  '/sys',
  '/var',
  '/boot',
  '/root',
  '/lib',
  '/lib64',
  '/opt',
  '/tmp',
  '/run',
  // Windows
  'C:\\Windows',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
  'C:\\ProgramData',
  'C:\\System Volume Information',
  'C:\\$Recycle.Bin'
];

/**
 * Validates that a path is safe for workspace operations
 * @param {string} requestedPath - The path to validate
 * @returns {Promise<{valid: boolean, resolvedPath?: string, error?: string}>}
 */
export async function validateWorkspacePath(requestedPath) {
  try {
    // Resolve to absolute path
    let absolutePath = path.resolve(requestedPath);

    // Check if path is a forbidden system directory
    const normalizedPath = path.normalize(absolutePath);
    if (FORBIDDEN_PATHS.includes(normalizedPath) || normalizedPath === '/') {
      return {
        valid: false,
        error: 'Cannot use system-critical directories as workspace locations'
      };
    }

    // Additional check for paths starting with forbidden directories
    for (const forbidden of FORBIDDEN_PATHS) {
      if (normalizedPath === forbidden ||
          normalizedPath.startsWith(forbidden + path.sep)) {
        // Exception: /var/tmp and similar user-accessible paths might be allowed
        // but /var itself and most /var subdirectories should be blocked
        if (forbidden === '/var' &&
            (normalizedPath.startsWith('/var/tmp') ||
             normalizedPath.startsWith('/var/folders'))) {
          continue; // Allow these specific cases
        }

        return {
          valid: false,
          error: `Cannot create workspace in system directory: ${forbidden}`
        };
      }
    }

    // Try to resolve the real path (following symlinks)
    let realPath;
    try {
      // Check if path exists to resolve real path
      await fs.access(absolutePath);
      realPath = await fs.realpath(absolutePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Path doesn't exist yet - check parent directory
        let parentPath = path.dirname(absolutePath);
        try {
          const parentRealPath = await fs.realpath(parentPath);

          // Reconstruct the full path with real parent
          realPath = path.join(parentRealPath, path.basename(absolutePath));
        } catch (parentError) {
          if (parentError.code === 'ENOENT') {
            // Parent doesn't exist either - use the absolute path as-is
            // We'll validate it's within allowed root
            realPath = absolutePath;
          } else {
            throw parentError;
          }
        }
      } else {
        throw error;
      }
    }

    // Resolve the workspace root to its real path
    const resolvedWorkspaceRoot = await fs.realpath(WORKSPACES_ROOT);

    // Ensure the resolved path is contained within the allowed workspace root
    if (!realPath.startsWith(resolvedWorkspaceRoot + path.sep) &&
        realPath !== resolvedWorkspaceRoot) {
      return {
        valid: false,
        error: `Workspace path must be within the allowed workspace root: ${WORKSPACES_ROOT}`
      };
    }

    // Additional symlink check for existing paths
    try {
      await fs.access(absolutePath);
      const stats = await fs.lstat(absolutePath);

      if (stats.isSymbolicLink()) {
        // Verify symlink target is also within allowed root
        const linkTarget = await fs.readlink(absolutePath);
        const resolvedTarget = path.resolve(path.dirname(absolutePath), linkTarget);
        const realTarget = await fs.realpath(resolvedTarget);

        if (!realTarget.startsWith(resolvedWorkspaceRoot + path.sep) &&
            realTarget !== resolvedWorkspaceRoot) {
          return {
            valid: false,
            error: 'Symlink target is outside the allowed workspace root'
          };
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // Path doesn't exist - that's fine for new workspace creation
    }

    return {
      valid: true,
      resolvedPath: realPath
    };

  } catch (error) {
    return {
      valid: false,
      error: `Path validation failed: ${error.message}`
    };
  }
}

export async function detectWorkspaceTypeForPath(resolvedPath) {
  try {
    const stats = await fs.stat(resolvedPath);
    if (!stats.isDirectory()) {
      throw new Error('Path exists but is not a directory');
    }

    const entries = await fs.readdir(resolvedPath);
    return entries.length === 0 ? 'new' : 'existing';
  } catch (error) {
    if (error.code === 'ENOENT') {
      return 'new';
    }

    throw error;
  }
}

export function resolveProjectPreviewFilePath(projectRoot, requestedPath) {
  const absoluteProjectRoot = path.resolve(projectRoot);
  const resolvedPreviewPath = path.resolve(absoluteProjectRoot, `.${path.sep}${requestedPath}`);
  const relativeToProject = path.relative(absoluteProjectRoot, resolvedPreviewPath);

  if (
    relativeToProject === '' ||
    relativeToProject === '.' ||
    relativeToProject.startsWith('..') ||
    path.isAbsolute(relativeToProject)
  ) {
    return null;
  }

  return resolvedPreviewPath;
}

/**
 * Create a new workspace
 * POST /api/projects/create-workspace
 *
 * Body:
 * - workspaceType: 'existing' | 'new'
 * - path: string (workspace path)
 * - githubUrl?: string (optional, for new workspaces)
 * - githubTokenId?: number (optional, ID of stored token)
 * - newGithubToken?: string (optional, one-time token)
 */
router.post('/create-workspace', async (req, res) => {
  try {
    const { workspaceType, path: workspacePath, githubUrl, githubTokenId, newGithubToken } = req.body;

    // Validate required fields
    if (!workspacePath) {
      return res.status(400).json({ error: 'path is required' });
    }

    if (workspaceType && !['existing', 'new'].includes(workspaceType)) {
      return res.status(400).json({ error: 'workspaceType must be "existing" or "new"' });
    }

    // Validate path safety before any operations
    const validation = await validateWorkspacePath(workspacePath);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid workspace path',
        details: validation.error
      });
    }

    const absolutePath = validation.resolvedPath;
    const effectiveWorkspaceType = workspaceType || await detectWorkspaceTypeForPath(absolutePath);

    // Handle existing workspace
    if (effectiveWorkspaceType === 'existing') {
      // Check if the path exists
      try {
        await fs.access(absolutePath);
        const stats = await fs.stat(absolutePath);

        if (!stats.isDirectory()) {
          return res.status(400).json({ error: 'Path exists but is not a directory' });
        }
      } catch (error) {
        if (error.code === 'ENOENT') {
          return res.status(404).json({ error: 'Workspace path does not exist' });
        }
        throw error;
      }

      // Add the existing workspace to the project list
      const project = await addProjectManually(absolutePath);

      return res.json({
        success: true,
        project,
        message: 'Existing workspace added successfully'
      });
    }

    // Handle new workspace creation
    if (effectiveWorkspaceType === 'new') {
      // Create the directory if it doesn't exist
      await fs.mkdir(absolutePath, { recursive: true });

      // If GitHub URL is provided, clone the repository
      if (githubUrl) {
        let githubToken = null;

        // Get GitHub token if needed
        if (githubTokenId) {
          // Fetch token from database
          const token = await getGithubTokenById(githubTokenId, req.user.id);
          if (!token) {
            // Clean up created directory
            await fs.rm(absolutePath, { recursive: true, force: true });
            return res.status(404).json({ error: 'GitHub token not found' });
          }
          githubToken = token.github_token;
        } else if (newGithubToken) {
          githubToken = newGithubToken;
        }

        // Extract repo name from URL for the clone destination
        const normalizedUrl = githubUrl.replace(/\/+$/, '').replace(/\.git$/, '');
        const repoName = normalizedUrl.split('/').pop() || 'repository';
        const clonePath = path.join(absolutePath, repoName);

        // Check if clone destination already exists to prevent data loss
        try {
          await fs.access(clonePath);
          return res.status(409).json({
            error: 'Directory already exists',
            details: `The destination path "${clonePath}" already exists. Please choose a different location or remove the existing directory.`
          });
        } catch (err) {
          // Directory doesn't exist, which is what we want
        }

        // Clone the repository into a subfolder
        try {
          await cloneGitHubRepository(githubUrl, clonePath, githubToken);
        } catch (error) {
          // Only clean up if clone created partial data (check if dir exists and is empty or partial)
          try {
            const stats = await fs.stat(clonePath);
            if (stats.isDirectory()) {
              await fs.rm(clonePath, { recursive: true, force: true });
            }
          } catch (cleanupError) {
            // Directory doesn't exist or cleanup failed - ignore
          }
          throw new Error(`Failed to clone repository: ${error.message}`);
        }

        // Add the cloned repo path to the project list
        const project = await addProjectManually(clonePath);

        return res.json({
          success: true,
          project,
          message: 'New workspace created and repository cloned successfully'
        });
      }

      // Add the new workspace to the project list (no clone)
      const project = await addProjectManually(absolutePath);

      return res.json({
        success: true,
        project,
        message: 'New workspace created successfully'
      });
    }

  } catch (error) {
    console.error('Error creating workspace:', error);
    res.status(500).json({
      error: error.message || 'Failed to create workspace',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

router.post('/resolve-workspace', async (req, res) => {
  try {
    const { path: workspacePath } = req.body;

    if (!workspacePath) {
      return res.status(400).json({ error: 'path is required' });
    }

    const validation = await validateWorkspacePath(workspacePath);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid workspace path',
        details: validation.error,
      });
    }

    const absolutePath = validation.resolvedPath;
    const workspaceType = await detectWorkspaceTypeForPath(absolutePath);

    return res.json({
      success: true,
      path: absolutePath,
      workspaceType,
    });
  } catch (error) {
    console.error('Error resolving workspace path:', error);
    res.status(500).json({
      error: error.message || 'Failed to resolve workspace path',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

/**
 * Helper function to get GitHub token from database
 */
async function getGithubTokenById(tokenId, userId) {
  return null;
}

/**
 * Clone repository with progress streaming (SSE)
 * GET /api/projects/clone-progress
 */
router.get('/clone-progress', async (req, res) => {
  const { path: workspacePath, githubUrl, githubTokenId, newGithubToken } = req.query;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  try {
    if (!workspacePath || !githubUrl) {
      sendEvent('error', { message: 'workspacePath and githubUrl are required' });
      res.end();
      return;
    }

    const validation = await validateWorkspacePath(workspacePath);
    if (!validation.valid) {
      sendEvent('error', { message: validation.error });
      res.end();
      return;
    }

    const absolutePath = validation.resolvedPath;

    await fs.mkdir(absolutePath, { recursive: true });

    let githubToken = null;
    if (githubTokenId) {
      const token = await getGithubTokenById(parseInt(githubTokenId), req.user.id);
      if (!token) {
        await fs.rm(absolutePath, { recursive: true, force: true });
        sendEvent('error', { message: 'GitHub token not found' });
        res.end();
        return;
      }
      githubToken = token.github_token;
    } else if (newGithubToken) {
      githubToken = newGithubToken;
    }

    const normalizedUrl = githubUrl.replace(/\/+$/, '').replace(/\.git$/, '');
    const repoName = normalizedUrl.split('/').pop() || 'repository';
    const clonePath = path.join(absolutePath, repoName);

    // Check if clone destination already exists to prevent data loss
    try {
      await fs.access(clonePath);
      sendEvent('error', { message: `Directory "${repoName}" already exists. Please choose a different location or remove the existing directory.` });
      res.end();
      return;
    } catch (err) {
      // Directory doesn't exist, which is what we want
    }

    let cloneUrl = githubUrl;
    if (githubToken) {
      try {
        const url = new URL(githubUrl);
        url.username = githubToken;
        url.password = '';
        cloneUrl = url.toString();
      } catch (error) {
        // SSH URL or invalid - use as-is
      }
    }

    sendEvent('progress', { message: `Cloning into '${repoName}'...` });

    const gitProcess = spawn('git', ['clone', '--progress', cloneUrl, clonePath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0'
      }
    });

    let lastError = '';

    gitProcess.stdout.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        sendEvent('progress', { message });
      }
    });

    gitProcess.stderr.on('data', (data) => {
      const message = data.toString().trim();
      lastError = message;
      if (message) {
        sendEvent('progress', { message });
      }
    });

    gitProcess.on('close', async (code) => {
      if (code === 0) {
        try {
          const project = await addProjectManually(clonePath);
          sendEvent('complete', { project, message: 'Repository cloned successfully' });
        } catch (error) {
          sendEvent('error', { message: `Clone succeeded but failed to add project: ${error.message}` });
        }
      } else {
        const sanitizedError = sanitizeGitError(lastError, githubToken);
        let errorMessage = 'Git clone failed';
        if (lastError.includes('Authentication failed') || lastError.includes('could not read Username')) {
          errorMessage = 'Authentication failed. Please check your credentials.';
        } else if (lastError.includes('Repository not found')) {
          errorMessage = 'Repository not found. Please check the URL and ensure you have access.';
        } else if (lastError.includes('already exists')) {
          errorMessage = 'Directory already exists';
        } else if (sanitizedError) {
          errorMessage = sanitizedError;
        }
        try {
          await fs.rm(clonePath, { recursive: true, force: true });
        } catch (cleanupError) {
          console.error('Failed to clean up after clone failure:', sanitizeGitError(cleanupError.message, githubToken));
        }
        sendEvent('error', { message: errorMessage });
      }
      res.end();
    });

    gitProcess.on('error', (error) => {
      if (error.code === 'ENOENT') {
        sendEvent('error', { message: 'Git is not installed or not in PATH' });
      } else {
        sendEvent('error', { message: error.message });
      }
      res.end();
    });

    req.on('close', () => {
      gitProcess.kill();
    });

  } catch (error) {
    sendEvent('error', { message: error.message });
    res.end();
  }
});

router.post('/:projectName/open-folder', async (req, res) => {
  try {
    const projects = await getProjects();
    const project = projects.find((item) => item.name === req.params.projectName);

    if (!project?.fullPath) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const stats = await fs.stat(project.fullPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Project path is not a directory' });
    }

    const { command, args } = getOpenDirectoryCommand(project.fullPath);
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    });

    child.unref();

    return res.json({
      success: true,
      path: project.fullPath,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/:projectName/open-file-tree-path', async (req, res) => {
  try {
    const projects = await getProjects();
    const project = projects.find((item) => item.name === req.params.projectName);

    if (!project?.fullPath) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const targetPath = resolveOpenFileTreeTargetPath(project.fullPath, req.body ?? {});
    const stats = await fs.stat(targetPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Target path is not a directory' });
    }

    const { command, args } = getOpenDirectoryCommand(targetPath);
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    });

    child.unref();

    return res.json({
      success: true,
      path: targetPath,
    });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({ error: error.message });
  }
});

router.get('/:projectName/preview/:previewPath(*)', async (req, res) => {
  try {
    const projects = await getProjects();
    const project = projects.find((item) => item.name === req.params.projectName);

    if (!project?.fullPath) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const previewPath = req.params.previewPath;
    if (!previewPath) {
      return res.status(400).json({ error: 'Preview path is required' });
    }

    const absoluteFilePath = resolveProjectPreviewFilePath(project.fullPath, previewPath);
    if (!absoluteFilePath) {
      return res.status(400).json({ error: 'Invalid preview path' });
    }

    const stats = await fs.stat(absoluteFilePath);
    if (!stats.isFile()) {
      return res.status(404).json({ error: 'Preview file not found' });
    }

    return res.sendFile(absoluteFilePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'Preview file not found' });
    }

    return res.status(500).json({ error: error.message });
  }
});

/**
 * Helper function to clone a GitHub repository
 */
function cloneGitHubRepository(githubUrl, destinationPath, githubToken = null) {
  return new Promise((resolve, reject) => {
    let cloneUrl = githubUrl;

    if (githubToken) {
      try {
        const url = new URL(githubUrl);
        url.username = githubToken;
        url.password = '';
        cloneUrl = url.toString();
      } catch (error) {
        // SSH URL - use as-is
      }
    }

    const gitProcess = spawn('git', ['clone', '--progress', cloneUrl, destinationPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0'
      }
    });

    let stdout = '';
    let stderr = '';

    gitProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    gitProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    gitProcess.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        let errorMessage = 'Git clone failed';

        if (stderr.includes('Authentication failed') || stderr.includes('could not read Username')) {
          errorMessage = 'Authentication failed. Please check your GitHub token.';
        } else if (stderr.includes('Repository not found')) {
          errorMessage = 'Repository not found. Please check the URL and ensure you have access.';
        } else if (stderr.includes('already exists')) {
          errorMessage = 'Directory already exists';
        } else if (stderr) {
          errorMessage = stderr;
        }

        reject(new Error(errorMessage));
      }
    });

    gitProcess.on('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new Error('Git is not installed or not in PATH'));
      } else {
        reject(error);
      }
    });
  });
}

// Rename project endpoint
router.put('/:projectName/rename', async (req, res) => {
  try {
    const { displayName } = req.body;
    await renameProject(req.params.projectName, displayName);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete project endpoint (force=true to delete with sessions)
router.delete('/:projectName', async (req, res) => {
  try {
    const { projectName } = req.params;
    const force = req.query.force === 'true';
    await deleteProject(projectName, force);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create project endpoint
router.post('/create', async (req, res) => {
  try {
    const { path: projectPath } = req.body;

    if (!projectPath || !projectPath.trim()) {
      return res.status(400).json({ error: 'Project path is required' });
    }

    const project = await addProjectManually(projectPath.trim());
    res.json({ success: true, project });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
