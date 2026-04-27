type ComposerStatus =
  | 'queued'
  | 'starting'
  | 'streaming'
  | 'waiting_for_tool'
  | 'completed'
  | 'failed'
  | 'aborted';

type ExecutionLike = {
  status?: string | null;
  assistantText?: string | null;
} | null;

type AgentComposerStateInput = {
  isLoading: boolean;
  claudeStatusText: string | null;
  execution: ExecutionLike;
};

const ACTIVE_EXECUTION_STATUSES = new Set([
  'queued',
  'starting',
  'streaming',
  'waiting_for_tool',
  'completing',
]);

function labelForExecutionStatus(status: string, fallback: string | null) {
  switch (status) {
    case 'queued':
      return '排队中';
    case 'starting':
      return '正在启动';
    case 'streaming':
    case 'completing':
      return '正在接收回复';
    case 'waiting_for_tool':
      return '等待工具结果';
    default:
      return fallback || '处理中';
  }
}

export function resolveAgentComposerState({
  isLoading,
  claudeStatusText,
  execution,
}: AgentComposerStateInput): {
  status: ComposerStatus;
  label: string;
} {
  const executionStatus = String(execution?.status || '').trim();
  const shortStatusLabel = labelForExecutionStatus(executionStatus, claudeStatusText);

  if (ACTIVE_EXECUTION_STATUSES.has(executionStatus)) {
    const status: ComposerStatus = executionStatus === 'completing'
      ? 'streaming'
      : (executionStatus as Exclude<ComposerStatus, 'completed' | 'failed' | 'aborted'>);

    return {
      status,
      label: shortStatusLabel,
    };
  }

  if (isLoading) {
    return {
      status: 'streaming',
      label: claudeStatusText || '思考中',
    };
  }

  return {
    status: 'completed',
    label: '准备开始下一轮',
  };
}
