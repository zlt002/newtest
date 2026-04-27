// V2 run 的状态定义。
// 这个类型帮助前端把状态机结果表达成可展示、可判断的快照。
export type RunStatus =
  | 'queued'
  | 'starting'
  | 'streaming'
  | 'waiting_for_tool'
  | 'completing'
  | 'completed'
  | 'failed'
  | 'aborted';

export type RunState = {
  runId: string;
  status: RunStatus;
  userInput: string;
  assistantText: string;
  error: string | null;
};
