import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useHookEditor } from '../../components/hooks/hooks/useHookEditor';
import type { HookAction, HookEditorData, HookEntry, HookMatcherDefinition, JsonValue } from '../../components/hooks/types';
import HookActionForm from '../HooksPage/subcomponents/HookActionForm';
import HookMatcherEditor from '../HooksPage/subcomponents/HookMatcherEditor';

type HookEditorPageProps = {
  initialData?: HookEditorData;
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

function getMatcherDefinition(entry: HookEntry, raw: HookEditorData['raw']): HookMatcherDefinition | null {
  const rawHooks = raw && typeof raw === 'object' && 'hooks' in raw ? raw.hooks : null;
  const eventHooks = rawHooks && typeof rawHooks === 'object' && !Array.isArray(rawHooks)
    ? rawHooks[entry.event || '']
    : null;

  if (!Array.isArray(eventHooks)) {
    return null;
  }

  const matchingEntry = eventHooks.find((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return false;
    }

    return (candidate.matcher ?? '') === (entry.matcher ?? '');
  });

  return matchingEntry && typeof matchingEntry === 'object' && !Array.isArray(matchingEntry)
    ? matchingEntry as HookMatcherDefinition
    : null;
}

function getActions(entry: HookEntry): HookAction[] {
  return Array.isArray(entry.hooks) ? entry.hooks as HookAction[] : [];
}

function parseMatcherIndex(entryId: string) {
  const segments = entryId.split(':');
  const matcherIndex = Number.parseInt(segments.at(-1) || '', 10);
  return Number.isInteger(matcherIndex) && matcherIndex >= 0 ? matcherIndex : 0;
}

function updateDraftData(
  currentData: HookEditorData,
  entryIndex: number,
  nextActions: HookAction[],
) {
  const normalizedEntries = currentData.normalized?.entries ? [...currentData.normalized.entries] : [];
  const targetEntry = normalizedEntries[entryIndex];
  if (!targetEntry) {
    return currentData;
  }

  const nextEntry = {
    ...targetEntry,
    hooks: nextActions as JsonValue[],
  };
  normalizedEntries[entryIndex] = nextEntry;

  const nextRaw = currentData.raw && typeof currentData.raw === 'object' && !Array.isArray(currentData.raw)
    ? { ...currentData.raw }
    : currentData.raw;

  if (nextRaw && typeof nextRaw === 'object' && !Array.isArray(nextRaw) && 'hooks' in nextRaw) {
    const rawHooks = nextRaw.hooks;
    if (rawHooks && typeof rawHooks === 'object' && !Array.isArray(rawHooks)) {
      const eventKey = targetEntry.event || '';
      const eventEntries = Array.isArray(rawHooks[eventKey]) ? [...rawHooks[eventKey]] : [];
      const matcherIndex = parseMatcherIndex(targetEntry.id);
      const currentMatcher = eventEntries[matcherIndex];
      if (currentMatcher && typeof currentMatcher === 'object' && !Array.isArray(currentMatcher)) {
        eventEntries[matcherIndex] = {
          ...currentMatcher,
          hooks: nextActions as JsonValue,
        };
        nextRaw.hooks = {
          ...rawHooks,
          [eventKey]: eventEntries,
        };
      }
    }
  }

  return {
    ...currentData,
    normalized: currentData.normalized
      ? {
          ...currentData.normalized,
          entries: normalizedEntries,
        }
      : currentData.normalized,
    raw: nextRaw,
  };
}

