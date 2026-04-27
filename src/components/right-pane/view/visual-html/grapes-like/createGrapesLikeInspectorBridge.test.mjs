import test from 'node:test';
import assert from 'node:assert/strict';
import { createGrapesLikeInspectorBridge } from './createGrapesLikeInspectorBridge.ts';

function createComponent({
  id,
  name,
  type,
  status,
  open = false,
  visible = true,
  styles = {},
  classes = [],
} = {}) {
  const state = {
    id,
    name,
    type,
    status,
    open,
    visible,
    styles: { ...styles },
    classes: [...classes],
  };

  const component = {
    getId: () => state.id,
    getName: () => state.name,
    getType: () => state.type,
    get: (key) => {
      if (key === 'id') return state.id;
      if (key === 'name') return state.name;
      if (key === 'type') return state.type;
      if (key === 'status') return state.status;
      if (key === 'open') return state.open;
      if (key === 'visible') return state.visible;
      return undefined;
    },
    getStyle: () => ({ ...state.styles }),
    getSelectorsString: () => '',
    getClasses: () => state.classes.map((entry) => ({ get: (key) => (key === 'name' ? entry : undefined) })),
    addStyle: (patch) => {
      state.styles = { ...state.styles, ...patch };
    },
    removeStyle: (property) => {
      delete state.styles[property];
    },
    set: (key, value) => {
      if (key === 'status') state.status = value;
      if (key === 'open') state.open = value;
      if (key === 'visible') state.visible = value;
    },
  };

  component.clone = () => createComponent({
    id: `${state.id}-copy`,
    name: state.name,
    type: state.type,
    status: state.status,
    open: state.open,
    visible: state.visible,
    styles: state.styles,
    classes: state.classes,
  });

  return component;
}

function createEditorFixture() {
  const wrapper = createComponent({ id: 'wrapper', type: 'wrapper', open: true });
  const hero = createComponent({ id: 'hero', name: 'Hero', type: 'section', open: true });
  const cta = createComponent({ id: 'cta', name: 'CTA', type: 'button', status: 'selected' });
  const badge = createComponent({ id: 'badge', name: 'Badge', type: 'span' });
  const textNode = createComponent({ id: 'text-1', type: 'textnode' });

  const tree = new Map([
    [wrapper, [hero]],
    [hero, [cta, badge]],
    [badge, []],
    [cta, []],
    [textNode, []],
  ]);

  const calls = {
    setLayerData: [],
    setVisible: [],
    setOpen: [],
    move: [],
    remove: [],
    select: [],
    selectorState: [],
    on: [],
    off: [],
  };
  const frameQueue = [];
  const frameWindow = {
    requestAnimationFrame: (callback) => {
      frameQueue.push(callback);
      return frameQueue.length;
    },
  };

  const editor = {
    getSelectedAll: () => [cta],
    getSelected: () => cta,
    select: (component) => {
      calls.select.push(component);
    },
    on: (eventName, listener) => {
      calls.on.push({ eventName, listener });
    },
    off: (eventName, listener) => {
      calls.off.push({ eventName, listener });
    },
    SelectorManager: {
      getState: () => '',
      setState: (value) => {
        calls.selectorState.push(value);
      },
    },
    CssComposer: {
      setRule: () => null,
    },
    Canvas: {
      getBody: () => ({
        ownerDocument: {
          defaultView: frameWindow,
        },
      }),
    },
    Layers: {
      getRoot: () => wrapper,
      getComponents: (component) => tree.get(component) ?? [],
      getLayerData: (component) => ({
        name: component.getName?.() ?? component.getType?.(),
        open: Boolean(component.get('open')),
        selected: component.get('status') === 'selected',
        visible: component.get('visible') !== false,
        components: tree.get(component) ?? [],
      }),
      setLayerData: (component, data, opts) => {
        calls.setLayerData.push({ component, data, ...(opts ? { opts } : {}) });
      },
      setVisible: (component, value) => {
        calls.setVisible.push({ component, value });
      },
      setOpen: (component, value) => {
        calls.setOpen.push({ component, value });
      },
    },
    DomComponents: {
      getWrapper: () => textNode,
    },
  };

  const getChildren = (component) => tree.get(component) ?? [];
  const findParent = (target) => {
    for (const [parent, children] of tree.entries()) {
      if (children.includes(target)) {
        return parent;
      }
    }
    return null;
  };

  const decorateComponent = (component) => {
    tree.set(component, tree.get(component) ?? []);
    component.parent = () => findParent(component);
    component.index = () => {
      const parent = findParent(component);
      return parent ? getChildren(parent).indexOf(component) : 0;
    };
    component.move = (parent, opts = {}) => {
      const currentParent = findParent(component);
      if (!parent) {
        return component;
      }

      if (currentParent) {
        const currentChildren = [...getChildren(currentParent)];
        const currentIndex = currentChildren.indexOf(component);
        if (currentIndex >= 0) {
          currentChildren.splice(currentIndex, 1);
          tree.set(currentParent, currentChildren);
        }
      }

      const nextChildren = [...getChildren(parent)];
      const at = typeof opts.at === 'number' ? opts.at : nextChildren.length;
      nextChildren.splice(at, 0, component);
      tree.set(parent, nextChildren);
      calls.move.push({ component, parent, opts });
      return component;
    };
    component.remove = () => {
      const currentParent = findParent(component);
      if (!currentParent) {
        return component;
      }

      const currentChildren = [...getChildren(currentParent)];
      const currentIndex = currentChildren.indexOf(component);
      if (currentIndex >= 0) {
        currentChildren.splice(currentIndex, 1);
        tree.set(currentParent, currentChildren);
      }
      tree.delete(component);
      calls.remove.push(component);
      return component;
    };
    component.clone = () => {
      const clone = createComponent({
        id: `${component.getId()}-copy`,
        name: component.getName?.(),
        type: component.getType?.(),
        status: component.get?.('status'),
        open: component.get?.('open'),
        visible: component.get?.('visible') !== false,
        styles: component.getStyle?.(),
        classes: component.getClasses?.().map((entry) => entry.get?.('name') ?? '').filter(Boolean),
      });
      return decorateComponent(clone);
    };
    return component;
  };

  [wrapper, hero, cta, badge, textNode].forEach(decorateComponent);

  return { editor, wrapper, hero, cta, badge, textNode, calls, frameQueue, tree };
}

