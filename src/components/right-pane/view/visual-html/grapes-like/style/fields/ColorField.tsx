type ColorFieldProps = {
  label: string;
  value: string;
  placeholder?: string;
  mixed?: boolean;
  disabled?: boolean;
  onCommit: (value: string) => void;
};

function normalizeColorValue(value: string): string {
  const trimmed = value.trim();
  if (/^#([0-9a-f]{6})$/i.test(trimmed)) {
    return trimmed;
  }

  if (/^#([0-9a-f]{3})$/i.test(trimmed)) {
    const [, hex] = trimmed.match(/^#([0-9a-f]{3})$/i) ?? [];
    if (hex) {
      return `#${hex.split('').map((char) => `${char}${char}`).join('')}`;
    }
  }

  return '#000000';
}

export default function ColorField({
  label,
  value,
  placeholder,
  mixed = false,
  disabled = false,
  onCommit,
}: ColorFieldProps) {
  return (
    <label className="gl-field flex w-full min-w-0 flex-1 flex-col gap-0.5 rounded-md text-foreground">
      <span className="text-[10px] font-medium leading-4 text-muted-foreground">{label}</span>
      <div className="flex h-8 min-w-0 items-center gap-1 rounded-md border border-border bg-background px-1 py-1 transition-colors focus-within:bg-accent hover:bg-accent">
        <input
          aria-label={`${label} 颜色块`}
          type="color"
          className="h-4 w-4 shrink-0 rounded-sm border border-border bg-transparent p-0"
          value={normalizeColorValue(value)}
          disabled={disabled}
          onChange={(event) => {
            onCommit(event.target.value);
          }}
        />
        <input
          aria-label={label}
          className="gl-input min-w-0 flex-1 bg-transparent px-0.5 py-0 text-xs leading-4 text-foreground outline-none"
          value={value}
          disabled={disabled}
          placeholder={mixed ? '混合' : placeholder}
          onChange={(event) => {
            onCommit(event.target.value);
          }}
        />
      </div>
    </label>
  );
}
