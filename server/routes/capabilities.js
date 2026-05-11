import express from 'express';
import os from 'node:os';

import {
  createCapability,
  deleteCapability,
  listCapabilities,
  readCapability,
  updateCapability,
} from '../utils/capability-catalog-service.js';
import { listManagedPlugins } from '../utils/plugin-management-service.js';

function getHomeDir(req) {
  return typeof req.testHomeDir === 'string' && req.testHomeDir.trim()
    ? req.testHomeDir.trim()
    : os.homedir();
}

function sendError(res, error) {
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  res.status(statusCode).json({
    success: false,
    message: error?.message || 'Failed to handle capability request',
    error: error?.code || error?.name || 'Error',
  });
}

function pluginPathsFromManagedPlugins(plugins) {
  return (Array.isArray(plugins) ? plugins : [])
    .filter((plugin) => plugin?.enabled !== false)
    .map((plugin) => (typeof plugin?.path === 'string' ? plugin.path.trim() : ''))
    .filter(Boolean);
}

export function createCapabilitiesRouter({ listPlugins = listManagedPlugins } = {}) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const homeDir = getHomeDir(req);
      const plugins = await listPlugins({ homeDir });
      const capabilities = await listCapabilities({
        type: req.query?.type || 'skill',
        homeDir,
        projectPath: req.query?.projectPath,
        pluginPaths: pluginPathsFromManagedPlugins(plugins),
      });
      res.json({ success: true, capabilities });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/', async (req, res) => {
    try {
      const capability = await createCapability({
        type: req.body?.type,
        scope: req.body?.scope,
        homeDir: getHomeDir(req),
        projectPath: req.body?.projectPath,
        name: req.body?.name,
        content: req.body?.content,
      });
      res.json({ success: true, capability });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const homeDir = getHomeDir(req);
      const plugins = await listPlugins({ homeDir });
      const result = await readCapability({
        id: req.params.id,
        homeDir,
        projectPath: req.query?.projectPath,
        pluginPaths: pluginPathsFromManagedPlugins(plugins),
      });
      res.json({ success: true, ...result });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch('/:id', async (req, res) => {
    try {
      const capability = await updateCapability({
        id: req.params.id,
        content: req.body?.content,
        homeDir: getHomeDir(req),
        projectPath: req.body?.projectPath || req.query?.projectPath,
      });
      res.json({ success: true, capability });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const result = await deleteCapability({
        id: req.params.id,
        homeDir: getHomeDir(req),
        projectPath: req.body?.projectPath || req.query?.projectPath,
      });
      res.json({ success: true, result });
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}

export default createCapabilitiesRouter();