function emitEditorEvent(calls, eventName) {
  calls.on
    .filter((entry) => entry.eventName === eventName)
    .forEach((entry) => entry.listener());
}

function flushFrame(frameQueue) {
  const callback = frameQueue.shift();
  if (callback) {
    callback();
  }
}

test('createGrapesLikeInspectorBridge reads roots from editor.Layers instead of raw wrapper recursion', () => {
  const { editor } = createEditorFixture();

  const bridge = createGrapesLikeInspectorBridge(editor);
  const snapshot = bridge.adapter.getSnapshot();

  assert.equal(snapshot.layers.roots.length, 1);
  assert.equal(snapshot.layers.roots[0].id, 'hero');
  assert.equal(snapshot.layers.roots[0].children[0].id, 'cta');
  assert.deepEqual(snapshot.layers.selectedLayerIds, ['cta']);
});

test('createGrapesLikeInspectorBridge selects a layer via editor.Layers.setLayerData', () => {
  const { editor, cta, calls } = createEditorFixture();

  const bridge = createGrapesLikeInspectorBridge(editor);
  bridge.actions.layers.selectLayer('cta');

  assert.deepEqual(calls.setLayerData, [{ component: cta, data: { selected: true } }]);
  assert.equal(calls.select.length, 0);
});

test('createGrapesLikeInspectorBridge forwards pointer modifier keys when selecting a layer', () => {
  const { editor, cta, calls } = createEditorFixture();
  const event = { ctrlKey: true, metaKey: false, shiftKey: false };

  const bridge = createGrapesLikeInspectorBridge(editor);
  bridge.actions.layers.selectLayer('cta', event);

  assert.deepEqual(calls.setLayerData, [{ component: cta, data: { selected: true }, opts: { event } }]);
});

test('createGrapesLikeInspectorBridge toggles visibility via editor.Layers.setVisible', () => {
  const { editor, cta, calls } = createEditorFixture();

  const bridge = createGrapesLikeInspectorBridge(editor);
  bridge.actions.layers.toggleLayerVisible('cta');

  assert.deepEqual(calls.setVisible, [{ component: cta, value: false }]);
});

