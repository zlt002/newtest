# Claude Hooks 验证清单

本项目验证 hooks 是否与官方 Claude Agent SDK 落地一致，建议按下面 3 层执行。

## 1. SDK 契约层

目标：确认当前项目依赖的 SDK 版本与官方 hooks 类型面没有漂移。

执行命令：

```bash
node --test server/agent-v2/runtime/claude-v2-sdk-contract.test.mjs
```

重点校验：

- SDK 是否固定在当前项目声明版本
- 官方 `HOOK_EVENTS` 是否完整暴露
- `HookEvent` 与 `HookInput` 联合类型是否包含全部官方 hooks
- `PreToolUse` 是否支持 `allow | deny | ask | defer`
- `PreToolUse` 是否支持 `updatedInput`
- `Notification` 是否支持 `additionalContext`
- 通用 hook 输出是否支持 `continue` 与 `systemMessage`

## 2. 项目实现层

目标：确认项目内 hooks 聚合、路由和执行记录没有偏离官方语义。

执行命令：

```bash
node --test \
  server/hooks/claude-hooks-discovery.test.mjs \
  server/hooks/claude-hooks-router.test.mjs \
  server/hooks/claude-hooks-events.test.mjs
```

重点校验：

- 多来源 hooks 是否都能被发现并标准化
- `event` / `matcher` / `sourceId` 是否正确归一化
- `effective hooks` 是否按事件分组
- `recent executions` 是否能从 `started / progress / response` 正确折叠
- 同一 `hookId` 多次运行时，是否能区分为不同 execution
- query 参数过滤是否完整透传到 hooks API

## 3. 真实冒烟层

目标：确认真实运行时和 UI 观察结果与官方 hooks 行为一致。

推荐步骤：

1. 在项目 hooks 配置里增加一个最小 `PreToolUse` hook，例如匹配 `Edit` 或 `Bash`
2. 再增加一个 `Stop` hook
3. 触发一次真实任务，让 Claude 走到对应工具调用和结束阶段
4. 打开 Hooks 页面或 Hooks 弹窗，观察以下四块

需要看到：

- `Effective Hooks` 出现预期事件和 matcher
- `Sources` 显示正确来源以及 `writable / read-only`
- `Recent Executions` 出现对应 hook 的执行记录
- `Diagnostics` 没有异常，或异常内容与当前配置问题一致

## 页面定位

相关页面和数据入口：

- `src/components/hooks/view/HooksOverviewContent.tsx`
- `src/components/hooks/hooks/useHooksOverview.ts`
- `src/components/hooks/api/hooksApi.ts`

这三个文件负责把 `/api/hooks/overview`、`/api/hooks/effective`、`/api/hooks/events` 聚合成当前 hooks 观测页面。

## 注意事项

- 不要用 `npm test -- <file>` 代替 `node --test <file>`，当前仓库的 `npm test` 会把整套测试一起跑起来
- 如果全量测试失败，先确认失败是否真的来自 hooks 相关测试
- SDK 升级后，优先看 `claude-v2-sdk-contract.test.mjs` 是否先红；这通常意味着官方契约变了，不一定是你项目实现错了
