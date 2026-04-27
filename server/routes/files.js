import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import mime from 'mime-types';
import { promises as fsPromises } from 'fs';

import {
  extractProjectDirectory,
} from '../projects.js';
import { WORKSPACES_ROOT, validateWorkspacePath } from './projects.js';
import { authenticateToken } from '../middleware/auth.js';
import { getFileContentVersion } from '../utils/fileVersion.js';

const router = express.Router();

// ============================================================================
// Helper functions
// ============================================================================

export function resolveProjectEditorFilePath(projectRoot, filePath) {
  if (!filePath) {
    const error = new Error('Invalid file path');
    error.statusCode = 400;
    throw error;
  }

  const resolved = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(projectRoot, filePath);
  const normalizedRoot = path.resolve(projectRoot) + path.sep;

  if (!resolved.startsWith(normalizedRoot)) {
    const error = new Error('Path must be under project root');
    error.statusCode = 403;
    throw error;
  }

  return resolved;
}

const fileSaveQueues = new Map();

export async function readProjectFileForEditor({ projectRoot, filePath }) {
  const resolved = resolveProjectEditorFilePath(projectRoot, filePath);
  const content = await fsPromises.readFile(resolved, 'utf8');

  return {
    content,
    path: resolved,
    version: getFileContentVersion(content),
  };
}

async function runSerializedFileSave(resolvedPath, operation) {
  const previous = fileSaveQueues.get(resolvedPath) || Promise.resolve();
  let releaseCurrent;
  const current = new Promise((resolve) => {
    releaseCurrent = resolve;
  });
  const queued = previous.then(() => current);

  fileSaveQueues.set(resolvedPath, queued);

  await previous;

  try {
    return await operation();
  } finally {
    releaseCurrent();
    if (fileSaveQueues.get(resolvedPath) === queued) {
      fileSaveQueues.delete(resolvedPath);
    }
  }
}

export function getSerializedFileSaveQueueSizeForTests() {
  return fileSaveQueues.size;
}

function createFileVersionConflictError(currentVersion) {
  const error = new Error('File has changed since last load');
  error.statusCode = 409;
  error.currentVersion = currentVersion ?? null;
  return error;
}

export async function saveProjectFileFromEditor({ projectRoot, filePath, content, expectedVersion, __testHooks }) {
  const resolved = resolveProjectEditorFilePath(projectRoot, filePath);

  return runSerializedFileSave(resolved, async () => {
    let currentVersion = null;

    try {
      const currentContent = await fsPromises.readFile(resolved, 'utf8');
      currentVersion = getFileContentVersion(currentContent);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
      throw createFileVersionConflictError(currentVersion);
    }

    if (__testHooks?.afterVersionCheck) {
      await __testHooks.afterVersionCheck({ currentVersion, resolvedPath: resolved });
    }

    await fsPromises.writeFile(resolved, content, 'utf8');

    return {
      success: true,
      path: resolved,
      message: 'File saved successfully',
      version: getFileContentVersion(content),
    };
  });
}

const expandWorkspacePath = (inputPath) => {
  if (!inputPath) return inputPath;
  if (inputPath === '~') {
    return WORKSPACES_ROOT;
  }
  if (inputPath.startsWith('~/') || inputPath.startsWith('~\\')) {
    return path.join(WORKSPACES_ROOT, inputPath.slice(2));
  }
  return inputPath;
};

function normalizeProjectRelativeMarkdownPath(filePath, projectRoot) {
  if (typeof filePath !== 'string') {
    throw new Error('Markdown annotation paths must be project-relative');
  }

  // If absolute path is provided, convert it to project-relative path
  if (/^[A-Za-z]:[\\/]/.test(filePath)) {
    if (!projectRoot) {
      throw new Error('Markdown annotation paths must be project-relative');
    }
    const resolved = path.resolve(filePath);
    const resolvedRoot = path.resolve(projectRoot);
    const relative = path.relative(resolvedRoot, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Path must be under project root');
    }
    return relative.replace(/\\/g, '/');
  }

  const normalizedInput = filePath.replace(/\\/g, '/');

  if (normalizedInput.startsWith('//')) {
    throw new Error('Markdown annotation paths must be project-relative');
  }

  const normalizedPath = normalizedInput.replace(/^\/+/, '');

  if (!normalizedPath) {
    throw new Error('Markdown annotation paths must not be empty');
  }

  if (normalizedPath.split('/').some((segment) => segment === '..')) {
    throw new Error('Markdown annotation paths must not contain ".." segments');
  }

  return normalizedPath;
}

