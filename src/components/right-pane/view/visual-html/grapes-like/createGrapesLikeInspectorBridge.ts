import type grapesjs from 'grapesjs';
// @ts-ignore - Node's strip-types runtime resolves the .ts specifier; tsc flags it without allowImportingTsExtensions.
import { createInspectorAdapter } from './inspectorAdapter.ts';
// @ts-ignore - Node's strip-types runtime resolves the .ts specifier; tsc flags it without allowImportingTsExtensions.
import { createInspectorSnapshotScheduler } from './inspectorSnapshotScheduler.ts';
// @ts-ignore - Node's strip-types runtime resolves the .ts specifier; tsc flags it without allowImportingTsExtensions.
import { addClass, removeClass, setState as setSelectorState } from './selectorMapper.ts';
// @ts-ignore - Node's strip-types runtime resolves the .ts specifier; tsc flags it without allowImportingTsExtensions.
import { readSelectorSnapshot } from './selectorAdapter.ts';
// @ts-ignore - Node's strip-types runtime resolves the .ts specifier; tsc flags it without allowImportingTsExtensions.
import { createSelectionFeedbackController } from './selectionFeedbackController.ts';
// @ts-ignore - Node's strip-types runtime resolves the .ts specifier; tsc flags it without allowImportingTsExtensions.
import { readStyleSnapshot } from './styleAdapter.ts';
// @ts-ignore - Node's strip-types runtime resolves the .ts specifier; tsc flags it without allowImportingTsExtensions.
import { updateStyle } from './styleMapper.ts';
// @ts-ignore - Node's strip-types runtime resolves the .ts specifier; tsc flags it without allowImportingTsExtensions.
import type { LayerNodeViewModel } from './types.ts';

type GrapesEditor = ReturnType<typeof grapesjs.init>;
type LayerSelectionEvent = {
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
} | null;

type GrapesComponent = ReturnType<GrapesEditor['getSelected']> & {
  getId?: () => string;
  getName?: () => string;
  getType?: () => string;
  get?: (key: string) => unknown;
  getStyle?: () => Record<string, unknown>;
  getSelectorsString?: () => string;
  getClasses?: () => Array<string | { get?: (key: string) => unknown }>;
  addClass?: (className: string) => void;
  removeClass?: (className: string) => void;
  setState?: (state: string) => void;
  addStyle?: (style: Record<string, string>) => void;
  removeStyle?: (property: string) => void;
  set?: (key: string, value: unknown) => void;
  clone?: () => GrapesComponent | null | undefined;
  remove?: () => GrapesComponent | void;
  parent?: () => GrapesComponent | null | undefined;
  index?: () => number;
  move?: (component: GrapesComponent, opts?: { at?: number }) => GrapesComponent | void;
  components?: () => { models?: GrapesComponent[] } | GrapesComponent[];
};

type GrapesStyleTarget = {
  getStyle?: () => Record<string, unknown>;
  addStyle?: (style: Record<string, string>, options?: Record<string, unknown>) => void;
  removeStyle?: (property: string) => void;
  setStyle?: (style: Record<string, string>, options?: Record<string, unknown>) => void;
};

type GrapesLayerManager = {
  getRoot?: () => GrapesComponent;
  getComponents?: (component: GrapesComponent) => GrapesComponent[];
  getLayerData?: (component: GrapesComponent) => {
    name?: string;
    open?: boolean;
    selected?: boolean;
    visible?: boolean;
    components?: GrapesComponent[];
  };
  setLayerData?: (
    component: GrapesComponent,
    data: { selected?: boolean; open?: boolean },
    opts?: { event?: LayerSelectionEvent },
  ) => void;
  setVisible?: (component: GrapesComponent, value: boolean) => void;
  setOpen?: (component: GrapesComponent, value: boolean) => void;
};

type GrapesStyleManager = {
  getModelToStyle?: (component: GrapesComponent) => GrapesStyleTarget;
};

