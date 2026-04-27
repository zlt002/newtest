import express from 'express';
import path from 'path';
import os from 'os';
import { promises as fsPromises } from 'fs';

import {
  getSessions,
  findSessionLocation,
  deleteSession,
  extractProjectDirectory,
} from '../projects.js';
import { authenticateToken } from '../middleware/auth.js';
import { sessionNamesDb, applyCustomSessionNames } from '../local-lite-state.js';
import sessionManager from '../sessionManager.js';

const router = express.Router();

const VALID_PROVIDERS = ['claude'];

// Get sessions for a project
router.get('/projects/:projectName/sessions', authenticateToken, async (req, res) => {
  try {
    const { limit = 5, offset = 0 } = req.query;
    const result = await getSessions(req.params.projectName, parseInt(limit), parseInt(offset));
    applyCustomSessionNames(result.sessions, 'claude');
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Lookup session by ID
router.get('/sessions/:sessionId/lookup', authenticateToken, async (req, res) => {
  try {
    const lookup = await findSessionLocation(req.params.sessionId);
    if (!lookup) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(lookup);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete session endpoint
router.delete('/projects/:projectName/sessions/:sessionId', authenticateToken, async (req, res) => {
  try {
    const { projectName, sessionId } = req.params;
    console.log(`[API] Deleting session: ${sessionId} from project: ${projectName}`);
    await deleteSession(projectName, sessionId);
    sessionNamesDb.deleteName(sessionId, 'claude');
    console.log(`[API] Session ${sessionId} deleted successfully`);
    res.json({ success: true });
  } catch (error) {
    console.error(`[API] Error deleting session ${req.params.sessionId}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Rename session endpoint
router.put('/sessions/:sessionId/rename', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const safeSessionId = String(sessionId).replace(/[^a-zA-Z0-9._-]/g, '');
    if (!safeSessionId || safeSessionId !== String(sessionId)) {
      return res.status(400).json({ error: 'Invalid sessionId' });
    }
    const { summary, provider } = req.body;
    if (!summary || typeof summary !== 'string' || summary.trim() === '') {
      return res.status(400).json({ error: 'Summary is required' });
    }
    if (summary.trim().length > 500) {
      return res.status(400).json({ error: 'Summary must not exceed 500 characters' });
    }
    if (!provider || !VALID_PROVIDERS.includes(provider)) {
      return res.status(400).json({ error: `Provider must be one of: ${VALID_PROVIDERS.join(', ')}` });
    }
    sessionNamesDb.setName(safeSessionId, provider, summary.trim());
    res.json({ success: true });
  } catch (error) {
    console.error(`[API] Error renaming session ${req.params.sessionId}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Get token usage for a specific session
router.get('/projects/:projectName/sessions/:sessionId/token-usage', authenticateToken, async (req, res) => {
  try {
    const { projectName, sessionId } = req.params;
    const { provider = 'claude', projectPath: requestedProjectPath = '' } = req.query;
    const homeDir = os.homedir();

    // Allow only safe characters in sessionId
    const safeSessionId = String(sessionId).replace(/[^a-zA-Z0-9._-]/g, '');
    if (!safeSessionId || safeSessionId !== String(sessionId)) {
      return res.status(400).json({ error: 'Invalid sessionId' });
    }

    // Handle Cursor sessions - they use SQLite and don't have token usage info
    if (provider === 'cursor') {
      return res.json({
        used: 0,
        total: 0,
        breakdown: { input: 0, cacheCreation: 0, cacheRead: 0 },
        unsupported: true,
        message: 'Token usage tracking not available for Cursor sessions'
      });
    }

    // Handle Gemini sessions - they are raw logs in our current setup
    if (provider === 'gemini') {
      return res.json({
        used: 0,
        total: 0,
        breakdown: { input: 0, cacheCreation: 0, cacheRead: 0 },
        unsupported: true,
        message: 'Token usage tracking not available for Gemini sessions'
      });
    }

    // Handle Codex sessions
    if (provider === 'codex') {
      const codexSessionsDir = path.join(homeDir, '.codex', 'sessions');

      // Find the session file by searching for the session ID
      const findSessionFile = async (dir) => {
        try {
          const entries = await fsPromises.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              const found = await findSessionFile(fullPath);
              if (found) return found;
            } else if (entry.name.includes(safeSessionId) && entry.name.endsWith('.jsonl')) {
              return fullPath;
            }
          }
        } catch (error) {
          // Skip directories we can't read
        }
        return null;
      };

      const sessionFilePath = await findSessionFile(codexSessionsDir);

      if (!sessionFilePath) {
        return res.status(404).json({ error: 'Codex session file not found', sessionId: safeSessionId });
      }

      // Read and parse the Codex JSONL file
      let fileContent;
      try {
        fileContent = await fsPromises.readFile(sessionFilePath, 'utf8');
      } catch (error) {
        if (error.code === 'ENOENT') {
          return res.status(404).json({ error: 'Session file not found', path: sessionFilePath });
        }
        throw error;
      }
      const lines = fileContent.trim().split('\n');
      let totalTokens = 0;
      let contextWindow = 200000; // Default for Codex/OpenAI

      // Find the latest token_count event with info (scan from end)
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const entry = JSON.parse(lines[i]);

          // Codex stores token info in event_msg with type: "token_count"
          if (entry.type === 'event_msg' && entry.payload?.type === 'token_count' && entry.payload?.info) {
            const tokenInfo = entry.payload.info;
            if (tokenInfo.total_token_usage) {
              totalTokens = tokenInfo.total_token_usage.total_tokens || 0;
            }
            if (tokenInfo.model_context_window) {
              contextWindow = tokenInfo.model_context_window;
            }
            break; // Stop after finding the latest token count
          }
        } catch (parseError) {
          // Skip lines that can't be parsed
          continue;
        }
      }

      return res.json({
        used: totalTokens,
        total: contextWindow
      });
    }

    // Handle Claude sessions (default)
    // Prefer explicit projectPath from the client because display projects may be grouped
    // under a parent encoded name while the session file lives under the session cwd.
    let projectPath = '';
    if (typeof requestedProjectPath === 'string' && requestedProjectPath.trim()) {
      projectPath = requestedProjectPath.trim();
    } else {
      try {
        projectPath = await extractProjectDirectory(projectName);
      } catch (error) {
        console.error('Error extracting project directory:', error);
        return res.status(500).json({ error: 'Failed to determine project path' });
      }
    }

    // Claude session files are usually stored in the encoded cwd directory, but some
    // historical sessions can still live under the broader projectName directory.
    const candidateProjectDirs = [];
    const pushCandidateProjectDir = (candidatePath) => {
      if (!candidatePath || typeof candidatePath !== 'string') {
        return;
      }

      const trimmedCandidatePath = candidatePath.trim();
      if (!trimmedCandidatePath) {
        return;
      }

      const candidateDir = path.join(homeDir, '.claude', 'projects', trimmedCandidatePath);
      if (!candidateProjectDirs.includes(candidateDir)) {
        candidateProjectDirs.push(candidateDir);
      }
    };

    if (typeof requestedProjectPath === 'string' && requestedProjectPath.trim()) {
      pushCandidateProjectDir(requestedProjectPath.trim().replace(/[^a-zA-Z0-9-]/g, '-'));
    }

    if (projectPath) {
      pushCandidateProjectDir(projectPath.replace(/[^a-zA-Z0-9-]/g, '-'));
    }

    pushCandidateProjectDir(projectName);

    let jsonlPath = null;
    for (const projectDir of candidateProjectDirs) {
      const candidateJsonlPath = path.join(projectDir, `${safeSessionId}.jsonl`);
      const rel = path.relative(path.resolve(projectDir), path.resolve(candidateJsonlPath));
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        continue;
      }

      try {
        await fsPromises.access(candidateJsonlPath);
        jsonlPath = candidateJsonlPath;
        break;
      } catch (error) {
        // Try the next candidate directory
      }
    }

    if (!jsonlPath) {
      return res.status(404).json({
        error: 'Session file not found',
        path: path.join(candidateProjectDirs[0] || path.join(homeDir, '.claude', 'projects', projectName), `${safeSessionId}.jsonl`)
      });
    }

    // Read and parse the JSONL file
    let fileContent;
    try {
      fileContent = await fsPromises.readFile(jsonlPath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        return res.status(404).json({ error: 'Session file not found', path: jsonlPath });
      }
      throw error; // Re-throw other errors to be caught by outer try-catch
    }
    const lines = fileContent.trim().split('\n');

    const parsedContextWindow = parseInt(process.env.CONTEXT_WINDOW, 10);
    const contextWindow = Number.isFinite(parsedContextWindow) ? parsedContextWindow : 160000;
    let inputTokens = 0;
    let cacheCreationTokens = 0;
    let cacheReadTokens = 0;

    // Find the latest assistant message with usage data (scan from end)
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);

        // Only count assistant messages which have usage data
        if (entry.type === 'assistant' && entry.message?.usage) {
          const usage = entry.message.usage;

          // Use token counts from latest assistant message only
          inputTokens = usage.input_tokens || 0;
          cacheCreationTokens = usage.cache_creation_input_tokens || 0;
          cacheReadTokens = usage.cache_read_input_tokens || 0;

          break; // Stop after finding the latest assistant message
        }
      } catch (parseError) {
        // Skip lines that can't be parsed
        continue;
      }
    }

    // Calculate total context usage (excluding output_tokens, as per ccusage)
    const totalUsed = inputTokens + cacheCreationTokens + cacheReadTokens;

    res.json({
      used: totalUsed,
      total: contextWindow,
      breakdown: {
        input: inputTokens,
        cacheCreation: cacheCreationTokens,
        cacheRead: cacheReadTokens
      }
    });
  } catch (error) {
    console.error('Error reading session token usage:', error);
    res.status(500).json({ error: 'Failed to read session token usage' });
  }
});

export default router;
