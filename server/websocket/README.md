# WebSocket Handlers

This directory will contain WebSocket handling logic extracted from `server/index.js`.

## Status

Currently in transition. The actual implementations remain in `server/index.js` due to deep coupling with server state and services.

## Structure

- `handlers/chatHandler.js` - Chat WebSocket connection handler
- `handlers/shellHandler.js` - Shell/terminal WebSocket connection handler
- `middleware/` - WebSocket-specific middleware (future)
- `utils.js` - WebSocket utilities

## TODO

1. Refactor `handleChatConnection` to accept dependencies via constructor
2. Refactor `handleShellConnection` to accept dependencies via constructor
3. Move WebSocket state management (connectedClients, etc.) to a dedicated module
4. Extract WebSocketWriter class to utils.js
5. Update server/index.js to use extracted handlers