test('createGrapesLikeInspectorBridge selects a parent layer when available', () => {
  const { editor, hero, calls } = createEditorFixture();

  const bridge = createGrapesLikeInspectorBridge(editor);
  bridge.actions.layers.selectParentLayer('cta');

  assert.deepEqual(calls.setLayerData, [{ component: hero, data: { selected: true } }]);
});

test('createGrapesLikeInspectorBridge duplicates a layer next to the original', () => {
  const { editor, hero, calls } = createEditorFixture();

  const bridge = createGrapesLikeInspectorBridge(editor);
  bridge.actions.layers.duplicateLayer('cta');

  assert.equal(calls.move.length, 1);
  assert.equal(calls.move[0].parent, hero);
  assert.deepEqual(calls.move[0].opts, { at: 1 });
});

test('createGrapesLikeInspectorBridge deletes a layer', () => {
  const { editor, cta, calls } = createEditorFixture();

  const bridge = createGrapesLikeInspectorBridge(editor);
  bridge.actions.layers.deleteLayer('cta');

  assert.deepEqual(calls.remove, [cta]);
});

test('createGrapesLikeInspectorBridge moves a layer before the target layer', () => {
  const { editor, hero, cta, calls } = createEditorFixture();

  const bridge = createGrapesLikeInspectorBridge(editor);
  bridge.actions.layers.moveLayer('cta', 'hero');

  assert.equal(calls.move.length, 1);
  assert.equal(calls.move[0].component, cta);
  assert.equal(calls.move[0].parent.getId(), 'wrapper');
  assert.deepEqual(calls.move[0].opts, { at: 0 });
});

test('createGrapesLikeInspectorBridge keeps selector state snapshot in sync after changing state', () => {
  const { editor, calls } = createEditorFixture();
  let selectorState = '';
  editor.SelectorManager.getState = () => selectorState;
  editor.SelectorManager.setState = (value) => {
    selectorState = value;
    calls.selectorState.push(value);
  };

  const bridge = createGrapesLikeInspectorBridge(editor);
  bridge.actions.selector.setState('hover');
  const snapshot = bridge.adapter.getSnapshot();

  assert.deepEqual(calls.selectorState, ['hover']);
  assert.equal(snapshot.selector.activeState, 'hover');
  assert.equal(snapshot.style.targetKind, 'inline');
});

test('createGrapesLikeInspectorBridge marks the current editor selection even when layer data is stale', () => {
  const { editor, cta } = createEditorFixture();
  editor.Layers.getLayerData = (component) => ({
    name: component.getName?.() ?? component.getType?.(),
    open: Boolean(component.get('open')),
    selected: false,
    visible: component.get('visible') !== false,
    components: [],
  });

  const bridge = createGrapesLikeInspectorBridge(editor);
  const snapshot = bridge.adapter.getSnapshot();

  assert.deepEqual(snapshot.selection.selectedIds, ['cta']);
  assert.deepEqual(snapshot.layers.selectedLayerIds, ['cta']);
  assert.equal(snapshot.layers.roots[0].children[0].selected, true);
});

test('createGrapesLikeInspectorBridge invalidates cached snapshots when editor selection events fire', () => {
  const { editor, hero, cta, calls, frameQueue } = createEditorFixture();
  let selected = cta;

  editor.getSelected = () => selected;
  editor.getSelectedAll = () => [selected];

  const bridge = createGrapesLikeInspectorBridge(editor);
  const unsubscribe = bridge.adapter.subscribe(() => {});
  const first = bridge.adapter.getSnapshot();

  selected = hero;
  emitEditorEvent(calls, 'component:selected');
  flushFrame(frameQueue);
  flushFrame(frameQueue);

  const second = bridge.adapter.getSnapshot();
  unsubscribe();

  assert.notStrictEqual(second, first);
  assert.deepEqual(second.selection.selectedIds, ['hero']);
  assert.deepEqual(second.layers.selectedLayerIds, ['hero']);
});

test('createGrapesLikeInspectorBridge shares one set of editor listeners across multiple subscribers', () => {
  const { editor, calls } = createEditorFixture();
  const bridge = createGrapesLikeInspectorBridge(editor);
  let firstNotifications = 0;
  let secondNotifications = 0;

  const unsubscribeFirst = bridge.adapter.subscribe(() => {
    firstNotifications += 1;
  });
  const onCountAfterFirstSubscribe = calls.on.length;

  const unsubscribeSecond = bridge.adapter.subscribe(() => {
    secondNotifications += 1;
  });

  assert.equal(calls.on.length, onCountAfterFirstSubscribe);

  emitEditorEvent(calls, 'component:update');

  assert.equal(firstNotifications, 1);
  assert.equal(secondNotifications, 1);

  unsubscribeFirst();
  assert.equal(calls.off.length, 0);

  unsubscribeSecond();
  assert.equal(calls.off.length, onCountAfterFirstSubscribe);
});

