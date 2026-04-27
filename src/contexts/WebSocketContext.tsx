import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  createClientLatencyTraceStore,
  markClientLatencyEvent,
} from '../components/chat/utils/latencyTrace';
import {
  appendSocketMessageEvent,
  type SocketMessageEvent,
} from './socketMessageEvents';
import {
  dispatchSocketMessage,
  flushQueuedSocketMessages,
} from './socketSendQueue.js';

type WebSocketContextType = {
  ws: WebSocket | null;
  sendMessage: (message: any) => { status: 'sent' | 'queued' };
  latestMessage: any | null;
  messageEvents: SocketMessageEvent<any>[];
  isConnected: boolean;
  clientLatencyTraceStore: ReturnType<typeof createClientLatencyTraceStore>;
};

export const isAgentEventEnvelopeMessage = (message: any) => (
  typeof message?.eventId === 'string'
  && typeof message?.runId === 'string'
  && (typeof message?.sessionId === 'string' || message?.sessionId === null)
  && typeof message?.sequence === 'number'
  && typeof message?.type === 'string'
);

const WebSocketContext = createContext<WebSocketContextType | null>(null);

const extractLatencySessionId = (message: any): string | null => {
  const candidateSessionId =
    message?.sessionId ||
    message?.session_id ||
    message?.newSessionId ||
    message?.actualSessionId ||
    null;

  return typeof candidateSessionId === 'string' && candidateSessionId ? candidateSessionId : null;
};

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

const buildWebSocketUrl = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
};

const useWebSocketProviderState = (): WebSocketContextType => {
  const wsRef = useRef<WebSocket | null>(null);
  const unmountedRef = useRef(false); // Track if component is unmounted
  const hasConnectedRef = useRef(false); // Track if we've ever connected (to detect reconnects)
  const [latestMessage, setLatestMessage] = useState<any>(null);
  const [messageEvents, setMessageEvents] = useState<SocketMessageEvent<any>[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const clientLatencyTraceStoreRef = useRef(createClientLatencyTraceStore());
  const nextMessageEventIdRef = useRef(1);
  const pendingMessagesRef = useRef<string[]>([]);

  useEffect(() => {
    connect();
    
    return () => {
      unmountedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const connect = useCallback(() => {
    if (unmountedRef.current) return; // Prevent connection if unmounted
    try {
      // Construct WebSocket URL
      const wsUrl = buildWebSocketUrl();
      
      const websocket = new WebSocket(wsUrl);

      websocket.onopen = () => {
        setIsConnected(true);
        wsRef.current = websocket;
        flushQueuedSocketMessages(websocket, pendingMessagesRef.current);
        if (hasConnectedRef.current) {
          // This is a reconnect — signal so components can catch up on missed messages
          setLatestMessage({ type: 'websocket-reconnected', timestamp: Date.now() });
        }
        hasConnectedRef.current = true;
      };

      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const sessionId = extractLatencySessionId(data);
          if (sessionId) {
            markClientLatencyEvent(
              clientLatencyTraceStoreRef.current,
              sessionId,
              'ws_message_first_received',
            );
          }
          const nextMessageEventId = nextMessageEventIdRef.current;
          nextMessageEventIdRef.current += 1;
          setMessageEvents((previous) =>
            appendSocketMessageEvent(previous, data, nextMessageEventId),
          );
          setLatestMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      websocket.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;

        if (unmountedRef.current) {
          return;
        }
        
        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          if (unmountedRef.current) return; // Prevent reconnection if unmounted
          connect();
        }, 3000);
      };

      websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
    }
  }, []);

  const sendMessage = useCallback((message: any): { status: 'sent' | 'queued' } => {
    const result = dispatchSocketMessage({
      socket: wsRef.current,
      message,
      queue: pendingMessagesRef.current,
    });
    return result as { status: 'sent' | 'queued' };
  }, []);

  const value: WebSocketContextType = useMemo(() =>
  ({
    ws: wsRef.current,
    sendMessage,
    latestMessage,
    messageEvents,
    isConnected,
    clientLatencyTraceStore: clientLatencyTraceStoreRef.current,
  }), [sendMessage, latestMessage, messageEvents, isConnected]);

  return value;
};

export const WebSocketProvider = ({ children }: { children: React.ReactNode }) => {
  const webSocketData = useWebSocketProviderState();
  
  return (
    <WebSocketContext.Provider value={webSocketData}>
      {children}
    </WebSocketContext.Provider>
  );
};

export default WebSocketContext;