const COMPONENT_TYPE_LABELS: Record<string, string> = {
  div: '容器',
  section: '区块',
  main: '主内容',
  header: '页眉',
  footer: '页脚',
  nav: '导航',
  article: '文章',
  aside: '侧边栏',
  button: '按钮',
  image: '图片',
  img: '图片',
  text: '文本',
  span: '行内',
  link: '链接',
  a: '链接',
  video: '视频',
};

function translateComponentType(type: string): string {
  return COMPONENT_TYPE_LABELS[type.toLowerCase()] ?? type;
}

function getSelectedComponents(editor: GrapesEditor): GrapesComponent[] {
  try {
    const selected = editor.getSelectedAll?.() ?? [];
    return Array.isArray(selected) ? selected as GrapesComponent[] : [];
  } catch {
    const selected = editor.getSelected?.();
    return selected ? [selected as GrapesComponent] : [];
  }
}

function readComponentClasses(component: GrapesComponent): string[] {
  const classes = component?.getClasses?.() ?? [];
  return classes.map((entry: string | { get?: (key: string) => unknown }) => {
    if (typeof entry === 'string') {
      return entry;
    }

    return String(entry?.get?.('name') ?? entry?.get?.('label') ?? '').trim();
  }).filter(Boolean);
}

function toSelectorSource(component: GrapesComponent) {
  return {
    name: String(component?.getName?.() ?? component?.get?.('name') ?? component?.getType?.() ?? '').trim(),
    type: String(component?.getType?.() ?? component?.get?.('type') ?? '').trim(),
    id: String(component?.getId?.() ?? component?.get?.('id') ?? '').trim(),
    classes: readComponentClasses(component),
  };
}

function buildSelectedLabel(component: GrapesComponent | null): string {
  if (!component) {
    return '';
  }

  const rawName = String(component.getName?.() ?? component.get?.('name') ?? component.getType?.() ?? '组件').trim();
  const id = String(component.getId?.() ?? component.get?.('id') ?? '').trim();
  const name = translateComponentType(rawName);
  return [name, id ? `#${id}` : ''].filter(Boolean).join(' ').trim();
}

function readComponentId(component: GrapesComponent | null | undefined): string {
  return String(component?.getId?.() ?? component?.get?.('id') ?? '').trim();
}

function getPrimarySelectedComponent(editor: GrapesEditor): GrapesComponent | null {
  return (editor.getSelected?.() as GrapesComponent | null) ?? null;
}

function readSelectionSnapshot(editor: GrapesEditor) {
  const selected = getSelectedComponents(editor);
  const primary = getPrimarySelectedComponent(editor) ?? selected[0] ?? null;

  return {
    selectedIds: selected.map((component) => readComponentId(component)).filter(Boolean),
    primarySelectedId: readComponentId(primary) || null,
    selectedLabel: buildSelectedLabel(primary),
    isMultiSelection: selected.length > 1,
    isDetached: false,
  };
}

function createSelectionSnapshot(editor: GrapesEditor, selectionController: ReturnType<typeof createSelectionFeedbackController>) {
  const selected = getSelectedComponents(editor);
  const primary = getPrimarySelectedComponent(editor) ?? selected[0] ?? null;
  const immediateSelection = selectionController.beginSelection(primary);
  const selectedIds = selected
    .map((component) => readComponentId(component))
    .filter(Boolean);

  return {
    ...readSelectionSnapshot(editor),
    ...immediateSelection,
    selectedIds: selectedIds.length > 0 ? selectedIds : immediateSelection.selectedIds,
    isMultiSelection: selected.length > 1,
    isDetached: false,
  };
}

function readSelectionSnapshotWithRevision(
  editor: GrapesEditor,
  revision: number | null,
) {
  const selection = readSelectionSnapshot(editor);

  if (revision == null) {
    return selection;
  }

  return {
    ...selection,
    revision,
  };
}

