import type { HookAction } from '../../../components/hooks/types';

type HookActionFormProps = {
  action: HookAction;
  index: number;
  onChange?: (nextAction: HookAction) => void;
};

const panelClassName = 'rounded-md border border-neutral-800 bg-neutral-950/70 p-3';

function renderLabel(action: HookAction) {
  return typeof action.type === 'string' && action.type.trim() ? action.type : 'unknown';
}

function FieldLabel({ children }: { children: string }) {
  return (
    <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">{children}</div>
  );
}

function renderInputField({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: unknown;
  onChange?: (nextValue: string) => void;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <input
        className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
        name={name}
        onChange={(event) => onChange?.(event.target.value)}
        type="text"
        value={typeof value === 'string' ? value : ''}
      />
    </label>
  );
}

function renderTextareaField({
  label,
  name,
  value,
  onChange,
  rows = 4,
}: {
  label: string;
  name: string;
  value: unknown;
  onChange?: (nextValue: string) => void;
  rows?: number;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <textarea
        className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
        name={name}
        onChange={(event) => onChange?.(event.target.value)}
        rows={rows}
        value={typeof value === 'string' ? value : ''}
      />
    </label>
  );
}

function renderActionFields(action: HookAction, onChange?: (nextAction: HookAction) => void) {
  const updateField = (field: string, value: string) => {
    onChange?.({
      ...action,
      [field]: value,
    });
  };

  switch (action.type) {
    case 'command':
      return renderTextareaField({
        label: 'Command',
        name: 'command',
        value: action.command,
        onChange: (nextValue) => updateField('command', nextValue),
      });
    case 'http':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {renderInputField({
            label: 'Method',
            name: 'method',
            value: action.method,
            onChange: (nextValue) => updateField('method', nextValue),
          })}
          {renderInputField({
            label: 'URL',
            name: 'url',
            value: action.url,
            onChange: (nextValue) => updateField('url', nextValue),
          })}
        </div>
      );
    case 'prompt':
      return renderTextareaField({
        label: 'Prompt',
        name: 'prompt',
        value: action.prompt,
        onChange: (nextValue) => updateField('prompt', nextValue),
      });
    case 'agent':
      return (
        <div className="space-y-3">
          {renderInputField({
            label: 'Agent',
            name: 'agent',
            value: action.agent,
            onChange: (nextValue) => updateField('agent', nextValue),
          })}
          {renderTextareaField({
            label: 'Prompt',
            name: 'prompt',
            value: action.prompt,
            onChange: (nextValue) => updateField('prompt', nextValue),
          })}
        </div>
      );
    default:
      return renderTextareaField({
        label: 'Payload',
        name: 'payload',
        value: JSON.stringify(action, null, 2),
        rows: 6,
      });
  }
}

export default function HookActionForm({ action, index, onChange }: HookActionFormProps) {
  return (
    <article className={panelClassName}>
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium text-neutral-100">{renderLabel(action)}</div>
        <div className="text-xs text-neutral-500">Action {index + 1}</div>
      </div>
      <div className="mt-3 space-y-3">
        <label className="block">
          <FieldLabel>Action Type</FieldLabel>
          <select
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
            name="actionType"
            onChange={(event) => onChange?.({ ...action, type: event.target.value })}
            value={renderLabel(action)}
          >
            <option value="command">command</option>
            <option value="http">http</option>
            <option value="prompt">prompt</option>
            <option value="agent">agent</option>
          </select>
        </label>
        {renderActionFields(action, onChange)}
      </div>
    </article>
  );
}
