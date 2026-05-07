import { useState } from 'react';
// @ts-ignore - Local runtime supports the .ts specifier used across this folder.
import type { InspectorSnapshot, InspectorSyncState, LayerSnapshot, SelectorSnapshot, StyleSnapshot, StyleStatePatch } from './types.ts';
import GrapesLikeLayerManager from './layers/GrapesLikeLayerManager';
import GrapesLikeStyleManager from './style/GrapesLikeStyleManager';
import { useGrapesLikeInspectorSnapshot } from './useGrapesLikeInspectorSnapshot';

type GrapesLikeInspectorPaneProps = {
  adapter: {
    subscribe: (listener: () => void) => () => void;
    getSnapshot: () => InspectorSnapshot;
  };
  actions: {
    selector: {
      addClass: (className: string) => void;
      removeClass: (className: string) => void;
      setState: (state: string) => void;
    };
    style: {
      updateStyle: (input: { property: string; value: string; targetKind: 'rule' | 'inline'; patch?: StyleStatePatch }) => void;
    };
    layers: {
      selectLayer: (id: string, event?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } | null) => void;
      selectParentLayer: (id: string) => void;
      duplicateLayer: (id: string) => void;
      deleteLayer: (id: string) => void;
      toggleLayerVisible: (id: string) => void;
      toggleLayerExpanded: (id: string) => void;
      moveLayer: (sourceId: string, targetId: string) => void;
    };
  };
};

type InspectorTab = 'style' | 'layers';
const INSPECTOR_WIDTH_PX = 250;

const TABS: Array<{ id: InspectorTab; label: string }> = [
  { id: 'style', label: '样式' },
  { id: 'layers', label: '图层' },
];

function readSyncState(section: StyleSnapshot | LayerSnapshot | SelectorSnapshot): InspectorSyncState | null {
  return section.syncState ?? null;
}

function SyncHint({ visible }: { visible: boolean }) {
  if (!visible) {
    return null;
  }

  return (
    <div
      data-inspector-sync-hint="true"
      className="border-b border-border px-2 py-1 text-[11px] leading-4 text-muted-foreground"
    >
      正在同步
    </div>
  );
}

export default function GrapesLikeInspectorPane({ adapter, actions }: GrapesLikeInspectorPaneProps) {
  const snapshot = useGrapesLikeInspectorSnapshot(adapter);
  const [activeTab, setActiveTab] = useState<InspectorTab>('style');
  const stylePending = readSyncState(snapshot.style) === 'pending';
  const selectorPending = readSyncState(snapshot.selector) === 'pending';
  const layerPending = readSyncState(snapshot.layers) === 'pending';
  const styleTabPending = stylePending || selectorPending;
  const syncHintVisible = styleTabPending || layerPending;

  return (
    <section
      data-gjs-like-inspector="true"
      className="flex h-full shrink-0 flex-col overflow-hidden border-l border-border bg-background text-foreground"
      style={{
        width: `${INSPECTOR_WIDTH_PX}px`,
        minWidth: `${INSPECTOR_WIDTH_PX}px`,
        maxWidth: `${INSPECTOR_WIDTH_PX}px`,
      }}
    >
      <div
        role="tablist"
        aria-label="检查器标签"
        className="sticky top-0 z-10 grid grid-cols-2 gap-1 border-b border-border bg-card px-1 py-1"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={[
              'w-full rounded-md px-1.5 py-1 text-xs leading-4 transition-colors',
              activeTab === tab.id
                ? 'border border-primary/20 bg-primary/10 text-primary shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            ].join(' ')}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <SyncHint visible={syncHintVisible} />

      <div
        className={[
          'min-h-0 flex-1 overflow-y-auto px-0.5 py-0.5',
          activeTab === 'layers' ? 'overflow-x-auto' : 'overflow-x-hidden',
        ].join(' ')}
      >
        {activeTab === 'style' && styleTabPending ? (
          <section
            data-inspector-style-sync-blocker="true"
            aria-busy="true"
            className="m-1 rounded-md border border-border bg-card px-3 py-4 text-xs leading-5 text-muted-foreground"
          >
            <div className="font-medium text-foreground">正在同步样式</div>
            <div>请稍候，样式和选择器刷新完成后再编辑。</div>
          </section>
        ) : null}
        {activeTab === 'style' && !styleTabPending ? (
          <GrapesLikeStyleManager
            selection={snapshot.selection}
            selector={snapshot.selector}
            style={snapshot.style}
            actions={{
              selector: actions.selector,
              updateStyle: actions.style.updateStyle,
            }}
          />
        ) : null}
        {activeTab === 'layers' ? <GrapesLikeLayerManager layers={snapshot.layers} actions={actions.layers} /> : null}
      </div>
    </section>
  );
}
