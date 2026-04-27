interface DispatchResult {
  status: 'sent' | 'queued';
}

const encodeSocketMessage = (message: unknown): string => JSON.stringify(message);

export const flushQueuedSocketMessages = (socket: WebSocket | null, queue: string[]): number => {
  if (!socket || socket.readyState !== WebSocket.OPEN || queue.length === 0) {
    return 0;
  }

  let flushed = 0;
  while (queue.length > 0) {
    const nextPayload = queue.shift();
    if (typeof nextPayload !== 'string') {
      continue;
    }
    socket.send(nextPayload);
    flushed += 1;
  }
  return flushed;
};

interface DispatchParams {
  socket: WebSocket | null;
  message: unknown;
  queue: string[];
  logger?: Pick<Console, 'warn'>;
}

export const dispatchSocketMessage = ({
  socket,
  message,
  queue,
  logger = console,
}: DispatchParams): DispatchResult => {
  const payload = encodeSocketMessage(message);
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(payload);
    return { status: 'sent' };
  }

  queue.push(payload);
  logger.warn('WebSocket not connected, message queued');
  return { status: 'queued' };
};
