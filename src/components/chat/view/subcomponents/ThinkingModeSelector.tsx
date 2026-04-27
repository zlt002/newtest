import { useState, useRef, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { Brain, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { ClaudeEffortLevel } from '../../constants/thinkingModes';
import { thinkingModes } from '../../constants/thinkingModes';
import { shouldDismissThinkingModeMenu } from './thinkingModeMenu';

const menuBaseStyle: CSSProperties = {
  maxHeight: '300px',
  overflow: 'hidden',
  borderRadius: '8px',
  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  zIndex: 1000,
  padding: '8px',
  transition: 'opacity 150ms ease-in-out, transform 150ms ease-in-out',
};

type ThinkingModeSelectorProps = {
  selectedMode: ClaudeEffortLevel;
  onModeChange: (modeId: ClaudeEffortLevel) => void;
  onClose?: () => void;
  className?: string;
  menuPosition?: { top: number; left: number; bottom?: number };
};

function ThinkingModeSelector({
  selectedMode,
  onModeChange,
  onClose,
  className = '',
  menuPosition,
}: ThinkingModeSelectorProps) {
  const { t } = useTranslation('chat');

  const translatedModes = thinkingModes.map(mode => {
    return {
      ...mode,
      name: t(`thinkingMode.modes.${mode.id}.name`),
      description: t(`thinkingMode.modes.${mode.id}.description`)
    };
  });

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        shouldDismissThinkingModeMenu({
          target: event.target,
          triggerContainer: dropdownRef.current,
          menuContainer: menuRef.current,
        })
      ) {
        setIsOpen(false);
        if (onClose) onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const currentMode = translatedModes.find(mode => mode.id === selectedMode) || translatedModes[0];
  const IconComponent = currentMode.icon || Brain;
  const getMenuPosition = (): CSSProperties => {
    if (typeof window === 'undefined') {
      return { position: 'fixed', left: '16px', bottom: '90px' };
    }

    if (menuPosition) {
      if (window.innerWidth < 640) {
        return {
          position: 'fixed',
          bottom: `${menuPosition.bottom ?? 90}px`,
          left: '16px',
          right: '16px',
          width: 'auto',
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'min(50vh, 300px)',
          zIndex: 1000,
        };
      }

      return {
        position: 'fixed',
        top: `${Math.max(16, Math.min(menuPosition.top, window.innerHeight - 316))}px`,
        left: `${Math.max(16, menuPosition.left)}px`,
        width: 'min(400px, calc(100vw - 32px))',
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: '300px',
        zIndex: 1000,
      };
    }

    if (!triggerRef.current) {
      return { position: 'fixed', left: '16px', bottom: '90px' };
    }

    const rect = triggerRef.current.getBoundingClientRect();
    if (window.innerWidth < 640) {
      return {
        position: 'fixed',
        bottom: `${window.innerHeight - rect.top + 8}px`,
        left: '16px',
        right: '16px',
        width: 'auto',
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: 'min(50vh, 300px)',
        zIndex: 1000,
      };
    }

    return {
      position: 'fixed',
      top: `${Math.max(16, rect.top - 316)}px`,
      left: `${Math.max(16, rect.left)}px`,
      width: 'min(400px, calc(100vw - 32px))',
      maxWidth: 'calc(100vw - 32px)',
      maxHeight: '300px',
      zIndex: 1000,
    };
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-background/80 text-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
        title={t('thinkingMode.buttonTitle', { mode: currentMode.name })}
      >
        <IconComponent className={`h-3.5 w-3.5 ${currentMode.color}`} />
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          aria-label={t('thinkingMode.selector.title')}
          className="command-menu border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
          style={{ ...menuBaseStyle, ...getMenuPosition(), opacity: 1, transform: 'translateY(0)' }}
        >
          <div className="border-b border-gray-200 px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
            <div className="flex items-center justify-between">
              <h3 className="truncate">
                {t('thinkingMode.selector.title')}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  if (onClose) onClose();
                }}
                className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>
            <p className="mt-1 pb-2 text-xs font-normal normal-case tracking-normal text-gray-500 dark:text-gray-400">
              {t('thinkingMode.selector.description')}
            </p>
          </div>

          <div className="max-h-[220px] overflow-y-auto py-1">
            {translatedModes.map((mode) => {
              const ModeIcon = mode.icon;
              const isSelected = mode.id === selectedMode;

              return (
                <button
                  key={mode.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onModeChange(mode.id as ClaudeEffortLevel);
                    setIsOpen(false);
                    if (onClose) onClose();
                  }}
                  onMouseDown={(event) => event.preventDefault()}
                  className={`command-item mb-0.5 flex w-full cursor-pointer items-start rounded-md px-3 py-2.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 ${isSelected ? 'bg-blue-50 dark:bg-blue-900' : 'bg-transparent'}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 ${mode.icon ? mode.color : 'text-gray-400'}`}>
                        {ModeIcon ? <ModeIcon className="h-5 w-5" /> : <div className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${isSelected ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                            {mode.name}
                          </span>
                          {isSelected && (
                            <span className="command-metadata-badge rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                              {t('thinkingMode.selector.active')}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-[13px] text-gray-500 dark:text-gray-300">
                          {mode.description}
                        </div>
                        <code className="mt-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">
                          {mode.id}
                        </code>
                      </div>
                    </div>
                  </div>
                  {isSelected && <span className="ml-2 text-xs font-semibold text-blue-500 dark:text-blue-300">{'<-'}</span>}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default ThinkingModeSelector;
