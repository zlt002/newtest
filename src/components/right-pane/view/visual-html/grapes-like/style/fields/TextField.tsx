import type { ChangeEvent } from 'react';

type TextFieldProps = {
  label: string;
  value: string;
  placeholder?: string;
  mixed?: boolean;
  disabled?: boolean;
  onCommit: (value: string) => void;
};

export default function TextField({
  label,
  value,
  placeholder,
  mixed = false,
  disabled = false,
  onCommit,
}: TextFieldProps) {
  return (
    <label className="gl-field flex w-full min-w-0 flex-1 flex-col gap-0.5 rounded-md text-foreground">
      <span className="text-[10px] font-medium leading-4 text-muted-foreground">{label}</span>
      <input
        aria-label={label}
        className="gl-input h-8 w-full min-w-0 rounded-md border border-border bg-background px-1.5 py-0 text-xs leading-4 text-foreground outline-none transition-colors hover:bg-accent focus:bg-accent"
        placeholder={mixed ? '混合' : placeholder}
        value={value}
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          onCommit(event.target.value);
        }}
      />
    </label>
  );
}
