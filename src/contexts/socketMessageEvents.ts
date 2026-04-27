export interface SocketMessageEvent<T = unknown> {
  id: number;
  data: T;
}

export function appendSocketMessageEvent<T>(
  events: SocketMessageEvent<T>[],
  nextData: T,
  nextId: number,
  maxEvents = 200,
): SocketMessageEvent<T>[] {
  const nextEvent = { id: nextId, data: nextData };
  const trimmedEvents =
    events.length >= maxEvents ? events.slice(events.length - maxEvents + 1) : events;

  return [...trimmedEvents, nextEvent];
}

export function getUnseenSocketMessageEvents<T>(
  events: SocketMessageEvent<T>[],
  lastSeenId: number,
): SocketMessageEvent<T>[] {
  return events.filter((event) => event.id > lastSeenId);
}
