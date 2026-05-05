/**
 * Authentication middleware — local single-user mode.
 *
 * All requests are authenticated as the built-in local user.
 * No JWT verification or credential checking is performed.
 */

const LOCAL_USER = Object.freeze({
  id: 1,
  userId: 1,
  username: 'local',
  created_at: new Date(0).toISOString(),
  last_login: null,
});

/** Express middleware — attaches the local user to every request. */
const authenticateToken = (_req, _res, next) => {
  _req.user = LOCAL_USER;
  next();
};

/** WebSocket authentication — returns the local user identity. */
const authenticateWebSocket = () => ({
  userId: LOCAL_USER.userId,
  username: LOCAL_USER.username,
});

export { LOCAL_USER, authenticateToken, authenticateWebSocket };
