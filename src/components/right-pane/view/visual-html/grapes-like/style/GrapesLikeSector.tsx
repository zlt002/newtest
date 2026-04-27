import type { ReactNode } from 'react';
import type { StyleSectorKey } from '../types';

type GrapesLikeSectorProps = {
  sectorKey?: StyleSectorKey;
  title: string;
  hint?: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
};

export default function GrapesLikeSector({
  sectorKey,
  title,
  hint,
  expanded,
  onToggle,
  children,
}: GrapesLikeSectorProps) {
  return (
    <section data-style-sector={sectorKey ?? title.toLowerCase()} className="gl-sector border-b">
      <button
        type="button"
        className="gl-sector-title flex w-full items-center justify-between gap-1 border-border px-2 py-1.5 text-left"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="break-words text-[12px] font-medium text-foreground">{title}</span>
          {hint ? <span className="text-[10px] leading-4 text-muted-foreground">{hint}</span> : null}
        </span>
        <span aria-hidden="true" className="text-[11px] text-muted-foreground">
          {expanded ? '▾' : '▸'}
        </span>
      </button>
      {expanded ? <div className="gl-sector-body flex w-full flex-col px-2 pb-2">{children}</div> : null}
    </section>
  );
}