test('createGrapesLikeInspectorBridge refreshes stale cache when subscribing after a detached period', () => {
  const { editor, hero, cta } = createEditorFixture();
  let selected = cta;

  editor.getSelected = () => selected;
  editor.getSelectedAll = () => [selected];

  const bridge = createGrapesLikeInspectorBridge(editor);
  const initial = bridge.adapter.getSnapshot();
  const unsubscribe = bridge.adapter.subscribe(() => {});

  unsubscribe();
  selected = hero;

  const resubscribe = bridge.adapter.subscribe(() => {});
  const refreshed = bridge.adapter.getSnapshot();
  resubscribe();

  assert.equal(initial.selection.primarySelectedId, 'cta');
  assert.equal(refreshed.selection.primarySelectedId, 'hero');
});

test('createGrapesLikeInspectorBridge keeps selection and layer projection aligned while style stays deferred', () => {
  const { editor, hero, cta, calls, frameQueue } = createEditorFixture();
  let selected = cta;

  editor.getSelected = () => selected;
  editor.getSelectedAll = () => [selected];

  const bridge = createGrapesLikeInspectorBridge(editor);
  bridge.adapter.getSnapshot();
  const updates = [];
  const unsubscribe = bridge.adapter.subscribe(() => {
    const snapshot = bridge.adapter.getSnapshot();
    updates.push({
      selection: snapshot.selection.primarySelectedId,
      styleTargetKind: snapshot.style.targetKind,
      layerSelection: [...snapshot.layers.selectedLayerIds],
    });
  });

  selected = hero;
  emitEditorEvent(calls, 'component:selected');

  assert.deepEqual(updates, [{
    selection: 'hero',
    styleTargetKind: 'inline',
    layerSelection: ['hero'],
  }]);
  assert.equal(frameQueue.length, 1);

  flushFrame(frameQueue);
  assert.deepEqual(updates[1], {
    selection: 'hero',
    styleTargetKind: 'inline',
    layerSelection: ['hero'],
  });
  unsubscribe();
});

test('createGrapesLikeInspectorBridge projects only selected paths until a branch is expanded', () => {
  const { editor } = createEditorFixture();

  const bridge = createGrapesLikeInspectorBridge(editor);
  const beforeExpand = bridge.adapter.getSnapshot();
  const heroLayer = beforeExpand.layers.roots[0];

  assert.equal(heroLayer.id, 'hero');
  assert.equal(heroLayer.expanded, true);
  assert.deepEqual(heroLayer.children.map((node) => node.id), ['cta']);

  bridge.actions.layers.toggleLayerExpanded('hero');

  const afterExpand = bridge.adapter.getSnapshot();
  assert.deepEqual(afterExpand.layers.roots[0].children.map((node) => node.id), ['cta', 'badge']);
  assert.deepEqual(afterExpand.layers.expandedLayerIds, ['hero']);
});

test('createGrapesLikeInspectorBridge derives selected paths from parents without scanning unrelated branches', () => {
  const { editor, wrapper, hero, cta, tree } = createEditorFixture();
  const unrelatedBranch = createComponent({ id: 'bulk-branch', name: 'Bulk', type: 'section' });
  const expensiveChild = createComponent({ id: 'bulk-child', name: 'Bulk child', type: 'div' });
  let unrelatedChildReads = 0;

  unrelatedBranch.parent = () => wrapper;
  unrelatedBranch.index = () => 0;
  expensiveChild.parent = () => unrelatedBranch;
  expensiveChild.index = () => 0;
  tree.set(wrapper, [unrelatedBranch, hero]);
  tree.set(unrelatedBranch, [expensiveChild]);
  tree.set(expensiveChild, []);

  const originalGetComponents = editor.Layers.getComponents;
  editor.Layers.getComponents = (component) => {
    if (component === unrelatedBranch) {
      unrelatedChildReads += 1;
    }
    return originalGetComponents(component);
  };

  const bridge = createGrapesLikeInspectorBridge(editor);
  const snapshot = bridge.adapter.getSnapshot();

  assert.deepEqual(snapshot.layers.selectedLayerIds, ['cta']);
  assert.equal(snapshot.layers.roots[1].id, 'hero');
  assert.deepEqual(snapshot.layers.roots[1].children.map((node) => node.id), ['cta']);
  assert.equal(unrelatedChildReads, 0);
});

