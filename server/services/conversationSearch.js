/**
 * CONVERSATION SEARCH
 * ===================
 *
 * Full-text search across all Claude CLI conversation sessions.
 * Searches through JSONL files in ~/.claude/projects/ for matching
 * user and assistant messages.
 */

import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import readline from 'readline';
import os from 'os';

// Lazy import to avoid circular dependency with projects.js
let _loadProjectConfig = null;
let _generateDisplayName = null;

async function loadProjectConfig() {
  if (!_loadProjectConfig) {
    const projectsModule = await import('../projects.js');
    _loadProjectConfig = projectsModule.loadProjectConfig;
  }
  return _loadProjectConfig();
}

async function generateDisplayName(projectName, actualProjectDir = null) {
  if (!_generateDisplayName) {
    const projectsModule = await import('../projects.js');
    _generateDisplayName = projectsModule.generateDisplayName;
  }
  return _generateDisplayName(projectName, actualProjectDir);
}

async function searchConversations(query, limit = 50, onProjectResult = null, signal = null) {
  const safeQuery = typeof query === 'string' ? query.trim() : '';
  const safeLimit = Math.max(1, Math.min(Number.isFinite(limit) ? limit : 50, 200));
  const claudeDir = path.join(os.homedir(), '.claude', 'projects');
  const config = await loadProjectConfig();
  const results = [];
  let totalMatches = 0;
  const words = safeQuery.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return { results: [], totalMatches: 0, query: safeQuery };

  const isAborted = () => signal?.aborted === true;

  const isSystemMessage = (textContent) => {
    return typeof textContent === 'string' && (
      textContent.startsWith('<command-name>') ||
      textContent.startsWith('<command-message>') ||
      textContent.startsWith('<command-args>') ||
      textContent.startsWith('<local-command-stdout>') ||
      textContent.startsWith('<system-reminder>') ||
      textContent.startsWith('Caveat:') ||
      textContent.startsWith('This session is being continued from a previous') ||
      textContent.startsWith('Invalid API key') ||
      textContent.includes('{"subtasks":') ||
      textContent.includes('CRITICAL: You MUST respond with ONLY a JSON') ||
      textContent === 'Warmup'
    );
  };

  const extractText = (content) => {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .filter(part => part.type === 'text' && part.text)
        .map(part => part.text)
        .join(' ');
    }
    return '';
  };

  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordPatterns = words.map(w => new RegExp(`(?<!\\p{L})${escapeRegex(w)}(?!\\p{L})`, 'u'));
  const allWordsMatch = (textLower) => {
    return wordPatterns.every(p => p.test(textLower));
  };

  const buildSnippet = (text, textLower, snippetLen = 150) => {
    let firstIndex = -1;
    let firstWordLen = 0;
    for (const w of words) {
      const re = new RegExp(`(?<!\\p{L})${escapeRegex(w)}(?!\\p{L})`, 'u');
      const m = re.exec(textLower);
      if (m && (firstIndex === -1 || m.index < firstIndex)) {
        firstIndex = m.index;
        firstWordLen = w.length;
      }
    }
    if (firstIndex === -1) firstIndex = 0;
    const halfLen = Math.floor(snippetLen / 2);
    let start = Math.max(0, firstIndex - halfLen);
    let end = Math.min(text.length, firstIndex + halfLen + firstWordLen);
    let snippet = text.slice(start, end).replace(/\n/g, ' ');
    const prefix = start > 0 ? '...' : '';
    const suffix = end < text.length ? '...' : '';
    snippet = prefix + snippet + suffix;
    const snippetLower = snippet.toLowerCase();
    const highlights = [];
    for (const word of words) {
      const re = new RegExp(`(?<!\\p{L})${escapeRegex(word)}(?!\\p{L})`, 'gu');
      let match;
      while ((match = re.exec(snippetLower)) !== null) {
        highlights.push({ start: match.index, end: match.index + word.length });
      }
    }
    highlights.sort((a, b) => a.start - b.start);
    const merged = [];
    for (const h of highlights) {
      const last = merged[merged.length - 1];
      if (last && h.start <= last.end) {
        last.end = Math.max(last.end, h.end);
      } else {
        merged.push({ ...h });
      }
    }
    return { snippet, highlights: merged };
  };

  try {
    await fs.access(claudeDir);
    const entries = await fs.readdir(claudeDir, { withFileTypes: true });
    const projectDirs = entries.filter(e => e.isDirectory());
    let scannedProjects = 0;
    const totalProjects = projectDirs.length;

    for (const projectEntry of projectDirs) {
      if (totalMatches >= safeLimit || isAborted()) break;

      const projectName = projectEntry.name;
      const projectDir = path.join(claudeDir, projectName);
      const displayName = config[projectName]?.displayName
        || await generateDisplayName(projectName);

      let files;
      try {
        files = await fs.readdir(projectDir);
      } catch {
        continue;
      }

      const jsonlFiles = files.filter(
        file => file.endsWith('.jsonl') && !file.startsWith('agent-')
      );

      const projectResult = {
        projectName,
        projectDisplayName: displayName,
        sessions: []
      };

      for (const file of jsonlFiles) {
        if (totalMatches >= safeLimit || isAborted()) break;

        const filePath = path.join(projectDir, file);
        const sessionMatches = new Map();
        const sessionSummaries = new Map();
        const pendingSummaries = new Map();
        const sessionLastMessages = new Map();
        let currentSessionId = null;

        try {
          const fileStream = fsSync.createReadStream(filePath);
          const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
          });

          for await (const line of rl) {
            if (totalMatches >= safeLimit || isAborted()) break;
            if (!line.trim()) continue;

            let entry;
            try {
              entry = JSON.parse(line);
            } catch {
              continue;
            }

            if (entry.sessionId) {
              currentSessionId = entry.sessionId;
            }
            if (entry.type === 'summary' && entry.summary) {
              const sid = entry.sessionId || currentSessionId;
              if (sid) {
                sessionSummaries.set(sid, entry.summary);
              } else if (entry.leafUuid) {
                pendingSummaries.set(entry.leafUuid, entry.summary);
              }
            }

            // Apply pending summary via parentUuid
            if (entry.parentUuid && currentSessionId && !sessionSummaries.has(currentSessionId)) {
              const pending = pendingSummaries.get(entry.parentUuid);
              if (pending) sessionSummaries.set(currentSessionId, pending);
            }

            // Track last user/assistant message for fallback title
            if (entry.message?.content && currentSessionId && !entry.isApiErrorMessage) {
              const role = entry.message.role;
              if (role === 'user' || role === 'assistant') {
                const text = extractText(entry.message.content);
                if (text && !isSystemMessage(text)) {
                  if (!sessionLastMessages.has(currentSessionId)) {
                    sessionLastMessages.set(currentSessionId, {});
                  }
                  const msgs = sessionLastMessages.get(currentSessionId);
                  if (role === 'user') msgs.user = text;
                  else msgs.assistant = text;
                }
              }
            }

            if (!entry.message?.content) continue;
            if (entry.message.role !== 'user' && entry.message.role !== 'assistant') continue;
            if (entry.isApiErrorMessage) continue;

            const text = extractText(entry.message.content);
            if (!text || isSystemMessage(text)) continue;

            const textLower = text.toLowerCase();
            if (!allWordsMatch(textLower)) continue;

            const sessionId = entry.sessionId || currentSessionId || file.replace('.jsonl', '');
            if (!sessionMatches.has(sessionId)) {
              sessionMatches.set(sessionId, []);
            }

            const matches = sessionMatches.get(sessionId);
            if (matches.length < 2) {
              const { snippet, highlights } = buildSnippet(text, textLower);
              matches.push({
                role: entry.message.role,
                snippet,
                highlights,
                timestamp: entry.timestamp || null,
                provider: 'claude',
                messageUuid: entry.uuid || null
              });
              totalMatches++;
            }
          }
        } catch {
          continue;
        }

        for (const [sessionId, matches] of sessionMatches) {
          projectResult.sessions.push({
            sessionId,
            provider: 'claude',
            sessionSummary: sessionSummaries.get(sessionId) || (() => {
              const msgs = sessionLastMessages.get(sessionId);
              const lastMsg = msgs?.user || msgs?.assistant;
              return lastMsg ? (lastMsg.length > 50 ? lastMsg.substring(0, 50) + '...' : lastMsg) : 'New Session';
            })(),
            matches
          });
        }
      }

      scannedProjects++;
      if (projectResult.sessions.length > 0) {
        results.push(projectResult);
        if (onProjectResult) {
          onProjectResult({ projectResult, totalMatches, scannedProjects, totalProjects });
        }
      } else if (onProjectResult && scannedProjects % 10 === 0) {
        onProjectResult({ projectResult: null, totalMatches, scannedProjects, totalProjects });
      }
    }
  } catch {
    // claudeDir doesn't exist
  }

  return { results, totalMatches, query: safeQuery };
}

export { searchConversations };
