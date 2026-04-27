export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type HookSource = {
  id: string;
  kind: string;
  label?: string | null;
  writable?: boolean;
  path?: string | null;
  description?: string | null;
  [key: string]: unknown;
};

export type HookEntry = {
  id: string;
  sourceId: string;
  event?: string | null;
  matcher?: string | null;
  hooks?: JsonValue[] | null;
  origin?: string | null;
  raw?: JsonValue;
  [key: string]: unknown;
};

export type HookDiagnostic = {
  code?: string | null;
  message?: string | null;
  [key: string]: unknown;
};

export type HookCapabilities = {
  writableKinds?: string[];
  readonlyKinds?: string[];
};

export type HooksOverviewResponse = {
  sources: HookSource[];
  entries: HookEntry[];
  diagnostics: HookDiagnostic[];
  capabilities: HookCapabilities;
};

export type EffectiveHooksResponse = {
  sources: HookSource[];
  entries: HookEntry[];
  groupedByEvent: Record<string, HookEntry[]>;
  writableSources: HookSource[];
  readonlySources: HookSource[];
  sessionHooks: JsonValue[];
  diagnostics: HookDiagnostic[];
};

export type HookExecutionSummary = {
  hookId: string;
  hookName?: string | null;
  hookEvent?: string | null;
  runId?: string | null;
  sessionId?: string | null;
  status?: string | null;
  outcome?: string | null;
  startedAt?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  [key: string]: unknown;
};

export type HookAction = {
  type: string;
  [key: string]: unknown;
};

export type HookMatcherDefinition = {
  matcher?: string | null;
  hooks?: HookAction[] | null;
  timeout?: number | null;
  enabled?: boolean | null;
  [key: string]: unknown;
};

export type HookExecutionLifecycleEvent = {
  type?: string | null;
  timestamp?: string | null;
  payload?: JsonValue | Record<string, unknown> | null;
  [key: string]: unknown;
};

export type HookExecutionDetail = HookExecutionSummary & {
  stdout?: string | null;
  stderr?: string | null;
  output?: string | null;
  exitCode?: number | null;
  started?: HookExecutionLifecycleEvent | null;
  progress?: HookExecutionLifecycleEvent[];
  response?: HookExecutionLifecycleEvent | null;
  raw?: JsonValue | Record<string, unknown> | null;
};

export type HooksOverviewPageData = HooksOverviewResponse & {
  effective: EffectiveHooksResponse;
  recentExecutions: HookExecutionSummary[];
};

export type HookSourceDetailResponse = {
  source: HookSource | null;
  raw: JsonValue;
  normalized: {
    entries: HookEntry[];
    [key: string]: unknown;
  } | null;
  aboutSource: {
    [key: string]: unknown;
  } | null;
};

export type HookEditorData = HookSourceDetailResponse;
