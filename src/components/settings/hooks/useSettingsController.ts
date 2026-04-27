import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '../../../contexts/ThemeContext';
import {
  DEFAULT_CODE_EDITOR_SETTINGS,
  DEFAULT_PROJECT_SORT_ORDER,
} from '../constants/constants';
import type {
  ClaudePermissionsState,
  CodeEditorSettingsState,
  ProjectSortOrder,
  SettingsMainTab,
} from '../types/types';
import {
  DEFAULT_CLAUDE_PERMISSIONS,
  mergeClaudeSettingsForSave,
  normalizeMainTab,
  readClaudePermissions,
} from '../utils/settingsStorage.js';

type ThemeContextValue = {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
};

type UseSettingsControllerArgs = {
  isOpen: boolean;
  initialTab: string;
};

const parseJson = <T>(value: string | null, fallback: T): T => {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const readCodeEditorSettings = (): CodeEditorSettingsState => ({
  theme: localStorage.getItem('codeEditorTheme') === 'light' ? 'light' : 'dark',
  wordWrap: localStorage.getItem('codeEditorWordWrap') === 'true',
  showMinimap: localStorage.getItem('codeEditorShowMinimap') !== 'false',
  lineNumbers: localStorage.getItem('codeEditorLineNumbers') !== 'false',
  fontSize: localStorage.getItem('codeEditorFontSize') ?? DEFAULT_CODE_EDITOR_SETTINGS.fontSize,
});

export function useSettingsController({ isOpen, initialTab }: UseSettingsControllerArgs) {
  const { isDarkMode, toggleDarkMode } = useTheme() as ThemeContextValue;
  const closeTimerRef = useRef<number | null>(null);

  const [activeTab, setActiveTab] = useState<SettingsMainTab>(() => normalizeMainTab(initialTab));
  const [saveStatus, setSaveStatus] = useState<'success' | 'error' | null>(null);
  const [projectSortOrder, setProjectSortOrder] = useState<ProjectSortOrder>(DEFAULT_PROJECT_SORT_ORDER);
  const [claudePermissions, setClaudePermissions] = useState<ClaudePermissionsState>({
    ...DEFAULT_CLAUDE_PERMISSIONS,
    permissionMode: DEFAULT_CLAUDE_PERMISSIONS.permissionMode,
    allowedTools: [...DEFAULT_CLAUDE_PERMISSIONS.allowedTools],
    disallowedTools: [...DEFAULT_CLAUDE_PERMISSIONS.disallowedTools],
  });
  const [codeEditorSettings, setCodeEditorSettings] = useState<CodeEditorSettingsState>(() => (
    readCodeEditorSettings()
  ));
  const loadSettings = useCallback(async () => {
    try {
      const savedClaudeSettings = parseJson<{
        projectSortOrder?: ProjectSortOrder;
      }>(localStorage.getItem('claude-settings'), {});
      setProjectSortOrder(savedClaudeSettings.projectSortOrder === 'name' ? 'name' : DEFAULT_PROJECT_SORT_ORDER);
      setClaudePermissions(readClaudePermissions(localStorage.getItem('claude-settings')));
    } catch (error) {
      console.error('Error loading settings:', error);
      setProjectSortOrder(DEFAULT_PROJECT_SORT_ORDER);
      setClaudePermissions({
        ...DEFAULT_CLAUDE_PERMISSIONS,
        permissionMode: DEFAULT_CLAUDE_PERMISSIONS.permissionMode,
        allowedTools: [...DEFAULT_CLAUDE_PERMISSIONS.allowedTools],
        disallowedTools: [...DEFAULT_CLAUDE_PERMISSIONS.disallowedTools],
      });
    }
  }, []);

  const saveSettings = useCallback(async () => {
    setSaveStatus(null);

    try {
      const now = new Date().toISOString();
      const existingSettings = localStorage.getItem('claude-settings');
      const nextSettings = mergeClaudeSettingsForSave(existingSettings, {
        ...claudePermissions,
        projectSortOrder,
        lastUpdated: now,
      });
      localStorage.setItem('claude-settings', JSON.stringify(nextSettings));

      setSaveStatus('success');
    } catch (error) {
      console.error('Error saving settings:', error);
      setSaveStatus('error');
    }
  }, [
    claudePermissions,
    projectSortOrder,
  ]);

  const updateCodeEditorSetting = useCallback(
    <K extends keyof CodeEditorSettingsState>(key: K, value: CodeEditorSettingsState[K]) => {
      setCodeEditorSettings((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setActiveTab(normalizeMainTab(initialTab));
    void loadSettings();
  }, [initialTab, isOpen, loadSettings]);

  useEffect(() => {
    localStorage.setItem('codeEditorTheme', codeEditorSettings.theme);
    localStorage.setItem('codeEditorWordWrap', String(codeEditorSettings.wordWrap));
    localStorage.setItem('codeEditorShowMinimap', String(codeEditorSettings.showMinimap));
    localStorage.setItem('codeEditorLineNumbers', String(codeEditorSettings.lineNumbers));
    localStorage.setItem('codeEditorFontSize', codeEditorSettings.fontSize);
    window.dispatchEvent(new Event('codeEditorSettingsChanged'));
  }, [codeEditorSettings]);

  // Auto-save permissions and sort order with debounce
  const autoSaveTimerRef = useRef<number | null>(null);
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    // Skip auto-save on initial load (settings are being loaded from localStorage)
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      return;
    }

    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = window.setTimeout(() => {
      saveSettings();
    }, 500);

    return () => {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [saveSettings]);

  // Clear save status after 2 seconds
  useEffect(() => {
    if (saveStatus === null) {
      return;
    }

    const timer = window.setTimeout(() => setSaveStatus(null), 2000);
    return () => window.clearTimeout(timer);
  }, [saveStatus]);

  // Reset initial load flag when settings dialog opens
  useEffect(() => {
    if (isOpen) {
      isInitialLoadRef.current = true;
    }
  }, [isOpen]);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, []);

  return {
    activeTab,
    setActiveTab,
    isDarkMode,
    toggleDarkMode,
    saveStatus,
    projectSortOrder,
    setProjectSortOrder,
    claudePermissions,
    setClaudePermissions,
    codeEditorSettings,
    updateCodeEditorSetting,
  };
}
