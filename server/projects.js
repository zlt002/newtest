/**
 * PROJECT DISCOVERY AND MANAGEMENT
 * Discovers Claude CLI projects from ~/.claude/projects/, manages project
 * config (~/.claude/project-config.json), and provides CRUD operations.
 * Session and parsing functions are re-exported from services/ modules.
 */

import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import readline from 'readline';
import os from 'os';
import { applyCustomSessionNames } from './local-lite-state.js';

// Re-export session functions from new modules for backward compatibility
export { getSessions, findSessionLocation, getSessionMessages, deleteSession, paginateOfficialSessions } from './services/sessionDiscovery.js';
export { parseJsonlSessions, parseAgentTools } from './services/sessionParsing.js';
export { searchConversations } from './services/conversationSearch.js';

// Import for internal use
import { getSessions } from './services/sessionDiscovery.js';

// Cache for extracted project directories
const projectDirectoryCache = new Map();

async function isAccessibleProjectDirectory(
  projectPath,
  {
    accessPath = fs.access,
    statPath = fs.stat,
  } = {},
) {
  if (!projectPath || typeof projectPath !== 'string') {
    return false;
  }

  try {
    await accessPath(projectPath);
    const stats = await statPath(projectPath);
    return stats.isDirectory();
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn(`Skipping inaccessible project path ${projectPath}:`, error.message);
    }
    return false;
  }
}

function clearProjectDirectoryCache() {
  projectDirectoryCache.clear();
}

