import express from 'express';
import { authenticateToken, generateToken, LOCAL_USER } from '../middleware/auth.js';

const router = express.Router();

router.get('/status', (_req, res) => {
  res.json({
    needsSetup: false,
    isAuthenticated: true,
  });
});

router.post('/register', (_req, res) => {
  res.json({
    success: true,
    user: { id: LOCAL_USER.id, username: LOCAL_USER.username },
    token: generateToken(),
  });
});

router.post('/login', (_req, res) => {
  res.json({
    success: true,
    user: { id: LOCAL_USER.id, username: LOCAL_USER.username },
    token: generateToken(),
  });
});

router.get('/user', authenticateToken, (req, res) => {
  res.json({
    user: req.user,
  });
});

router.post('/logout', authenticateToken, (_req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

export default router;
