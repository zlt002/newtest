import { AlertTriangle, Copy, ExternalLink } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { copyTextToClipboard } from '../../../utils/clipboard';
import type { RightPaneBrowserTarget } from '../types';
import {
  BROWSER_IFRAME_REFERRER_POLICY,
  createBrowserPaneState,
  getBrowserIframeSandbox,
  moveBrowserPaneHistory,
  navigateBrowserPaneState,
  refreshBrowserPaneState,
  resetBrowserPaneState,
  syncBrowserPaneAddress,
} from '../utils/browserPaneState';
import { getBrowserEmbedFallbackReason, type BrowserEmbedFallbackReason } from '../utils/browserEmbedFallback';
import type { BrowserDependencySnapshot } from '../../code-editor/hooks/useEditorSidebar';

type BrowserPaneProps = {
  target: RightPaneBrowserTarget;
  projectPath?: string;
  refreshVersion?: number;
  onDependenciesChange?: ((snapshot: BrowserDependencySnapshot) => void) | null;
  onClosePane: () => void;
  onAppendToChatInput?: ((text: string) => void) | null;
};

const EMBED_TIMEOUT_MS = 4500;

type BrowserFrameStatus = 'loading' | 'ready' | 'fallback';

function buildInitialFallbackReason(target: RightPaneBrowserTarget): BrowserEmbedFallbackReason | null {
  return getBrowserEmbedFallbackReason(target.url, target.source);
}

