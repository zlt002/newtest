export type SelectOption = {
  value: string;
  label: string;
};

export function getSelectLabel(options: SelectOption[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? options[0]?.label ?? '';
}