function getMarkdownAnnotationFilePath(filePath, projectRoot) {
  return path.join('.ccui', 'annotations', `${normalizeProjectRelativeMarkdownPath(filePath, projectRoot)}.annotations.json`);
}

function resolveMarkdownAnnotationsFilePath(projectRoot, filePath) {
  const resolved = path.resolve(projectRoot, getMarkdownAnnotationFilePath(filePath, projectRoot));
  const normalizedRoot = path.resolve(projectRoot);
  const relative = path.relative(normalizedRoot, resolved);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path must be under project root');
  }

  return resolved;
}

function createEmptyMarkdownAnnotationsFile(filePath, projectRoot) {
  return {
    version: 1,
    filePath: normalizeProjectRelativeMarkdownPath(filePath, projectRoot),
    annotations: []
  };
}

function isPathWithinRoot(rootPath, targetPath) {
  const normalizedRoot = path.resolve(rootPath);
  const normalizedTarget = path.resolve(targetPath);
  const relative = path.relative(normalizedRoot, normalizedTarget);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

function validateMarkdownAnnotationsStructure(annotationFile, normalizedFilePath) {
  if (!annotationFile || typeof annotationFile !== 'object' || Array.isArray(annotationFile)) {
    throw new Error('annotationFile must be an object');
  }

  if (annotationFile.version !== 1) {
    throw new Error('annotationFile.version must be 1');
  }

  if (annotationFile.filePath !== normalizedFilePath) {
    throw new Error('annotationFile.filePath must match the requested filePath');
  }

  if (!Array.isArray(annotationFile.annotations)) {
    throw new Error('annotationFile.annotations must be an array');
  }
}

async function assertMarkdownAnnotationsPathWithinProject(projectRoot, resolvedPath, { mustExist = false } = {}) {
  const projectRealRoot = await fsPromises.realpath(projectRoot);

  if (mustExist) {
    const fileStat = await fsPromises.lstat(resolvedPath);
    if (fileStat.isSymbolicLink()) {
      throw new Error('Path must be under project root');
    }
    const fileRealPath = await fsPromises.realpath(resolvedPath);
    if (!isPathWithinRoot(projectRealRoot, fileRealPath)) {
      throw new Error('Path must be under project root');
    }
    return fileRealPath;
  }

  const parentRealPath = await fsPromises.realpath(path.dirname(resolvedPath));
  if (!isPathWithinRoot(projectRealRoot, parentRealPath)) {
    throw new Error('Path must be under project root');
  }

  return resolvedPath;
}

async function assertMarkdownAnnotationsParentChainIsSafe(projectRoot, resolvedPath) {
  const projectRealRoot = await fsPromises.realpath(projectRoot);
  let currentPath = path.dirname(resolvedPath);

  while (currentPath.startsWith(projectRealRoot) && currentPath !== projectRealRoot) {
    try {
      const stat = await fsPromises.lstat(currentPath);
      if (stat.isSymbolicLink()) {
        throw new Error('Path must be under project root');
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    currentPath = path.dirname(currentPath);
  }
}

/**
 * Validate that a path is within the project root
 * @param {string} projectRoot - The project root path
 * @param {string} targetPath - The path to validate
 * @returns {{ valid: boolean, resolved?: string, error?: string }}
 */
function validatePathInProject(projectRoot, targetPath) {
  const resolved = path.isAbsolute(targetPath)
    ? path.resolve(targetPath)
    : path.resolve(projectRoot, targetPath);
  const normalizedRoot = path.resolve(projectRoot) + path.sep;
  if (!resolved.startsWith(normalizedRoot)) {
    return { valid: false, error: 'Path must be under project root' };
  }
  return { valid: true, resolved };
}

/**
 * Validate filename - check for invalid characters
 * @param {string} name - The filename to validate
 * @returns {{ valid: boolean, error?: string }}
 */
function validateFilename(name) {
  if (!name || !name.trim()) {
    return { valid: false, error: 'Filename cannot be empty' };
  }
  // Check for invalid characters (Windows + Unix)
  const invalidChars = /[<>:"/\\|?*\x00-\x1f]/;
  if (invalidChars.test(name)) {
    return { valid: false, error: 'Filename contains invalid characters' };
  }
  // Check for reserved names (Windows)
  const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  if (reserved.test(name)) {
    return { valid: false, error: 'Filename is a reserved name' };
  }
  // Check for dots only
  if (/^\.+$/.test(name)) {
    return { valid: false, error: 'Filename cannot be only dots' };
  }
  return { valid: true };
}

// Helper function to convert permissions to rwx format
function permToRwx(perm) {
  const r = perm & 4 ? 'r' : '-';
  const w = perm & 2 ? 'w' : '-';
  const x = perm & 1 ? 'x' : '-';
  return r + w + x;
}

async function getFileTree(dirPath, maxDepth = 3, currentDepth = 0, showHidden = true) {
  // Using fsPromises from import
  const items = [];

  try {
    const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      // Debug: log all entries including hidden files


      // Skip heavy build directories and VCS directories
      if (entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === 'build' ||
        entry.name === '.git' ||
        entry.name === '.svn' ||
        entry.name === '.hg') continue;

      const itemPath = path.join(dirPath, entry.name);
      const item = {
        name: entry.name,
        path: itemPath,
        type: entry.isDirectory() ? 'directory' : 'file'
      };

      // Get file stats for additional metadata
      try {
        const stats = await fsPromises.stat(itemPath);
        item.size = stats.size;
        item.modified = stats.mtime.toISOString();

        // Convert permissions to rwx format
        const mode = stats.mode;
        const ownerPerm = (mode >> 6) & 7;
        const groupPerm = (mode >> 3) & 7;
        const otherPerm = mode & 7;
        item.permissions = ((mode >> 6) & 7).toString() + ((mode >> 3) & 7).toString() + (mode & 7).toString();
        item.permissionsRwx = permToRwx(ownerPerm) + permToRwx(groupPerm) + permToRwx(otherPerm);
      } catch (statError) {
        // If stat fails, provide default values
        item.size = 0;
        item.modified = null;
        item.permissions = '000';
        item.permissionsRwx = '---------';
      }

      if (entry.isDirectory() && currentDepth < maxDepth) {
        // Recursively get subdirectories but limit depth
        try {
          // Check if we can access the directory before trying to read it
          await fsPromises.access(item.path, fs.constants.R_OK);
          item.children = await getFileTree(item.path, maxDepth, currentDepth + 1, showHidden);
        } catch (e) {
          // Silently skip directories we can't access (permission denied, etc.)
          item.children = [];
        }
      }

      items.push(item);
    }
  } catch (error) {
    // Only log non-permission errors to avoid spam
    if (error.code !== 'EACCES' && error.code !== 'EPERM') {
      console.error('Error reading directory:', error);
    }
  }

  return items.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

// ============================================================================
// Route handlers
// ============================================================================

// Browse filesystem endpoint for project suggestions - uses existing getFileTree
router.get('/browse-filesystem', authenticateToken, async (req, res) => {
  try {
    const { path: dirPath } = req.query;

    console.log('[API] Browse filesystem request for path:', dirPath);
    console.log('[API] WORKSPACES_ROOT is:', WORKSPACES_ROOT);
    // Default to home directory if no path provided
    const defaultRoot = WORKSPACES_ROOT;
    let targetPath = dirPath ? expandWorkspacePath(dirPath) : defaultRoot;

    // Resolve and normalize the path
    targetPath = path.resolve(targetPath);

    // Security check - ensure path is within allowed workspace root
    const validation = await validateWorkspacePath(targetPath);
    if (!validation.valid) {
      return res.status(403).json({ error: validation.error });
    }
    const resolvedPath = validation.resolvedPath || targetPath;

    // Security check - ensure path is accessible
    try {
      await fs.promises.access(resolvedPath);
      const stats = await fs.promises.stat(resolvedPath);

      if (!stats.isDirectory()) {
        return res.status(400).json({ error: 'Path is not a directory' });
      }
    } catch (err) {
      return res.status(404).json({ error: 'Directory not accessible' });
    }

    // Use existing getFileTree function with shallow depth (only direct children)
    const fileTree = await getFileTree(resolvedPath, 1, 0, false); // maxDepth=1, showHidden=false

    // Filter only directories and format for suggestions
    const directories = fileTree
      .filter(item => item.type === 'directory')
      .map(item => ({
        path: item.path,
        name: item.name,
        type: 'directory'
      }))
      .sort((a, b) => {
        const aHidden = a.name.startsWith('.');
        const bHidden = b.name.startsWith('.');
        if (aHidden && !bHidden) return 1;
        if (!aHidden && bHidden) return -1;
        return a.name.localeCompare(b.name);
      });

    // Add common directories if browsing home directory
    const suggestions = [];
    let resolvedWorkspaceRoot = defaultRoot;
    try {
      resolvedWorkspaceRoot = await fsPromises.realpath(defaultRoot);
    } catch (error) {
      // Use default root as-is if realpath fails
    }
    if (resolvedPath === resolvedWorkspaceRoot) {
      const commonDirs = ['Desktop', 'Documents', 'Projects', 'Development', 'Dev', 'Code', 'workspace'];
      const existingCommon = directories.filter(dir => commonDirs.includes(dir.name));
      const otherDirs = directories.filter(dir => !commonDirs.includes(dir.name));

      suggestions.push(...existingCommon, ...otherDirs);
    } else {
      suggestions.push(...directories);
    }

    res.json({
      path: resolvedPath,
      suggestions: suggestions
    });

  } catch (error) {
    console.error('Error browsing filesystem:', error);
    res.status(500).json({ error: 'Failed to browse filesystem' });
  }
});

router.post('/create-folder', authenticateToken, async (req, res) => {
  try {
    const { path: folderPath } = req.body;
    if (!folderPath) {
      return res.status(400).json({ error: 'Path is required' });
    }
    const expandedPath = expandWorkspacePath(folderPath);
    const resolvedInput = path.resolve(expandedPath);
    const validation = await validateWorkspacePath(resolvedInput);
    if (!validation.valid) {
      return res.status(403).json({ error: validation.error });
    }
    const targetPath = validation.resolvedPath || resolvedInput;
    const parentDir = path.dirname(targetPath);
    try {
      await fs.promises.access(parentDir);
    } catch (err) {
      return res.status(404).json({ error: 'Parent directory does not exist' });
    }
    try {
      await fs.promises.access(targetPath);
      return res.status(409).json({ error: 'Folder already exists' });
    } catch (err) {
      // Folder doesn't exist, which is what we want
    }
    try {
      await fs.promises.mkdir(targetPath, { recursive: false });
      res.json({ success: true, path: targetPath });
    } catch (mkdirError) {
      if (mkdirError.code === 'EEXIST') {
        return res.status(409).json({ error: 'Folder already exists' });
      }
      throw mkdirError;
    }
  } catch (error) {
    console.error('Error creating folder:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// Read file content endpoint
router.get('/projects/:projectName/file', authenticateToken, async (req, res) => {
  try {
    const { projectName } = req.params;
    const { filePath } = req.query;

    const projectRoot = await extractProjectDirectory(projectName).catch(() => null);
    if (!projectRoot) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const file = await readProjectFileForEditor({ projectRoot, filePath });
    res.json(file);
  } catch (error) {
    console.error('Error reading file:', error);
    if (error.statusCode) {
      res.status(error.statusCode).json({ error: error.message });
    } else if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'File not found' });
    } else if (error.code === 'EACCES') {
      res.status(403).json({ error: 'Permission denied' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Serve binary file content endpoint (for images, etc.)
router.get('/projects/:projectName/files/content', authenticateToken, async (req, res) => {
  try {
    const { projectName } = req.params;
    const { path: filePath } = req.query;


    // Security: ensure the requested path is inside the project root
    if (!filePath) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    const projectRoot = await extractProjectDirectory(projectName).catch(() => null);
    if (!projectRoot) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const resolved = path.resolve(filePath);
    const normalizedRoot = path.resolve(projectRoot) + path.sep;
    if (!resolved.startsWith(normalizedRoot)) {
      return res.status(403).json({ error: 'Path must be under project root' });
    }

    // Check if file exists
    try {
      await fsPromises.access(resolved);
    } catch (error) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Get file extension and set appropriate content type
    const mimeType = mime.lookup(resolved) || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);

    // Stream the file
    const fileStream = fs.createReadStream(resolved);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      console.error('Error streaming file:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error reading file' });
      }
    });

  } catch (error) {
    console.error('Error serving binary file:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

// Save file content endpoint
router.put('/projects/:projectName/file', authenticateToken, async (req, res) => {
  try {
    const { projectName } = req.params;
    const { filePath, content, expectedVersion } = req.body;

    if (content === undefined) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const projectRoot = await extractProjectDirectory(projectName).catch(() => null);
    if (!projectRoot) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const result = await saveProjectFileFromEditor({
      projectRoot,
      filePath,
      content,
      expectedVersion,
    });

    res.json(result);
  } catch (error) {
    console.error('Error saving file:', error);
    if (error.statusCode === 409) {
      res.status(409).json({
        error: error.message,
        currentVersion: error.currentVersion,
      });
    } else if (error.statusCode) {
      res.status(error.statusCode).json({ error: error.message });
    } else if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'File or directory not found' });
    } else if (error.code === 'EACCES') {
      res.status(403).json({ error: 'Permission denied' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

router.get('/projects/:projectName/markdown-annotations', authenticateToken, async (req, res) => {
  try {
    const { projectName } = req.params;
    const { filePath } = req.query;

    if (typeof filePath !== 'string' || !filePath.trim()) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    const projectRoot = await extractProjectDirectory(projectName).catch(() => null);
    if (!projectRoot) {
      return res.status(404).json({ error: 'Project not found' });
    }

    let resolvedPath;
    try {
      resolvedPath = resolveMarkdownAnnotationsFilePath(projectRoot, filePath);
    } catch (error) {
      return res.status(403).json({ error: error.message });
    }

    try {
      await assertMarkdownAnnotationsPathWithinProject(projectRoot, resolvedPath, { mustExist: true });
      const rawContent = await fsPromises.readFile(resolvedPath, 'utf8');
      const parsedContent = JSON.parse(rawContent);
      validateMarkdownAnnotationsStructure(parsedContent, normalizeProjectRelativeMarkdownPath(filePath, projectRoot));
      res.json(parsedContent);
    } catch (error) {
      if (error.code === 'ENOENT') {
        res.json(createEmptyMarkdownAnnotationsFile(filePath, projectRoot));
        return;
      }

      if (error instanceof SyntaxError) {
        return res.status(500).json({ error: 'Invalid markdown annotations JSON' });
      }

      if (error.message === 'Path must be under project root') {
        return res.status(403).json({ error: error.message });
      }

      if (error.message === 'annotationFile must be an object' ||
        error.message === 'annotationFile.version must be 1' ||
        error.message === 'annotationFile.filePath must match the requested filePath' ||
        error.message === 'annotationFile.annotations must be an array') {
        return res.status(500).json({ error: 'Invalid markdown annotations JSON' });
      }

      throw error;
    }
  } catch (error) {
    console.error('Error reading markdown annotations:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/projects/:projectName/markdown-annotations', authenticateToken, async (req, res) => {
  try {
    const { projectName } = req.params;
    const { filePath, annotationFile } = req.body;

    if (typeof filePath !== 'string' || !filePath.trim()) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    if (!annotationFile || typeof annotationFile !== 'object' || Array.isArray(annotationFile)) {
      return res.status(400).json({ error: 'annotationFile is required' });
    }

    const projectRoot = await extractProjectDirectory(projectName).catch(() => null);
    if (!projectRoot) {
      return res.status(404).json({ error: 'Project not found' });
    }

    let resolvedPath;
    try {
      resolvedPath = resolveMarkdownAnnotationsFilePath(projectRoot, filePath);
    } catch (error) {
      return res.status(403).json({ error: error.message });
    }

    const normalizedFilePath = normalizeProjectRelativeMarkdownPath(filePath, projectRoot);
    try {
      validateMarkdownAnnotationsStructure(annotationFile, normalizedFilePath);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    await assertMarkdownAnnotationsParentChainIsSafe(projectRoot, resolvedPath);
    await fsPromises.mkdir(path.dirname(resolvedPath), { recursive: true });
    await assertMarkdownAnnotationsPathWithinProject(projectRoot, path.dirname(resolvedPath));

    try {
      await fsPromises.lstat(resolvedPath);
      await assertMarkdownAnnotationsPathWithinProject(projectRoot, resolvedPath, { mustExist: true });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    await fsPromises.writeFile(resolvedPath, JSON.stringify(annotationFile, null, 2), 'utf8');

    res.json({
      success: true,
      path: resolvedPath
    });
  } catch (error) {
    console.error('Error saving markdown annotations:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/projects/:projectName/files', authenticateToken, async (req, res) => {
  try {

    // Using fsPromises from import

    // Use extractProjectDirectory to get the actual project path
    let actualPath;
    try {
      actualPath = await extractProjectDirectory(req.params.projectName);
    } catch (error) {
      console.error('Error extracting project directory:', error);
      // Fallback to simple dash replacement
      actualPath = req.params.projectName.replace(/-/g, '/');
    }

    // Check if path exists
    try {
      await fsPromises.access(actualPath);
    } catch (e) {
      return res.status(404).json({ error: `Project path not found: ${actualPath}` });
    }

    const files = await getFileTree(actualPath, 10, 0, true);
    res.json(files);
  } catch (error) {
    console.error('[ERROR] File tree error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/projects/:projectName/files/create - Create new file or directory
router.post('/projects/:projectName/files/create', authenticateToken, async (req, res) => {
  try {
    const { projectName } = req.params;
    const { path: parentPath, type, name } = req.body;

    // Validate input
    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }

    if (!['file', 'directory'].includes(type)) {
      return res.status(400).json({ error: 'Type must be "file" or "directory"' });
    }

    const nameValidation = validateFilename(name);
    if (!nameValidation.valid) {
      return res.status(400).json({ error: nameValidation.error });
    }

    // Get project root
    const projectRoot = await extractProjectDirectory(projectName).catch(() => null);
    if (!projectRoot) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Build and validate target path
    const targetDir = parentPath || '';
    const targetPath = targetDir ? path.join(targetDir, name) : name;
    const validation = validatePathInProject(projectRoot, targetPath);
    if (!validation.valid) {
      return res.status(403).json({ error: validation.error });
    }

    const resolvedPath = validation.resolved;

    // Check if already exists
    try {
      await fsPromises.access(resolvedPath);
      return res.status(409).json({ error: `${type === 'file' ? 'File' : 'Directory'} already exists` });
    } catch {
      // Doesn't exist, which is what we want
    }

    // Create file or directory
    if (type === 'directory') {
      await fsPromises.mkdir(resolvedPath, { recursive: false });
    } else {
      // Ensure parent directory exists
      const parentDir = path.dirname(resolvedPath);
      try {
        await fsPromises.access(parentDir);
      } catch {
        await fsPromises.mkdir(parentDir, { recursive: true });
      }
      await fsPromises.writeFile(resolvedPath, '', 'utf8');
    }

    res.json({
      success: true,
      path: resolvedPath,
      name,
      type,
      message: `${type === 'file' ? 'File' : 'Directory'} created successfully`
    });
  } catch (error) {
    console.error('Error creating file/directory:', error);
    if (error.code === 'EACCES') {
      res.status(403).json({ error: 'Permission denied' });
    } else if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'Parent directory not found' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// PUT /api/projects/:projectName/files/rename - Rename file or directory
router.put('/projects/:projectName/files/rename', authenticateToken, async (req, res) => {
  try {
    const { projectName } = req.params;
    const { oldPath, newName } = req.body;

    // Validate input
    if (!oldPath || !newName) {
      return res.status(400).json({ error: 'oldPath and newName are required' });
    }

    const nameValidation = validateFilename(newName);
    if (!nameValidation.valid) {
      return res.status(400).json({ error: nameValidation.error });
    }

    // Get project root
    const projectRoot = await extractProjectDirectory(projectName).catch(() => null);
    if (!projectRoot) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Validate old path
    const oldValidation = validatePathInProject(projectRoot, oldPath);
    if (!oldValidation.valid) {
      return res.status(403).json({ error: oldValidation.error });
    }

    const resolvedOldPath = oldValidation.resolved;

    // Check if old path exists
    try {
      await fsPromises.access(resolvedOldPath);
    } catch {
      return res.status(404).json({ error: 'File or directory not found' });
    }

    // Build and validate new path
    const parentDir = path.dirname(resolvedOldPath);
    const resolvedNewPath = path.join(parentDir, newName);
    const newValidation = validatePathInProject(projectRoot, resolvedNewPath);
    if (!newValidation.valid) {
      return res.status(403).json({ error: newValidation.error });
    }

    // Check if new path already exists
    try {
      await fsPromises.access(resolvedNewPath);
      return res.status(409).json({ error: 'A file or directory with this name already exists' });
    } catch {
      // Doesn't exist, which is what we want
    }

    // Rename
    await fsPromises.rename(resolvedOldPath, resolvedNewPath);

    res.json({
      success: true,
      oldPath: resolvedOldPath,
      newPath: resolvedNewPath,
      newName,
      message: 'Renamed successfully'
    });
  } catch (error) {
    console.error('Error renaming file/directory:', error);
    if (error.code === 'EACCES') {
      res.status(403).json({ error: 'Permission denied' });
    } else if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'File or directory not found' });
    } else if (error.code === 'EXDEV') {
      res.status(400).json({ error: 'Cannot move across different filesystems' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// DELETE /api/projects/:projectName/files - Delete file or directory
router.delete('/projects/:projectName/files', authenticateToken, async (req, res) => {
  try {
    const { projectName } = req.params;
    const { path: targetPath, type } = req.body;

    // Validate input
    if (!targetPath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    // Get project root
    const projectRoot = await extractProjectDirectory(projectName).catch(() => null);
    if (!projectRoot) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Validate path
    const validation = validatePathInProject(projectRoot, targetPath);
    if (!validation.valid) {
      return res.status(403).json({ error: validation.error });
    }

    const resolvedPath = validation.resolved;

    // Check if path exists and get stats
    let stats;
    try {
      stats = await fsPromises.stat(resolvedPath);
    } catch {
      return res.status(404).json({ error: 'File or directory not found' });
    }

    // Prevent deleting the project root itself
    if (resolvedPath === path.resolve(projectRoot)) {
      return res.status(403).json({ error: 'Cannot delete project root directory' });
    }

    // Delete based on type
    if (stats.isDirectory()) {
      await fsPromises.rm(resolvedPath, { recursive: true, force: true });
    } else {
      await fsPromises.unlink(resolvedPath);
    }

    res.json({
      success: true,
      path: resolvedPath,
      type: stats.isDirectory() ? 'directory' : 'file',
      message: 'Deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting file/directory:', error);
    if (error.code === 'EACCES') {
      res.status(403).json({ error: 'Permission denied' });
    } else if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'File or directory not found' });
    } else if (error.code === 'ENOTEMPTY') {
      res.status(400).json({ error: 'Directory is not empty' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// POST /api/projects/:projectName/files/upload - Upload files
// Dynamic import of multer for file uploads
const uploadFilesHandler = async (req, res) => {
  // Dynamic import of multer
  const multer = (await import('multer')).default;

  const uploadMiddleware = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, os.tmpdir());
      },
      filename: (req, file, cb) => {
        // Use a unique temp name, but preserve original name in file.originalname
        // Note: file.originalname may contain path separators for folder uploads
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        // For temp file, just use a safe unique name without the path
        cb(null, `upload-${uniqueSuffix}`);
      }
    }),
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB limit
      files: 20 // Max 20 files at once
    }
  });

  // Use multer middleware
  uploadMiddleware.array('files', 20)(req, res, async (err) => {
    if (err) {
      console.error('Multer error:', err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: 'Too many files. Maximum is 20 files.' });
      }
      return res.status(500).json({ error: err.message });
    }

    try {
      const { projectName } = req.params;
      const { targetPath, relativePaths } = req.body;

      // Parse relative paths if provided (for folder uploads)
      let filePaths = [];
      if (relativePaths) {
        try {
          filePaths = JSON.parse(relativePaths);
        } catch (e) {
          console.log('[DEBUG] Failed to parse relativePaths:', relativePaths);
        }
      }

      console.log('[DEBUG] File upload request:', {
        projectName,
        targetPath: JSON.stringify(targetPath),
        targetPathType: typeof targetPath,
        filesCount: req.files?.length,
        relativePaths: filePaths
      });

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files provided' });
      }

      // Get project root
      const projectRoot = await extractProjectDirectory(projectName).catch(() => null);
      if (!projectRoot) {
        return res.status(404).json({ error: 'Project not found' });
      }

      console.log('[DEBUG] Project root:', projectRoot);

      // Validate and resolve target path
      // If targetPath is empty or '.', use project root directly
      const targetDir = targetPath || '';
      let resolvedTargetDir;

      console.log('[DEBUG] Target dir:', JSON.stringify(targetDir));

      if (!targetDir || targetDir === '.' || targetDir === './') {
        // Empty path means upload to project root
        resolvedTargetDir = path.resolve(projectRoot);
        console.log('[DEBUG] Using project root as target:', resolvedTargetDir);
      } else {
        const validation = validatePathInProject(projectRoot, targetDir);
        if (!validation.valid) {
          console.log('[DEBUG] Path validation failed:', validation.error);
          return res.status(403).json({ error: validation.error });
        }
        resolvedTargetDir = validation.resolved;
        console.log('[DEBUG] Resolved target dir:', resolvedTargetDir);
      }

      // Ensure target directory exists
      try {
        await fsPromises.access(resolvedTargetDir);
      } catch {
        await fsPromises.mkdir(resolvedTargetDir, { recursive: true });
      }

      // Move uploaded files from temp to target directory
      const uploadedFiles = [];
      console.log('[DEBUG] Processing files:', req.files.map(f => ({ originalname: f.originalname, path: f.path })));
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        // Use relative path if provided (for folder uploads), otherwise use originalname
        const fileName = (filePaths && filePaths[i]) ? filePaths[i] : file.originalname;
        console.log('[DEBUG] Processing file:', fileName, '(originalname:', file.originalname + ')');
        const destPath = path.join(resolvedTargetDir, fileName);

        // Validate destination path
        const destValidation = validatePathInProject(projectRoot, destPath);
        if (!destValidation.valid) {
          console.log('[DEBUG] Destination validation failed for:', destPath);
          // Clean up temp file
          await fsPromises.unlink(file.path).catch(() => {});
          continue;
        }

        // Ensure parent directory exists (for nested files from folder upload)
        const parentDir = path.dirname(destPath);
        try {
          await fsPromises.access(parentDir);
        } catch {
          await fsPromises.mkdir(parentDir, { recursive: true });
        }

        // Move file (copy + unlink to handle cross-device scenarios)
        await fsPromises.copyFile(file.path, destPath);
        await fsPromises.unlink(file.path);

        uploadedFiles.push({
          name: fileName,
          path: destPath,
          size: file.size,
          mimeType: file.mimetype
        });
      }

      res.json({
        success: true,
        files: uploadedFiles,
        targetPath: resolvedTargetDir,
        message: `Uploaded ${uploadedFiles.length} file(s) successfully`
      });
    } catch (error) {
      console.error('Error uploading files:', error);
      // Clean up any remaining temp files
      if (req.files) {
        for (const file of req.files) {
          await fsPromises.unlink(file.path).catch(() => {});
        }
      }
      if (error.code === 'EACCES') {
        res.status(403).json({ error: 'Permission denied' });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  });
};

router.post('/projects/:projectName/files/upload', authenticateToken, uploadFilesHandler);

// Image upload endpoint
router.post('/projects/:projectName/upload-images', authenticateToken, async (req, res) => {
  try {
    const multer = (await import('multer')).default;
    const path = (await import('path')).default;
    const fs = (await import('fs')).promises;
    const os = (await import('os')).default;

    // Configure multer for image uploads
    const storage = multer.diskStorage({
      destination: async (req, file, cb) => {
        const uploadDir = path.join(os.tmpdir(), 'claude-ui-uploads', String(req.user.id));
        await fs.mkdir(uploadDir, { recursive: true });
        cb(null, uploadDir);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, uniqueSuffix + '-' + sanitizedName);
      }
    });

    const fileFilter = (req, file, cb) => {
      const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only JPEG, PNG, GIF, WebP, and SVG are allowed.'));
      }
    };

    const upload = multer({
      storage,
      fileFilter,
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
        files: 5
      }
    });

    // Handle multipart form data
    upload.array('images', 5)(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No image files provided' });
      }

      try {
        // Process uploaded images
        const processedImages = await Promise.all(
          req.files.map(async (file) => {
            // Read file and convert to base64
            const buffer = await fs.readFile(file.path);
            const base64 = buffer.toString('base64');
            const mimeType = file.mimetype;

            // Clean up temp file immediately
            await fs.unlink(file.path);

            return {
              name: file.originalname,
              data: `data:${mimeType};base64,${base64}`,
              size: file.size,
              mimeType: mimeType
            };
          })
        );

        res.json({ images: processedImages });
      } catch (error) {
        console.error('Error processing images:', error);
        // Clean up any remaining files
        await Promise.all(req.files.map(f => fs.unlink(f.path).catch(() => { })));
        res.status(500).json({ error: 'Failed to process images' });
      }
    });
  } catch (error) {
    console.error('Error in image upload endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
