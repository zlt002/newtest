export type BrowserPaneState = {
  entries: string[];
  currentIndex: number;
  addressValue: string;
  refreshKey: number;
};

export const BROWSER_IFRAME_SANDBOX = 'allow-forms allow-modals allow-popups allow-scripts';
export const BROWSER_IFRAME_REFERRER_POLICY = 'strict-origin-when-cross-origin';

function isBrowserHostAddress(value: string): boolean {
  return /^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(value);
}

function normalizeBrowserPaneUrl(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error('Invalid browser URL');
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (isBrowserHostAddress(trimmed)) {
    return `http://${trimmed}`;
  }

  throw new Error('Invalid browser URL');
}

function buildHistory(url: string) {
  return {
    entries: [url],
    currentIndex: 0,
  };
}

export function createBrowserPaneState(url: string): BrowserPaneState {
  return {
    ...buildHistory(url),
    addressValue: url,
    refreshKey: 0,
  };
}

export function navigateBrowserPaneState(state: BrowserPaneState, value: string): BrowserPaneState {
  let nextUrl: string;

  try {
    nextUrl = normalizeBrowserPaneUrl(value);
  } catch {
    return state;
  }

  const activeUrl = state.entries[state.currentIndex];
  if (activeUrl === nextUrl) {
    return {
      ...state,
      addressValue: nextUrl,
    };
  }

  const nextEntries = state.entries.slice(0, state.currentIndex + 1);
  nextEntries.push(nextUrl);

  return {
    ...state,
    entries: nextEntries,
    currentIndex: nextEntries.length - 1,
    addressValue: nextUrl,
  };
}

export function resetBrowserPaneState(previousState: BrowserPaneState, url: string): BrowserPaneState {
  return {
    ...createBrowserPaneState(url),
    refreshKey: previousState.refreshKey > 0 ? 0 : previousState.refreshKey,
  };
}

export function refreshBrowserPaneState(state: BrowserPaneState): BrowserPaneState {
  return {
    ...state,
    refreshKey: state.refreshKey + 1,
  };
}

export function syncBrowserPaneAddress(state: BrowserPaneState, currentUrl: string): BrowserPaneState {
  if (state.addressValue === currentUrl) {
    return state;
  }

  return {
    ...state,
    addressValue: currentUrl,
  };
}

export function moveBrowserPaneHistory(state: BrowserPaneState, nextIndex: number): BrowserPaneState {
  if (nextIndex < 0 || nextIndex >= state.entries.length || nextIndex === state.currentIndex) {
    return state;
  }

  return syncBrowserPaneAddress(
    {
      ...state,
      currentIndex: nextIndex,
    },
    state.entries[nextIndex],
  );
}

export function getBrowserIframeSandbox(): string {
  return BROWSER_IFRAME_SANDBOX;
}
