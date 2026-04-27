import crypto from 'crypto';

import { createAgentEventEnvelope } from '../domain/agent-event.js';

export function createInMemoryRunStateStore() {
  const sessions = new Map();
  const runs = new Map();
  const runEvents = new Map();

  return {
    async createSession({ sessionId, title }) {
      const normalizedSessionId = String(sessionId || '').trim();
      const existing = sessions.get(normalizedSessionId);
      const record = {
        id: normalizedSessionId,
        title,
        createdAt: existing?.createdAt || new Date().toISOString(),
      };
      sessions.set(record.id, record);
      return record;
    },
    async getSession(sessionId) {
      return sessions.get(sessionId) || null;
    },
    async createRun({ sessionId, userInput }) {
      const record = {
        id: crypto.randomUUID(),
        sessionId,
        userInput,
        status: 'queued',
        createdAt: new Date().toISOString(),
      };
      runs.set(record.id, record);
      return record;
    },
    async listSessionRuns(sessionId) {
      return [...runs.values()]
        .filter((run) => run.sessionId === sessionId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async getSessionHistory(sessionId) {
      const sessionRuns = await this.listSessionRuns(sessionId);
      const eventsByRun = {};

      for (const run of sessionRuns) {
        eventsByRun[run.id] = await this.listRunEvents(run.id);
      }

      return {
        sessionId,
        runs: sessionRuns,
        eventsByRun,
      };
    },
    async getRun(runId) {
      return runs.get(runId) || null;
    },
    async updateRun(runId, patch) {
      const current = runs.get(runId);
      if (!current) {
        return null;
      }

      const next = { ...current, ...patch };
      runs.set(runId, next);
      return next;
    },
    async markRunAbortedIfActive(runId) {
      const current = runs.get(runId);
      if (!current || ['completed', 'failed', 'aborted'].includes(current.status)) {
        return null;
      }

      const next = { ...current, status: 'aborted' };
      runs.set(runId, next);
      return next;
    },
    async appendRunEvent(event) {
      const list = runEvents.get(event.runId) || [];
      list.push(event);
      list.sort((a, b) => a.sequence - b.sequence);
      runEvents.set(event.runId, list);
      return event;
    },
    async markRunPersistenceDegraded(runId, message) {
      const currentRun = runs.get(runId) || null;
      if (!currentRun) {
        return null;
      }

      const existingEvents = runEvents.get(runId) || [];
      const nextSequence = existingEvents.reduce((max, event) => Math.max(max, event.sequence), 0) + 1;
      return this.appendRunEvent(createAgentEventEnvelope({
        runId,
        sessionId: currentRun.sessionId || null,
        sequence: nextSequence,
        type: 'run.status_changed',
        payload: {
          status: 'degraded',
          warning: message,
          reason: 'persistence_failure',
        },
      }));
    },
    async listRunEvents(runId) {
      return runEvents.get(runId) || [];
    },
    async listSessionEvents(sessionId) {
      return [...runEvents.values()]
        .flat()
        .filter((event) => event.sessionId === sessionId)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.sequence - b.sequence);
    },
    async findLatestRunBySessionId(sessionId) {
      const matches = [...runs.values()].filter((run) => run.sessionId === sessionId);
      return matches.at(-1) || null;
    },
    async listAllEvents() {
      return [...runEvents.values()].flat();
    },
  };
}
