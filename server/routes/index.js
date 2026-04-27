// Routes aggregator
// Centralizes all route imports for easier management
import authRoutes from './auth.js';
import projectsRoutes from './projects.js';
import gitRoutes from './git.js';
import mcpRoutes from './mcp.js';
import commandsRoutes from './commands.js';
import settingsRoutes from './settings.js';
import userRoutes from './user.js';
import filesRoutes from './files.js';
import sessionsRoutes from './sessions.js';
import systemRoutes from './system.js';

// Export all routes
export {
  authRoutes,
  projectsRoutes,
  gitRoutes,
  mcpRoutes,
  commandsRoutes,
  settingsRoutes,
  userRoutes,
  filesRoutes,
  sessionsRoutes,
  systemRoutes,
};

// Default export for convenience
export default {
  auth: authRoutes,
  projects: projectsRoutes,
  git: gitRoutes,
  mcp: mcpRoutes,
  commands: commandsRoutes,
  settings: settingsRoutes,
  user: userRoutes,
  files: filesRoutes,
  sessions: sessionsRoutes,
  system: systemRoutes,
};
