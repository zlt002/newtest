import type { ReactNode } from 'react';
import type { HookEntry, HookMatcherDefinition } from '../../../components/hooks/types';

type HookMatcherEditorProps = {
  entry: HookEntry;
  matcherDefinition?: HookMatcherDefinition | null;
  children?: ReactNode;
};

function renderMatcherValue(value?: string | null) {
  return value && value.trim() ? value : 'Any matcher';
}

export default function HookMatcherEditor({
  entry,
  matcherDefinition,
  children,
}: HookMatcherEditorProps) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/80 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-sm font-medium text-white">{entry.event || 'Unknown event'}</div>
        <div className="rounded-full border border-neutral-700 px-2 py-1 text-xs text-neutral-300">
          {renderMatcherValue(entry.matcher)}
        </div>
        {matcherDefinition?.enabled === false ? (
          <div className="rounded-full border border-amber-700/60 px-2 py-1 text-xs text-amber-200">
            disabled
          </div>
        ) : null}
      </div>
      {matcherDefinition?.timeout ? (
        <p className="mt-2 text-xs text-neutral-500">Timeout: {matcherDefinition.timeout}ms</p>
      ) : null}
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}
