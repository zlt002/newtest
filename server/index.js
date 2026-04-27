#!/usr/bin/env node
// 先加载环境变量，再执行后续导入，避免启动时读取到不完整的配置。
import './load-env.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const installMode = fs.existsSync(path.join(__dirname, '..', '.git')) ? 'git' : 'npm';

// ANSI color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    dim: '\x1b[2m',
};

const c = {
    info: (text) => `${colors.cyan}${text}${colors.reset}`,
    ok: (text) => `${colors.green}${text}${colors.reset}`,
    warn: (text) => `${colors.yellow}${text}${colors.reset}`,
    tip: (text) => `${colors.blue}${text}${colors.reset}`,
    bright: (text) => `${colors.bright}${text}${colors.reset}`,
    dim: (text) => `${colors.dim}${text}${colors.reset}`,
};

console.log('SERVER_PORT from env:', process.env.SERVER_PORT);

import express from 'express';
import { WebSocket } from 'ws';
import os from 'os';
import http from 'http';
import cors from 'cors';
import { promises as fsPromises } from 'fs';

import { getProjects, clearProjectDirectoryCache } from './projects.js';
import sessionManager from './sessionManager.js';
import { defaultAgentV2Repository, defaultAgentV2Services } from './services/agent/default-services.js';
import { handleClaudeCommandWithAgentV2 } from './services/agent/application/handle-claude-command.js';
import gitRoutes from './routes/git.js';
import authRoutes from './routes/auth.js';
import cliAuthRoutes from './routes/cli-auth.js';
import mcpRoutes from './routes/mcp.js';
import commandsRoutes from './routes/commands.js';
import settingsRoutes from './routes/settings.js';
import { createAgentV2Router } from './routes/agent-v2.js';
import { createClaudeHooksRouter, createDefaultClaudeHooksServices } from './hooks/claude-hooks-router.js';
import projectsRoutes from './routes/projects.js';
import userRoutes from './routes/user.js';
import filesRoutes from './routes/files.js';
import sessionsRoutes from './routes/sessions.js';
import systemRoutes from './routes/system.js';
import { initializeDatabase } from './local-lite-state.js';
import { validateApiKey, authenticateToken, authenticateWebSocket } from './middleware/auth.js';
import { IS_PLATFORM } from './constants/config.js';
import { getConnectableHost } from '../shared/networkHosts.js';
import { shouldIgnoreWatchedPath } from './utils/projects-watcher.js';
import {
    createLatencyTrace,
    markLatencyTrace,
    buildClaudeInvocationSnapshot
} from './utils/claude-latency-trace.js';

import { shouldResumeClaudeSession } from './utils/claude-session.js';
import { setupWebSocket } from './websocket/setup.js';

function normalizeTransportUserMessage(message) {
    const normalizedMessage = message && typeof message === 'object' ? message : null;
    const rawContent = normalizedMessage?.content;

    if (typeof rawContent === 'string') {
        return {
            prompt: rawContent,
            images: [],
        };
    }

    if (!Array.isArray(rawContent)) {
        return {
            prompt: '',
            images: [],
        };
    }

    let prompt = '';
    const images = [];

    for (const block of rawContent) {
        if (!block || typeof block !== 'object') {
            continue;
        }

        if (block.type === 'text' && typeof block.text === 'string') {
            prompt += prompt ? `\n${block.text}` : block.text;
            continue;
        }

        if (block.type === 'image' && block.source?.type === 'base64') {
            const mediaType = typeof block.source.media_type === 'string'
                ? block.source.media_type
                : 'application/octet-stream';
            const base64Data = typeof block.source.data === 'string' ? block.source.data : '';
            if (!base64Data) {
                continue;
            }

            images.push({
                data: `data:${mediaType};base64,${base64Data}`,
                mimeType: mediaType,
            });
        }
    }

    return { prompt, images };
}