test('createGrapesLikeInspectorBridge does not materialize selected container children until expanded', () => {
  const { editor, hero } = createEditorFixture();
  let heroChildReads = 0;

  editor.getSelected = () => hero;
  editor.getSelectedAll = () => [hero];

  const originalGetComponents = editor.Layers.getComponents;
  editor.Layers.getComponents = (component) => {
    if (component === hero) {
      heroChildReads += 1;
    }
    return originalGetComponents(component);
  };

  const bridge = createGrapesLikeInspectorBridge(editor);
  const beforeExpand = bridge.adapter.getSnapshot();

  assert.deepEqual(beforeExpand.layers.selectedLayerIds, ['hero']);
  assert.equal(beforeExpand.layers.roots[0].id, 'hero');
  assert.equal(beforeExpand.layers.roots[0].selected, true);
  assert.equal(beforeExpand.layers.roots[0].canExpand, true);
  assert.deepEqual(beforeExpand.layers.roots[0].children, []);
  assert.equal(heroChildReads, 0);

  bridge.actions.layers.toggleLayerExpanded('hero');
  const afterExpand = bridge.adapter.getSnapshot();

  assert.deepEqual(afterExpand.layers.roots[0].children.map((node) => node.id), ['cta', 'badge']);
  assert.equal(heroChildReads, 1);
});

test('createGrapesLikeInspectorBridge reads style values from editor.getSelectedToStyle when classes map to a rule target', () => {
  const { editor, cta } = createEditorFixture();
  const ruleTarget = {
    getStyle: () => ({
      float: 'left',
      left: '40px',
      display: 'flex',
    }),
  };

  cta.getStyle = () => ({});
  cta.getSelectorsString = () => '.cta';
  cta.getClasses = () => [{ get: (key) => (key === 'name' ? 'cta' : undefined) }];
  editor.getSelectedToStyle = () => ruleTarget;

  const bridge = createGrapesLikeInspectorBridge(editor);
  const snapshot = bridge.adapter.getSnapshot();
  const layout = snapshot.style.sectors.find((sector) => sector.key === 'layout');
  const floatProperty = layout.properties.find((property) => property.property === 'float');
  const displayProperty = layout.properties.find((property) => property.property === 'display');

  assert.equal(snapshot.style.targetKind, 'rule');
  assert.equal(floatProperty.value.committed.value, 'left');
  assert.equal(ruleTarget.getStyle().left, '40px');
  assert.equal(displayProperty.value.committed.value, 'flex');
});

test('createGrapesLikeInspectorBridge keeps writing rule styles to the same selected style target', () => {
  const { editor, cta } = createEditorFixture();
  const ruleState = {
    position: 'absolute',
  };
  const ruleTarget = {
    getStyle: () => ({ ...ruleState }),
    addStyle: (patch) => {
      Object.assign(ruleState, patch);
    },
    removeStyle: (property) => {
      delete ruleState[property];
    },
  };

  cta.getStyle = () => ({});
  cta.getSelectorsString = () => '.cta';
  cta.getClasses = () => [{ get: (key) => (key === 'name' ? 'cta' : undefined) }];
  editor.getSelectedToStyle = () => ruleTarget;
  editor.StyleManager = {
    getModelToStyle: () => ruleTarget,
  };

  const bridge = createGrapesLikeInspectorBridge(editor);
  bridge.actions.style.updateStyle({ property: 'position', value: 'absolute', targetKind: 'rule' });
  bridge.actions.style.updateStyle({ property: 'top', value: '12px', targetKind: 'rule' });

  const snapshot = bridge.adapter.getSnapshot();
  const layout = snapshot.style.sectors.find((sector) => sector.key === 'layout');
  const positionProperty = layout.properties.find((property) => property.property === 'position');

  assert.equal(snapshot.style.targetKind, 'rule');
  assert.equal(positionProperty.value.committed.value, 'absolute');
  assert.equal(ruleState.top, '12px');
});
