// V2 输入框上下文条。
// 它只负责把 run 的状态和简短标签展示出来，不掺杂任何事件处理逻辑。
import React from 'react';
import { useTranslation } from 'react-i18next';

export function ComposerContextBar({
  status,
  label,
  blockedOnDecision = false,
}: {
  status: 'idle' | 'queued' | 'starting' | 'streaming' | 'waiting_for_tool' | 'completed' | 'failed' | 'aborted';
  label: string;
  blockedOnDecision?: boolean;
}) {
  const { t } = useTranslation('chat');
  const toneClass = status === 'failed'
    ? 'border-red-900/60 bg-red-950/30 text-red-100'
    : blockedOnDecision
      ? 'border-amber-900/60 bg-amber-950/30 text-amber-100'
      : 'border-neutral-700 bg-neutral-900/60 text-neutral-200';
  const statusLabel = t(`composerContext.statuses.${status}`);

  return React.createElement(
    'div',
    {
      'data-chat-v2-composer-context': 'true',
      className: `rounded-xl border px-3 py-2 text-xs ${toneClass}`,
    },
    React.createElement('span', { className: 'font-medium' }, statusLabel),
    React.createElement('span', { className: 'ml-2' }, label),
  );
}