export function normalizeAgentRunTransportOptions(data = {}) {
    const normalizedInput = data.type === 'chat_run_start' || data.type === 'chat_user_message'
        ? normalizeTransportUserMessage(data.message)
        : {
            prompt: data.prompt,
            images: data.images || [],
        };

    return {
        projectPath: data.projectPath,
        cwd: data.projectPath,
        sessionId: data.sessionId || null,
        conversationId: data.conversationId || null,
        agentConversationId: data.agentConversationId || null,
        resume: Boolean(data.sessionId || data.conversationId || data.agentConversationId),
        toolsSettings: data.toolsSettings || {},
        permissionMode: data.permissionMode,
        model: data.model,
        effort: data.effort,
        sessionSummary: data.sessionSummary,
        images: normalizedInput.images,
        prompt: normalizedInput.prompt,
        message: data.message || null,
        traceId: data.traceId,
        outputFormat: data.outputFormat,
        contextFilePaths: Array.isArray(data.contextFilePaths)
            ? data.contextFilePaths
                .filter((value) => typeof value === 'string')
                .map((value) => value.trim())
                .filter(Boolean)
            : [],
    };
}

// Re-export from files route for backward compatibility
export { resolveProjectEditorFilePath, readProjectFileForEditor, saveProjectFileFromEditor, getSerializedFileSaveQueueSizeForTests } from './routes/files.js';

// File system watchers for provider project/session folders
const PROVIDER_WATCH_PATHS = [
    { provider: 'claude', rootPath: path.join(os.homedir(), '.claude', 'projects') },
];
const WATCHER_DEBOUNCE_MS = 300;
let projectsWatchers = [];
let projectsWatcherDebounceTimer = null;
const connectedClients = new Set();
let isGetProjectsRunning = false; // Flag to prevent reentrant calls

// Broadcast progress to all connected WebSocket clients
function broadcastProgress(progress) {
    const message = JSON.stringify({
        type: 'loading_progress',
        ...progress
    });
    connectedClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Setup file system watchers for Claude, Cursor, and Codex project/session folders
async function setupProjectsWatcher() {
    const chokidar = (await import('chokidar')).default;

    if (projectsWatcherDebounceTimer) {
        clearTimeout(projectsWatcherDebounceTimer);
        projectsWatcherDebounceTimer = null;
    }

    await Promise.all(
        projectsWatchers.map(async (watcher) => {
            try {
                await watcher.close();
            } catch (error) {
                console.error('[WARN] Failed to close watcher:', error);
            }
        })
    );
    projectsWatchers = [];

    const debouncedUpdate = (eventType, filePath, provider, rootPath) => {
        if (projectsWatcherDebounceTimer) {
            clearTimeout(projectsWatcherDebounceTimer);
        }

        projectsWatcherDebounceTimer = setTimeout(async () => {
            // Prevent reentrant calls
            if (isGetProjectsRunning) {
                return;
            }

            try {
                isGetProjectsRunning = true;

                // Clear project directory cache when files change
                clearProjectDirectoryCache();

                // Get updated projects list
                const updatedProjects = await getProjects(broadcastProgress);

                // Notify all connected clients about the project changes
                const updateMessage = JSON.stringify({
                    type: 'projects_updated',
                    projects: updatedProjects,
                    timestamp: new Date().toISOString(),
                    changeType: eventType,
                    changedFile: path.relative(rootPath, filePath),
                    watchProvider: provider
                });

                connectedClients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(updateMessage);
                    }
                });

            } catch (error) {
                console.error('[ERROR] Error handling project changes:', error);
            } finally {
                isGetProjectsRunning = false;
            }
        }, WATCHER_DEBOUNCE_MS);
    };

    for (const { provider, rootPath } of PROVIDER_WATCH_PATHS) {
        try {
            // chokidar v4 emits ENOENT via the "error" event for missing roots and will not auto-recover.
            // Ensure provider folders exist before creating the watcher so watching stays active.
            await fsPromises.mkdir(rootPath, { recursive: true });

            // Initialize chokidar watcher with optimized settings
            const watcher = chokidar.watch(rootPath, {
                // Avoid glob-heavy matching and skip generated Claude session artifacts.
                ignored: shouldIgnoreWatchedPath,
                persistent: true,
                ignoreInitial: true, // Don't fire events for existing files on startup
                followSymlinks: false,
                depth: 10, // Reasonable depth limit
                awaitWriteFinish: {
                    stabilityThreshold: 100, // Wait 100ms for file to stabilize
                    pollInterval: 50
                }
            });

            // Set up event listeners
            watcher
                .on('add', (filePath) => debouncedUpdate('add', filePath, provider, rootPath))
                .on('change', (filePath) => debouncedUpdate('change', filePath, provider, rootPath))
                .on('unlink', (filePath) => debouncedUpdate('unlink', filePath, provider, rootPath))
                .on('addDir', (dirPath) => debouncedUpdate('addDir', dirPath, provider, rootPath))
                .on('unlinkDir', (dirPath) => debouncedUpdate('unlinkDir', dirPath, provider, rootPath))
                .on('error', (error) => {
                    console.error(`[ERROR] ${provider} watcher error:`, error);
                })
                .on('ready', () => {
                });

            projectsWatchers.push(watcher);
        } catch (error) {
            console.error(`[ERROR] Failed to setup ${provider} watcher for ${rootPath}:`, error);
        }
    }

    if (projectsWatchers.length === 0) {
        console.error('[ERROR] Failed to setup any provider watchers');
    }
}


