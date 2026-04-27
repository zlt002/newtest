import express from 'express';

const router = express.Router();

router.get('/api-keys', (_req, res) => {
  res.json({ apiKeys: [] });
});

router.post('/api-keys', (_req, res) => {
  res.json({
    success: true,
    apiKey: {
      id: 'local-key',
      key_name: 'Local Key',
      api_key: 'local-mode',
      created_at: new Date().toISOString(),
      is_active: true,
    },
  });
});

router.delete('/api-keys/:keyId', (_req, res) => {
  res.json({ success: true });
});

router.patch('/api-keys/:keyId/toggle', (_req, res) => {
  res.json({ success: true });
});

router.get('/credentials', (_req, res) => {
  res.json({ credentials: [] });
});

router.post('/credentials', (_req, res) => {
  res.json({ success: true, credential: null });
});

router.delete('/credentials/:credentialId', (_req, res) => {
  res.json({ success: true });
});

router.patch('/credentials/:credentialId/toggle', (_req, res) => {
  res.json({ success: true });
});

export default router;
