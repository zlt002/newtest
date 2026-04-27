import type { CSSProperties } from 'react';

type SelectOption = {
  value: string;
  label: string;
};

type SelectFieldProps = {
  label: string;
  value: string;
  options: readonly (string | SelectOption)[];
  mixed?: boolean;
  disabled?: boolean;
  onCommit: (value: string) => void;
};

function normalizeOption(option: string | SelectOption): SelectOption {
  return typeof option === 'string' ? { value: option, label: option } : option;
}

export default function SelectField({
  label,
  value,
  options,
  mixed = false,
  disabled = false,
  onCommit,
}: SelectFieldProps) {
  const selectStyle: CSSProperties = {
    appearance: 'none',
    backgroundImage: 'none',
    WebkitAppearance: 'none',
  };

  return (
    <label className="gl-field flex w-full min-w-0 flex-1 flex-col gap-0.5 rounded-md text-foreground">
      <span className="text-[10px] font-medium leading-4 text-muted-foreground">{label}</span>
      <div className="relative min-w-0">
        <select
          aria-label={label}
          className="gl-input h-8 w-full min-w-0 appearance-none rounded-md border border-border bg-background px-1.5 py-0 text-xs leading-4 text-foreground outline-none transition-colors hover:bg-accent focus:bg-accent"
          style={selectStyle}
          value={value}
          disabled={disabled}
          onChange={(event) => {
            onCommit(event.target.value);
          }}
        >
          <option value="">{mixed ? '混合' : ''}</option>
          {options.map((option) => {
            const normalized = normalizeOption(option);
            return (
              <option key={normalized.value} value={normalized.value}>
                {normalized.label}
              </option>
            );
          })}
        </select>
      </div>
    </label>
  );
}
