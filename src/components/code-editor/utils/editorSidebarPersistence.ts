export const DEFAULT_EDITOR_WIDTH = 600;
export const EDITOR_SIDEBAR_STORAGE_KEY = 'codeEditorSidebarPreference';

type EditorSidebarPreference = {
  hasManualWidth: boolean;
  width: number;
};

const DEFAULT_EDITOR_SIDEBAR_PREFERENCE: EditorSidebarPreference = {
  hasManualWidth: false,
  width: DEFAULT_EDITOR_WIDTH,
};

export function readEditorSidebarPreference(): EditorSidebarPreference {
  if (typeof localStorage === 'undefined') {
    return DEFAULT_EDITOR_SIDEBAR_PREFERENCE;
  }

  try {
    const raw = localStorage.getItem(EDITOR_SIDEBAR_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_EDITOR_SIDEBAR_PREFERENCE;
    }

    const parsed = JSON.parse(raw) as { width?: unknown };
    if (typeof parsed?.width !== 'number' || !Number.isFinite(parsed.width) || parsed.width <= 0) {
      return DEFAULT_EDITOR_SIDEBAR_PREFERENCE;
    }

    return {
      hasManualWidth: true,
      width: parsed.width,
    };
  } catch {
    return DEFAULT_EDITOR_SIDEBAR_PREFERENCE;
  }
}

export function writeEditorSidebarPreference(width: number) {
  if (typeof localStorage === 'undefined') {
    return;
  }

  if (!Number.isFinite(width) || width <= 0) {
    return;
  }

  localStorage.setItem(EDITOR_SIDEBAR_STORAGE_KEY, JSON.stringify({ width }));
}
