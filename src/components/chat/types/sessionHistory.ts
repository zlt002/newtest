export type CanonicalSessionMessageRole = 'user' | 'assistant' | 'tool';

export type CanonicalSessionMessage = {
  id: string;
  sessionId: string | null;
  role: CanonicalSessionMessageRole;
  text: string | null;
  timestamp: string;
  kind: string | null;
  type: string | null;
  toolName?: string | null;
  toolInput?: unknown;
  toolId?: string | null;
  isError?: boolean;
  content?: unknown;
};

export type SessionHistoryMetadata = {
  title: string | null;
  pinned: boolean;
  starred: boolean;
  lastViewedAt: string | null;
};

export type SessionHistoryResponse = {
  sessionId: string;
  cwd: string | null;
  metadata: SessionHistoryMetadata;
  messages: CanonicalSessionMessage[];
  diagnosticsSummary: {
    officialMessageCount: number;
    debugLogAvailable: boolean;
    agentMessageCount: number;
    debugAugmentedCount: number;
    historySourceCoverage: string | null;
  };
};