const app = express();
const server = http.createServer(app);

const ptySessionsMap = new Map();

// Setup WebSocket server via extracted module
const wss = setupWebSocket(server, {
    IS_PLATFORM,
    authenticateWebSocket,
    connectedClients,
    normalizeAgentRunTransportOptions,
    shouldResumeClaudeSession,
    createLatencyTrace,
    markLatencyTrace,
    buildClaudeInvocationSnapshot,
    handleClaudeCommandWithAgentV2,
    defaultAgentV2Services,
    ptySessionsMap,
    pty: null, // pty module is not currently imported; shell functionality requires node-pty
    sessionManager,
});

// Make WebSocket server available to routes
app.locals.wss = wss;

app.use(cors({ exposedHeaders: ['X-Refreshed-Token'] }));
app.use(express.json({
    limit: '50mb',
    type: (req) => {
        // Skip multipart/form-data requests (for file uploads like images)
        const contentType = req.headers['content-type'] || '';
        if (contentType.includes('multipart/form-data')) {
            return false;
        }
        return contentType.includes('json');
    }
}));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Optional API key validation (if configured)
app.use('/api', validateApiKey);

// Authentication routes (public)
app.use('/api/auth', authRoutes);

// Claude CLI auth status routes (protected)
app.use('/api/cli', authenticateToken, cliAuthRoutes);

// Projects API Routes (protected)
app.use('/api/projects', authenticateToken, projectsRoutes);

// Git API Routes (protected)
app.use('/api/git', authenticateToken, gitRoutes);

// MCP API Routes (protected)
app.use('/api/mcp', authenticateToken, mcpRoutes);

// Commands API Routes (protected)
app.use('/api/commands', authenticateToken, commandsRoutes);

// Settings API Routes (protected)
app.use('/api/settings', authenticateToken, settingsRoutes);

// Agent V2 HTTP routes (protected)
app.use('/api/agent-v2', authenticateToken, createAgentV2Router({
    services: defaultAgentV2Services,
}));

async function readSettingsJson(filePath) {
    try {
        const content = await fsPromises.readFile(filePath, 'utf8');
        return JSON.parse(content);
    } catch {
        return null;
    }
}

const hooksRouter = createClaudeHooksRouter({
    services: createDefaultClaudeHooksServices({
        discoveryOptions: {
            settingsReader: readSettingsJson,
        },
        hookEventsProvider: {
            async listHookEvents(filters = {}) {
                const allEvents = await defaultAgentV2Repository.listAllEvents();
                let events = allEvents;
                if (filters.sessionId) {
                    events = events.filter((e) => e.sessionId === filters.sessionId);
                }
                if (filters.runId) {
                    events = events.filter((e) => e.runId === filters.runId);
                }
                return events;
            },
        },
    }),
});

