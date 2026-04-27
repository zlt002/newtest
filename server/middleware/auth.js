const LOCAL_USER = {
  id: 1,
  userId: 1,
  username: 'local',
  created_at: new Date(0).toISOString(),
  last_login: null,
};

const JWT_SECRET = 'local-mode';

const validateApiKey = (req, _res, next) => {
  req.user = LOCAL_USER;
  next();
};

const authenticateToken = async (req, _res, next) => {
  req.user = LOCAL_USER;
  next();
};

const generateToken = () => 'local-mode';

const authenticateWebSocket = () => ({
  userId: LOCAL_USER.userId,
  username: LOCAL_USER.username,
});

export {
  LOCAL_USER,
  validateApiKey,
  authenticateToken,
  generateToken,
  authenticateWebSocket,
  JWT_SECRET,
};
