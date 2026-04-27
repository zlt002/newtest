import { useEffect, useRef, useState } from 'react';
import type { InspectorSelection, SelectorSnapshot } from '../types';
import GrapesLikeClassTag from './GrapesLikeClassTag';
import { useSelectorManagerState } from './useSelectorManagerState';

type GrapesLikeSelectorManagerProps = {
  selection: InspectorSelection;
  selector: SelectorSnapshot;
  actions: {
    addClass: (className: string) => void;
    removeClass: (className: string) => void;
    setState: (state: string) => void;
  };
};

export default function GrapesLikeSelectorManager({
  selection,
  selector,
  actions,
}: GrapesLikeSelectorManagerProps) {
  const [classInputValue, setClassInputValue] = useState('');
  const [isAddingClass, setIsAddingClass] = useState(false);
  const classInputRef = useRef<HTMLInputElement | null>(null);
  const selectorState = useSelectorManagerState(
    selector,
    actions,
    classInputValue,
    setClassInputValue,
  );

  useEffect(() => {
    if (isAddingClass) {
      classInputRef.current?.focus();
    }
  }, [isAddingClass]);

  const handleStartAddClass = () => {
    setIsAddingClass(true);
  };

  const handleCommitClass = () => {
    selectorState.handleAddButtonClick();
    setIsAddingClass(false);
  };

  const handleCancelAddClass = () => {
    setClassInputValue('');
    setIsAddingClass(false);
  };

  return (
    <section
      data-selector-manager="true"
      className="w-full min-w-0 border-b p-2 text-card-foreground"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[12px] font-medium text-foreground">{selection.isMultiSelection ? ` ${selection.selectedIds.length} elements` : `${selection.selectedLabel || 'None'}`}</h2>
        <div className="relative min-w-0 shrink-0">
          <select
            aria-label="状态"
            className="gl-input h-8 w-[92px] appearance-none rounded-md border border-border bg-background py-0 pl-1.5 pr-2 text-xs leading-4 text-foreground outline-none transition-colors hover:bg-accent focus:bg-accent"
            value={selectorState.state.activeState}
            onChange={(event) => {
              selectorState.handleStateChange(event.target.value);
            }}
          >
            {selector.availableStates.map((option) => (
              <option key={option.id || 'default'} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex min-h-[40px] flex-wrap items-center gap-1 rounded-md border border-border bg-background p-1.5">
        {selectorState.state.commonClasses.length > 0 ? (
          selectorState.state.commonClasses.map((item) => (
            <GrapesLikeClassTag key={item.name} name={item.name} onRemove={selectorState.removeClass} />
          ))
        ) : (
          <span className="text-xs text-muted-foreground">暂无类名</span>
        )}
        {isAddingClass ? (
          <>
            <input
              ref={classInputRef}
              aria-label="类名"
              className="gl-input min-w-[88px] flex-1 rounded-md bg-transparent px-1.5 py-0 text-xs leading-4 text-foreground outline-none"
              placeholder="添加类名"
              value={selectorState.classInputValue}
              onChange={(event) => {
                selectorState.setClassInputValue(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  handleCancelAddClass();
                  return;
                }

                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleCommitClass();
                  return;
                }

                selectorState.handleClassInputKeyDown(event);
              }}
            onBlur={() => {
              if (!selectorState.classInputValue.trim()) {
                handleCancelAddClass();
              }
            }}
          />
            <button
              type="button"
              aria-label="取消添加类名"
              className="inline-flex h-6 shrink-0 items-center justify-center rounded-md border border-border bg-background px-1.5 text-xs text-foreground transition-colors hover:bg-accent"
              onClick={handleCancelAddClass}
            >
              ×
            </button>
          </>
        ) : (
          <button
            type="button"
            aria-label="添加类名"
            className="inline-flex h-6 shrink-0 items-center justify-center rounded-md border border-border bg-background px-1.5 text-xs text-foreground transition-colors hover:bg-accent"
            onClick={handleStartAddClass}
          >
            +
          </button>
        )}
      </div>
    </section>
  );
}