// Claude Hooks API Routes (protected)
app.use('/api/hooks', authenticateToken, hooksRouter);

// User API Routes (protected)
app.use('/api/user', authenticateToken, userRoutes);

// Unified session messages route (protected)

// File system routes (protected)
app.use('/api', authenticateToken, filesRoutes);

// Session management routes (protected)
app.use('/api', authenticateToken, sessionsRoutes);

// System routes (health is public, others protected internally)
app.use('/', systemRoutes);

// Serve public files (like api-docs.html)
app.use(express.static(path.join(__dirname, '../public')));

// Static files served after API routes
// Add cache control: HTML files should not be cached, but assets can be cached
app.use(express.static(path.join(__dirname, '../dist'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            // Prevent HTML caching to avoid service worker issues after builds
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        } else if (filePath.match(/\.(js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|ico)$/)) {
            // Cache static assets for 1 year (they have hashed names)
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }
}));

// Projects list endpoint (needs broadcastProgress from this module)
app.get('/api/projects', authenticateToken, async (req, res) => {
    try {
        const projects = await getProjects(broadcastProgress);
        res.json(projects);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Serve React app for all other routes (excluding static files)
app.get('*', (req, res) => {
    // Skip requests for static assets (files with extensions)
    if (path.extname(req.path)) {
        return res.status(404).send('Not found');
    }

    // Only serve index.html for HTML routes, not for static assets
    // Static assets should already be handled by express.static middleware above
    const indexPath = path.join(__dirname, '../dist/index.html');

    // Check if dist/index.html exists (production build available)
    if (fs.existsSync(indexPath)) {
        // Set no-cache headers for HTML to prevent service worker issues
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.sendFile(indexPath);
    } else {
        // In development, redirect to Vite dev server only if dist doesn't exist
        const redirectHost = getConnectableHost(req.hostname);
        res.redirect(`${req.protocol}://${redirectHost}:${VITE_PORT}`);
    }
});

const SERVER_PORT = process.env.SERVER_PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const DISPLAY_HOST = getConnectableHost(HOST);
const VITE_PORT = process.env.VITE_PORT || 5173;

// Initialize database and start server
async function startServer() {
    try {
        // Initialize authentication database
        await initializeDatabase();

        // Check if running in production mode (dist folder exists)
        const distIndexPath = path.join(__dirname, '../dist/index.html');
        const isProduction = fs.existsSync(distIndexPath);

        // Log Claude implementation mode
        console.log(`${c.info('[INFO]')} Using Claude Agents SDK for Claude integration`);
        console.log('');

        if (isProduction) {
            console.log(`${c.info('[INFO]')} To run in production mode, go to http://${DISPLAY_HOST}:${SERVER_PORT}`);
        }

        console.log(`${c.info('[INFO]')} To run in development mode with hot-module replacement, go to http://${DISPLAY_HOST}:${VITE_PORT}`);

        server.listen(SERVER_PORT, HOST, async () => {
            const appInstallPath = path.join(__dirname, '..');

            console.log('');
            console.log(c.dim('═'.repeat(63)));
            console.log(`  ${c.bright('CC UI Server - Ready')}`);
            console.log(c.dim('═'.repeat(63)));
            console.log('');
            console.log(`${c.info('[INFO]')} Server URL:  ${c.bright('http://' + DISPLAY_HOST + ':' + SERVER_PORT)}`);
            console.log(`${c.info('[INFO]')} Installed at: ${c.dim(appInstallPath)}`);
            console.log(`${c.tip('[TIP]')}  Run "ccui status" for full configuration details`);
            console.log('');

            // Start watching the projects folder for changes
            await setupProjectsWatcher();
        });

        process.on('SIGTERM', () => process.exit(0));
        process.on('SIGINT', () => process.exit(0));
    } catch (error) {
        console.error('[ERROR] Failed to start server:', error);
        process.exit(1);
    }
}

if (process.argv[1] === __filename) {
    startServer();
}
