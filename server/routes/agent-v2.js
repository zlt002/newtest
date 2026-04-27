import express from 'express';

function parsePositiveIntegerParam(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value !== 'string' || !/^(?:[1-9]\d*)$/.test(value)) {
    throw new Error(`${fieldName} must be a positive integer`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${fieldName} is too large`);
  }

  return parsed;
}

function parseNonNegativeIntegerParam(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)$/.test(value)) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${fieldName} is too large`);
  }

  return parsed;
}

function parseFullFlag(value) {
  if (value === undefined || value === null || value === '') {
    return false;
  }

  return value === true || value === '1' || value === 'true';
}

export function createAgentV2Router({ services = {} } = {}) {
  const router = express.Router();

  router.post('/sessions', async (req, res) => {
    try {
      const result = await services.startSessionRun?.({
        title: req.body?.title,
        prompt: req.body?.prompt,
        images: req.body?.images || [],
        model: req.body?.model,
        projectPath: req.body?.projectPath,
        effort: req.body?.effort,
        permissionMode: req.body?.permissionMode,
        toolsSettings: req.body?.toolsSettings || {},
        traceId: req.body?.traceId,
        writer: null,
      });

      res.status(201).json(result || {});
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to start session run' });
    }
  });

  router.get('/sessions/:id', async (req, res) => {
    try {
      const session = await services.getSession?.({ sessionId: req.params.id });
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      res.json(session);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to read session' });
    }
  });

  router.post('/sessions/:id/runs', async (req, res) => {
    try {
      const result = await services.continueSessionRun?.({
        sessionId: req.params.id,
        prompt: req.body?.prompt,
        images: req.body?.images || [],
        model: req.body?.model,
        projectPath: req.body?.projectPath,
        effort: req.body?.effort,
        permissionMode: req.body?.permissionMode,
        toolsSettings: req.body?.toolsSettings || {},
        traceId: req.body?.traceId,
        writer: null,
      });

      res.status(201).json(result || {});
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to continue session run' });
    }
  });

  router.get('/sessions/:id/history', async (req, res) => {
    try {
      const history = await services.getSessionHistory?.({
        sessionId: req.params.id,
        limit: parsePositiveIntegerParam(req.query?.limit, 'limit'),
        offset: parseNonNegativeIntegerParam(req.query?.offset, 'offset'),
        full: parseFullFlag(req.query?.full),
      });

      res.json(history || {});
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load session history';
      const isValidationError = /limit|offset/i.test(message);
      res.status(isValidationError ? 400 : 500).json({ error: message });
    }
  });

  router.post('/runs/:id/abort', async (req, res) => {
    try {
      const result = await services.abortRun?.({ runId: req.params.id });
      res.json(result || { ok: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to abort run' });
    }
  });

  return router;
}

export default createAgentV2Router;
