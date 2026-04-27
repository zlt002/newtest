import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ClaudeEffortLevel } from '../../constants/thinkingModes';
import type { PermissionMode, Provider } from '../../types/types';
import ThinkingModeSelector from './ThinkingModeSelector';
import ClaudeModelSelector from './ClaudeModelSelector';

interface ChatInputControlsProps {
  menuPosition?: { top: number; left: number; bottom?: number };
  onOpenImagePicker: () => void;
  permissionMode: PermissionMode | string;
  onModeSwitch: () => void;
  provider: Provider | string;
  claudeModel: string;
  setClaudeModel: React.Dispatch<React.SetStateAction<string>>;
  thinkingMode: ClaudeEffortLevel;
  setThinkingMode: React.Dispatch<React.SetStateAction<ClaudeEffortLevel>>;
  tokenBudget: { used?: number; total?: number } | null;
  slashCommandsCount: number;
  onToggleCommandMenu: () => void;
  hasInput: boolean;
  onClearInput: () => void;
}

export default function ChatInputControls({
  menuPosition,
  onOpenImagePicker,
  permissionMode,
  onModeSwitch,
  provider,
  claudeModel,
  setClaudeModel,
  thinkingMode,
  setThinkingMode,
  slashCommandsCount,
  onToggleCommandMenu,
  hasInput,
  onClearInput,
}: ChatInputControlsProps) {
  const { t } = useTranslation('chat');
  const permissionModeLabel =
    permissionMode === 'acceptEdits'
      ? t('input.permissionModes.acceptEdits')
      : permissionMode === 'dontAsk'
        ? t('input.permissionModes.dontAsk')
      : permissionMode === 'bypassPermissions'
        ? t('input.permissionModes.bypassPermissions')
        : permissionMode === 'plan'
          ? t('input.permissionModes.plan')
          : t('input.permissionModes.default');

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={onOpenImagePicker}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
        title={t('input.attachImages')}
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </button>



      {provider === 'claude' && (
        <>
          <ClaudeModelSelector
            value={claudeModel}
            onChange={setClaudeModel}
            title={t('input.modelSelector')}
            menuPosition={menuPosition}
          />
          <ThinkingModeSelector
            selectedMode={thinkingMode}
            onModeChange={setThinkingMode}
            onClose={() => {}}
            className=""
            menuPosition={menuPosition}
          />
        </>
      )}

      <button
        type="button"
        onClick={onToggleCommandMenu}
        className="relative inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
        title={t('input.showAllCommands')}
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
          />
        </svg>
        {slashCommandsCount > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground"
          >
            {slashCommandsCount}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={onModeSwitch}
        className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-medium transition-all duration-200 ${
          permissionMode === 'default'
            ? 'border-border/60 bg-muted/50 text-muted-foreground hover:bg-muted'
            : permissionMode === 'dontAsk'
              ? 'border-red-300/60 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-600/40 dark:bg-red-900/15 dark:text-red-300 dark:hover:bg-red-900/25'
            : permissionMode === 'acceptEdits'
              ? 'border-green-300/60 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-600/40 dark:bg-green-900/15 dark:text-green-300 dark:hover:bg-green-900/25'
              : permissionMode === 'bypassPermissions'
                ? 'border-orange-300/60 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:border-orange-600/40 dark:bg-orange-900/15 dark:text-orange-300 dark:hover:bg-orange-900/25'
                : 'border-primary/20 bg-primary/5 text-primary hover:bg-primary/10'
        }`}
        title={t('input.clickToChangeMode')}
      >
        <div className="flex items-center gap-1.5">
          <div
            className={`h-1.5 w-1.5 rounded-full ${
              permissionMode === 'default'
                ? 'bg-muted-foreground'
                : permissionMode === 'dontAsk'
                  ? 'bg-red-500'
                : permissionMode === 'acceptEdits'
                  ? 'bg-green-500'
                  : permissionMode === 'bypassPermissions'
                    ? 'bg-orange-500'
                    : 'bg-primary'
            }`}
          />
          <span>
            {permissionModeLabel}
          </span>
        </div>
      </button>
      {hasInput && (
        <button
          type="button"
          onClick={onClearInput}
          className="group inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-background/80 shadow-sm transition-all duration-200 hover:bg-accent/60"
          title={t('input.clearInput')}
        >
          <svg
            className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
