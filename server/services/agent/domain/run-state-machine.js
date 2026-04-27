// V2 run 状态机。
// 它把原始事件序列压缩成 run 的生命周期状态，作为前后端判断 loading / 终态的依据。
import { createAgentEventEnvelope } from './agent-event.js';

export { createAgentEventEnvelope };

// run 的生命周期状态。
// 所有 UI loading / streaming / error 都应该从这里派生，而不是在前端散落判断。
export const RUN_STATES = [
  'queued',
  'starting',
  'streaming',
  'waiting_for_tool',
  'completing',
  'completed',
  'failed',
  'aborted',
];

// 每一种事件都会驱动 run 状态向前推进。
// 这个映射是 V2 的“状态机真相来源”。
const TRANSITIONS = {
  queued: {
    'run.started': 'starting',
    'run.failed': 'failed',
    'run.aborted': 'aborted',
  },
  starting: {
    'assistant.message.started': 'streaming',
    'assistant.message.delta': 'streaming',
    'tool.call.started': 'waiting_for_tool',
    'run.completed': 'completed',
    'run.failed': 'failed',
    'run.aborted': 'aborted',
  },
  streaming: {
    'assistant.message.delta': 'streaming',
    'assistant.message.completed': 'completing',
    'tool.call.started': 'waiting_for_tool',
    'run.completed': 'completed',
    'run.failed': 'failed',
    'run.aborted': 'aborted',
  },
  waiting_for_tool: {
    'tool.call.delta': 'waiting_for_tool',
    'tool.call.completed': 'streaming',
    'tool.call.failed': 'failed',
    'run.failed': 'failed',
    'run.aborted': 'aborted',
  },
  completing: {
    'run.completed': 'completed',
    'run.failed': 'failed',
    'run.aborted': 'aborted',
  },
  completed: {},
  failed: {},
  aborted: {},
};

// 根据当前状态和新事件类型，计算下一状态。
// 如果转移非法，说明事件顺序或协议出现了问题，应该尽早暴露。
export function advanceRunState(currentState, eventType) {
  const nextState = TRANSITIONS[currentState]?.[eventType];
  if (!nextState) {
    throw new Error(`Illegal run transition: ${currentState} -> ${eventType}`);
  }
  return nextState;
}
