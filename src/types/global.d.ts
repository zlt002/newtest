export {};

declare global {
  interface Window {
    __ROUTER_BASENAME__?: string;
    refreshProjects?: () => void | Promise<void>;
    openSettings?: (target?: string) => void;
    CCUI_DEBUG_VISUAL_SAVE?: boolean;
    CCUI_DEBUG_VISUAL_EDITOR?: boolean;
    __CCUI_VISUAL_SAVE_DEBUG__?: Record<string, unknown>;
    __CCUI_VISUAL_SAVE_DEBUG_HISTORY__?: Record<string, unknown>[];
    __CCUI_VISUAL_HTML_DEBUG__?: Record<string, unknown>;
    __CCUI_VISUAL_HTML_EDITOR__?: unknown;
  }

  interface EventSourceEventMap {
    result: MessageEvent;
    progress: MessageEvent;
    done: MessageEvent;
  }
}