function getComponentChildren(component: GrapesComponent): GrapesComponent[] {
  const children = component?.components?.();
  if (Array.isArray(children)) {
    return children as GrapesComponent[];
  }

  return Array.isArray(children?.models) ? children.models as GrapesComponent[] : [];
}

function getLayerManager(editor: GrapesEditor): GrapesLayerManager | null {
  return (editor.Layers as unknown as GrapesLayerManager | undefined) ?? null;
}

function getStyleManager(editor: GrapesEditor): GrapesStyleManager | null {
  return (editor.StyleManager as unknown as GrapesStyleManager | undefined) ?? null;
}

function getLayerChildren(editor: GrapesEditor, component: GrapesComponent): GrapesComponent[] {
  const layers = getLayerManager(editor);
  const children = layers?.getComponents?.(component);
  return Array.isArray(children) ? children : getComponentChildren(component);
}

function selectComponent(editor: GrapesEditor, component: GrapesComponent, event?: LayerSelectionEvent) {
  const layers = getLayerManager(editor);
  if (layers?.setLayerData) {
    layers.setLayerData(component, { selected: true }, event ? { event } : undefined);
  } else {
    editor.select?.(component, event ? { event } as any : undefined);
  }
}

function insertComponentIntoParent(parent: GrapesComponent, component: GrapesComponent, at: number) {
  const collection = parent.components?.() as { add?: (item: GrapesComponent, opts?: { at?: number }) => void } | GrapesComponent[] | undefined;
  if (collection && !Array.isArray(collection) && typeof collection.add === 'function') {
    collection.add(component, { at });
    return;
  }

  component.move?.(parent, { at });
}

function findComponentPathById(
  component: GrapesComponent | null | undefined,
  targetId: string,
  getChildren: (component: GrapesComponent) => GrapesComponent[],
): GrapesComponent[] {
  if (!component || !targetId) {
    return [];
  }

  const currentId = String(component.getId?.() ?? component.get?.('id') ?? '').trim();
  if (currentId === targetId) {
    return [component];
  }

  for (const child of getChildren(component)) {
    const childPath = findComponentPathById(child, targetId, getChildren);
    if (childPath.length > 0) {
      return [component, ...childPath];
    }
  }

  return [];
}

function findComponentPathFromParents(
  selectedComponent: GrapesComponent | null | undefined,
  layerRoot: GrapesComponent | null | undefined,
  roots: readonly GrapesComponent[],
): string[] {
  if (!selectedComponent) {
    return [];
  }

  const path: GrapesComponent[] = [];
  const seen = new Set<GrapesComponent>();
  let current: GrapesComponent | null | undefined = selectedComponent;

  while (current && !seen.has(current)) {
    seen.add(current);
    path.push(current);

    if (layerRoot && current === layerRoot) {
      break;
    }

    current = current.parent?.() ?? null;
  }

  path.reverse();
  if (layerRoot && path[0] === layerRoot) {
    path.shift();
  }

  const rootIds = new Set(roots.map((root) => readComponentId(root)).filter(Boolean));
  const pathIds = path.map((component) => readComponentId(component)).filter(Boolean);

  return pathIds.length > 0 && rootIds.has(pathIds[0]) ? pathIds : [];
}