export default function HookEditorPage({ initialData }: HookEditorPageProps) {
  const { sourceKind } = useParams<{ sourceKind: string }>();
  const [searchParams] = useSearchParams();
  const queryString = searchParams.toString();
  const { data, isLoading, isSaving, error, saveMessage, reload, saveHooks } = useHookEditor({
    sourceKind,
    query: queryString,
    initialData,
  });
  const backToHooks = queryString ? `/hooks?${queryString}` : '/hooks';
  const writeTargetLabel = data?.source?.path || data?.source?.id || sourceKind || 'Unknown target';
  const isSessionMemorySource = (data?.source?.kind || sourceKind) === 'session-memory';
  const [draftData, setDraftData] = useState<HookEditorData | null>(data ?? null);
  const [selectedEntryIndex, setSelectedEntryIndex] = useState(0);
  const [selectedActionIndex, setSelectedActionIndex] = useState(0);
  const [rawJsonText, setRawJsonText] = useState(data ? stringifyJson(data.raw) : '');
  const [rawJsonError, setRawJsonError] = useState<string | null>(null);

  useEffect(() => {
    setDraftData(data ?? null);
    setSelectedEntryIndex(0);
    setSelectedActionIndex(0);
    setRawJsonText(data ? stringifyJson(data.raw) : '');
    setRawJsonError(null);
  }, [data]);

  const entries = draftData?.normalized?.entries || [];
  const selectedEntry = entries[selectedEntryIndex] || null;
  const selectedActions = selectedEntry ? getActions(selectedEntry) : [];
  const selectedAction = selectedActions[selectedActionIndex] || null;
  const eventOptions = Array.from(new Set(entries.map((entry) => entry.event || 'Unknown event')));

  const updateSelectedAction = (nextAction: HookAction) => {
    if (!draftData || !selectedEntry) {
      return;
    }

    const nextActions = selectedActions.map((action, index) => (
      index === selectedActionIndex ? nextAction : action
    ));
    const nextDraftData = updateDraftData(draftData, selectedEntryIndex, nextActions);
    setDraftData(nextDraftData);
    setRawJsonText(stringifyJson(nextDraftData.raw));
  };

  const handleSave = () => {
    const fallbackHooks = draftData?.raw && typeof draftData.raw === 'object' && !Array.isArray(draftData.raw) && 'hooks' in draftData.raw
      ? draftData.raw.hooks
      : null;

    try {
      const parsed = JSON.parse(rawJsonText) as { hooks?: unknown };
      const hooks = parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.hooks
        ? parsed.hooks
        : fallbackHooks;

      if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) {
        setRawJsonError('Raw JSON must include a hooks object.');
        return;
      }

      setRawJsonError(null);
      void saveHooks(hooks as Record<string, unknown>);
    } catch {
      setRawJsonError('Raw JSON is invalid.');
    }
  };

  return (
    <main className={pageContainerClassName}>
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-2">
          <Link className="text-sm text-sky-300 hover:text-sky-200" to={backToHooks}>
            Back to Hooks
          </Link>
          <div className="text-sm uppercase tracking-[0.2em] text-neutral-500">Hooks</div>
          <h1 className="text-3xl font-semibold text-white">Hook Editor</h1>
          <p className="max-w-3xl text-sm text-neutral-400">
            Thin editor view for writable hook sources. This page focuses on structure visibility before richer UX.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-500"
              onClick={() => {
                void reload();
              }}
              type="button"
            >
              Reload
            </button>
            <button
              className="rounded-md border border-sky-700 px-3 py-2 text-sm text-sky-100 hover:border-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSaving || !data?.raw || typeof data.raw !== 'object' || !('hooks' in data.raw)}
              onClick={() => {
                handleSave();
              }}
              type="button"
            >
              {isSaving ? 'Saving...' : 'Save Raw Hooks'}
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

        {saveMessage ? (
          <section className={panelClassName}>
            <p className="text-sm text-emerald-300">{saveMessage}</p>
          </section>
        ) : null}

        {isLoading && !data ? (
          <section className={panelClassName}>
            <p className="text-sm text-neutral-300">Loading hook editor...</p>
          </section>
        ) : null}

        {data ? (
          <div className="space-y-4">
            <section className={panelClassName}>
              <h2 className="text-lg font-medium text-white">Write Target</h2>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-[160px_1fr]">
                <div className="text-neutral-500">Source Kind</div>
                <div>{data.source?.kind || sourceKind || 'unknown'}</div>
                <div className="text-neutral-500">Source ID</div>
                <div>{data.source?.id || 'unknown'}</div>
                <div className="text-neutral-500">Writable Target</div>
                <div className="break-all">{writeTargetLabel}</div>
              </div>
              {isSessionMemorySource ? (
                <p className="mt-4 text-sm text-amber-200">
                  仅当前会话生效。关闭或切换会话后，这个 session-memory hooks 来源不会继续生效。
                </p>
              ) : null}
            </section>

            <section className={panelClassName}>
              <h2 className="text-lg font-medium text-white">Matchers</h2>
              <div className="mt-4 space-y-4">
                {entries.length ? (
                  <HookMatcherEditor
                    entry={selectedEntry || entries[0]}
                    matcherDefinition={selectedEntry && draftData ? getMatcherDefinition(selectedEntry, draftData.raw) : null}
                  >
                    <div className="space-y-4">
                      <div>
                        <div className="mb-2 text-sm font-medium text-neutral-200">Event Selector</div>
                        <select
                          className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
                          onChange={(event) => {
                            const nextIndex = entries.findIndex((entry) => (entry.event || 'Unknown event') === event.target.value);
                            setSelectedEntryIndex(nextIndex >= 0 ? nextIndex : 0);
                            setSelectedActionIndex(0);
                          }}
                          value={selectedEntry?.event || eventOptions[0] || ''}
                        >
                          {eventOptions.map((eventName, index) => (
                            <option key={`${eventName}:${index}`} value={eventName}>{eventName}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <div className="mb-2 text-sm font-medium text-neutral-200">Action List Editor</div>
                        {selectedActions.length ? (
                          <div className="flex flex-wrap gap-2">
                            {selectedActions.map((action, index) => (
                              <button
                                className={`rounded-md border px-3 py-2 text-sm ${
                                  index === selectedActionIndex
                                    ? 'border-sky-500 bg-sky-950/40 text-sky-100'
                                    : 'border-neutral-700 text-neutral-300'
                                }`}
                                key={`${selectedEntry?.id || 'entry'}:${action.type}:${index}`}
                                onClick={() => {
                                  setSelectedActionIndex(index);
                                }}
                                type="button"
                              >
                                {index + 1}. {action.type}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-neutral-400">No actions in this matcher.</p>
                        )}
                      </div>

                      <div>
                        <div className="mb-2 text-sm font-medium text-neutral-200">Action Form</div>
                        {selectedAction ? (
                          <HookActionForm
                            action={selectedAction}
                            index={selectedActionIndex}
                            onChange={updateSelectedAction}
                          />
                        ) : (
                          <p className="text-sm text-neutral-400">Select an action to edit its fields.</p>
                        )}
                      </div>
                    </div>
                  </HookMatcherEditor>
                ) : (
                  <p className="text-sm text-neutral-400">No normalized matchers found.</p>
                )}
              </div>
            </section>

            <section className={panelClassName}>
              <h2 className="text-lg font-medium text-white">Raw JSON Drawer</h2>
              <div className="mt-4">
                <details className="rounded-md border border-neutral-800 bg-neutral-950/70 p-3">
                  <summary className="cursor-pointer text-sm text-neutral-200">Open Raw JSON</summary>
                  <div className="mt-3 space-y-3">
                    <textarea
                      className="min-h-[240px] w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-neutral-100"
                      onChange={(event) => {
                        setRawJsonText(event.target.value);
                        setRawJsonError(null);
                      }}
                      value={rawJsonText}
                    />
                    {rawJsonError ? <p className="text-sm text-rose-300">{rawJsonError}</p> : null}
                  </div>
                </details>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
