import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { ScrollArea } from '../../shared/view/ui/index.js';
import { useHooksOverview } from '../../components/hooks/hooks/useHooksOverview';
import type { HookEntry, HookExecutionSummary, HookSource, HooksOverviewPageData, JsonValue } from '../../components/hooks/types';

type HooksOverviewContentProps = {
  initialData?: HooksOverviewPageData;
  queryString?: string;
  embedded?: boolean;
  reload?: () => void;
  isLoading?: boolean;
};

const panelClassName = 'rounded-xl border border-border bg-card/95 p-4 shadow-sm';

const stringifyJson = (value: unknown) => JSON.stringify(value, null, 2);

const renderJsonPreview = (value: unknown) => (
  <pre className="overflow-x-auto rounded-lg border border-border/70 bg-background/80 p-3 text-xs text-muted-foreground">
    {stringifyJson(value)}
  </pre>
);

function renderSourceLabel(source: HookSource) {
  return source.label || source.id;
}

function renderEntrySummary(entry: HookEntry) {
  return [entry.event, entry.matcher].filter(Boolean).join(' / ') || entry.id;
}

export function getRecentExecutionKey(execution: HookExecutionSummary, index: number) {
  const timestamp =
    execution.startedAt
    || execution.updatedAt
    || execution.createdAt
    || (typeof execution.started === 'string' ? execution.started : null)
    || (typeof execution.timestamp === 'string' ? execution.timestamp : null)
    || 'na';

  return [
    execution.runId || 'run',
    execution.sessionId || 'session',
    execution.hookId || 'hook',
    timestamp,
    index,
  ].join(':');
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={panelClassName}>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SourceList({
  sources,
  queryString,
  embedded,
}: {
  sources: HookSource[];
  queryString: string;
  embedded: boolean;
}) {
  if (sources.length === 0) {
    return <p className="text-sm text-muted-foreground">未找到源文件。</p>;
  }

  const suffix = queryString ? `?${queryString}` : '';

  return (
    <ul className="space-y-3 text-sm">
      {sources.map((source) => (
        <li key={source.id} className="rounded-lg border border-border/80 bg-background/40 p-3">
          {embedded ? (
            <div className="font-medium text-foreground">{renderSourceLabel(source)}</div>
          ) : (
            <Link className="font-medium text-primary hover:underline" to={`/hooks/sources/${encodeURIComponent(source.id)}${suffix}`}>
              {renderSourceLabel(source)}
            </Link>
          )}
          <div className="mt-1 text-muted-foreground">
            <span>{source.kind}</span>
            <span>{source.writable ? ' · 可写' : ' · 只读'}</span>
          </div>
          {source.path ? <div className="mt-1 break-all text-xs text-muted-foreground/80">{source.path}</div> : null}
        </li>
      ))}
    </ul>
  );
}

function EffectiveHookList({ entries }: { entries: HookEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">未找到有效钩子。</p>;
  }

  return (
    <ul className="space-y-3 text-sm">
      {entries.map((entry) => {
        const [isExpanded, setIsExpanded] = useState(false);

        return (
          <li key={entry.id} className="rounded-lg border border-border/80 bg-background/40 p-3">
            <div className="font-medium text-foreground">{entry.id}</div>
            <button
              className="mt-1 flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {renderEntrySummary(entry)}
            </button>
            {isExpanded && entry.hooks ? (
              <div className="mt-3">
                {renderJsonPreview(entry.hooks as JsonValue)}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function RecentExecutionList({ recentExecutions }: { recentExecutions: HooksOverviewPageData['recentExecutions'] }) {
  if (recentExecutions.length === 0) {
    return <p className="text-sm text-muted-foreground">未找到最近的执行记录。</p>;
  }

  return (
    <ul className="space-y-3 text-sm">
      {recentExecutions.map((execution, index) => (
        <li key={getRecentExecutionKey(execution, index)} className="rounded-lg border border-border/80 bg-background/40 p-3">
          <div className="font-medium text-foreground">{execution.hookName || execution.hookId}</div>
          <div className="mt-1 text-muted-foreground">
            {[execution.hookEvent, execution.runId, execution.sessionId].filter(Boolean).join(' · ')}
          </div>
          {renderJsonPreview(execution)}
        </li>
      ))}
    </ul>
  );
}

function DiagnosticsList({
  diagnostics,
  capabilities,
}: {
  diagnostics: HooksOverviewPageData['diagnostics'];
  capabilities: HooksOverviewPageData['capabilities'];
}) {
  return (
    <div className="space-y-4 text-sm">
      {diagnostics.length === 0 ? (
        <p className="text-muted-foreground">未报告诊断信息。</p>
      ) : (
        <ul className="space-y-3">
          {diagnostics.map((diagnostic, index) => (
            <li key={`${diagnostic.code || 'diagnostic'}-${index}`} className="rounded-lg border border-border/80 bg-background/40 p-3">
              <div className="font-medium text-foreground">{diagnostic.code || `Diagnostic ${index + 1}`}</div>
              <div className="mt-1 text-muted-foreground">{diagnostic.message || '未提供消息。'}</div>
            </li>
          ))}
        </ul>
      )}
      <div>
        <div className="mb-2 font-medium text-foreground">功能</div>
        {renderJsonPreview(capabilities)}
      </div>
    </div>
  );
}

export default function HooksOverviewContent({
  initialData,
  queryString = '',
  embedded = false,
  reload: propReload,
  isLoading: propIsLoading,
}: HooksOverviewContentProps) {
  const { data, isLoading: hookIsLoading, error, reload: hookReload } = useHooksOverview({
    query: queryString,
    initialData,
  });

  const isLoading = propIsLoading !== undefined ? propIsLoading : hookIsLoading;
  const reload = propReload !== undefined ? propReload : hookReload;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {error ? (
        <section className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">加载错误</h2>
              <p className="mt-1 text-sm text-destructive">{error}</p>
            </div>
          </div>
        </section>
      ) : null}

      {isLoading && !data ? (
        <section className={`mt-4 ${panelClassName}`}>
          <p className="text-sm text-muted-foreground">正在加载钩子概览...</p>
        </section>
      ) : null}

      {data ? (
        <ScrollArea className="mt-4 min-h-0 flex-1 pr-1">
          <div className="grid gap-4 pb-2 lg:grid-cols-2">
            <SectionCard title="有效钩子">
              <EffectiveHookList entries={data.effective.entries} />
            </SectionCard>

            <SectionCard title="源文件">
              <SourceList sources={data.sources} queryString={queryString} embedded={embedded} />
            </SectionCard>

            <SectionCard title="最近执行">
              <RecentExecutionList recentExecutions={data.recentExecutions} />
            </SectionCard>

            <SectionCard title="诊断信息">
              <DiagnosticsList diagnostics={data.diagnostics} capabilities={data.capabilities} />
            </SectionCard>
          </div>
        </ScrollArea>
      ) : null}
    </div>
  );
}
