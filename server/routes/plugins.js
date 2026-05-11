import express from 'express';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadClaudePluginsSync } from '../utils/claude-plugin-config.js';
import {
  listManagedPlugins,
  removeManagedPlugin,
  setManagedPluginEnabled,
} from '../utils/plugin-management-service.js';
import {
  upsertLitePlugin,
} from '../utils/lite-registry.js';

function getHomeDir(req) {
  return typeof req.testHomeDir === 'string' && req.testHomeDir.trim()
    ? req.testHomeDir.trim()
    : os.homedir();
}

function sendError(res, error) {
  const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  res.status(status).json({
    error: error?.message || 'Plugin route failed',
    message: error?.message || 'Plugin route failed',
  });
}

function getImportDirectory(body) {
  const value = body?.path ?? body?.directoryPath ?? body?.pluginDir ?? body?.directory;
  return typeof value === 'string' ? value.trim() : '';
}

function getRequestSourceKind(req) {
  if (Object.hasOwn(req.body ?? {}, 'sourceKind')) {
    return req.body.sourceKind;
  }
  if (Object.hasOwn(req.query ?? {}, 'sourceKind')) {
    return req.query.sourceKind;
  }
  return 'lite';
}

async function resolveImportDirectory(body) {
  const rawPluginDir = getImportDirectory(body);
  if (!rawPluginDir) {
    const error = new Error('Plugin directory path is required.');
    error.statusCode = 400;
    throw error;
  }

  if (!path.isAbsolute(rawPluginDir)) {
    const error = new Error('Plugin directory path must be an absolute path.');
    error.statusCode = 400;
    throw error;
  }

  const pluginDir = path.resolve(rawPluginDir);
  let stats;
  try {
    stats = await fs.stat(pluginDir);
  } catch (statError) {
    const error = new Error(`Plugin directory does not exist: ${pluginDir}`);
    error.statusCode = 400;
    throw error;
  }

  if (!stats.isDirectory()) {
    const error = new Error(`Plugin path must point to a directory: ${pluginDir}`);
    error.statusCode = 400;
    throw error;
  }

  return pluginDir;
}

function normalizeManifestField(manifest, fieldName) {
  if (!Object.hasOwn(manifest, fieldName)) {
    return undefined;
  }

  const value = manifest[fieldName];
  if (typeof value !== 'string') {
    const error = new Error(`Plugin manifest field "${fieldName}" must be a string when provided.`);
    error.statusCode = 400;
    throw error;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

async function readPluginManifest(pluginDir) {
  const manifestPath = path.join(pluginDir, '.claude-plugin', 'plugin.json');
  let payload;

  try {
    payload = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch (error) {
    const routeError = new Error(`Unable to read plugin manifest: ${manifestPath}`);
    routeError.statusCode = error?.code === 'ENOENT' ? 404 : 400;
    throw routeError;
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const error = new Error('Plugin manifest must be a JSON object.');
    error.statusCode = 400;
    throw error;
  }

  const manifest = {
    id: normalizeManifestField(payload, 'id'),
    name: normalizeManifestField(payload, 'name'),
    version: normalizeManifestField(payload, 'version'),
  };

  if (!manifest.id && !manifest.name) {
    const error = new Error('Plugin manifest must provide a usable string id or name.');
    error.statusCode = 400;
    throw error;
  }

  return Object.fromEntries(
    Object.entries(manifest).filter(([, value]) => typeof value === 'string'),
  );
}

async function getDefaultAgentV2Runtime() {
  const { defaultAgentV2Runtime } = await import('../services/agent/default-services.js');
  return defaultAgentV2Runtime;
}

function getSessionId(session, index) {
  const id = session?.id ?? session?.sessionId ?? session?.conversationId;
  return typeof id === 'string' && id.trim() ? id.trim() : String(index);
}

function normalizeLiveSessions(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value instanceof Map) {
    return [...value.values()];
  }
  if (value && typeof value === 'object') {
    return Object.values(value);
  }
  return [];
}

export function createPluginRouter({ runtime, getRuntime = getDefaultAgentV2Runtime } = {}) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const homeDir = getHomeDir(req);
      const sdkPlugins = loadClaudePluginsSync({ homeDir });
      const plugins = await listManagedPlugins({ homeDir, sdkPlugins });
      res.json({ plugins, sdkPlugins });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/import-directory', async (req, res) => {
    try {
      const pluginDir = await resolveImportDirectory(req.body);
      const manifest = await readPluginManifest(pluginDir);
      const plugin = await upsertLitePlugin({
        homeDir: getHomeDir(req),
        plugin: {
          ...manifest,
          path: pluginDir,
          source: 'local-directory',
          enabled: true,
        },
      });

      res.json({ success: true, plugin });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/reload', async (_req, res) => {
    try {
      const resolvedRuntime = runtime ?? (typeof getRuntime === 'function' ? await getRuntime() : null);
      const liveSessions = typeof resolvedRuntime?.listLiveSessions === 'function'
        ? normalizeLiveSessions(await resolvedRuntime.listLiveSessions())
        : [];
      const sessions = [];
      let reloaded = 0;
      let skipped = 0;

      for (const [index, session] of liveSessions.entries()) {
        const id = getSessionId(session, index);
        if (session && typeof session.reloadPlugins === 'function') {
          try {
            await session.reloadPlugins();
            reloaded += 1;
            sessions.push({ id, reloaded: true });
          } catch (error) {
            skipped += 1;
            sessions.push({
              id,
              reloaded: false,
              reason: error?.message || 'Plugin reload failed for this session.',
            });
          }
          continue;
        }

        skipped += 1;
        sessions.push({ id, reloaded: false, reason: 'Plugin reload is not supported by this session.' });
      }

      res.json({
        success: true,
        total: liveSessions.length,
        reloaded,
        skipped,
        sessions,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch('/:id', async (req, res) => {
    try {
      const plugin = await setManagedPluginEnabled({
        homeDir: getHomeDir(req),
        id: req.params.id,
        sourceKind: getRequestSourceKind(req),
        enabled: req.body?.enabled,
      });
      res.json({ success: true, plugin });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const result = await removeManagedPlugin({
        homeDir: getHomeDir(req),
        id: req.params.id,
        sourceKind: getRequestSourceKind(req),
      });
      res.json({ success: true, result });
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}

export default createPluginRouter();
