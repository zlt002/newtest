import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../../shared/view/ui';
import { cn } from '../../../../lib/utils';
import type { Project, ProjectSession } from '../../../../types/app';
import { sanitizeDisplayText } from '../../../chat/utils/protocolNoise.js';

type MainContentSessionSwitcherProps = {
  selectedProject: Project;
  selectedSession: ProjectSession | null;
  onNavigateToSession: (targetSessionId: string) => void;
  onStartNewSession: (project: Project) => void;
};

function getSessionLabel(session: ProjectSession | null, fallback: string): string {
  if (!session) {
    return fallback;
  }

  return sanitizeDisplayText(session.summary || session.title || session.name || '', fallback);
}

function getSessionTimestamp(session: ProjectSession): number {
  const rawValue =
    session.lastActivity ||
    session.updated_at ||
    session.createdAt ||
    session.created_at ||
    '';

  const timestamp = rawValue ? new Date(rawValue).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export default function MainContentSessionSwitcher({
  selectedProject,
  selectedSession,
  onNavigateToSession,
  onStartNewSession,
}: MainContentSessionSwitcherProps) {
  const { t: tCommon } = useTranslation();
  const { t: tSidebar } = useTranslation('sidebar');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const newSessionLabel = tSidebar('sessions.newSession');
  const currentSessionLabel = getSessionLabel(selectedSession, tCommon('mainContent.newSession'));
  const sessionOptions = useMemo(() => {
    return [...(selectedProject.sessions ?? [])].sort(
      (left, right) => getSessionTimestamp(right) - getSessionTimestamp(left),
    );
  }, [selectedProject.sessions]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div className="flex h-full w-full min-w-0 items-center gap-2" ref={rootRef}>
      <div className="relative min-w-0 flex-1 self-stretch md:w-1/2 md:flex-none">
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={tSidebar('sessions.title')}
          className="flex h-full w-full min-w-0 items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-0 text-left shadow-sm transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={() => setOpen((current) => !current)}
        >
          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <div className="truncate text-sm font-semibold leading-tight text-foreground">
              {currentSessionLabel}
            </div>
            <div className="truncate text-[10px] leading-tight text-muted-foreground">
              {selectedProject.displayName}
            </div>
          </div>
          <ChevronDown
            className={cn('h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
          />
        </button>

        {open && (
          <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-xl border border-border/70 bg-background shadow-xl">
            <div className="border-b border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground">
              {tSidebar('sessions.title')}
            </div>

            <div className="max-h-80 overflow-y-auto p-2" role="listbox" aria-label={tSidebar('sessions.title')}>
              {sessionOptions.length === 0 ? (
                <div className="px-2 py-3 text-sm text-muted-foreground">
                  {tSidebar('sessions.noSessions')}
                </div>
              ) : (
                sessionOptions.map((session) => {
                  const isSelected = session.id === selectedSession?.id;

                  return (
                    <button
                      key={session.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={cn(
                        'flex w-full items-center rounded-lg px-2.5 py-2 text-left transition-colors',
                        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
                      )}
                      onClick={() => {
                        setOpen(false);
                        onNavigateToSession(session.id);
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {getSessionLabel(session, tCommon('mainContent.untitledSession'))}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {selectedProject.displayName}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      <Button
        type="button"
        size="sm"
        className="h-full flex-shrink-0 self-stretch rounded-lg px-3"
        onClick={() => onStartNewSession(selectedProject)}
      >
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">{newSessionLabel}</span>
      </Button>
    </div>
  );
}
