// V2 默认服务出口。
// 路由层和 WebSocket 层都复用这里的单例实例，避免装配逻辑散落各处。
import { createAgentV2Services } from './application/create-agent-v2-services.js';
import { createInMemoryRunStateStore } from './application/in-memory-run-state-store.js';
import { createSdkDebugLog } from './debug/sdk-debug-log.js';
import { createSessionHistoryService } from './history/session-history-service.js';
import { createOfficialHistoryReader } from './history/official-history-reader.js';
import { createClaudeV2SessionPool } from './runtime/claude-v2-session-pool.js';
import { db, sessionNamesDb } from '../../database/db.js';

function createNoopSdkDebugLog() {
  return {
    append() {
      return null;
    },
    listBySession() {
      return [];
    },
    hasSessionLogs() {
      return false;
    },
    trim() {
      return 0;
    },
  };
}

// 默认主链使用进程内 run-state；official history 和 debug log 仍各自走旁路。
export const defaultAgentV2Repository = createInMemoryRunStateStore();
export const defaultAgentV2DebugLog = (() => {
  try {
    return createSdkDebugLog({ db });
  } catch {
    return createNoopSdkDebugLog();
  }
})();
// 运行时依赖 SDK V2 session pool。
export const defaultAgentV2Runtime = createClaudeV2SessionPool();
export const defaultSessionHistoryService = createSessionHistoryService({
  officialHistoryReader: createOfficialHistoryReader(),
  sessionNamesDb,
  debugLog: defaultAgentV2DebugLog,
});
// 对外暴露的默认 services 实例，路由和 WebSocket 入口都直接复用它。
export const defaultAgentV2Services = createAgentV2Services({
  repo: defaultAgentV2Repository,
  runtime: defaultAgentV2Runtime,
  sessionHistoryService: defaultSessionHistoryService,
  debugLog: defaultAgentV2DebugLog,
});
