type SelectionComponent = {
  getId?: () => string;
  getName?: () => string;
  getType?: () => string;
  get?: (key: string) => unknown;
} | null;

export type SelectedComponentSummary = {
  selectedIds: string[];
  primarySelectedId: string | null;
  selectedLabel: string;
  isMultiSelection: boolean;
  revision: number;
};

function readStringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function readSelectedComponentSummary(component: SelectionComponent): SelectedComponentSummary {
  const id = readStringValue(component?.getId?.() ?? component?.get?.('id'));
  const name = readStringValue(component?.getName?.() ?? component?.getType?.()) || '组件';

  return {
    selectedIds: id ? [id] : [],
    primarySelectedId: id || null,
    selectedLabel: id ? `${name} #${id}` : '',
    isMultiSelection: false,
    revision: 0,
  };
}

export function createSelectionFeedbackController() {
  let revision = 0;

  return {
    beginSelection(component: SelectionComponent) {
      revision += 1;

      return {
        ...readSelectedComponentSummary(component),
        revision,
      };
    },
    isRevisionCurrent(candidate: number) {
      return candidate === revision;
    },
  };
}