export default function BrowserPane({
  target,
  projectPath,
  refreshVersion = 0,
  onDependenciesChange = null,
  onClosePane,
  onAppendToChatInput = null,
}: BrowserPaneProps) {
  void projectPath;
  void onDependenciesChange;
  void onAppendToChatInput;

  const [browserState, setBrowserState] = useState(() => createBrowserPaneState(target.url));
  const [frameStatus, setFrameStatus] = useState<BrowserFrameStatus>(() => (
    buildInitialFallbackReason(target) ? 'fallback' : 'loading'
  ));
  const [fallbackReason, setFallbackReason] = useState<BrowserEmbedFallbackReason | null>(() => buildInitialFallbackReason(target));
  const [copyFeedback, setCopyFeedback] = useState<'idle' | 'success' | 'error'>('idle');
  const { entries, currentIndex, addressValue, refreshKey } = browserState;
  const lastRefreshVersionRef = useRef(refreshVersion);

  useEffect(() => {
    setBrowserState((previousState) => resetBrowserPaneState(previousState, target.url));
    setCopyFeedback('idle');
  }, [target]);

  useEffect(() => {
    if (refreshVersion === lastRefreshVersionRef.current) {
      return;
    }

    lastRefreshVersionRef.current = refreshVersion;
    setBrowserState((previousState) => refreshBrowserPaneState(previousState));
  }, [refreshVersion]);

  const currentUrl = useMemo(() => entries[currentIndex] ?? target.url, [currentIndex, entries, target.url]);

  useEffect(() => {
    const nextFallbackReason = getBrowserEmbedFallbackReason(currentUrl, target.source);
    setFallbackReason(nextFallbackReason);
    setFrameStatus(nextFallbackReason ? 'fallback' : 'loading');
    setCopyFeedback('idle');
  }, [currentUrl, refreshKey, target.source]);

  useEffect(() => {
    if (fallbackReason === 'known-restricted-host' || frameStatus === 'ready') {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setFrameStatus((previousStatus) => {
        if (previousStatus === 'ready') {
          return previousStatus;
        }

        setFallbackReason('load-timeout');
        return 'fallback';
      });
    }, EMBED_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [fallbackReason, frameStatus, currentUrl, refreshKey]);

  useEffect(() => {
    setBrowserState((previousState) => syncBrowserPaneAddress(previousState, currentUrl));
  }, [currentUrl]);

  const canGoBack = currentIndex > 0;
  const canGoForward = currentIndex < entries.length - 1;
  const shouldShowFallback = frameStatus === 'fallback' && Boolean(fallbackReason);
  const shouldShowIframe = !shouldShowFallback;

  const handleOpenExternal = () => {
    if (typeof window === 'undefined') {
      return;
    }

    window.open(currentUrl, '_blank', 'noopener,noreferrer');
  };

  const handleCopyLink = async () => {
    const copied = await copyTextToClipboard(currentUrl);
    setCopyFeedback(copied ? 'success' : 'error');
  };

  const fallbackTitle = fallbackReason === 'known-restricted-host'
    ? '该网站禁止内嵌预览'
    : '当前页面暂时无法在右侧浏览器里稳定加载';
  const fallbackDescription = fallbackReason === 'known-restricted-host'
    ? '目标网站主动拒绝被 iframe 内嵌打开，所以这里无法直接显示页面内容。'
    : '这个页面长时间没有成功完成内嵌加载，可能是站点限制了 iframe，或加载过程被浏览器拦截。';

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-browser-pane="true" data-right-pane-view="browser">
      <div className="flex h-14 flex-shrink-0 items-center border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        <div className="flex w-full items-center gap-2">
          <button
            className="rounded border border-border px-2 py-1 text-xs text-foreground disabled:opacity-50"
            data-browser-back="true"
            disabled={!canGoBack}
            onClick={() => setBrowserState((previousState) => moveBrowserPaneHistory(previousState, previousState.currentIndex - 1))}
            type="button"
          >
            后退
          </button>
          <button
            className="rounded border border-border px-2 py-1 text-xs text-foreground disabled:opacity-50"
            data-browser-forward="true"
            disabled={!canGoForward}
            onClick={() => setBrowserState((previousState) => moveBrowserPaneHistory(previousState, previousState.currentIndex + 1))}
            type="button"
          >
            前进
          </button>
          <button
            className="rounded border border-border px-2 py-1 text-xs text-foreground"
            data-browser-refresh="true"
            onClick={() => {
              setBrowserState((previousState) => refreshBrowserPaneState(previousState));
            }}
            type="button"
          >
            刷新
          </button>
          <form
            className="min-w-0 flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              setBrowserState((previousState) => navigateBrowserPaneState(previousState, previousState.addressValue));
            }}
          >
            <input
              aria-label="浏览器地址"
              className="h-8 w-full rounded border border-border bg-background px-3 text-sm"
              data-browser-address-bar="true"
              onChange={(event) =>
                setBrowserState((previousState) => ({
                  ...previousState,
                  addressValue: event.target.value,
                }))
              }
              type="text"
              value={addressValue}
            />
          </form>
          <button
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            data-right-pane-close="true"
            onClick={onClosePane}
            type="button"
          >
            关闭
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 bg-muted/20">
        {shouldShowIframe && (
          <iframe
            key={`${currentUrl}:${refreshKey}`}
            className="h-full w-full border-0 bg-white"
            referrerPolicy={BROWSER_IFRAME_REFERRER_POLICY}
            sandbox={getBrowserIframeSandbox()}
            src={currentUrl}
            title={target.title ?? '嵌入式浏览器内容'}
            onLoad={() => {
              setFrameStatus('ready');
              setFallbackReason(null);
            }}
          />
        )}
        {frameStatus === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/90">
            <div className="max-w-md rounded-xl border border-border/70 bg-card px-5 py-4 text-center shadow-sm">
              <div className="text-sm font-medium text-foreground">正在尝试加载网页</div>
              <div className="mt-2 text-xs leading-6 text-muted-foreground">
                如果目标站点禁止 iframe 内嵌，右侧会自动切换到失败提示并给你兜底操作。
              </div>
            </div>
          </div>
        )}
        {shouldShowFallback && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-background px-6"
            data-browser-fallback="true"
            data-browser-fallback-reason={fallbackReason}
          >
            <div className="w-full max-w-md rounded-2xl border border-border/70 bg-card px-6 py-6 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-amber-100 p-2 text-amber-600">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-foreground">{fallbackTitle}</div>
                  <div className="mt-2 text-xs leading-6 text-muted-foreground">{fallbackDescription}</div>
                  <div className="mt-3 break-all rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                    {currentUrl}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      className="inline-flex items-center gap-1 rounded border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
                      data-browser-open-external="true"
                      onClick={handleOpenExternal}
                      type="button"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      在系统浏览器打开
                    </button>
                    <button
                      className="inline-flex items-center gap-1 rounded border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
                      data-browser-copy-link="true"
                      onClick={() => {
                        void handleCopyLink();
                      }}
                      type="button"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {copyFeedback === 'success' ? '已复制链接' : copyFeedback === 'error' ? '复制失败' : '复制链接'}
                    </button>
                    <button
                      className="rounded border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
                      data-browser-retry-embed="true"
                      onClick={() => {
                        setFallbackReason(null);
                        setBrowserState((previousState) => refreshBrowserPaneState(previousState));
                      }}
                      type="button"
                    >
                      重新尝试内嵌
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
