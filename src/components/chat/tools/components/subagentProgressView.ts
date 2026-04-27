import type { ProcessTimelineEvent, SubagentChildTool, SubagentProgressState } from '../../types/types';

export type SubagentStatusTone = 'running' | 'completed' | 'degraded' | 'failed' | 'idle';

export interface SubagentProgressView {
  status: {
    label: string;
    tone: SubagentStatusTone;
  };
  activeToolLabel: string;
  latestEvent: ProcessTimelineEvent | null;
  recentSteps: ProcessTimelineEvent[];
  timelineEvents: ProcessTimelineEvent[];
  primaryTimelineEvents: ProcessTimelineEvent[];
  debugTimelineEvents: ProcessTimelineEvent[];
  outputFileName: string;
  headlineStats: string[];
  warningItems: NonNullable<SubagentProgressState['warnings']>;
  warningOverflowCount: number;
  resultPreview: string;
  resultDisplayMode: 'preview' | 'collapsed';
}

export interface SubagentToolHistoryEntry {
  id: string;
  status: 'queued' | 'running' | 'waiting' | 'completed' | 'failed';
}

function getOutputFileName(path: string | undefined) {
  const raw = String(path || '').trim();
  if (!raw) return '';
  const segments = raw.split('/').filter(Boolean);
  return segments.at(-1) || raw;
}

function humanizeCommandLikeLabel(input: string) {
  const text = String(input || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';

  if (/Unable to verify if domain .* is safe to fetch/i.test(text)) {
    return '外部站点安全校验失败，已切换备用方式';
  }

  if (/Sibling tool call errored/i.test(text)) {
    return '并行抓取中的一个步骤失败，已继续后续流程';
  }

  if (/open-meteo/i.test(text)) {
    return '调用 Open-Meteo 获取天气数据';
  }

  if (/wikipedia|wikipedia\.org|api\.php\?action=query/i.test(text)) {
    return '抓取维基百科佛山资料';
  }

  if (/weatherbase|weather-and-climate/i.test(text)) {
    return '尝试抓取外部气候站点资料';
  }

  if (/baike\.baidu/i.test(text)) {
    return '尝试抓取百度百科资料';
  }

  if (/\bcurl\b/i.test(text) && /\bpython3?\b/i.test(text)) {
    return '抓取网页并解析结果';
  }

  if (/\bcurl\b/i.test(text)) {
    return '执行命令行数据抓取';
  }

  if (/\bpython3?\s+-c\b/i.test(text)) {
    return '解析抓取结果';
  }

  return text;
}

function humanizeTimelineEvent(event: ProcessTimelineEvent | null) {
  if (!event) {
    return null;
  }

  const label = humanizeCommandLikeLabel(event.label);
  if (label === event.label) {
    return event;
  }

  return {
    ...event,
    label,
  };
}

function buildHeadlineStats(progress: SubagentProgressState | null | undefined) {
  const stats: string[] = [];

  if (typeof progress?.usage?.toolUses === 'number') {
    stats.push(`${progress.usage.toolUses} 个工具`);
  }

  if (typeof progress?.usage?.totalTokens === 'number') {
    stats.push(`${progress.usage.totalTokens.toLocaleString()} tokens`);
  }

  if (typeof progress?.usage?.durationMs === 'number') {
    stats.push(`${Math.round(progress.usage.durationMs / 1000)}s`);
  } else if (typeof progress?.elapsedTimeSeconds === 'number') {
    stats.push(`${Math.round(progress.elapsedTimeSeconds)}s`);
  }

  return stats;
}

function buildTimelinePartitions(timelineEvents: ProcessTimelineEvent[]) {
  const primaryTimelineEvents = timelineEvents.slice(-3);
  const debugTimelineEvents = timelineEvents.slice(0, Math.max(0, timelineEvents.length - primaryTimelineEvents.length));

  return {
    primaryTimelineEvents,
    debugTimelineEvents,
  };
}

export function buildSubagentToolHistoryEntries(
  childTools: SubagentChildTool[],
  currentToolIndex: number,
): SubagentToolHistoryEntry[] {
  return childTools.map((child, index) => {
    let status: SubagentToolHistoryEntry['status'] = 'completed';

    if (child.toolResult?.isError) {
      status = 'failed';
    } else if (child.toolResult == null) {
      if (index === currentToolIndex) {
        status = 'running';
      } else if (currentToolIndex >= 0 && index > currentToolIndex) {
        status = 'queued';
      } else {
        status = 'queued';
      }
    }

    return {
      id: child.toolId,
      status,
    };
  });
}

export function buildSubagentProgressView(
  progress: SubagentProgressState | null | undefined,
  isComplete: boolean,
  hasError: boolean,
): SubagentProgressView {
  const timeline = Array.isArray(progress?.timeline) ? progress.timeline : [];
  const timelineEvents = timeline.map(event => humanizeTimelineEvent(event) || event);
  const latestEvent = timelineEvents.length > 0 ? timelineEvents[timelineEvents.length - 1] : null;
  const { primaryTimelineEvents, debugTimelineEvents } = buildTimelinePartitions(timelineEvents);
  const allWarningItems = Array.isArray(progress?.warnings) ? progress.warnings : [];
  const warningItems = allWarningItems.slice(0, 2);
  const warningOverflowCount = Math.max(0, allWarningItems.length - warningItems.length);
  const resultPreview = String(progress?.resultPreview || '').trim();
  const hasWarnings = allWarningItems.length > 0;

  let tone: SubagentStatusTone = 'idle';
  let label = '等待中';

  if (hasError) {
    tone = 'failed';
    label = '失败';
  } else if (isComplete || progress?.status === 'completed') {
    if (hasWarnings) {
      tone = 'degraded';
      label = '部分降级完成';
    } else {
      tone = 'completed';
      label = '已完成';
    }
  } else if (progress?.status === 'in_progress' || progress?.status === 'started' || progress?.currentToolName) {
    tone = 'running';
    label = '运行中';
  }

  return {
    status: {
      label,
      tone,
    },
    activeToolLabel: String(progress?.currentToolName || progress?.lastToolName || '').trim(),
    latestEvent,
    recentSteps: primaryTimelineEvents,
    timelineEvents,
    primaryTimelineEvents,
    debugTimelineEvents,
    outputFileName: getOutputFileName(progress?.outputFile),
    headlineStats: buildHeadlineStats(progress),
    warningItems,
    warningOverflowCount,
    resultPreview,
    resultDisplayMode: resultPreview ? 'preview' : 'collapsed',
  };
}
