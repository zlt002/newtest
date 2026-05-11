import express from 'express';

import { createClaudeRuntimeConfigService } from '../utils/claude-runtime-config-service.js';

function sendError(res, error) {
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  res.status(statusCode).json({
    success: false,
    message: error?.message || 'Failed to handle Claude runtime config request',
    error: error?.code || error?.name || 'Error',
  });
}

export function createClaudeConfigRouter({
  service = createClaudeRuntimeConfigService(),
} = {}) {
  const router = express.Router();

  router.get('/runtime', async (_req, res) => {
    try {
      const config = await service.readRuntimeConfig();
      res.json({ success: true, config });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch('/runtime', async (req, res) => {
    try {
      const config = await service.updateRuntimeConfig({ patch: req.body });
      res.json({ success: true, config });
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}

export default createClaudeConfigRouter();
