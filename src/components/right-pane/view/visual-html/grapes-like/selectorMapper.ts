// @ts-ignore - Node's strip-types runtime resolves the .ts specifier; tsc flags it without allowImportingTsExtensions.
import { normalizeSelectorStateValue } from './selectorAdapter.ts';
// @ts-ignore - Node's strip-types runtime resolves the .ts specifier; tsc flags it without allowImportingTsExtensions.
import type { SelectorState } from './types.ts';

export function applySelectorPatch(current: SelectorState, patch: Partial<SelectorState>): SelectorState {
  return {
    selectedLabel: patch.selectedLabel ?? current.selectedLabel,
    activeState: patch.activeState ?? current.activeState,
    classTags: patch.classTags ?? current.classTags,
  };
}

function normalizeClassName(className: string) {
  return String(className ?? '').trim();
}

export function addClass(component: any, className: string) {
  const nextClassName = normalizeClassName(className);
  if (!nextClassName || !component?.addClass) {
    return;
  }

  component.addClass(nextClassName);
}

export function removeClass(component: any, className: string) {
  const nextClassName = normalizeClassName(className);
  if (!nextClassName || !component?.removeClass) {
    return;
  }

  component.removeClass(nextClassName);
}

export function setState(component: any, state: string) {
  if (!component?.setState) {
    return;
  }

  component.setState(normalizeSelectorStateValue(state));
}

export const addClassToComponent = addClass;
export const removeClassFromComponent = removeClass;
export const setComponentState = setState;
