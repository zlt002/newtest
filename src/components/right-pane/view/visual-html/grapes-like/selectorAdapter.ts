import { EMPTY_SELECTOR_SNAPSHOT, EMPTY_SELECTOR_STATE, type SelectorSnapshot, type SelectorSource, type SelectorState } from './types.ts';

const SELECTOR_STATE_VALUES = ['', 'hover', 'active', 'focus'] as const;
const SELECTOR_STATE_OPTIONS = [
  { id: '', label: '默认状态' },
  { id: 'hover', label: '悬停' },
  { id: 'active', label: '激活' },
  { id: 'focus', label: '聚焦' },
] as const;

export function normalizeSelectorStateValue(value: unknown): string {
  const nextValue = String(value ?? '').trim();
  return SELECTOR_STATE_VALUES.includes(nextValue as (typeof SELECTOR_STATE_VALUES)[number]) ? nextValue : '';
}

function normalizeClassTags(classes: SelectorSource['classes']): string[] {
  if (!classes) {
    return [];
  }

  const values = Array.isArray(classes) ? classes : String(classes).split(/\s+/);
  return values.map((value) => String(value).trim()).filter(Boolean);
}

function getCommonClasses(selected: readonly SelectorSource[]): SelectorSnapshot['commonClasses'] {
  if (selected.length === 0) {
    return [];
  }

  const normalized = selected.map((item) => new Set(normalizeClassTags(item.classes)));
  const [first, ...rest] = normalized;

  return Array.from(first)
    .filter((className) => rest.every((entry) => entry.has(className)))
    .map((name) => ({ name }));
}

export function readSelectorSnapshot(source: {
  selected?: readonly SelectorSource[] | null;
  activeState?: unknown;
  getSelectedAll?: () => readonly SelectorSource[] | null | undefined;
  getState?: () => unknown;
} | null | undefined): SelectorSnapshot {
  const selected = Array.isArray(source?.selected)
    ? source.selected
    : source?.getSelectedAll?.() ?? [];
  const activeState = source && 'activeState' in source
    ? source.activeState
    : source?.getState?.();

  return {
    ...EMPTY_SELECTOR_SNAPSHOT,
    availableStates: [...SELECTOR_STATE_OPTIONS],
    activeState: normalizeSelectorStateValue(activeState),
    commonClasses: getCommonClasses(selected),
  };
}

export function readSelectorState(source: SelectorSource | null | undefined): SelectorState {
  if (!source) {
    return { ...EMPTY_SELECTOR_STATE, classTags: [] };
  }

  const name = String(source.name ?? source.label ?? source.type ?? 'Component').trim();
  const id = String(source.id ?? '').trim();
  const selectedLabel = [name, id ? `#${id}` : ''].filter(Boolean).join(' ').trim();

  return {
    selectedLabel,
    activeState: normalizeSelectorStateValue(source.state),
    classTags: normalizeClassTags(source.classes),
  };
}
