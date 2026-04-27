import { Link, useSearchParams } from 'react-router-dom';
import { useHookExecutions } from '../../components/hooks/hooks/useHookExecutions';
import type { HookExecutionSummary } from '../../components/hooks/types';

type HookExecutionsPageProps = {
  initialData?: HookExecutionSummary[];
};

const pageContainerClassName = 'min-h-screen bg-neutral-950 px-4 py-6 text-neutral-100 sm:px-6';
const panelClassName = 'rounded-lg border border-neutral-800 bg-neutral-900/80 p-4';

function buildExecutionDetailLink(execution: HookExecutionSummary, queryString: string) {
  const params = new URLSearchParams(queryString);
  if (execution.runId) {
    params.set('runId', execution.runId);
  }
  if (execution.sessionId) {
    params.set('sessionId', execution.sessionId);
  }
  if (execution.hookEvent) {
    params.set('hookEvent', execution.hookEvent);
  }
  if (execution.hookName) {
    params.set('hookName', execution.hookName);
  }

  const suffix = params.toString();
  return `/hooks/executions/${encodeURIComponent(execution.hookId)}${suffix ? `?${suffix}` : ''}`;
}

export default function HookExecutionsPage({ initialData }: HookExecutionsPageProps) {
  const [searchParams] = useSearchParams();
  const queryString = searchParams.toString();
  const { data, isLoading, error, reload } = useHookExecutions({
    query: queryString,
    initialData,
  });
  const executions = Array.isArray(data) ? data : [];

  return (
    <main className={pageContainerClassName}>
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-2">
          <Link className="text-sm text-sky-300 hover:text-sky-200" to={queryString ? `/hooks?${queryString}` : '/hooks'}>
            Back to Hooks
          </Link>
          <div className="text-sm uppercase tracking-[0.2em] text-neutral-500">Hooks</div>
          <h1 className="text-3xl font-semibold text-white">Hook Executions</h1>
          <div className="flex gap-3">
            <button
              className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-500"
              onClick={() => {
                void reload();
              }}
              type="button"
            >
              Reload
            </button>
            {queryString ? <code className="rounded-md bg-neutral-900 px-3 py-2 text-xs text-neutral-400">{queryString}</code> : null}
          </div>
        </header>

        {error ? (
          <section className={panelClassName}>
            <h2 className="text-lg font-medium text-white">Load Error</h2>
            <p className="mt-2 text-sm text-rose-300">{error}</p>
          </section>
        ) : null}

        {isLoading && executions.length === 0 ? (
          <section className={panelClassName}>
            <p className="text-sm text-neutral-300">Loading hook executions...</p>
          </section>
        ) : null}

        {executions.length > 0 ? (
          <section className={panelClassName}>
            <ul className="space-y-3 text-sm">
              {executions.map((execution, index) => (
                <li className="rounded-md border border-neutral-800 p-3" key={`${execution.hookId}:${execution.runId || 'run'}:${index}`}>
                  <Link
                    className="font-medium text-sky-300 hover:text-sky-200"
                    to={buildExecutionDetailLink(execution, queryString)}
                  >
                    {execution.hookName || execution.hookId}
                  </Link>
                  <div className="mt-1 text-neutral-400">
                    {[execution.hookEvent, execution.runId, execution.sessionId, execution.status].filter(Boolean).join(' · ')}
                  </div>
                  <div className="mt-2 grid gap-2 text-xs text-neutral-500 sm:grid-cols-2">
                    <div>Started: {execution.startedAt || 'n/a'}</div>
                    <div>Updated: {execution.updatedAt || execution.createdAt || 'n/a'}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!isLoading && executions.length === 0 && !error ? (
          <section className={panelClassName}>
            <p className="text-sm text-neutral-400">No hook executions found.</p>
          </section>
        ) : null}
      </div>
    </main>
  );
}
