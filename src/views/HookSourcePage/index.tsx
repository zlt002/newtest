import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useHookSourceDetail } from '../../components/hooks/hooks/useHookSourceDetail';
import type { HookSourceDetailResponse } from '../../components/hooks/types';

type HookSourcePageProps = {
  initialData?: HookSourceDetailResponse;
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

function getReadonlyReason(kind?: string | null) {
  switch (kind) {
    case 'plugin':
      return 'This source is read-only because it is contributed by an installed plugin.';
    case 'skill':
      return 'This source is read-only because it comes from a skill package.';
    case 'subagent':
      return 'This source is read-only because it is generated from a subagent definition.';
    default:
      return 'This source is read-only in the hooks editor.';
  }
}

function getReadonlyGuidance(kind?: string | null, path?: string | null) {
  switch (kind) {
    case 'plugin':
      return path
        ? `请去上游 plugin 定义或其原文件修改：${path}`
        : '请去上游 plugin 定义处修改，然后重新加载当前页面。';
    case 'skill':
      return path
        ? `请去上游 skill 包或其原文件修改：${path}`
        : '请去上游 skill 包定义处修改，然后重新加载当前页面。';
    case 'subagent':
      return path
        ? `请去上游 subagent 定义或其原文件修改：${path}`
        : '请去上游 subagent 定义处修改，然后重新加载当前页面。';
    default:
      return path
        ? `请去这个原文件修改：${path}`
        : '请去该 hooks 来源的上游配置处修改。';
  }
}

export default function HookSourcePage({ initialData }: HookSourcePageProps) {
  const { sourceId } = useParams<{ sourceId: string }>();
  const [searchParams] = useSearchParams();
  const queryString = searchParams.toString();
  const { data, isLoading, error, reload } = useHookSourceDetail({
    sourceId,
    query: queryString,
    initialData,
  });
  const backToHooks = queryString ? `/hooks?${queryString}` : '/hooks';

  return (
    <main className={pageContainerClassName}>
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-2">
          <Link className="text-sm text-sky-300 hover:text-sky-200" to={backToHooks}>
            Back to Hooks
          </Link>
          <div className="text-sm uppercase tracking-[0.2em] text-neutral-500">Hook Source</div>
          <h1 className="text-3xl font-semibold text-white">{data?.source?.label || data?.source?.id || sourceId || 'Source Detail'}</h1>
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

        {isLoading && !data ? (
          <section className={panelClassName}>
            <p className="text-sm text-neutral-300">Loading source detail...</p>
          </section>
        ) : null}

        {data ? (
          <div className="space-y-4">
            <section className={panelClassName}>
              <h2 className="text-lg font-medium text-white">Normalized</h2>
              <div className="mt-4 space-y-4">
                {data.normalized?.entries?.length ? (
                  <ul className="space-y-3 text-sm">
                    {data.normalized.entries.map((entry) => (
                      <li key={entry.id} className="rounded-md border border-neutral-800 p-3">
                        <div className="font-medium text-neutral-100">{entry.id}</div>
                        <div className="mt-1 text-neutral-400">{[entry.event, entry.matcher].filter(Boolean).join(' / ') || entry.sourceId}</div>
                        <div className="mt-3">{renderJsonPreview(entry)}</div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-neutral-400">No normalized entries found.</p>
                )}
              </div>
            </section>

            <section className={panelClassName}>
              <h2 className="text-lg font-medium text-white">Raw</h2>
              <div className="mt-4">{renderJsonPreview(data.raw)}</div>
            </section>

            <section className={panelClassName}>
              <h2 className="text-lg font-medium text-white">About Source</h2>
              <div className="mt-4 space-y-3 text-sm text-neutral-300">
                {data.source ? (
                  <>
                    <dl className="grid gap-2 sm:grid-cols-[140px_1fr]">
                      <dt className="text-neutral-500">ID</dt>
                      <dd>{data.source.id}</dd>
                      <dt className="text-neutral-500">Kind</dt>
                      <dd>{data.source.kind}</dd>
                      <dt className="text-neutral-500">Writable</dt>
                      <dd>{data.source.writable ? 'Yes' : 'No'}</dd>
                      {data.source.path ? (
                        <>
                          <dt className="text-neutral-500">Path</dt>
                          <dd className="break-all">{data.source.path}</dd>
                        </>
                      ) : null}
                    </dl>
                    {!data.source.writable ? (
                      <div className="rounded-md border border-amber-700/40 bg-amber-950/20 p-3 text-sm text-amber-100">
                        <p>{getReadonlyReason(data.source.kind)}</p>
                        <p className="mt-2">{getReadonlyGuidance(data.source.kind, data.source.path || null)}</p>
                      </div>
                    ) : null}
                  </>
                ) : null}
                <div>{renderJsonPreview(data.aboutSource)}</div>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