function toProjectedLayerSource(
  editor: GrapesEditor,
  component: GrapesComponent,
  selectedId: string,
  expandedIds: ReadonlySet<string>,
  selectedPath: readonly string[],
  pathIndex: number,
): LayerNodeViewModel {
  const layers = getLayerManager(editor);
  const data = layers?.getLayerData?.(component);
  const id = String(component?.getId?.() ?? component?.get?.('id') ?? '').trim();
  const type = String(component?.getType?.() ?? component?.get?.('type') ?? component?.getName?.() ?? 'Component').trim();
  const name = String(data?.name ?? component?.getName?.() ?? component?.get?.('name') ?? '').trim();
  const displayName = translateComponentType(name || type);
  const dataChildren = Array.isArray(data?.components) ? data.components : [];
  const nextPathId = selectedPath[pathIndex + 1];
  const isOnSelectedPath = pathIndex >= 0;
  const includeDirectChildren = expandedIds.has(id);

  let children: LayerNodeViewModel[] = [];
  if (includeDirectChildren || (isOnSelectedPath && nextPathId)) {
    const childrenComponents = getLayerChildren(editor, component);

    if (includeDirectChildren) {
      children = childrenComponents.map((child) => toProjectedLayerSource(
        editor,
        child,
        selectedId,
        expandedIds,
        selectedPath,
        readComponentId(child) === nextPathId ? pathIndex + 1 : -1,
      ));
    } else {
      const nextChild = childrenComponents.find((child) => readComponentId(child) === nextPathId);
      if (nextChild) {
        children = [toProjectedLayerSource(editor, nextChild, selectedId, expandedIds, selectedPath, pathIndex + 1)];
      }
    }
  }

  return {
    id,
    label: id ? `${displayName} #${id}` : displayName,
    visible: data?.visible ?? true,
    selected: id === selectedId,
    expanded: expandedIds.has(id) || isOnSelectedPath,
    canExpand: dataChildren.length > 0 || children.length > 0,
    children,
  };
}

function readProjectedLayerSnapshot(
  editor: GrapesEditor,
  selectedComponent: GrapesComponent | null,
  expandedLayerIds: Iterable<string>,
) {
  const layers = getLayerManager(editor);
  const layerRoot = layers?.getRoot?.();
  const expandedIds = new Set([...expandedLayerIds].map((id) => String(id).trim()).filter(Boolean));
  const selectedIdValue = readComponentId(selectedComponent);
  const roots = layerRoot
    ? getLayerChildren(editor, layerRoot)
    : (editor.DomComponents?.getWrapper ? [editor.DomComponents.getWrapper() as GrapesComponent] : []);

  let selectedPathIds = findComponentPathFromParents(selectedComponent, layerRoot, roots);
  if (selectedIdValue && selectedPathIds.length === 0) {
    for (const root of roots) {
      const path = findComponentPathById(root, selectedIdValue, (component) => getLayerChildren(editor, component));
      if (path.length > 0) {
        selectedPathIds = path
          .map((component) => readComponentId(component))
          .filter(Boolean);
        break;
      }
    }
  }

  const projectedRoots = roots.map((root) => toProjectedLayerSource(
      editor,
      root,
      selectedIdValue,
      expandedIds,
      selectedPathIds,
      selectedPathIds.length > 0 && readComponentId(root) === selectedPathIds[0]
        ? 0
        : -1,
    ));

  return {
    roots: projectedRoots,
    selectedLayerIds: selectedIdValue ? [selectedIdValue] : [],
    expandedLayerIds: [...expandedIds],
    sortable: projectedRoots.length > 0,
  };
}

function findComponentById(component: GrapesComponent | null | undefined, targetId: string, getChildren: (component: GrapesComponent) => GrapesComponent[]): GrapesComponent | null {
  if (!component) {
    return null;
  }

  const currentId = String(component.getId?.() ?? component.get?.('id') ?? '').trim();
  if (currentId === targetId) {
    return component;
  }

  for (const child of getChildren(component)) {
    const result = findComponentById(child, targetId, getChildren);
    if (result) {
      return result;
    }
  }

  return null;
}

function hasDescendant(
  component: GrapesComponent | null | undefined,
  targetId: string,
  getChildren: (component: GrapesComponent) => GrapesComponent[],
): boolean {
  if (!component) {
    return false;
  }

  return getChildren(component).some((child) => {
    const childId = String(child.getId?.() ?? child.get?.('id') ?? '').trim();
    return childId === targetId || hasDescendant(child, targetId, getChildren);
  });
}

