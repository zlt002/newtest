import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useHookExecutions } from '../../components/hooks/hooks/useHookExecutions';
import type { HookExecutionDetail } from '../../components/hooks/types';

type HookExecutionDetailPageProps = {
  initialData?: HookExecutionDetail;
};

const pageContainerClassName = 'min-h-screen bg-neutral-950 px-4 py-6 text-neutral-100 sm:px-6';
const panelClassName = 'rounded-lg border border-neutral-800 bg-neutral-900/80 p-4';

const stringifyJson = (value: unknown) => JSON.stringify(value, null, 2);

function renderJsonPreview(value: unknown) {
  return (
    <pre className="overflow-x-auto rounded-md bg-neutral-950/80 p-3 text-xs text-neutral-300">
      {stringifyJson(value)}
    </pre>
  );
}

export default function HookExecutionDetailPage({ initialData }: HookExecutionDetailPageProps) {
  const { hookId } = useParams<{ hookId: string }>();
  const [searchParams] = useSearchParams();
  const queryString = searchParams.toString();
  const { data, isLoading, error, reload } = useHookExecutions({
    hookId,
    query: queryString,
    initialData,
  });
  const detail = data && !Array.isArray(data) ? data : null;
  const backToExecutions = queryString ? `/hooks/executions?${queryString}` : '/hooks/executions';

  return (
    <main className={pageContainerClassName}>
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-2">
          <Link className="text-sm text-sky-300 hover:text-sky-200" to={backToExecutions}>
            Back to Hook Executions
          </Link>
          <div className="text-sm uppercase tracking-[0.2em] text-neutral-500">Hooks</div>
          <h1 className="text-3xl font-semibold text-white">{detail?.hookName || hookId || 'Hook Execution Detail'}</h1>
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

        {isLoading && !detail ? (
          <section className={panelClassName}>
            <p className="text-sm text-neutral-300">Loading hook execution detail...</p>
          </section>
        ) : null}

        {detail ? (
          <div className="space-y-4">
            <section className={panelClassName}>
              <h2 className="text-lg font-medium text-white">Lifecycle</h2>
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-[140px_1fr]">
                <dt className="text-neutral-500">Hook ID</dt>
                <dd>{detail.hookId}</dd>
                <dt className="text-neutral-500">Run ID</dt>
                <dd>{detail.runId || 'n/a'}</dd>
                <dt className="text-neutral-500">Session ID</dt>
                <dd>{detail.sessionId || 'n/a'}</dd>
                <dt className="text-neutral-500">Event</dt>
                <dd>{detail.hookEvent || 'n/a'}</dd>
                <dt className="text-neutral-500">Status</dt>
                <dd>{detail.status || 'n/a'}</dd>
                <dt className="text-neutral-500">Outcome</dt>
                <dd>{detail.outcome || 'n/a'}</dd>
                <dt className="text-neutral-500">Started At</dt>
                <dd>{detail.startedAt || 'n/a'}</dd>
                <dt className="text-neutral-500">Updated At</dt>
                <dd>{detail.updatedAt || 'n/a'}</dd>
              </dl>
              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <div>
                  <div className="mb-2 text-sm font-medium text-neutral-200">Started Event</div>
                  {renderJsonPreview(detail.started)}
                </div>
                <div>
                  <div className="mb-2 text-sm font-medium text-neutral-200">Progress Events</div>
                  {renderJsonPreview(detail.progress || [])}
                </div>
                <div>
                  <div className="mb-2 text-sm font-medium text-neutral-200">Response Event</div>
                  {renderJsonPreview(detail.response)}
                </div>
              </div>
            </section>

            <section className={panelClassName}>
              <h2 className="text-lg font-medium text-white">stdout</h2>
              <div className="mt-4">{renderJsonPreview(detail.stdout || '')}</div>
            </section>

            <section className={panelClassName}>
              <h2 className="text-lg font-medium text-white">stderr</h2>
              <div className="mt-4">{renderJsonPreview(detail.stderr || '')}</div>
            </section>

            <section className={panelClassName}>
              <h2 className="text-lg font-medium text-white">Exit Code</h2>
              <div className="mt-4 text-2xl font-semibold text-white">{detail.exitCode ?? 'n/a'}</div>
            </section>

            <section className={panelClassName}>
              <h2 className="text-lg font-medium text-white">Raw Payload</h2>
              <div className="mt-4">{renderJsonPreview(detail.raw)}</div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
