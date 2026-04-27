// 测试里继续沿用旧名字，底层实现直接复用生产默认的内存 run-state store，
// 避免测试路径和默认实现长期漂移。
import { createInMemoryRunStateStore } from '../application/in-memory-run-state-store.js';

export function createInMemoryAgentV2Repository() {
  return createInMemoryRunStateStore();
}