function updateInlineStyle(editor: GrapesEditor, property: string, value: string) {
  getSelectedComponents(editor).forEach((component) => {
    const nextValue = String(value ?? '').trim();
    if (!nextValue) {
      component?.removeStyle?.(property);
      return;
    }

    component?.addStyle?.({ [property]: nextValue });
  });
}

function sanitizeStyleRecord(style: Record<string, unknown> | null | undefined): Record<string, string | number | null | undefined> {
  if (!style) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(style).filter(([, value]) => typeof value === 'string' || typeof value === 'number' || value == null),
  ) as Record<string, string | number | null | undefined>;
}

function getStyleSourceForComponent(editor: GrapesEditor, component: GrapesComponent, index: number) {
  const primaryTarget = index === 0
    ? (editor.getSelectedToStyle?.() as GrapesStyleTarget | undefined)
    : undefined;
  const styleTarget = primaryTarget ?? getStyleManager(editor)?.getModelToStyle?.(component);
  return sanitizeStyleRecord(styleTarget?.getStyle?.() ?? component?.getStyle?.());
}

function getStyleTargetsForSelection(editor: GrapesEditor): GrapesStyleTarget[] {
  const selected = getSelectedComponents(editor);
  const primaryTarget = editor.getSelectedToStyle?.() as GrapesStyleTarget | undefined;
  const styleManager = getStyleManager(editor);
  const targets = selected.map((component, index) => (
    index === 0
      ? (primaryTarget ?? styleManager?.getModelToStyle?.(component))
      : styleManager?.getModelToStyle?.(component)
  ));

  return targets.filter(Boolean) as GrapesStyleTarget[];
}

function updateRuleStyle(editor: GrapesEditor, property: string, value: string) {
  const nextValue = String(value ?? '').trim();
  const targets = getStyleTargetsForSelection(editor);

  if (targets.length > 0) {
    targets.forEach((target) => {
      if (!nextValue) {
        target.removeStyle?.(property);
        return;
      }

      target.addStyle?.({ [property]: nextValue });
    });
    return;
  }

  updateInlineStyle(editor, property, value);
}

