import { WebSocketServer } from 'ws';
import { createChatHandler } from './handlers/chatHandler.js';
import { createShellHandler } from './handlers/shellHandler.js';

export function setupWebSocket(server, deps) {
    const {
        IS_PLATFORM,
        authenticateWebSocket,
    } = deps;

    const wss = new WebSocketServer({
        server,
        verifyClient: (info) => {
            console.log('WebSocket connection attempt to:', info.req.url);

            // Platform mode: always allow connection
            if (IS_PLATFORM) {
                const user = authenticateWebSocket(null); // Will return first user
                if (!user) {
                    console.log('[WARN] Platform mode: No user found in database');
                    return false;
                }
                info.req.user = user;
                console.log('[OK] Platform mode WebSocket authenticated for user:', user.username);
                return true;
            }

            // Normal mode: verify token
            // Extract token from query parameters or headers
            const url = new URL(info.req.url, 'http://localhost');
            const token = url.searchParams.get('token') ||
                info.req.headers.authorization?.split(' ')[1];

            // Verify token
            const user = authenticateWebSocket(token);
            if (!user) {
                console.log('[WARN] WebSocket authentication failed');
                return false;
            }

            // Store user info in the request for later use
            info.req.user = user;
            console.log('[OK] WebSocket authenticated for user:', user.username);
            return true;
        }
    });

    const handleChatConnection = createChatHandler(deps);
    const handleShellConnection = createShellHandler(deps);

    wss.on('connection', (ws, request) => {
        const url = request.url;
        console.log('[INFO] Client connected to:', url);

        // Parse URL to get pathname without query parameters
        const urlObj = new URL(url, 'http://localhost');
        const pathname = urlObj.pathname;

        if (pathname === '/ws') {
            handleChatConnection(ws, request);
        } else {
            console.log('[WARN] Unknown WebSocket path:', pathname);
            ws.close();
        }
    });

    return wss;
}
