import type { MarkdownAnnotationFile } from '../components/code-editor/types/markdownAnnotations';

// Utility function for authenticated API calls
export const authenticatedFetch = (url: string | URL, options: RequestInit = {}): Promise<Response> => {
  const defaultHeaders: Record<string, string> = {};

  // Only set Content-Type for non-FormData requests
  if (!(options.body instanceof FormData)) {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  return fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options.headers as Record<string, string>),
    },
  });
};

// API endpoints
export const api = {
  // Auth endpoints (no token required)
  auth: {
    status: (): Promise<Response> => fetch('/api/auth/status'),
    login: (username: string, password: string): Promise<Response> => fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),
    register: (username: string, password: string): Promise<Response> => fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),
    user: (): Promise<Response> => authenticatedFetch('/api/auth/user'),
    logout: (): Promise<Response> => authenticatedFetch('/api/auth/logout', { method: 'POST' }),
  },

  // Protected endpoints
  projects: (): Promise<Response> => authenticatedFetch('/api/projects'),
  sessions: (projectName: string, limit = 5, offset = 0): Promise<Response> =>
    authenticatedFetch(`/api/projects/${projectName}/sessions?limit=${limit}&offset=${offset}`),
  sessionLookup: (sessionId: string): Promise<Response> =>
    authenticatedFetch(`/api/sessions/${encodeURIComponent(sessionId)}/lookup`),
  // Unified endpoint — all providers through one URL
  unifiedSessionMessages: (sessionId: string, provider = 'claude', { projectName = '', projectPath = '', limit = null, offset = 0 }: {
    projectName?: string;
    projectPath?: string;
    limit?: number | null;
    offset?: number;
  } = {}): Promise<Response> => {
    const params = new URLSearchParams();
    if (limit === null) {
      params.append('full', '1');
    } else {
      params.append('limit', String(limit));
      params.append('offset', String(offset));
    }
    const queryString = params.toString();
    return authenticatedFetch(`/api/agent-v2/sessions/${encodeURIComponent(sessionId)}/history${queryString ? `?${queryString}` : ''}`);
  },
  renameProject: (projectName: string, displayName: string): Promise<Response> =>
    authenticatedFetch(`/api/projects/${projectName}/rename`, {
      method: 'PUT',
      body: JSON.stringify({ displayName }),
    }),
  deleteSession: (projectName: string, sessionId: string): Promise<Response> =>
    authenticatedFetch(`/api/projects/${projectName}/sessions/${sessionId}`, {
      method: 'DELETE',
    }),
  renameSession: (sessionId: string, summary: string, provider: string): Promise<Response> =>
    authenticatedFetch(`/api/sessions/${sessionId}/rename`, {
      method: 'PUT',
      body: JSON.stringify({ summary, provider }),
    }),
  deleteProject: (projectName: string, force = false): Promise<Response> =>
    authenticatedFetch(`/api/projects/${projectName}${force ? '?force=true' : ''}`, {
      method: 'DELETE',
    }),
  openProjectFolder: (projectName: string): Promise<Response> =>
    authenticatedFetch(`/api/projects/${projectName}/open-folder`, {
      method: 'POST',
    }),
  openFileTreePath: (projectName: string, body: { path: string; type: 'file' | 'directory' }): Promise<Response> =>
    authenticatedFetch(`/api/projects/${projectName}/open-file-tree-path`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  searchConversationsUrl: (query: string, limit = 50): string => {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    return `/api/search/conversations?${params.toString()}`;
  },
  createProject: (path: string): Promise<Response> =>
    authenticatedFetch('/api/projects/create', {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),
  createWorkspace: (workspaceData: Record<string, unknown>): Promise<Response> =>
    authenticatedFetch('/api/projects/create-workspace', {
      method: 'POST',
      body: JSON.stringify(workspaceData),
    }),
  readFile: (projectName: string, filePath: string): Promise<Response> =>
    authenticatedFetch(`/api/projects/${projectName}/file?filePath=${encodeURIComponent(filePath)}`),
  saveFile: (projectName: string, filePath: string, content: string, expectedVersion: unknown): Promise<Response> =>
    authenticatedFetch(`/api/projects/${projectName}/file`, {
      method: 'PUT',
      body: JSON.stringify({ filePath, content, expectedVersion }),
    }),
  readMarkdownAnnotations: (projectName: string, filePath: string): Promise<Response> =>
    authenticatedFetch(`/api/projects/${projectName}/markdown-annotations?filePath=${encodeURIComponent(filePath)}`),
  saveMarkdownAnnotations: (projectName: string, filePath: string, annotationFile: MarkdownAnnotationFile): Promise<Response> =>
    authenticatedFetch(`/api/projects/${projectName}/markdown-annotations`, {
      method: 'PUT',
      body: JSON.stringify({ filePath, annotationFile }),
    }),
  getFiles: (projectName: string, options: RequestInit = {}): Promise<Response> =>
    authenticatedFetch(`/api/projects/${projectName}/files`, options),

  // File operations
  createFile: (projectName: string, { path, type, name }: { path: string; type: string; name: string }): Promise<Response> =>
    authenticatedFetch(`/api/projects/${projectName}/files/create`, {
      method: 'POST',
      body: JSON.stringify({ path, type, name }),
    }),

  renameFile: (projectName: string, { oldPath, newName }: { oldPath: string; newName: string }): Promise<Response> =>
    authenticatedFetch(`/api/projects/${projectName}/files/rename`, {
      method: 'PUT',
      body: JSON.stringify({ oldPath, newName }),
    }),

  deleteFile: (projectName: string, { path, type }: { path: string; type: string }): Promise<Response> =>
    authenticatedFetch(`/api/projects/${projectName}/files`, {
      method: 'DELETE',
      body: JSON.stringify({ path, type }),
    }),

  uploadFiles: (projectName: string, formData: FormData): Promise<Response> =>
    authenticatedFetch(`/api/projects/${projectName}/files/upload`, {
      method: 'POST',
      body: formData,
      headers: {}, // Let browser set Content-Type for FormData
    }),

  transcribe: (formData: FormData): Promise<Response> =>
    authenticatedFetch('/api/transcribe', {
      method: 'POST',
      body: formData,
      headers: {}, // Let browser set Content-Type for FormData
    }),

  // Browse filesystem for project suggestions
  browseFilesystem: (dirPath: string | null = null): Promise<Response> => {
    const params = new URLSearchParams();
    if (dirPath) params.append('path', dirPath);

    return authenticatedFetch(`/api/browse-filesystem?${params}`);
  },

  createFolder: (folderPath: string): Promise<Response> =>
    authenticatedFetch('/api/create-folder', {
      method: 'POST',
      body: JSON.stringify({ path: folderPath }),
    }),

  // User endpoints
  user: {
    gitConfig: (): Promise<Response> => authenticatedFetch('/api/user/git-config'),
    updateGitConfig: (gitName: string, gitEmail: string): Promise<Response> =>
      authenticatedFetch('/api/user/git-config', {
        method: 'POST',
        body: JSON.stringify({ gitName, gitEmail }),
      }),
    onboardingStatus: (): Promise<Response> => authenticatedFetch('/api/user/onboarding-status'),
    completeOnboarding: (): Promise<Response> =>
      authenticatedFetch('/api/user/complete-onboarding', {
        method: 'POST',
      }),
  },

  // Generic GET method for any endpoint
  get: (endpoint: string): Promise<Response> => authenticatedFetch(`/api${endpoint}`),

  // Generic POST method for any endpoint
  post: (endpoint: string, body: Record<string, unknown> | FormData): Promise<Response> => authenticatedFetch(`/api${endpoint}`, {
    method: 'POST',
    ...(body instanceof FormData ? { body } : { body: JSON.stringify(body) }),
  }),

  // Generic PUT method for any endpoint
  put: (endpoint: string, body: Record<string, unknown>): Promise<Response> => authenticatedFetch(`/api${endpoint}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  }),

  // Generic DELETE method for any endpoint
  delete: (endpoint: string, options: RequestInit = {}): Promise<Response> => authenticatedFetch(`/api${endpoint}`, {
    method: 'DELETE',
    ...options,
  }),
};