export function createGrapesLikeInspectorBridge(editor: GrapesEditor | null) {
  if (!editor) {
    return null;
  }

  const selectionController = createSelectionFeedbackController();
  const expandedLayerIds = new Set<string>();
  let selectionRevision: number | null = null;

  const bumpSelectionRevision = () => {
    const nextSelection = createSelectionSnapshot(editor, selectionController);
    selectionRevision = nextSelection.revision;
    return nextSelection;
  };
  const adapter = createInspectorAdapter({
    selection: () => {
      if (selectionRevision == null) {
        return bumpSelectionRevision();
      }

      return readSelectionSnapshotWithRevision(editor, selectionRevision);
    },
    selector: () => readSelectorSnapshot({
      selected: getSelectedComponents(editor).map((component) => toSelectorSource(component)),
      activeState: editor.SelectorManager?.getState?.() ?? '',
    }),
    style: () => readStyleSnapshot({
      selection: getSelectedComponents(editor).map((component, index) => ({
        styles: getStyleSourceForComponent(editor, component, index),
        classes: readComponentClasses(component),
      })),
      activeState: editor.SelectorManager?.getState?.() ?? '',
    }),
    layers: () => readProjectedLayerSnapshot(editor, getPrimarySelectedComponent(editor), expandedLayerIds),
  });
  const scheduler = createInspectorSnapshotScheduler({
    scheduleFrame: (task) => {
      const view = editor.Canvas?.getBody?.()?.ownerDocument?.defaultView;
      if (view?.requestAnimationFrame) {
        view.requestAnimationFrame(() => task());
        return;
      }

      setTimeout(task, 0);
    },
    applyPatch: (patch) => adapter.patchSnapshot(patch as Partial<ReturnType<typeof adapter.getSnapshot>>),
  });

  const buildFullPayload = () => {
    const selection = bumpSelectionRevision();
    const primary = getPrimarySelectedComponent(editor);

    return {
      immediate: {
        selection,
        layers: readProjectedLayerSnapshot(editor, primary, expandedLayerIds),
      },
      deferred: () => ({
        selector: readSelectorSnapshot({
          selected: getSelectedComponents(editor).map((component) => toSelectorSource(component)),
          activeState: editor.SelectorManager?.getState?.() ?? '',
        }),
        style: readStyleSnapshot({
          selection: getSelectedComponents(editor).map((component, index) => ({
            styles: getStyleSourceForComponent(editor, component, index),
            classes: readComponentClasses(component),
          })),
          activeState: editor.SelectorManager?.getState?.() ?? '',
        }),
      }),
    };
  };

  const baseSubscribe = adapter.subscribe.bind(adapter);
  const selectionEvents = [
    'component:selected',
    'component:deselected',
  ];
  const immediateRefreshEvents = [
    'component:update',
    'component:styleUpdate',
    'selector:add',
    'selector:remove',
    'layer:component',
  ];
  const handleSelectionChange = () => {
    scheduler.scheduleSelection(buildFullPayload());
  };
  const handleEditorChange = () => {
    adapter.notify();
  };
  let activeSubscriberCount = 0;
  let editorListenersAttached = false;
  let snapshotMayBeStale = false;

  const attachEditorListeners = () => {
    if (editorListenersAttached) {
      return;
    }

    selectionEvents.forEach((eventName) => {
      editor.on?.(eventName, handleSelectionChange);
    });
    immediateRefreshEvents.forEach((eventName) => {
      editor.on?.(eventName, handleEditorChange);
    });
    editorListenersAttached = true;
  };

  const detachEditorListeners = () => {
    if (!editorListenersAttached) {
      return;
    }

    selectionEvents.forEach((eventName) => {
      editor.off?.(eventName, handleSelectionChange);
    });
    immediateRefreshEvents.forEach((eventName) => {
      editor.off?.(eventName, handleEditorChange);
    });
    editorListenersAttached = false;
  };

  adapter.subscribe = (listener) => {
    if (activeSubscriberCount === 0) {
      if (snapshotMayBeStale) {
        adapter.notify();
        snapshotMayBeStale = false;
      }
      attachEditorListeners();
    }

    activeSubscriberCount += 1;
    const unsubscribe = baseSubscribe(listener);

    return () => {
      unsubscribe();
      activeSubscriberCount = Math.max(0, activeSubscriberCount - 1);

      if (activeSubscriberCount === 0) {
        detachEditorListeners();
        snapshotMayBeStale = true;
      }
    };
  };

  return {
    adapter,
    actions: {
      selector: {
        addClass: (className: string) => {
          getSelectedComponents(editor).forEach((component) => addClass(component, className));
          adapter.notify();
        },
        removeClass: (className: string) => {
          getSelectedComponents(editor).forEach((component) => removeClass(component, className));
          adapter.notify();
        },
        setState: (state: string) => {
          getSelectedComponents(editor).forEach((component) => setSelectorState(component, state));
          editor.SelectorManager?.setState?.(state);
          adapter.notify();
        },
      },
      style: {
        updateStyle: (input: { property: string; value: string; targetKind: 'rule' | 'inline' }) => {
          updateStyle({
            updateRuleStyle: (property, value) => updateRuleStyle(editor, property, value),
            updateInlineStyle: (property, value) => updateInlineStyle(editor, property, value),
          }, input);
          adapter.notify();
        },
      },
      layers: {
        selectLayer: (id: string, event?: LayerSelectionEvent) => {
          const layers = getLayerManager(editor);
          const root = layers?.getRoot?.() ?? (editor.DomComponents?.getWrapper?.() as GrapesComponent | undefined);
          const target = findComponentById(root, id, (component) => getLayerChildren(editor, component));
          if (target) {
            selectComponent(editor, target, event);
            bumpSelectionRevision();
            adapter.notify();
          }
        },
        selectParentLayer: (id: string) => {
          const layers = getLayerManager(editor);
          const root = layers?.getRoot?.() ?? (editor.DomComponents?.getWrapper?.() as GrapesComponent | undefined);
          const target = findComponentById(root, id, (component) => getLayerChildren(editor, component));
          const parent = target?.parent?.() ?? null;
          if (!target || !parent || parent === root) {
            return;
          }

          selectComponent(editor, parent, null);
          bumpSelectionRevision();
          adapter.notify();
        },
        duplicateLayer: (id: string) => {
          const layers = getLayerManager(editor);
          const root = layers?.getRoot?.() ?? (editor.DomComponents?.getWrapper?.() as GrapesComponent | undefined);
          const target = findComponentById(root, id, (component) => getLayerChildren(editor, component));
          const parent = target?.parent?.() ?? null;
          const clone = target?.clone?.() ?? null;
          const at = typeof target?.index?.() === 'number' ? target.index() + 1 : undefined;
          if (!target || !parent || !clone || at === undefined) {
            return;
          }

          insertComponentIntoParent(parent, clone, at);
          selectComponent(editor, clone, null);
          bumpSelectionRevision();
          adapter.notify();
        },
        deleteLayer: (id: string) => {
          const layers = getLayerManager(editor);
          const root = layers?.getRoot?.() ?? (editor.DomComponents?.getWrapper?.() as GrapesComponent | undefined);
          const target = findComponentById(root, id, (component) => getLayerChildren(editor, component));
          if (!target || target === root) {
            return;
          }

          target.remove?.();
          adapter.notify();
        },
        toggleLayerExpanded: (id: string) => {
          const layers = getLayerManager(editor);
          const root = layers?.getRoot?.() ?? (editor.DomComponents?.getWrapper?.() as GrapesComponent | undefined);
          const target = findComponentById(root, id, (component) => getLayerChildren(editor, component));
          if (!target) {
            return;
          }

          if (layers?.setOpen) {
            const isOpen = Boolean(layers.getLayerData?.(target)?.open ?? target.get?.('open'));
            layers.setOpen(target, !isOpen);
          } else {
            target.set?.('open', !target.get?.('open'));
          }
          if (expandedLayerIds.has(id)) {
            expandedLayerIds.delete(id);
          } else {
            expandedLayerIds.add(id);
          }
          adapter.notify();
        },
        toggleLayerVisible: (id: string) => {
          const layers = getLayerManager(editor);
          const root = layers?.getRoot?.() ?? (editor.DomComponents?.getWrapper?.() as GrapesComponent | undefined);
          const target = findComponentById(root, id, (component) => getLayerChildren(editor, component));
          const visible = layers?.getLayerData?.(target as GrapesComponent)?.visible ?? target?.get?.('visible');
          if (!target) {
            return;
          }

          if (layers?.setVisible) {
            layers.setVisible(target, visible === undefined ? false : !visible);
          } else {
            target.set?.('visible', visible === undefined ? false : !visible);
          }
          adapter.notify();
        },
        moveLayer: (sourceId: string, targetId: string) => {
          if (!sourceId || !targetId || sourceId === targetId) {
            return;
          }

          const layers = getLayerManager(editor);
          const root = layers?.getRoot?.() ?? (editor.DomComponents?.getWrapper?.() as GrapesComponent | undefined);
          const getChildren = (component: GrapesComponent) => getLayerChildren(editor, component);
          const source = findComponentById(root, sourceId, getChildren);
          const target = findComponentById(root, targetId, getChildren);

          if (!source || !target || hasDescendant(source, targetId, getChildren)) {
            return;
          }

          const targetParent = target.parent?.() ?? root;
          const at = target.index?.();
          if (!targetParent || typeof at !== 'number') {
            return;
          }

          source.move?.(targetParent, { at });
          adapter.notify();
        },
      },
    },
  };
}
