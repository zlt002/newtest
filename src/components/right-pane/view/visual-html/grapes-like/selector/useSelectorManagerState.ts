import { normalizeSelectorStateValue } from '../selectorAdapter';
import type { SelectorSnapshot } from '../types';

type SelectorManagerHandlers = {
  addClass: (className: string) => void;
  removeClass: (className: string) => void;
  setState: (state: string) => void;
};

export function createSelectorManagerActions(handlers: SelectorManagerHandlers) {
  return {
    addClass(className: string) {
      const nextClassName = String(className ?? '').trim();
      if (!nextClassName) {
        return;
      }

      handlers.addClass(nextClassName);
    },
    removeClass(className: string) {
      const nextClassName = String(className ?? '').trim();
      if (!nextClassName) {
        return;
      }

      handlers.removeClass(nextClassName);
    },
    changeState(state: string) {
      handlers.setState(normalizeSelectorStateValue(state));
    },
  };
}

export function createSelectorManagerRuntime({
  state,
  classInputValue,
  setClassInputValue,
  handlers,
}: {
  state: SelectorSnapshot;
  classInputValue: string;
  setClassInputValue: (value: string) => void;
  handlers: SelectorManagerHandlers;
}) {
  const actions = createSelectorManagerActions(handlers);
  const normalizedState = {
    ...state,
    activeState: normalizeSelectorStateValue(state.activeState),
  };
  const addCurrentClass = () => {
    actions.addClass(classInputValue);
    setClassInputValue('');
  };

  return {
    classInputValue,
    setClassInputValue,
    state: normalizedState,
    addClass: addCurrentClass,
    handleAddButtonClick: addCurrentClass,
    handleClassInputKeyDown(event: { key: string; preventDefault?: () => void }) {
      if (event.key !== 'Enter') {
        return;
      }

      event.preventDefault?.();
      addCurrentClass();
    },
    handleStateChange: actions.changeState,
    removeClass: actions.removeClass,
  };
}

export function useSelectorManagerState(
  state: SelectorSnapshot,
  handlers: SelectorManagerHandlers,
  classInputValue: string,
  setClassInputValue: (value: string) => void,
) {
  return createSelectorManagerRuntime({
    state,
    handlers,
    classInputValue,
    setClassInputValue,
  });
}