async function loadProjectConfig() {
  const configPath = path.join(os.homedir(), '.claude', 'project-config.json');
  try {
    const configData = await fs.readFile(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    // Return empty config if file doesn't exist
    return {};
  }
}

async function saveProjectConfig(config) {
  const claudeDir = path.join(os.homedir(), '.claude');
  const configPath = path.join(claudeDir, 'project-config.json');

  // Ensure the .claude directory exists
  try {
    await fs.mkdir(claudeDir, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }

  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
}

async function generateDisplayName(projectName, actualProjectDir = null) {
  // Use actual project directory if provided, otherwise decode from project name
  let projectPath = actualProjectDir || projectName.replace(/-/g, '/');

  // Try to read package.json from the project path
  try {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageData = await fs.readFile(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageData);

    // Return the name from package.json if it exists
    if (packageJson.name) {
      return packageJson.name;
    }
  } catch (error) {
    // Fall back to path-based naming if package.json doesn't exist or can't be read
  }

  // If it starts with /, it's an absolute path
  if (projectPath.startsWith('/')) {
    const parts = projectPath.split('/').filter(Boolean);
    // Return only the last folder name
    return parts[parts.length - 1] || projectPath;
  }

  return projectPath;
}

async function extractProjectDirectory(projectName) {
  // Check cache first
  if (projectDirectoryCache.has(projectName)) {
    return projectDirectoryCache.get(projectName);
  }

  // Check project config for originalPath (manually added projects via UI or platform)
  // This handles projects with dashes in their directory names correctly
  const config = await loadProjectConfig();
  if (config[projectName]?.originalPath) {
    const originalPath = config[projectName].originalPath;
    projectDirectoryCache.set(projectName, originalPath);
    return originalPath;
  }

  const projectDir = path.join(os.homedir(), '.claude', 'projects', projectName);
  const cwdCounts = new Map();
  let latestTimestamp = 0;
  let latestCwd = null;
  let extractedPath;

  try {
    // Check if the project directory exists
    await fs.access(projectDir);

    const files = await fs.readdir(projectDir);
    const jsonlFiles = files.filter(file => file.endsWith('.jsonl'));

    if (jsonlFiles.length === 0) {
      // Fall back to decoded project name if no sessions
      extractedPath = projectName.replace(/-/g, '/');
    } else {
      // Process all JSONL files to collect cwd values
      for (const file of jsonlFiles) {
        const jsonlFile = path.join(projectDir, file);
        const fileStream = fsSync.createReadStream(jsonlFile);
        const rl = readline.createInterface({
          input: fileStream,
          crlfDelay: Infinity
        });

        for await (const line of rl) {
          if (line.trim()) {
            try {
              const entry = JSON.parse(line);

              if (entry.cwd) {
                // Count occurrences of each cwd
                cwdCounts.set(entry.cwd, (cwdCounts.get(entry.cwd) || 0) + 1);

                // Track the most recent cwd
                const timestamp = new Date(entry.timestamp || 0).getTime();
                if (timestamp > latestTimestamp) {
                  latestTimestamp = timestamp;
                  latestCwd = entry.cwd;
                }
              }
            } catch (parseError) {
              // Skip malformed lines
            }
          }
        }
      }

      // Determine the best cwd to use
      if (cwdCounts.size === 0) {
        // No cwd found, fall back to decoded project name
        extractedPath = projectName.replace(/-/g, '/');
      } else if (cwdCounts.size === 1) {
        // Only one cwd, use it
        extractedPath = Array.from(cwdCounts.keys())[0];
      } else {
        // Multiple cwd values - prefer the most recent one if it has reasonable usage
        const mostRecentCount = cwdCounts.get(latestCwd) || 0;
        const maxCount = Math.max(...cwdCounts.values());

        // Use most recent if it has at least 25% of the max count
        if (mostRecentCount >= maxCount * 0.25) {
          extractedPath = latestCwd;
        } else {
          // Otherwise use the most frequently used cwd
          for (const [cwd, count] of cwdCounts.entries()) {
            if (count === maxCount) {
              extractedPath = cwd;
              break;
            }
          }
        }

        // Fallback (shouldn't reach here)
        if (!extractedPath) {
          extractedPath = latestCwd || projectName.replace(/-/g, '/');
        }
      }
    }

    // Cache the result
    projectDirectoryCache.set(projectName, extractedPath);

    return extractedPath;

  } catch (error) {
    // If the directory doesn't exist, just use the decoded project name
    if (error.code === 'ENOENT') {
      extractedPath = projectName.replace(/-/g, '/');
    } else {
      console.error(`Error extracting project directory for ${projectName}:`, error);
      // Fall back to decoded project name for other errors
      extractedPath = projectName.replace(/-/g, '/');
    }

    // Cache the fallback result too
    projectDirectoryCache.set(projectName, extractedPath);

    return extractedPath;
  }
}

async function getProjects(progressCallback = null) {
  const claudeDir = path.join(os.homedir(), '.claude', 'projects');
  const config = await loadProjectConfig();
  const projects = [];
  const existingProjects = new Set();
  let totalProjects = 0;
  let processedProjects = 0;
  let directories = [];

  try {
    // Check if the .claude/projects directory exists
    await fs.access(claudeDir);

    // First, get existing Claude projects from the file system
    const entries = await fs.readdir(claudeDir, { withFileTypes: true });
    directories = entries.filter(e => e.isDirectory());

    // Build set of existing project names for later
    directories.forEach(e => existingProjects.add(e.name));

    // Count manual projects not already in directories
    const manualProjectsCount = Object.entries(config)
      .filter(([name, cfg]) => cfg.manuallyAdded && !existingProjects.has(name))
      .length;

    totalProjects = directories.length + manualProjectsCount;

    for (const entry of directories) {
      processedProjects++;

      // Emit progress
      if (progressCallback) {
        progressCallback({
          phase: 'loading',
          current: processedProjects,
          total: totalProjects,
          currentProject: entry.name
        });
      }

      // Extract actual project directory from JSONL sessions
      const actualProjectDir = await extractProjectDirectory(entry.name);

      if (!(await isAccessibleProjectDirectory(actualProjectDir))) {
        continue;
      }

      // Get display name from config or generate one
      const customName = config[entry.name]?.displayName;
      const autoDisplayName = await generateDisplayName(entry.name, actualProjectDir);
      const fullPath = actualProjectDir;

      const project = {
        name: entry.name,
        path: actualProjectDir,
        displayName: customName || autoDisplayName,
        fullPath: fullPath,
        isCustomName: !!customName,
        sessions: [],
        sessionMeta: {
          hasMore: false,
          total: 0
        }
      };

      // Try to get sessions for this project (just first 5 for performance)
      try {
        const sessionResult = await getSessions(entry.name, 5, 0);
        project.sessions = sessionResult.sessions || [];
        project.sessionMeta = {
          hasMore: sessionResult.hasMore,
          total: sessionResult.total
        };
      } catch (e) {
        console.warn(`Could not load sessions for project ${entry.name}:`, e.message);
        project.sessionMeta = {
          hasMore: false,
          total: 0
        };
      }
      applyCustomSessionNames(project.sessions, 'claude');

      projects.push(project);
    }
  } catch (error) {
    // If the directory doesn't exist (ENOENT), that's okay - just continue with empty projects
    if (error.code !== 'ENOENT') {
      console.error('Error reading projects directory:', error);
    }
    // Calculate total for manual projects only (no directories exist)
    totalProjects = Object.entries(config)
      .filter(([name, cfg]) => cfg.manuallyAdded)
      .length;
  }

  // Add manually configured projects that don't exist as folders yet
  for (const [projectName, projectConfig] of Object.entries(config)) {
    if (!existingProjects.has(projectName) && projectConfig.manuallyAdded) {
      processedProjects++;

      // Emit progress for manual projects
      if (progressCallback) {
        progressCallback({
          phase: 'loading',
          current: processedProjects,
          total: totalProjects,
          currentProject: projectName
        });
      }

      // Use the original path if available, otherwise extract from potential sessions
      let actualProjectDir = projectConfig.originalPath;

      if (!actualProjectDir) {
        try {
          actualProjectDir = await extractProjectDirectory(projectName);
        } catch (error) {
          // Fall back to decoded project name
          actualProjectDir = projectName.replace(/-/g, '/');
        }
      }

      if (!(await isAccessibleProjectDirectory(actualProjectDir))) {
        continue;
      }

      const project = {
        name: projectName,
        path: actualProjectDir,
        displayName: projectConfig.displayName || await generateDisplayName(projectName, actualProjectDir),
        fullPath: actualProjectDir,
        isCustomName: !!projectConfig.displayName,
        isManuallyAdded: true,
        sessions: [],
        sessionMeta: {
          hasMore: false,
          total: 0
        }
      };

      projects.push(project);
    }
  }

  // Emit completion after all projects (including manual) are processed
  if (progressCallback) {
    progressCallback({
      phase: 'complete',
      current: totalProjects,
      total: totalProjects
    });
  }

  return projects;
}

async function renameProject(projectName, newDisplayName) {
  const config = await loadProjectConfig();

  if (!newDisplayName || newDisplayName.trim() === '') {
    // Remove custom name if empty, will fall back to auto-generated
    if (config[projectName]) {
      delete config[projectName].displayName;
    }
  } else {
    // Set custom display name, preserving other properties (manuallyAdded, originalPath)
    config[projectName] = {
      ...config[projectName],
      displayName: newDisplayName.trim()
    };
  }

  await saveProjectConfig(config);
  return true;
}

async function isProjectEmpty(projectName) {
  try {
    const sessionsResult = await getSessions(projectName, 1, 0);
    return sessionsResult.total === 0;
  } catch (error) {
    console.error(`Error checking if project ${projectName} is empty:`, error);
    return false;
  }
}

async function deleteProject(projectName, force = false) {
  const projectDir = path.join(os.homedir(), '.claude', 'projects', projectName);

  try {
    const isEmpty = await isProjectEmpty(projectName);
    if (!isEmpty && !force) {
      throw new Error('Cannot delete project with existing sessions');
    }

    const config = await loadProjectConfig();
    let projectPath = config[projectName]?.path || config[projectName]?.originalPath;

    // Fallback to extractProjectDirectory if projectPath is not in config
    if (!projectPath) {
      projectPath = await extractProjectDirectory(projectName);
    }

    // Remove the project directory (includes all Claude sessions)
    await fs.rm(projectDir, { recursive: true, force: true });

    // Remove from project config
    delete config[projectName];
    await saveProjectConfig(config);

    return true;
  } catch (error) {
    console.error(`Error deleting project ${projectName}:`, error);
    throw error;
  }
}

async function addProjectManually(projectPath, displayName = null) {
  const absolutePath = path.resolve(projectPath);

  try {
    // Check if the path exists
    await fs.access(absolutePath);
  } catch (error) {
    throw new Error(`Path does not exist: ${absolutePath}`);
  }

  // Generate project name (encode path for use as directory name)
  const projectName = absolutePath.replace(/[\\/:\s~_]/g, '-');

  // Check if project already exists in config
  const config = await loadProjectConfig();
  const projectDir = path.join(os.homedir(), '.claude', 'projects', projectName);

  if (config[projectName]) {
    throw new Error(`Project already configured for path: ${absolutePath}`);
  }

  // Allow adding projects even if the directory exists - this enables tracking
  // existing Claude Code or Cursor projects in the UI

  // Add to config as manually added project
  config[projectName] = {
    manuallyAdded: true,
    originalPath: absolutePath
  };

  if (displayName) {
    config[projectName].displayName = displayName;
  }

  await saveProjectConfig(config);

  return {
    name: projectName,
    path: absolutePath,
    fullPath: absolutePath,
    displayName: displayName || await generateDisplayName(projectName, absolutePath),
    isManuallyAdded: true,
    sessions: [],
  };
}

export {
  getProjects,
  renameProject,
  isProjectEmpty,
  deleteProject,
  addProjectManually,
  loadProjectConfig,
  saveProjectConfig,
  extractProjectDirectory,
  clearProjectDirectoryCache,
  isAccessibleProjectDirectory
};
