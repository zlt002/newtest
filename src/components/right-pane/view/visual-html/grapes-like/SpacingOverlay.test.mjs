import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';

const tsxLoaderUrl = new URL('../../../../code-editor/view/subcomponents/tsx-loader.mjs', import.meta.url).href;

const loaderSource = `
import * as base from ${JSON.stringify(tsxLoaderUrl)};

export async function resolve(specifier, context, nextResolve) {
  return base.resolve(specifier, context, nextResolve);
}

export async function load(url, context, nextLoad) {
  return base.load(url, context, nextLoad);
}
`;

register(`data:text/javascript,${encodeURIComponent(loaderSource)}`, import.meta.url);

const {
  applyPositionDragDelta,
  applyResizeDragDelta,
  attachCanvasMarqueeSelection,
  attachSpacingOverlayToolbarSync,
  applyInlineStyleToTarget,
  applyPositionStylesToTarget,
  applyResizeStylesToTarget,
  applySpacingDragDelta,
  buildSpacingSnapshot,
  buildElementStyleChatPrompt,
  buildSendSelectionToChatPayload,
  extractComponentIdentity,
  findElementSourceLocation,
  findClosestElementSourceLocation,
  getPositionDragCursor,
  getPositionDragPreviewLabel,
  isPositionDragEnabled,
  isWrapperComponent,
  replaceToolbarMoveCommandWithSendCommand,
  shouldSuppressDuplicateSend,
  getVisibleSpacingKinds,
  getVisibleSpacingHandleSides,
  getScrollSyncTargets,
  parseSpacingLength,
  readSpacingBoxFromStyle,
  syncSpacingOverlayToolbar,
} = await import('./SpacingOverlay.tsx');
const { createGrapesLikeInspectorBridge } = await import('./createGrapesLikeInspectorBridge.ts');
const { buildSourceLocationMap } = await import('../sourceLocationMapping.ts');

function createToolbarSelectionFixture() {
  const listeners = new Map();
  const refreshCalls = [];
  const commandAdds = [];
  const commandRemoves = [];
  const frameQueue = [];

  const wrapper = {
    getId: () => 'wrapper',
    getName: () => 'Wrapper',
    getType: () => 'wrapper',
    get: (key) => (key === 'open' ? true : key === 'visible' ? true : key === 'id' ? 'wrapper' : undefined),
  };
  const heroState = {
    toolbar: [{ command: 'tlb-move' }, { command: 'tlb-clone' }],
  };
  const hero = {
    getId: () => 'hero',
    getName: () => 'Hero',
    getType: () => 'section',
    get: (key) => {
      if (key === 'open') return true;
      if (key === 'visible') return true;
      if (key === 'id') return 'hero';
      if (key === 'toolbar') return heroState.toolbar;
      if (key === 'status') return selected.id === 'hero' ? 'selected' : '';
      return undefined;
    },
    set: (key, value) => {
      if (key === 'toolbar') {
        heroState.toolbar = value;
      }
    },
    getStyle: () => ({}),
    getSelectorsString: () => '',
    getClasses: () => [],
  };
  let selected = {
    toolbar: [{ command: 'tlb-move' }, { command: 'tlb-delete' }],
    id: 'cta',
  };
  const cta = {
    getId: () => 'cta',
    getName: () => 'CTA',
    getType: () => 'button',
    get: (key) => {
      if (key === 'id') return 'cta';
      if (key === 'toolbar') return selected.toolbar;
      if (key === 'status') return selected.id === 'cta' ? 'selected' : '';
      if (key === 'visible') return true;
      if (key === 'open') return false;
      return undefined;
    },
    set: (key, value) => {
      if (key === 'toolbar') {
        selected.toolbar = value;
      }
    },
    getStyle: () => ({}),
    getSelectorsString: () => '',
    getClasses: () => [],
  };
  const badge = {
    getId: () => 'badge',
    getName: () => 'Badge',
    getType: () => 'span',
    get: (key) => (key === 'visible' ? true : key === 'open' ? false : key === 'id' ? 'badge' : undefined),
  };
  const tree = new Map([
    [wrapper, [hero]],
    [hero, [cta, badge]],
    [cta, []],
    [badge, []],
  ]);

  const editor = {
    getSelected: () => (selected.id === 'hero' ? hero : cta),
    getSelectedAll: () => [selected.id === 'hero' ? hero : cta],
    refresh: (options) => {
      refreshCalls.push(options);
    },
    on: (eventName, listener) => {
      const bucket = listeners.get(eventName) ?? [];
      bucket.push(listener);
      listeners.set(eventName, bucket);
    },
    off: (eventName, listener) => {
      const bucket = listeners.get(eventName) ?? [];
      listeners.set(eventName, bucket.filter((entry) => entry !== listener));
    },
    Commands: {
      add: (name) => {
        commandAdds.push(name);
      },
      remove: (name) => {
        commandRemoves.push(name);
      },
    },
    SelectorManager: {
      getState: () => '',
    },
    CssComposer: {
      setRule: () => null,
    },
    Canvas: {
      refresh: () => {},
      getBody: () => ({
        ownerDocument: {
          defaultView: {
            requestAnimationFrame: (callback) => {
              frameQueue.push(callback);
              return frameQueue.length;
            },
          },
        },
      }),
    },
    Layers: {
      getRoot: () => wrapper,
      getComponents: (component) => tree.get(component) ?? [],
      getLayerData: (component) => ({
        name: component.getName?.() ?? component.getType?.(),
        open: Boolean(component.get?.('open')),
        selected: component.getId?.() === selected.id,
        visible: component.get?.('visible') !== false,
        components: tree.get(component) ?? [],
      }),
      setLayerData: () => {},
      setVisible: () => {},
      setOpen: () => {},
    },
    DomComponents: {
      getWrapper: () => wrapper,
    },
  };

  return {
    editor,
    refreshCalls,
    commandAdds,
    commandRemoves,
    emit(eventName, payload) {
      for (const listener of listeners.get(eventName) ?? []) {
        listener(payload);
      }
    },
    flushFrame() {
      const callback = frameQueue.shift();
      if (callback) {
        callback();
      }
    },
    getPendingFrameCount() {
      return frameQueue.length;
    },
    readToolbar() {
      return (selected.id === 'hero' ? heroState.toolbar : selected.toolbar);
    },
    selectHero() {
      selected = {
        toolbar: selected.toolbar,
        id: 'hero',
      };
    },
  };
}

test('parseSpacingLength preserves numeric CSS lengths and rejects keywords', () => {
  assert.deepEqual(parseSpacingLength('12px'), { value: 12, unit: 'px' });
  assert.deepEqual(parseSpacingLength('-4.5rem'), { value: -4.5, unit: 'rem' });
  assert.deepEqual(parseSpacingLength('auto'), { value: null, unit: '' });
});

test('applySpacingDragDelta uses the same stepped drag behavior as the numeric fields', () => {
  assert.deepEqual(
    applySpacingDragDelta({ value: '12', unit: 'px' }, 2, {}),
    { value: '14', unit: 'px' },
  );
  assert.deepEqual(
    applySpacingDragDelta({ value: '12', unit: 'px' }, -2, { shiftKey: true }),
    { value: '11.8', unit: 'px' },
  );
  assert.deepEqual(
    applySpacingDragDelta({ value: '', unit: '' }, 2, {}),
    { value: '2', unit: 'px' },
  );
});

test('applyInlineStyleToTarget writes directly to the locked drag target even if editor selection changes', () => {
  const calls = [];
  const target = {
    addStyle(style) {
      calls.push({ type: 'add', style });
    },
    removeStyle(property) {
      calls.push({ type: 'remove', property });
    },
  };

  applyInlineStyleToTarget(target, 'margin-left', '24px');
  applyInlineStyleToTarget(target, 'margin-left', '   ');

  assert.deepEqual(calls, [
    { type: 'add', style: { 'margin-left': '24px' } },
    { type: 'remove', property: 'margin-left' },
  ]);
});

test('isPositionDragEnabled only allows absolute and fixed layers to move on canvas', () => {
  assert.equal(isPositionDragEnabled('absolute'), true);
  assert.equal(isPositionDragEnabled('fixed'), true);
  assert.equal(isPositionDragEnabled('relative'), false);
  assert.equal(isPositionDragEnabled('static'), false);
  assert.equal(isPositionDragEnabled(''), false);
});

test('applyPositionDragDelta updates left and top from pointer movement in px', () => {
  assert.deepEqual(
    applyPositionDragDelta(
      { left: { value: '12', unit: 'px' }, top: { value: '24', unit: 'px' } },
      { x: 18, y: -6 },
    ),
    {
      left: { value: '30', unit: 'px' },
      top: { value: '18', unit: 'px' },
    },
  );

  assert.deepEqual(
    applyPositionDragDelta(
      { left: { value: '', unit: '' }, top: { value: '', unit: '' } },
      { x: 5, y: 9 },
    ),
    {
      left: { value: '5', unit: 'px' },
      top: { value: '9', unit: 'px' },
    },
  );
});

test('applyResizeDragDelta resizes from edges and corners with a minimum size', () => {
  assert.deepEqual(
    applyResizeDragDelta(
      { width: { value: '120', unit: 'px' }, height: { value: '80', unit: 'px' }, aspectRatio: 1.5 },
      { x: 20, y: 10 },
      'bottom-right',
      {},
    ),
    { width: { value: '140', unit: 'px' }, height: { value: '90', unit: 'px' } },
  );
  assert.deepEqual(
    applyResizeDragDelta(
      { width: { value: '120', unit: 'px' }, height: { value: '80', unit: 'px' }, aspectRatio: 1.5 },
      { x: 200, y: 0 },
      'left',
      {},
    ),
    { width: { value: '8', unit: 'px' }, height: { value: '80', unit: 'px' } },
  );
});

test('applyResizeDragDelta preserves aspect ratio while shift is held', () => {
  assert.deepEqual(
    applyResizeDragDelta(
      { width: { value: '120', unit: 'px' }, height: { value: '80', unit: 'px' }, aspectRatio: 1.5 },
      { x: 30, y: 5 },
      'bottom-right',
      { shiftKey: true },
    ),
    { width: { value: '150', unit: 'px' }, height: { value: '100', unit: 'px' } },
  );
});

test('getScrollSyncTargets includes document scroll roots, scrollable ancestors, and de-duplicates targets', () => {
  const win = {
    getComputedStyle(element) {
      return {
        overflowX: element.overflowX ?? 'visible',
        overflowY: element.overflowY ?? 'visible',
      };
    },
  };
  const html = {
    overflowY: 'visible',
    parentElement: null,
    ownerDocument: null,
  };
  const doc = {
    defaultView: win,
    documentElement: html,
  };
  const root = {
    overflowY: 'auto',
    parentElement: html,
    ownerDocument: doc,
  };
  const frame = {
    overflowY: 'scroll',
    parentElement: root,
    ownerDocument: doc,
  };
  const body = {
    overflowY: 'visible',
    parentElement: frame,
    ownerDocument: doc,
  };
  html.ownerDocument = doc;

  assert.deepEqual(getScrollSyncTargets(body), [frame, root, body, doc, html, win]);
});

test('getScrollSyncTargets also includes scrollable ancestors of the selected element inside body', () => {
  const win = {
    getComputedStyle(element) {
      return {
        overflowX: element.overflowX ?? 'visible',
        overflowY: element.overflowY ?? 'visible',
      };
    },
  };
  const html = {
    overflowY: 'visible',
    parentElement: null,
    ownerDocument: null,
  };
  const doc = {
    defaultView: win,
    documentElement: html,
  };
  const body = {
    overflowY: 'visible',
    parentElement: html,
    ownerDocument: doc,
  };
  const scroller = {
    overflowY: 'auto',
    parentElement: body,
    ownerDocument: doc,
  };
  const section = {
    overflowY: 'visible',
    parentElement: scroller,
    ownerDocument: doc,
  };
  const target = {
    overflowY: 'visible',
    parentElement: section,
    ownerDocument: doc,
  };
  html.ownerDocument = doc;

  assert.deepEqual(getScrollSyncTargets(body, target), [scroller, body, doc, html, win]);
});

test('applyResizeStylesToTarget writes inline width height and promotes inline display', () => {
  const styles = [];
  const target = {
    addStyle(style) {
      styles.push(style);
    },
  };

  applyResizeStylesToTarget(
    target,
    { width: { value: '150', unit: 'px' }, height: { value: '100', unit: 'px' } },
    'inline',
  );

  assert.deepEqual(styles, [{ width: '150px', height: '100px', display: 'inline-block' }]);
});

test('applyPositionStylesToTarget rewrites inset-based positioning to left/top only', () => {
  const calls = [];
  const target = {
    addStyle(style) {
      calls.push({ type: 'add', style });
    },
    removeStyle(property) {
      calls.push({ type: 'remove', property });
    },
  };

  applyPositionStylesToTarget(target, {
    left: { value: '88', unit: 'px' },
    top: { value: '32', unit: 'px' },
  });

  assert.deepEqual(calls, [
    { type: 'remove', property: 'inset' },
    { type: 'remove', property: 'right' },
    { type: 'remove', property: 'bottom' },
    { type: 'add', style: { left: '88px' } },
    { type: 'add', style: { top: '32px' } },
  ]);
});

test('position drag preview copy and cursor reflect dragging state', () => {
  assert.equal(getPositionDragCursor(false), 'grab');
  assert.equal(getPositionDragCursor(true), 'grabbing');
  assert.equal(getPositionDragPreviewLabel({ left: '88px', top: '32px' }), 'X 88px  Y 32px');
});

test('findElementSourceLocation returns line and column range for matching outer html', () => {
  const sourceText = [
    '<div class="wrapper">',
    '  <button class="cta">Send</button>',
    '</div>',
  ].join('\n');

  assert.deepEqual(
    findElementSourceLocation({
      sourceText,
      elementOuterHtml: '<button class="cta">Send</button>',
    }),
    {
      startLine: 2,
      startColumn: 3,
      endLine: 2,
      endColumn: 36,
    },
  );
});

test('findElementSourceLocation ignores GrapesJS runtime classes and attributes', () => {
  const sourceText = [
    '<div class="login-header">',
    '  <div class="title">Welcome back</div>',
    '</div>',
  ].join('\n');

  assert.deepEqual(
    findElementSourceLocation({
      sourceText,
      elementOuterHtml: '<div class="login-header gjs-selected" data-gjs-type="text" contenteditable="false"><div class="title">Welcome back</div></div>',
    }),
    {
      startLine: 1,
      startColumn: 1,
      endLine: 3,
      endColumn: 7,
    },
  );
});

test('findElementSourceLocation ignores hidden-layer runtime attrs and preview style', () => {
  const sourceText = [
    '<div id="thankYou" class="thank-you">',
    '  <h2>提交成功，感谢您的参与111！</h2>',
    '</div>',
  ].join('\n');

  assert.deepEqual(
    findElementSourceLocation({
      sourceText,
      elementOuterHtml: '<div id="thankYou" class="thank-you" data-ccui-hidden-layer-preview="true" data-ccui-hidden-layer-original-style="display%3Anone" style="display:block; visibility:visible; z-index:1003"><h2>提交成功，感谢您的参与111！</h2></div>',
    }),
    {
      startLine: 1,
      startColumn: 1,
      endLine: 3,
      endColumn: 7,
    },
  );
});

test('findClosestElementSourceLocation falls back to the nearest ancestor that exists in source', () => {
  const sourceText = [
    '<section class="card">',
    '  <div class="title">Welcome back</div>',
    '</section>',
  ].join('\n');

  const parentElement = {
    outerHTML: '<section class="card"><div class="title">Welcome back</div></section>',
    parentElement: null,
  };
  const childElement = {
    outerHTML: '<div class="runtime-wrapper"><span>shadow</span></div>',
    parentElement,
  };

  assert.deepEqual(
    findClosestElementSourceLocation({
      sourceText,
      element: childElement,
    }),
    {
      startLine: 1,
      startColumn: 1,
      endLine: 3,
      endColumn: 11,
    },
  );
});

test('buildElementStyleChatPrompt formats file path and element source context for chat input', () => {
  assert.equal(
    buildElementStyleChatPrompt({
      filePath: 'src/pages/login.html',
      location: {
        startLine: 12,
        startColumn: 5,
        endLine: 18,
        endColumn: 9,
      },
    }),
    [
      '文件路径：`src/pages/login.html`',
      '代码位置：`src/pages/login.html:12:5-18:9`',
    ].join('\n'),
  );
});

test('extractComponentIdentity prefers component id, then fingerprint and dom path', () => {
  const component = {
    getId() {
      return 'cmp-hero';
    },
    getAttributes() {
      return {
        'data-ccui-fingerprint': 'button:primary',
        'data-ccui-dom-path': 'html > body > section > button',
      };
    },
    getEl() {
      return {
        dataset: {
          ccuiComponentId: 'dom-id-ignored',
          ccuiFingerprint: 'dom-fingerprint-ignored',
          ccuiDomPath: 'dom-path-ignored',
        },
      };
    },
  };

  assert.deepEqual(extractComponentIdentity(component), {
    componentId: 'cmp-hero',
    fingerprint: 'button:primary',
    domPath: 'html > body > section > button',
  });
});

test('extractComponentIdentity falls back to live DOM attributes when component attributes are sparse', () => {
  const element = {
    tagName: 'BUTTON',
    dataset: {},
    getAttributeNames() {
      return ['class', 'id'];
    },
    getAttribute(name) {
      return name === 'class' ? 'primary cta' : name === 'id' ? 'submit-btn' : null;
    },
    parentElement: {
      tagName: 'SECTION',
      parentElement: {
        tagName: 'BODY',
        parentElement: {
          tagName: 'HTML',
          parentElement: null,
          children: [],
        },
        children: [],
      },
      children: [],
    },
  };
  element.parentElement.children = [element];
  element.parentElement.parentElement.children = [element.parentElement];
  element.parentElement.parentElement.parentElement.children = [element.parentElement.parentElement];

  const component = {
    getAttributes() {
      return {};
    },
    getEl() {
      return element;
    },
  };

  assert.deepEqual(extractComponentIdentity(component), {
    componentId: null,
    fingerprint: 'button|id=submit-btn|class=primary cta',
    domPath: 'html > body > section > button',
  });
});

test('extractComponentIdentity strips Grapes runtime attributes from the computed fingerprint', () => {
  const htmlElement = {
    tagName: 'HTML',
    parentElement: null,
    children: [],
  };
  const bodyElement = {
    tagName: 'BODY',
    parentElement: htmlElement,
    children: [],
  };
  const wrapperElement = {
    tagName: 'DIV',
    parentElement: bodyElement,
    children: [],
  };
  const element = {
    tagName: 'DIV',
    dataset: {},
    parentElement: wrapperElement,
    children: [],
    getAttributeNames() {
      return ['id', 'class', 'data-gjs-highlightable', 'data-gjs-type', 'draggable'];
    },
    getAttribute(name) {
      if (name === 'id') return 'iydn';
      if (name === 'class') return 'login-header gjs-selected';
      if (name === 'data-gjs-highlightable') return 'true';
      if (name === 'data-gjs-type') return 'default';
      if (name === 'draggable') return 'true';
      return null;
    },
  };
  htmlElement.children = [bodyElement];
  bodyElement.children = [wrapperElement];
  wrapperElement.children = [element];

  const component = {
    getId() {
      return 'iydn';
    },
    getAttributes() {
      return {};
    },
    getEl() {
      return element;
    },
  };

  assert.deepEqual(extractComponentIdentity(component), {
    componentId: 'iydn',
    fingerprint: 'div|id=iydn|class=login-header',
    domPath: 'html > body > div > div',
  });
});

test('buildSendSelectionToChatPayload refreshes stale mapping and resolves source location by identity', async () => {
  const staleMap = buildSourceLocationMap('<div><button>Mismatch</button></div>', 1);
  const freshMap = buildSourceLocationMap([
    '<section>',
    '  <button',
    '    data-ccui-component-id="cmp-cta"',
    '    data-ccui-fingerprint="button:cta"',
    '    data-ccui-dom-path="html > body > section > button"',
    '  >Send</button>',
    '</section>',
  ].join('\n'), 2);

  let ensureFreshCalls = 0;
  const payload = await buildSendSelectionToChatPayload({
    editor: {
      getSelectedAll() {
        return [{
          getId() {
            return 'cmp-cta';
          },
          getAttributes() {
            return {
              'data-ccui-fingerprint': 'button:cta',
              'data-ccui-dom-path': 'html > body > section > button',
            };
          },
          getEl() {
            return {
              outerHTML: '<button class="runtime-only">Not the persisted source</button>',
              dataset: {},
            };
          },
        }];
      },
      getSelected() {
        return null;
      },
    },
    filePath: 'src/pages/login.html',
    sourceLocationMap: staleMap,
    ensureFreshSourceLocationMap: async () => {
      ensureFreshCalls += 1;
      return freshMap;
    },
  });

  assert.equal(ensureFreshCalls, 1);
  assert.deepEqual(payload?.identity, {
    componentId: 'cmp-cta',
    fingerprint: 'button:cta',
    domPath: 'html > body > section > button',
  });
  assert.equal(payload?.location?.startLine, 2);
  assert.equal(payload?.location?.startColumn, 3);
  assert.equal(
    payload?.prompt,
    [
      '文件路径：`src/pages/login.html`',
      '代码位置：`src/pages/login.html:2:3-6:17`',
    ].join('\n'),
  );
});

test('buildSendSelectionToChatPayload includes all selected component locations for multi-select sends', async () => {
  const sourceText = [
    '<section>',
    '  <label data-ccui-component-id="label">用户名</label>',
    '  <input data-ccui-component-id="input" />',
    '</section>',
  ].join('\n');
  const payload = await buildSendSelectionToChatPayload({
    editor: {
      getSelectedAll() {
        return [
          {
            getId: () => 'label',
            getAttributes: () => ({}),
            getEl: () => ({ dataset: {} }),
          },
          {
            getId: () => 'input',
            getAttributes: () => ({}),
            getEl: () => ({ dataset: {} }),
          },
        ];
      },
      getSelected() {
        return null;
      },
    },
    filePath: 'src/pages/login.html',
    sourceText,
    sourceLocationMap: buildSourceLocationMap(sourceText, 1),
  });

  assert.equal(payload?.targetId, 'label,input');
  assert.equal(payload?.locations?.length, 2);
  assert.equal(
    payload?.prompt,
    [
      '文件路径：`src/pages/login.html`',
      '选中元素：2 个',
      '1. 代码位置：`src/pages/login.html:2:3-2:52`',
      '2. 代码位置：`src/pages/login.html:3:3-3:43`',
    ].join('\n'),
  );
});

test('buildSendSelectionToChatPayload skips expensive source fallback when mapping resolves multi-select targets', async () => {
  const sourceText = [
    '<section>',
    '  <label data-ccui-component-id="label">用户名</label>',
    '  <input data-ccui-component-id="input" />',
    '</section>',
  ].join('\n');
  let outerHtmlReads = 0;
  const createElement = () => ({
    dataset: {},
    get outerHTML() {
      outerHtmlReads += 1;
      return '<div>slow fallback</div>';
    },
  });

  const payload = await buildSendSelectionToChatPayload({
    editor: {
      getSelectedAll() {
        return [
          {
            getId: () => 'label',
            getAttributes: () => ({}),
            getEl: createElement,
          },
          {
            getId: () => 'input',
            getAttributes: () => ({}),
            getEl: createElement,
          },
        ];
      },
      getSelected() {
        return null;
      },
    },
    filePath: 'src/pages/login.html',
    sourceText,
    sourceLocationMap: buildSourceLocationMap(sourceText, 1),
  });

  assert.equal(payload?.locations?.length, 2);
  assert.equal(outerHtmlReads, 0);
});

test('buildSendSelectionToChatPayload uses the latest mapping returned by freshness helper across repeated sends', async () => {
  const latestMaps = [
    buildSourceLocationMap([
      '<section>',
      '  <button',
      '    data-ccui-component-id="cmp-repeat"',
      '    data-ccui-fingerprint="button:repeat"',
      '    data-ccui-dom-path="html > body > section > button"',
      '  >First</button>',
      '</section>',
    ].join('\n'), 2),
    buildSourceLocationMap([
      '<section>',
      '  <button',
      '    data-ccui-component-id="cmp-repeat"',
      '    data-ccui-fingerprint="button:repeat"',
      '    data-ccui-dom-path="html > body > section > button"',
      '  >Second</button>',
      '</section>',
    ].join('\n'), 3),
  ];
  let ensureFreshCalls = 0;

  const createEditor = () => ({
    getSelectedAll() {
      return [{
        getId() {
          return 'cmp-repeat';
        },
        getAttributes() {
          return {
            'data-ccui-fingerprint': 'button:repeat',
            'data-ccui-dom-path': 'html > body > section > button',
          };
        },
        getEl() {
          return {
            dataset: {},
          };
        },
      }];
    },
    getSelected() {
      return null;
    },
  });

  const firstPayload = await buildSendSelectionToChatPayload({
    editor: createEditor(),
    filePath: 'src/pages/repeat.html',
    sourceLocationMap: buildSourceLocationMap('<div />', 1),
    ensureFreshSourceLocationMap: async () => latestMaps[ensureFreshCalls++] ?? latestMaps.at(-1),
  });

  const secondPayload = await buildSendSelectionToChatPayload({
    editor: createEditor(),
    filePath: 'src/pages/repeat.html',
    sourceLocationMap: buildSourceLocationMap('<div />', 1),
    ensureFreshSourceLocationMap: async () => latestMaps[ensureFreshCalls++] ?? latestMaps.at(-1),
  });

  assert.equal(ensureFreshCalls, 2);
  assert.equal(firstPayload?.prompt, '文件路径：`src/pages/repeat.html`\n代码位置：`src/pages/repeat.html:2:3-6:18`');
  assert.equal(secondPayload?.prompt, '文件路径：`src/pages/repeat.html`\n代码位置：`src/pages/repeat.html:2:3-6:19`');
});

test('buildSendSelectionToChatPayload falls back to current sourceText outerHTML search when mapping lookup misses', async () => {
  const payload = await buildSendSelectionToChatPayload({
    editor: {
      getSelectedAll() {
        return [{
          getAttributes() {
            return {};
          },
          getEl() {
            return {
              outerHTML: '<button class="cta">Send</button>',
              dataset: {},
              tagName: 'BUTTON',
              getAttributeNames() {
                return ['class'];
              },
              getAttribute(name) {
                return name === 'class' ? 'cta' : null;
              },
            };
          },
        }];
      },
      getSelected() {
        return null;
      },
    },
    filePath: 'src/pages/fallback.html',
    sourceText: '<section>\n  <button class="cta">Send</button>\n</section>',
    sourceLocationMap: buildSourceLocationMap('<div />', 1),
    ensureFreshSourceLocationMap: async () => buildSourceLocationMap('<div />', 2),
  });

  assert.equal(payload?.location?.startLine, 2);
  assert.equal(payload?.location?.startColumn, 3);
  assert.equal(payload?.prompt, '文件路径：`src/pages/fallback.html`\n代码位置：`src/pages/fallback.html:2:3-2:36`');
});

test('buildSendSelectionToChatPayload falls back to nearest ancestor source location when selected wrapper is not in source', async () => {
  const htmlElement = {
    tagName: 'HTML',
    parentElement: null,
    children: [],
  };
  const bodyElement = {
    tagName: 'BODY',
    parentElement: htmlElement,
    children: [],
  };
  const parentElement = {
    outerHTML: '<section class="card"><button class="cta">Send</button></section>',
    dataset: {},
    tagName: 'SECTION',
    getAttributeNames() {
      return ['class'];
    },
    getAttribute(name) {
      return name === 'class' ? 'card' : null;
    },
    parentElement: bodyElement,
    children: [],
  };
  const childElement = {
    outerHTML: '<div class="runtime-wrapper"><button class="cta">Send</button></div>',
    dataset: {},
    tagName: 'DIV',
    getAttributeNames() {
      return ['class'];
    },
    getAttribute(name) {
      return name === 'class' ? 'runtime-wrapper' : null;
    },
    parentElement,
  };
  htmlElement.children = [bodyElement];
  bodyElement.children = [parentElement];
  parentElement.children = [childElement];

  const payload = await buildSendSelectionToChatPayload({
    editor: {
      getSelectedAll() {
        return [{
          getAttributes() {
            return {};
          },
          getEl() {
            return childElement;
          },
        }];
      },
      getSelected() {
        return null;
      },
    },
    filePath: 'src/pages/ancestor.html',
    sourceText: '<section class="card">\n  <button class="cta">Send</button>\n</section>',
    sourceLocationMap: buildSourceLocationMap('<div />', 1),
    ensureFreshSourceLocationMap: async () => buildSourceLocationMap('<div />', 2),
  });

  assert.equal(payload?.location?.startLine, 1);
  assert.equal(payload?.location?.startColumn, 1);
  assert.equal(payload?.prompt, '文件路径：`src/pages/ancestor.html`\n代码位置：`src/pages/ancestor.html:1:1-3:11`');
});

test('buildSendSelectionToChatPayload resolves mapping for Grapes runtime DOM polluted with editor attrs', async () => {
  const sourceText = [
    '<div class="page">',
    '  <div id="iydn" class="login-header">',
    '    <div class="title">Welcome back</div>',
    '  </div>',
    '</div>',
  ].join('\n');

  const htmlElement = {
    tagName: 'HTML',
    parentElement: null,
    children: [],
  };
  const bodyElement = {
    tagName: 'BODY',
    parentElement: htmlElement,
    children: [],
  };
  const pageElement = {
    tagName: 'DIV',
    parentElement: bodyElement,
    children: [],
  };
  const targetElement = {
    tagName: 'DIV',
    parentElement: pageElement,
    children: [],
    dataset: {},
    outerHTML: '<div id="iydn" class="login-header gjs-selected" data-gjs-highlightable="true" data-gjs-type="default" draggable="true"><div class="title">Welcome back</div></div>',
    getAttributeNames() {
      return ['id', 'class', 'data-gjs-highlightable', 'data-gjs-type', 'draggable'];
    },
    getAttribute(name) {
      if (name === 'id') return 'iydn';
      if (name === 'class') return 'login-header gjs-selected';
      if (name === 'data-gjs-highlightable') return 'true';
      if (name === 'data-gjs-type') return 'default';
      if (name === 'draggable') return 'true';
      return null;
    },
  };
  htmlElement.children = [bodyElement];
  bodyElement.children = [pageElement];
  pageElement.children = [targetElement];

  const payload = await buildSendSelectionToChatPayload({
    editor: {
      getSelectedAll() {
        return [{
          getId() {
            return 'iydn';
          },
          getAttributes() {
            return {};
          },
          getEl() {
            return targetElement;
          },
        }];
      },
      getSelected() {
        return null;
      },
    },
    filePath: 'src/pages/login.html',
    sourceText,
    sourceLocationMap: buildSourceLocationMap(sourceText, 1),
    ensureFreshSourceLocationMap: async () => buildSourceLocationMap(sourceText, 2),
  });

  assert.equal(payload?.location?.startLine, 2);
  assert.equal(payload?.location?.startColumn, 3);
  assert.equal(payload?.prompt, '文件路径：`src/pages/login.html`\n代码位置：`src/pages/login.html:2:3-4:9`');
});

test('buildSendSelectionToChatPayload prefers persisted source location when design edits are unsaved', async () => {
  const persistedText = [
    '<section>',
    '  <div id="hero" class="login-header">',
    '    <div class="title">Welcome back</div>',
    '  </div>',
    '</section>',
  ].join('\n');
  const currentSourceText = [
    '<!doctype html>',
    '<html>',
    '  <head></head>',
    '  <body>',
    '    <section>',
    '      <div id="hero" class="login-header" style="margin-bottom: 80px;">',
    '        <div class="title">Welcome back</div>',
    '      </div>',
    '    </section>',
    '  </body>',
    '</html>',
  ].join('\n');

  const payload = await buildSendSelectionToChatPayload({
    editor: {
      getSelectedAll() {
        return [{
          getId() {
            return 'hero';
          },
          getAttributes() {
            return {};
          },
          getEl() {
            return {
              dataset: {},
              tagName: 'DIV',
              getAttributeNames() {
                return ['id', 'class'];
              },
              getAttribute(name) {
                return name === 'id' ? 'hero' : name === 'class' ? 'login-header' : null;
              },
            };
          },
        }];
      },
      getSelected() {
        return null;
      },
    },
    filePath: 'src/pages/login.html',
    sourceText: currentSourceText,
    sourceLocationMap: buildSourceLocationMap(currentSourceText, 19),
    ensureFreshSourceLocationMap: async () => buildSourceLocationMap(currentSourceText, 19),
    persistedSourceText: persistedText,
    persistedSourceLocationMap: buildSourceLocationMap(persistedText, 1),
    preferPersistedLocation: true,
  });

  assert.equal(payload?.location?.startLine, 2);
  assert.equal(payload?.location?.startColumn, 3);
  assert.equal(payload?.prompt, '文件路径：`src/pages/login.html`\n代码位置：`src/pages/login.html:2:3-4:9`');
});

test('buildSendSelectionToChatPayload prefers host-provided latest source context over stale working props', async () => {
  const staleWorkingText = [
    '<!doctype html>',
    '<html>',
    '  <body>',
    '    <section>',
    '      <div id="hero" class="login-header" style="margin-bottom: 80px;">',
    '        <div class="title">Welcome back</div>',
    '      </div>',
    '    </section>',
    '  </body>',
    '</html>',
  ].join('\n');
  const latestFileText = [
    '<section>',
    '  <div id="hero" class="login-header">',
    '    <div class="title">Welcome back</div>',
    '  </div>',
    '</section>',
  ].join('\n');

  const payload = await buildSendSelectionToChatPayload({
    editor: {
      getSelectedAll() {
        return [{
          getId() {
            return 'hero';
          },
          getAttributes() {
            return {};
          },
          getEl() {
            return {
              dataset: {},
              tagName: 'DIV',
              getAttributeNames() {
                return ['id', 'class'];
              },
              getAttribute(name) {
                return name === 'id' ? 'hero' : name === 'class' ? 'login-header' : null;
              },
            };
          },
        }];
      },
      getSelected() {
        return null;
      },
    },
    filePath: 'src/pages/login.html',
    sourceText: staleWorkingText,
    sourceLocationMap: buildSourceLocationMap(staleWorkingText, 9),
    latestSourceContext: {
      sourceText: latestFileText,
      sourceLocationMap: buildSourceLocationMap(latestFileText, 10),
      preferPersistedLocation: false,
    },
  });

  assert.equal(payload?.location?.startLine, 2);
  assert.equal(payload?.location?.startColumn, 3);
  assert.equal(payload?.prompt, '文件路径：`src/pages/login.html`\n代码位置：`src/pages/login.html:2:3-4:9`');
});

test('buildSendSelectionToChatPayload does not re-run freshness helper when latest source context is provided', async () => {
  const latestFileText = [
    '<section>',
    '  <div data-ccui-component-id="hero" class="login-header">Welcome back</div>',
    '</section>',
  ].join('\n');
  let ensureFreshCalls = 0;

  const payload = await buildSendSelectionToChatPayload({
    editor: {
      getSelectedAll() {
        return [{
          getId() {
            return 'hero';
          },
          getAttributes() {
            return {};
          },
          getEl() {
            return { dataset: {} };
          },
        }];
      },
      getSelected() {
        return null;
      },
    },
    filePath: 'src/pages/login.html',
    sourceText: '<div />',
    sourceLocationMap: buildSourceLocationMap('<div />', 1),
    ensureFreshSourceLocationMap: async () => {
      ensureFreshCalls += 1;
      return buildSourceLocationMap('<div />', 2);
    },
    latestSourceContext: {
      sourceText: latestFileText,
      sourceLocationMap: buildSourceLocationMap(latestFileText, 10),
      preferPersistedLocation: false,
    },
  });

  assert.equal(ensureFreshCalls, 0);
  assert.equal(payload?.location?.startLine, 2);
});

test('getVisibleSpacingHandleSides keeps only the active drag side visible while dragging', () => {
  assert.deepEqual(getVisibleSpacingHandleSides(null), ['top', 'right', 'bottom', 'left']);
  assert.deepEqual(getVisibleSpacingHandleSides('top'), ['top']);
  assert.deepEqual(getVisibleSpacingHandleSides('right'), ['right']);
});

test('getVisibleSpacingKinds hides the other spacing group while dragging', () => {
  assert.deepEqual(getVisibleSpacingKinds(null), ['margin', 'padding']);
  assert.deepEqual(getVisibleSpacingKinds('margin'), ['margin']);
  assert.deepEqual(getVisibleSpacingKinds('padding'), ['padding']);
});

test('readSpacingBoxFromStyle expands shorthand margin and padding values', () => {
  const style = {
    getPropertyValue(property) {
      if (property === 'margin') {
        return '8px 16px';
      }
      if (property === 'padding-top') {
        return '4px';
      }
      if (property === 'padding-right') {
        return '12px';
      }
      if (property === 'padding-bottom') {
        return '20px';
      }
      if (property === 'padding-left') {
        return '6px';
      }
      if (property === 'padding') {
        return '';
      }
      return '';
    },
  };

  assert.deepEqual(readSpacingBoxFromStyle(style, 'margin'), {
    top: '8',
    right: '16',
    bottom: '8',
    left: '16',
    unit: 'px',
    topPx: 8,
    rightPx: 16,
    bottomPx: 8,
    leftPx: 16,
  });

  assert.deepEqual(readSpacingBoxFromStyle(style, 'padding'), {
    top: '4',
    right: '12',
    bottom: '20',
    left: '6',
    unit: 'px',
    topPx: 4,
    rightPx: 12,
    bottomPx: 20,
    leftPx: 6,
  });
});

test('buildSpacingSnapshot avoids computed-style reads for every multi-selected element', () => {
  let computedStyleReads = 0;
  const makeElement = (left) => ({
    getBoundingClientRect: () => ({
      left,
      top: 10,
      right: left + 20,
      bottom: 30,
      width: 20,
      height: 20,
    }),
  });
  const makeComponent = (id, left) => {
    const element = makeElement(left);
    return {
      getId: () => id,
      getType: () => 'div',
      get: (key) => (key === 'id' ? id : key === 'type' ? 'div' : undefined),
      getEl: () => element,
    };
  };
  const selected = [
    makeComponent('one', 10),
    makeComponent('two', 40),
    makeComponent('three', 70),
    makeComponent('four', 100),
  ];
  const body = {
    ownerDocument: {
      defaultView: {
        getComputedStyle: () => {
          computedStyleReads += 1;
          return {
            display: 'block',
            position: 'static',
            getPropertyValue: () => '0px',
          };
        },
      },
    },
    contains: () => true,
  };
  const editor = {
    Canvas: {
      getBody: () => body,
    },
    getSelected: () => selected[0],
    getSelectedAll: () => selected,
  };

  const snapshot = buildSpacingSnapshot(editor);

  assert.equal(computedStyleReads, 1);
  assert.equal(snapshot.selectedBorderBoxes.length, selected.length);
  assert.deepEqual(snapshot.multiSelectionBox, {
    left: 10,
    top: 10,
    width: 110,
    height: 20,
  });
});

test('replaceToolbarMoveCommandWithSendCommand swaps the move tool for send without changing other toolbar actions', () => {
  const toolbar = [
    { command: 'tlb-move', attributes: { class: 'fa fa-arrows' } },
    { command: 'tlb-clone', attributes: { class: 'fa fa-clone' } },
    { command: 'tlb-delete', attributes: { class: 'fa fa-trash' } },
  ];

  assert.deepEqual(
    replaceToolbarMoveCommandWithSendCommand(toolbar),
    [
      {
        command: 'ccui-send-to-ai',
        label: `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M22 2 11 13" />
          <path d="m22 2-7 20-4-9-9-4Z" />
        </svg>
      `,
        attributes: { class: 'ccui-gjs-toolbar-send', 'data-ccui-toolbar-send': 'true', title: '发送到 AI' },
      },
      { command: 'tlb-clone', attributes: { class: 'fa fa-clone' } },
      { command: 'tlb-delete', attributes: { class: 'fa fa-trash' } },
    ],
  );
});

test('replaceToolbarMoveCommandWithSendCommand leaves toolbars without a move action unchanged', () => {
  const toolbar = [
    { command: 'tlb-clone', attributes: { class: 'fa fa-clone' } },
  ];

  assert.deepEqual(replaceToolbarMoveCommandWithSendCommand(toolbar), toolbar);
});

test('shouldSuppressDuplicateSend blocks immediate repeat sends for the same target', () => {
  assert.equal(
    shouldSuppressDuplicateSend(
      { targetId: 'loginForm', at: 1000 },
      { targetId: 'loginForm', at: 1200 },
    ),
    true,
  );
  assert.equal(
    shouldSuppressDuplicateSend(
      { targetId: 'loginForm', at: 1000 },
      { targetId: 'loginForm', at: 1800 },
    ),
    false,
  );
  assert.equal(
    shouldSuppressDuplicateSend(
      { targetId: 'loginForm', at: 1000 },
      { targetId: 'welcome', at: 1200 },
    ),
    false,
  );
});

test('SpacingOverlay source keeps a minimal guard for hiding GrapesJS chrome during overlay drag', async () => {
  const source = await readFile(new URL('./SpacingOverlay.tsx', import.meta.url), 'utf8');

  assert.match(source, /showComponentOutlines = false/);
  assert.match(source, /editor\.Canvas\?\.getBody\?\.\(\)/);
  assert.match(source, /const outlineVisibilityRoots = \[body, document\?\.documentElement\]\.filter\(Boolean\) as HTMLElement\[];/);
  assert.match(source, /const syncOutlineVisibility = \(\) => \{/);
  assert.match(source, /root\.classList\.toggle\('ccui-spacing-overlay-hide-outlines', !showComponentOutlines\);/);
  assert.match(source, /editor\.on\?\.\('canvas:frame:load', syncOutlineVisibility\);/);
  assert.match(source, /editor\.off\?\.\('canvas:frame:load', syncOutlineVisibility\);/);
  assert.match(source, /\.ccui-spacing-overlay-hide-outlines \.gjs-com-dashed,\s*\n\s*\.ccui-spacing-overlay-hide-outlines \.gjs-com-dashed \*/);
  assert.match(source, /body\[data-ccui-overlay-dragging="true"\] \.gjs-toolbar/);
  assert.match(source, /body\[data-ccui-overlay-dragging="true"\] \.gjs-badge/);
  assert.match(source, /body\[data-ccui-multi-selecting="true"\] \.gjs-toolbar/);
  assert.match(source, /MULTI_SELECTING_DATASET_KEY = 'ccuiMultiSelecting'/);
  assert.match(source, /body\.dataset\[MULTI_SELECTING_DATASET_KEY\] = 'true'/);
  assert.match(source, /CANVAS_MULTI_TOOLBAR_HIDDEN_ATTR = 'data-ccui-multi-toolbar-hidden'/);
  assert.match(source, /function setCanvasSingleSelectionToolbarHidden/);
  assert.match(source, /querySelectorAll\?\.<HTMLElement>\('\.gjs-toolbar'\)/);
  assert.match(source, /setCanvasSingleSelectionToolbarHidden\(doc, isMultiSelecting\)/);
  assert.match(source, /querySelectorAll\?\.<HTMLElement>\('\.gjs-toolbar, \.gjs-badge, \.gjs-placeholder, \.gjs-highlighter, \.gjs-resizer'\)/);
  assert.match(source, /SELECTED_OVERLAY_BORDER_COLOR = 'rgba\(37, 99, 235, 0\.95\)'/);
  assert.match(source, /selectedBorderBoxes/);
  assert.match(source, /data-spacing-selected-box="true"/);
  assert.match(source, /multiSelectionBox/);
  assert.match(source, /data-spacing-multi-toolbar="true"/);
  assert.match(source, /MultiSelectionToolbar/);
  assert.match(source, /SPACING_HANDLE_HOVER_ZONE_PX = 10/);
  assert.match(source, /SPACING_HANDLE_HIDE_DELAY_MS = 120/);
  assert.match(source, /spacingHoverActive/);
  assert.match(source, /shouldShowSpacingHandles/);
  assert.match(source, /data-spacing-handle-hover-zone="true"/);
  assert.match(source, /function SpacingHandleHoverFrame/);
  assert.match(source, /发送所选到 AI/);
  assert.match(source, /选择父级/);
  assert.match(source, /selectSelectedParents\(currentEditor\)/);
  assert.match(source, /void handleSendSelectionToChat\(\)/);
  assert.match(source, /currentEditor\.runCommand\?\.\('tlb-clone'\)/);
  assert.match(source, /currentEditor\.runCommand\?\.\('tlb-delete'\)/);
  assert.match(source, /getSelectedComponents\(editor\)/);
  assert.match(source, /const selectedElement = getSelectedComponent\(editor\)\?\.getEl\?\.\(\) as HTMLElement \| null \| undefined;/);
  assert.match(source, /getScrollSyncTargets\(body,\s*selectedElement \?\? null\)/);
  assert.match(source, /border: `1px solid \$\{SELECTED_OVERLAY_BORDER_COLOR\}`/);
  assert.match(source, /setProperty\('display', 'none', 'important'\)/);
  assert.match(source, /removeProperty\('display'\)/);
});

test('SpacingOverlay source does not poll spacing snapshots on every animation frame', async () => {
  const source = await readFile(new URL('./SpacingOverlay.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /frameId = win\.requestAnimationFrame\(tick\)/);
  assert.match(source, /editor\.on\?\.\(eventName, scheduleUpdate\)/);
  assert.match(source, /addEventListener\?\.\('scroll', scheduleUpdate/);
});

test('SpacingOverlay source wires ctrl drag marquee selection to the canvas', async () => {
  const source = await readFile(new URL('./SpacingOverlay.tsx', import.meta.url), 'utf8');

  assert.match(source, /attachCanvasMarqueeSelection/);
  assert.match(source, /event\.ctrlKey/);
  assert.match(source, /collectMarqueeSelectionComponents/);
  assert.match(source, /clearMarqueeSourceSelection/);
  assert.match(source, /readMarqueeSelectionCandidatesFromHitTest/);
  assert.match(source, /elementsFromPoint/);
  assert.match(source, /readMarqueeCaretElementFromPoint/);
  assert.match(source, /caretRangeFromPoint/);
  assert.match(source, /caretPositionFromPoint/);
  assert.match(source, /findMarqueeSelectionComponentElementFromHit/);
  assert.match(source, /'_gjs-data'/);
  assert.match(source, /buildMarqueeComponentByElementMap/);
  assert.match(source, /componentByElement\.get\(current\)/);
  assert.match(source, /MARQUEE_SELECTION_MAX_HIT_TEST_POINTS/);
  assert.doesNotMatch(source, /candidates: readMarqueeSelectionCandidates\(body\)/);
  assert.match(source, /setCanvasMarqueeChromeSuppressed/);
  assert.match(source, /data-ccui-marquee-selection/);
  assert.match(source, /canvas:frame:load/);
  assert.match(source, /reattachMarqueeSelection/);
  assert.match(source, /event\.button !== 0 && event\.button !== 2/);
  assert.match(source, /contextmenu/);
  assert.match(source, /doc\.documentElement/);
  assert.match(source, /setPointerCapture/);
  assert.doesNotMatch(source, /addEventListener\('keydown'/);
  assert.doesNotMatch(source, /addEventListener\('keyup'/);
});

test('attachCanvasMarqueeSelection is a no-op until the canvas body is ready', () => {
  const detach = attachCanvasMarqueeSelection({
    Canvas: {},
  });

  assert.equal(typeof detach, 'function');
  assert.doesNotThrow(() => detach());
});

function createMarqueeEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      const bucket = listeners.get(type) ?? [];
      bucket.push(listener);
      listeners.set(type, bucket);
    },
    removeEventListener(type, listener) {
      const bucket = listeners.get(type) ?? [];
      listeners.set(type, bucket.filter((entry) => entry !== listener));
    },
    emit(type, event) {
      for (const listener of listeners.get(type) ?? []) {
        listener(event);
      }
    },
  };
}

test('attachCanvasMarqueeSelection starts when pointerdown is captured by the iframe document', () => {
  const win = createMarqueeEventTarget();
  const doc = createMarqueeEventTarget();
  const html = createMarqueeEventTarget();
  const body = createMarqueeEventTarget();
  const boxes = [];

  Object.assign(win, {
    requestAnimationFrame: (callback) => {
      callback();
      return 1;
    },
    cancelAnimationFrame: () => {},
  });
  Object.assign(doc, {
    defaultView: win,
    documentElement: html,
    createElement: () => {
      const box = {
        style: {},
        setAttribute: (name, value) => {
          box[name] = value;
        },
        remove: () => {},
      };
      return box;
    },
  });
  Object.assign(body, {
    ownerDocument: doc,
    style: {},
    dataset: {},
    appendChild: (element) => {
      boxes.push(element);
    },
    querySelectorAll: () => [],
  });

  const capturedPointerIds = [];
  const pointerTarget = {
    closest: () => null,
    setPointerCapture: (pointerId) => {
      capturedPointerIds.push(pointerId);
    },
  };
  const preventDefaultCalls = [];
  const stopPropagationCalls = [];
  const eventBase = {
    pointerId: 7,
    ctrlKey: true,
    button: 0,
    target: pointerTarget,
    preventDefault: () => preventDefaultCalls.push('preventDefault'),
    stopPropagation: () => stopPropagationCalls.push('stopPropagation'),
  };

  const detach = attachCanvasMarqueeSelection({
    Canvas: {
      getBody: () => body,
    },
  });

  doc.emit('pointerdown', {
    ...eventBase,
    clientX: 10,
    clientY: 10,
  });
  win.emit('pointermove', {
    ...eventBase,
    clientX: 40,
    clientY: 40,
  });

  assert.equal(boxes.length, 1);
  assert.equal(boxes[0]['data-ccui-marquee-selection'], 'true');
  assert.deepEqual(capturedPointerIds, [7]);
  assert.equal(preventDefaultCalls.length, 2);
  assert.equal(stopPropagationCalls.length, 2);

  detach();
});

test('attachCanvasMarqueeSelection clears existing selection while ctrl is held and replaces it with marquee hits', () => {
  const win = createMarqueeEventTarget();
  const doc = createMarqueeEventTarget();
  const html = createMarqueeEventTarget();
  const body = createMarqueeEventTarget();
  const selectCalls = [];

  Object.assign(win, {
    requestAnimationFrame: (callback) => {
      callback();
      return 1;
    },
    cancelAnimationFrame: () => {},
  });
  Object.assign(doc, {
    defaultView: win,
    documentElement: html,
    querySelectorAll: () => [],
    createElement: () => ({
      style: {},
      setAttribute: () => {},
      remove: () => {},
    }),
  });

  const firstComponent = {
    get: (key) => (key === 'selectable' ? true : undefined),
    parents: () => [],
  };
  const secondComponent = {
    get: (key) => (key === 'selectable' ? true : undefined),
    parents: () => [],
  };
  const firstElement = {
    __gjsv: { model: firstComponent },
    closest: () => null,
    getBoundingClientRect: () => ({ left: 10, top: 10, right: 30, bottom: 30, width: 20, height: 20 }),
  };
  const secondElement = {
    __gjsv: { model: secondComponent },
    closest: () => null,
    getBoundingClientRect: () => ({ left: 50, top: 50, right: 70, bottom: 70, width: 20, height: 20 }),
  };

  Object.assign(body, {
    ownerDocument: doc,
    style: {},
    dataset: {},
    appendChild: () => {},
    querySelectorAll: () => [firstElement, secondElement],
  });

  const eventBase = {
    pointerId: 3,
    ctrlKey: true,
    button: 0,
    target: {
      closest: () => null,
      setPointerCapture: () => {},
    },
    preventDefault: () => {},
    stopPropagation: () => {},
  };

  const detach = attachCanvasMarqueeSelection({
    Canvas: {
      getBody: () => body,
    },
    select(components) {
      selectCalls.push(components);
    },
  });

  doc.emit('pointerdown', {
    ...eventBase,
    clientX: 0,
    clientY: 0,
  });
  win.emit('pointermove', {
    ...eventBase,
    clientX: 80,
    clientY: 80,
  });
  win.emit('pointerup', {
    ...eventBase,
    clientX: 80,
    clientY: 80,
  });

  assert.deepEqual(selectCalls, [[], [firstComponent, secondComponent]]);
  assert.equal(body.dataset.ccuiMarqueeSelecting, undefined);

  detach();
});

test('attachCanvasMarqueeSelection defers expensive candidate scans until drag release', () => {
  const win = createMarqueeEventTarget();
  const doc = createMarqueeEventTarget();
  const html = createMarqueeEventTarget();
  const body = createMarqueeEventTarget();
  let querySelectorAllCalls = 0;

  Object.assign(win, {
    requestAnimationFrame: (callback) => {
      callback();
      return 1;
    },
    cancelAnimationFrame: () => {},
  });
  Object.assign(doc, {
    defaultView: win,
    documentElement: html,
    createElement: () => ({
      style: {},
      setAttribute: () => {},
      remove: () => {},
    }),
  });
  Object.assign(body, {
    ownerDocument: doc,
    style: {},
    dataset: {},
    appendChild: () => {},
    querySelectorAll: () => {
      querySelectorAllCalls += 1;
      return [];
    },
  });

  const eventBase = {
    pointerId: 13,
    ctrlKey: true,
    button: 0,
    target: {
      closest: () => null,
      setPointerCapture: () => {},
    },
    preventDefault: () => {},
    stopPropagation: () => {},
  };

  const detach = attachCanvasMarqueeSelection({
    Canvas: {
      getBody: () => body,
    },
    select() {},
  });

  doc.emit('pointerdown', {
    ...eventBase,
    clientX: 0,
    clientY: 0,
  });
  win.emit('pointermove', {
    ...eventBase,
    clientX: 80,
    clientY: 80,
  });

  assert.equal(querySelectorAllCalls, 0);

  win.emit('pointerup', {
    ...eventBase,
    clientX: 80,
    clientY: 80,
  });

  assert.equal(querySelectorAllCalls, 1);

  detach();
});

test('attachCanvasMarqueeSelection uses elementsFromPoint instead of full DOM scans when available', () => {
  const win = createMarqueeEventTarget();
  const doc = createMarqueeEventTarget();
  const html = createMarqueeEventTarget();
  const body = createMarqueeEventTarget();
  const selectedComponent = {
    get: (key) => (key === 'selectable' ? true : undefined),
    parents: () => [],
  };
  const selectedElement = {
    __gjsv: { model: selectedComponent },
    closest: () => null,
    getBoundingClientRect: () => ({ left: 10, top: 10, right: 30, bottom: 30, width: 20, height: 20 }),
  };
  const selectCalls = [];

  Object.assign(win, {
    HTMLElement: Object,
    requestAnimationFrame: (callback) => {
      callback();
      return 1;
    },
    cancelAnimationFrame: () => {},
  });
  Object.assign(doc, {
    defaultView: win,
    documentElement: html,
    createElement: () => ({
      style: {},
      setAttribute: () => {},
      remove: () => {},
    }),
    elementsFromPoint: () => [selectedElement],
  });
  Object.assign(body, {
    ownerDocument: doc,
    style: {},
    dataset: {},
    appendChild: () => {},
    contains: (element) => element === selectedElement,
    querySelectorAll: () => {
      throw new Error('框选命中不应该全量扫描 DOM');
    },
  });

  const eventBase = {
    pointerId: 14,
    ctrlKey: true,
    button: 0,
    target: {
      closest: () => null,
      setPointerCapture: () => {},
    },
    preventDefault: () => {},
    stopPropagation: () => {},
  };

  const detach = attachCanvasMarqueeSelection({
    Canvas: {
      getBody: () => body,
    },
    select(components) {
      selectCalls.push(components);
    },
  });

  doc.emit('pointerdown', {
    ...eventBase,
    clientX: 0,
    clientY: 0,
  });
  win.emit('pointermove', {
    ...eventBase,
    clientX: 80,
    clientY: 80,
  });
  win.emit('pointerup', {
    ...eventBase,
    clientX: 80,
    clientY: 80,
  });

  assert.deepEqual(selectCalls, [[], [selectedComponent]]);

  detach();
});

test('attachCanvasMarqueeSelection falls back to a batched candidate scan when hit testing finds no components', () => {
  const win = createMarqueeEventTarget();
  const doc = createMarqueeEventTarget();
  const html = createMarqueeEventTarget();
  const body = createMarqueeEventTarget();
  const selectedComponent = {
    get: (key) => (key === 'selectable' ? true : undefined),
    parents: () => [],
  };
  const selectedElement = {
    __gjsv: { model: selectedComponent },
    closest: () => null,
    getBoundingClientRect: () => ({ left: 10, top: 10, right: 30, bottom: 30, width: 20, height: 20 }),
  };
  const selectCalls = [];
  let querySelectorAllCalls = 0;
  const frameQueue = [];

  Object.assign(win, {
    HTMLElement: Object,
    requestAnimationFrame: (callback) => {
      frameQueue.push(callback);
      return frameQueue.length;
    },
    cancelAnimationFrame: () => {},
  });
  Object.assign(doc, {
    defaultView: win,
    documentElement: html,
    createElement: () => ({
      style: {},
      setAttribute: () => {},
      remove: () => {},
    }),
    elementsFromPoint: () => [],
  });
  Object.assign(body, {
    ownerDocument: doc,
    style: {},
    dataset: {},
    appendChild: () => {},
    contains: () => false,
    querySelectorAll: () => {
      querySelectorAllCalls += 1;
      return [selectedElement];
    },
  });

  const eventBase = {
    pointerId: 19,
    ctrlKey: true,
    button: 0,
    target: {
      closest: () => null,
      setPointerCapture: () => {},
    },
    preventDefault: () => {},
    stopPropagation: () => {},
  };

  const detach = attachCanvasMarqueeSelection({
    Canvas: {
      getBody: () => body,
    },
    select(components) {
      selectCalls.push(components);
    },
  });

  doc.emit('pointerdown', {
    ...eventBase,
    clientX: 0,
    clientY: 0,
  });
  win.emit('pointermove', {
    ...eventBase,
    clientX: 80,
    clientY: 80,
  });
  frameQueue.shift()?.();
  win.emit('pointerup', {
    ...eventBase,
    clientX: 80,
    clientY: 80,
  });

  assert.deepEqual(selectCalls, [[]]);
  assert.equal(querySelectorAllCalls, 1);
  frameQueue.shift()?.();
  frameQueue.shift()?.();
  assert.deepEqual(selectCalls, [[], [selectedComponent]]);

  detach();
});

test('attachCanvasMarqueeSelection completes fallback scans without many animation frames', () => {
  const win = createMarqueeEventTarget();
  const doc = createMarqueeEventTarget();
  const html = createMarqueeEventTarget();
  const body = createMarqueeEventTarget();
  const selectedComponent = {
    get: (key) => (key === 'selectable' ? true : undefined),
    parents: () => [],
  };
  const selectedElement = {
    __gjsv: { model: selectedComponent },
    closest: () => null,
    getBoundingClientRect: () => ({ left: 10, top: 10, right: 30, bottom: 30, width: 20, height: 20 }),
  };
  const elements = Array.from({ length: 1199 }, () => ({
    closest: () => null,
    getBoundingClientRect: () => ({ left: 200, top: 200, right: 220, bottom: 220, width: 20, height: 20 }),
  })).concat(selectedElement);
  const selectCalls = [];
  const frameQueue = [];

  Object.assign(win, {
    HTMLElement: Object,
    requestAnimationFrame: (callback) => {
      frameQueue.push(callback);
      return frameQueue.length;
    },
    cancelAnimationFrame: () => {},
  });
  Object.assign(doc, {
    defaultView: win,
    documentElement: html,
    createElement: () => ({
      style: {},
      setAttribute: () => {},
      remove: () => {},
    }),
    elementsFromPoint: () => [],
  });
  Object.assign(body, {
    ownerDocument: doc,
    style: {},
    dataset: {},
    appendChild: () => {},
    contains: () => false,
    querySelectorAll: () => elements,
  });

  const eventBase = {
    pointerId: 23,
    ctrlKey: true,
    button: 0,
    target: {
      closest: () => null,
      setPointerCapture: () => {},
    },
    preventDefault: () => {},
    stopPropagation: () => {},
  };

  const detach = attachCanvasMarqueeSelection({
    Canvas: {
      getBody: () => body,
    },
    select(components) {
      selectCalls.push(components);
    },
  });

  doc.emit('pointerdown', {
    ...eventBase,
    clientX: 0,
    clientY: 0,
  });
  win.emit('pointermove', {
    ...eventBase,
    clientX: 80,
    clientY: 80,
  });
  frameQueue.shift()?.();
  win.emit('pointerup', {
    ...eventBase,
    clientX: 80,
    clientY: 80,
  });

  assert.deepEqual(selectCalls, [[]]);
  frameQueue.shift()?.();
  frameQueue.shift()?.();
  assert.deepEqual(selectCalls, [[], [selectedComponent]]);

  detach();
});

test('attachCanvasMarqueeSelection resolves text hits through caretRangeFromPoint before falling back', () => {
  const win = createMarqueeEventTarget();
  const doc = createMarqueeEventTarget();
  const html = createMarqueeEventTarget();
  const body = createMarqueeEventTarget();
  const selectedComponent = {
    get: (key) => (key === 'selectable' ? true : undefined),
    parents: () => [],
  };
  const textHostElement = {
    __gjsv: { model: selectedComponent },
    closest: () => null,
    parentElement: body,
    getBoundingClientRect: () => ({ left: 10, top: 10, right: 30, bottom: 30, width: 20, height: 20 }),
  };
  const textNode = {
    nodeType: 3,
    parentElement: textHostElement,
  };
  const selectCalls = [];

  Object.assign(win, {
    HTMLElement: Object,
    requestAnimationFrame: (callback) => {
      callback();
      return 1;
    },
    cancelAnimationFrame: () => {},
  });
  Object.assign(doc, {
    defaultView: win,
    documentElement: html,
    createElement: () => ({
      style: {},
      setAttribute: () => {},
      remove: () => {},
    }),
    caretRangeFromPoint: () => ({ startContainer: textNode }),
    elementsFromPoint: () => [],
  });
  Object.assign(body, {
    ownerDocument: doc,
    style: {},
    dataset: {},
    appendChild: () => {},
    contains: (element) => element === textHostElement,
    querySelectorAll: () => {
      throw new Error('caretRangeFromPoint 命中文本后不应该进入慢速全量扫描');
    },
  });

  const eventBase = {
    pointerId: 20,
    ctrlKey: true,
    button: 0,
    target: {
      closest: () => null,
      setPointerCapture: () => {},
    },
    preventDefault: () => {},
    stopPropagation: () => {},
  };

  const detach = attachCanvasMarqueeSelection({
    Canvas: {
      getBody: () => body,
    },
    select(components) {
      selectCalls.push(components);
    },
  });

  doc.emit('pointerdown', {
    ...eventBase,
    clientX: 0,
    clientY: 0,
  });
  win.emit('pointermove', {
    ...eventBase,
    clientX: 80,
    clientY: 80,
  });
  win.emit('pointerup', {
    ...eventBase,
    clientX: 80,
    clientY: 80,
  });

  assert.deepEqual(selectCalls, [[], [selectedComponent]]);

  detach();
});

test('attachCanvasMarqueeSelection resolves hit-tested child nodes to their nearest component parent', () => {
  const win = createMarqueeEventTarget();
  const doc = createMarqueeEventTarget();
  const html = createMarqueeEventTarget();
  const body = createMarqueeEventTarget();
  const selectedComponent = {
    get: (key) => (key === 'selectable' ? true : undefined),
    parents: () => [],
  };
  const parentElement = {
    __gjsv: { model: selectedComponent },
    closest: () => null,
    parentElement: body,
    getBoundingClientRect: () => ({ left: 10, top: 10, right: 30, bottom: 30, width: 20, height: 20 }),
  };
  const childElement = {
    closest: () => null,
    parentElement,
  };
  const selectCalls = [];

  Object.assign(win, {
    HTMLElement: Object,
    requestAnimationFrame: (callback) => {
      callback();
      return 1;
    },
    cancelAnimationFrame: () => {},
  });
  Object.assign(doc, {
    defaultView: win,
    documentElement: html,
    createElement: () => ({
      style: {},
      setAttribute: () => {},
      remove: () => {},
    }),
    elementsFromPoint: () => [childElement],
  });
  Object.assign(body, {
    ownerDocument: doc,
    style: {},
    dataset: {},
    appendChild: () => {},
    contains: (element) => element === childElement || element === parentElement,
    querySelectorAll: () => {
      throw new Error('框选命中子节点不应该回退到全量扫描 DOM');
    },
  });

  const eventBase = {
    pointerId: 15,
    ctrlKey: true,
    button: 0,
    target: {
      closest: () => null,
      setPointerCapture: () => {},
    },
    preventDefault: () => {},
    stopPropagation: () => {},
  };

  const detach = attachCanvasMarqueeSelection({
    Canvas: {
      getBody: () => body,
    },
    select(components) {
      selectCalls.push(components);
    },
  });

  doc.emit('pointerdown', {
    ...eventBase,
    clientX: 0,
    clientY: 0,
  });
  win.emit('pointermove', {
    ...eventBase,
    clientX: 80,
    clientY: 80,
  });
  win.emit('pointerup', {
    ...eventBase,
    clientX: 80,
    clientY: 80,
  });

  assert.deepEqual(selectCalls, [[], [selectedComponent]]);

  detach();
});

test('attachCanvasMarqueeSelection keeps large-box hit testing bounded', () => {
  const win = createMarqueeEventTarget();
  const doc = createMarqueeEventTarget();
  const html = createMarqueeEventTarget();
  const body = createMarqueeEventTarget();
  const selectedComponent = {
    get: (key) => (key === 'selectable' ? true : undefined),
    parents: () => [],
  };
  const selectedElement = {
    __gjsv: { model: selectedComponent },
    closest: () => null,
    parentElement: body,
    getBoundingClientRect: () => ({ left: 10, top: 10, right: 30, bottom: 30, width: 20, height: 20 }),
  };
  const selectCalls = [];
  let hitTestCalls = 0;

  Object.assign(win, {
    HTMLElement: Object,
    requestAnimationFrame: (callback) => {
      callback();
      return 1;
    },
    cancelAnimationFrame: () => {},
  });
  Object.assign(doc, {
    defaultView: win,
    documentElement: html,
    createElement: () => ({
      style: {},
      setAttribute: () => {},
      remove: () => {},
    }),
    elementsFromPoint: () => {
      hitTestCalls += 1;
      return [selectedElement];
    },
  });
  Object.assign(body, {
    ownerDocument: doc,
    style: {},
    dataset: {},
    appendChild: () => {},
    contains: (element) => element === selectedElement,
    querySelectorAll: () => {
      throw new Error('large marquee hit testing should not fall back to a full DOM scan');
    },
  });

  const eventBase = {
    pointerId: 22,
    ctrlKey: true,
    button: 0,
    target: {
      closest: () => null,
      setPointerCapture: () => {},
    },
    preventDefault: () => {},
    stopPropagation: () => {},
  };

  const detach = attachCanvasMarqueeSelection({
    Canvas: {
      getBody: () => body,
    },
    select(components) {
      selectCalls.push(components);
    },
  });

  doc.emit('pointerdown', {
    ...eventBase,
    clientX: 0,
    clientY: 0,
  });
  win.emit('pointermove', {
    ...eventBase,
    clientX: 1000,
    clientY: 1000,
  });
  win.emit('pointerup', {
    ...eventBase,
    clientX: 1000,
    clientY: 1000,
  });

  assert.ok(hitTestCalls <= 320, `expected bounded hit-test calls, got ${hitTestCalls}`);
  assert.deepEqual(selectCalls, [[], [selectedComponent]]);

  detach();
});

test('attachCanvasMarqueeSelection keeps hit-tested components even when their full rect center is outside the marquee', () => {
  const win = createMarqueeEventTarget();
  const doc = createMarqueeEventTarget();
  const html = createMarqueeEventTarget();
  const body = createMarqueeEventTarget();
  const selectedComponent = {
    get: (key) => (key === 'selectable' ? true : undefined),
    parents: () => [],
  };
  const selectedElement = {
    __gjsv: { model: selectedComponent },
    closest: () => null,
    parentElement: body,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000 }),
  };
  const selectCalls = [];

  Object.assign(win, {
    HTMLElement: Object,
    requestAnimationFrame: (callback) => {
      callback();
      return 1;
    },
    cancelAnimationFrame: () => {},
  });
  Object.assign(doc, {
    defaultView: win,
    documentElement: html,
    createElement: () => ({
      style: {},
      setAttribute: () => {},
      remove: () => {},
    }),
    elementsFromPoint: () => [selectedElement],
  });
  Object.assign(body, {
    ownerDocument: doc,
    style: {},
    dataset: {},
    appendChild: () => {},
    contains: (element) => element === selectedElement,
    querySelectorAll: () => {
      throw new Error('hit-test 命中后不应该因为大 rect 中心在框外而回退扫描');
    },
  });

  const eventBase = {
    pointerId: 16,
    ctrlKey: true,
    button: 0,
    target: {
      closest: () => null,
      setPointerCapture: () => {},
    },
    preventDefault: () => {},
    stopPropagation: () => {},
  };

  const detach = attachCanvasMarqueeSelection({
    Canvas: {
      getBody: () => body,
    },
    select(components) {
      selectCalls.push(components);
    },
  });

  doc.emit('pointerdown', {
    ...eventBase,
    clientX: 20,
    clientY: 20,
  });
  win.emit('pointermove', {
    ...eventBase,
    clientX: 80,
    clientY: 80,
  });
  win.emit('pointerup', {
    ...eventBase,
    clientX: 80,
    clientY: 80,
  });

  assert.deepEqual(selectCalls, [[], [selectedComponent]]);

  detach();
});

test('attachCanvasMarqueeSelection reads GrapesJS data model fallback from hit-tested elements', () => {
  const win = createMarqueeEventTarget();
  const doc = createMarqueeEventTarget();
  const html = createMarqueeEventTarget();
  const body = createMarqueeEventTarget();
  const selectedComponent = {
    get: (key) => (key === 'selectable' ? true : undefined),
    parents: () => [],
  };
  const selectedElement = {
    '_gjs-data': { model: selectedComponent },
    closest: () => null,
    parentElement: body,
    getBoundingClientRect: () => ({ left: 10, top: 10, right: 30, bottom: 30, width: 20, height: 20 }),
  };
  const selectCalls = [];

  Object.assign(win, {
    HTMLElement: Object,
    requestAnimationFrame: (callback) => {
      callback();
      return 1;
    },
    cancelAnimationFrame: () => {},
  });
  Object.assign(doc, {
    defaultView: win,
    documentElement: html,
    createElement: () => ({
      style: {},
      setAttribute: () => {},
      remove: () => {},
    }),
    elementsFromPoint: () => [selectedElement],
  });
  Object.assign(body, {
    ownerDocument: doc,
    style: {},
    dataset: {},
    appendChild: () => {},
    contains: (element) => element === selectedElement,
    querySelectorAll: () => {
      throw new Error('GrapesJS data model fallback 命中后不应该全量扫描 DOM');
    },
  });

  const eventBase = {
    pointerId: 17,
    ctrlKey: true,
    button: 0,
    target: {
      closest: () => null,
      setPointerCapture: () => {},
    },
    preventDefault: () => {},
    stopPropagation: () => {},
  };

  const detach = attachCanvasMarqueeSelection({
    Canvas: {
      getBody: () => body,
    },
    select(components) {
      selectCalls.push(components);
    },
  });

  doc.emit('pointerdown', {
    ...eventBase,
    clientX: 0,
    clientY: 0,
  });
  win.emit('pointermove', {
    ...eventBase,
    clientX: 80,
    clientY: 80,
  });
  win.emit('pointerup', {
    ...eventBase,
    clientX: 80,
    clientY: 80,
  });

  assert.deepEqual(selectCalls, [[], [selectedComponent]]);

  detach();
});

test('attachCanvasMarqueeSelection resolves hit-tested elements through the GrapesJS component tree map', () => {
  const win = createMarqueeEventTarget();
  const doc = createMarqueeEventTarget();
  const html = createMarqueeEventTarget();
  const body = createMarqueeEventTarget();
  const selectedElement = {
    closest: () => null,
    parentElement: body,
    getBoundingClientRect: () => ({ left: 10, top: 10, right: 30, bottom: 30, width: 20, height: 20 }),
  };
  const selectedComponent = {
    get: (key) => (key === 'selectable' ? true : undefined),
    getEl: () => selectedElement,
    parents: () => [],
    components: () => [],
  };
  const wrapperComponent = {
    getEl: () => body,
    components: () => ({ models: [selectedComponent] }),
  };
  const selectCalls = [];

  Object.assign(win, {
    HTMLElement: Object,
    requestAnimationFrame: (callback) => {
      callback();
      return 1;
    },
    cancelAnimationFrame: () => {},
  });
  Object.assign(doc, {
    defaultView: win,
    documentElement: html,
    createElement: () => ({
      style: {},
      setAttribute: () => {},
      remove: () => {},
    }),
    elementsFromPoint: () => [selectedElement],
  });
  Object.assign(body, {
    ownerDocument: doc,
    style: {},
    dataset: {},
    appendChild: () => {},
    contains: (element) => element === selectedElement,
    querySelectorAll: () => {
      throw new Error('component tree map 命中后不应该全量扫描 DOM');
    },
  });

  const eventBase = {
    pointerId: 18,
    ctrlKey: true,
    button: 0,
    target: {
      closest: () => null,
      setPointerCapture: () => {},
    },
    preventDefault: () => {},
    stopPropagation: () => {},
  };

  const detach = attachCanvasMarqueeSelection({
    Canvas: {
      getBody: () => body,
    },
    getWrapper: () => wrapperComponent,
    select(components) {
      selectCalls.push(components);
    },
  });

  doc.emit('pointerdown', {
    ...eventBase,
    clientX: 0,
    clientY: 0,
  });
  win.emit('pointermove', {
    ...eventBase,
    clientX: 80,
    clientY: 80,
  });
  win.emit('pointerup', {
    ...eventBase,
    clientX: 80,
    clientY: 80,
  });

  assert.deepEqual(selectCalls, [[], [selectedComponent]]);

  detach();
});

test('attachCanvasMarqueeSelection does not change selection when ctrl is pressed and released without pointer drag', () => {
  const win = createMarqueeEventTarget();
  const doc = createMarqueeEventTarget();
  const html = createMarqueeEventTarget();
  const body = createMarqueeEventTarget();
  const selectedBeforeCtrl = [{ id: 'already-selected' }];
  const selectCalls = [];

  Object.assign(win, {
    requestAnimationFrame: (callback) => {
      callback();
      return 1;
    },
    cancelAnimationFrame: () => {},
  });
  Object.assign(doc, {
    defaultView: win,
    documentElement: html,
    querySelectorAll: () => [],
    createElement: () => ({
      style: {},
      setAttribute: () => {},
      remove: () => {},
    }),
  });
  Object.assign(body, {
    ownerDocument: doc,
    style: {},
    dataset: {},
    appendChild: () => {},
    querySelectorAll: () => [],
  });

  const detach = attachCanvasMarqueeSelection({
    Canvas: {
      getBody: () => body,
    },
    getSelectedAll: () => selectedBeforeCtrl,
    select(components) {
      selectCalls.push(components);
    },
  });

  win.emit('keydown', {
    key: 'Control',
    preventDefault: () => {},
    stopPropagation: () => {},
  });
  win.emit('keyup', {
    key: 'Control',
    preventDefault: () => {},
    stopPropagation: () => {},
  });

  assert.deepEqual(selectCalls, []);
  assert.equal(body.dataset.ccuiMarqueeSelecting, undefined);

  detach();
});

test('attachCanvasMarqueeSelection restores previous selection when ctrl pointerdown ends without drag', () => {
  const win = createMarqueeEventTarget();
  const doc = createMarqueeEventTarget();
  const html = createMarqueeEventTarget();
  const body = createMarqueeEventTarget();
  const selectedBeforeCtrl = [{ id: 'already-selected' }];
  const selectCalls = [];

  Object.assign(win, {
    requestAnimationFrame: (callback) => {
      callback();
      return 1;
    },
    cancelAnimationFrame: () => {},
  });
  Object.assign(doc, {
    defaultView: win,
    documentElement: html,
    querySelectorAll: () => [],
    createElement: () => ({
      style: {},
      setAttribute: () => {},
      remove: () => {},
    }),
  });
  Object.assign(body, {
    ownerDocument: doc,
    style: {},
    dataset: {},
    appendChild: () => {},
    querySelectorAll: () => [],
  });

  const eventBase = {
    pointerId: 9,
    ctrlKey: true,
    button: 0,
    target: {
      closest: () => null,
      setPointerCapture: () => {},
    },
    preventDefault: () => {},
    stopPropagation: () => {},
  };

  const detach = attachCanvasMarqueeSelection({
    Canvas: {
      getBody: () => body,
    },
    getSelectedAll: () => selectedBeforeCtrl,
    select(components) {
      selectCalls.push(components);
    },
  });

  doc.emit('pointerdown', {
    ...eventBase,
    clientX: 10,
    clientY: 10,
  });
  win.emit('pointerup', {
    ...eventBase,
    clientX: 10,
    clientY: 10,
  });

  assert.deepEqual(selectCalls, [[], selectedBeforeCtrl]);
  assert.equal(body.dataset.ccuiMarqueeSelecting, undefined);

  detach();
});

test('attachCanvasMarqueeSelection toggles marquee hits against existing selection when ctrl shift is held', () => {
  const win = createMarqueeEventTarget();
  const doc = createMarqueeEventTarget();
  const html = createMarqueeEventTarget();
  const body = createMarqueeEventTarget();
  const retainedSelection = {
    get: (key) => (key === 'selectable' ? true : undefined),
    parents: () => [],
  };
  const toggledOffSelection = {
    get: (key) => (key === 'selectable' ? true : undefined),
    parents: () => [],
  };
  const toggledOnSelection = {
    get: (key) => (key === 'selectable' ? true : undefined),
    parents: () => [],
  };
  const selectCalls = [];

  Object.assign(win, {
    requestAnimationFrame: (callback) => {
      callback();
      return 1;
    },
    cancelAnimationFrame: () => {},
  });
  Object.assign(doc, {
    defaultView: win,
    documentElement: html,
    querySelectorAll: () => [],
    createElement: () => ({
      style: {},
      setAttribute: () => {},
      remove: () => {},
    }),
  });
  Object.assign(body, {
    ownerDocument: doc,
    style: {},
    dataset: {},
    appendChild: () => {},
    querySelectorAll: () => [
      {
        __gjsv: { model: toggledOffSelection },
        closest: () => null,
        getBoundingClientRect: () => ({ left: 10, top: 10, right: 30, bottom: 30, width: 20, height: 20 }),
      },
      {
        __gjsv: { model: toggledOnSelection },
        closest: () => null,
        getBoundingClientRect: () => ({ left: 40, top: 10, right: 60, bottom: 30, width: 20, height: 20 }),
      },
    ],
  });

  const eventBase = {
    pointerId: 4,
    ctrlKey: true,
    shiftKey: true,
    button: 0,
    target: {
      closest: () => null,
      setPointerCapture: () => {},
    },
    preventDefault: () => {},
    stopPropagation: () => {},
  };

  const detach = attachCanvasMarqueeSelection({
    Canvas: {
      getBody: () => body,
    },
    getSelectedAll: () => [retainedSelection, toggledOffSelection],
    select(components) {
      selectCalls.push(components);
    },
  });

  doc.emit('pointerdown', {
    ...eventBase,
    clientX: 0,
    clientY: 0,
  });
  win.emit('pointermove', {
    ...eventBase,
    clientX: 80,
    clientY: 80,
  });
  win.emit('pointerup', {
    ...eventBase,
    clientX: 80,
    clientY: 80,
  });

  assert.deepEqual(selectCalls, [[retainedSelection, toggledOnSelection]]);

  detach();
});

test('attachCanvasMarqueeSelection does not swallow the first toolbar click after marquee selection', () => {
  const win = createMarqueeEventTarget();
  const doc = createMarqueeEventTarget();
  const html = createMarqueeEventTarget();
  const body = createMarqueeEventTarget();
  const selectedComponent = {
    get: (key) => (key === 'selectable' ? true : undefined),
    parents: () => [],
  };
  const clickEvent = {
    target: {
      closest: (selector) => (selector.includes('data-spacing-multi-toolbar') ? {} : null),
    },
    preventDefaultCalled: false,
    stopPropagationCalled: false,
    preventDefault() {
      this.preventDefaultCalled = true;
    },
    stopPropagation() {
      this.stopPropagationCalled = true;
    },
  };

  Object.assign(win, {
    requestAnimationFrame: (callback) => {
      callback();
      return 1;
    },
    cancelAnimationFrame: () => {},
  });
  Object.assign(doc, {
    defaultView: win,
    documentElement: html,
    querySelectorAll: () => [],
    createElement: () => ({
      style: {},
      setAttribute: () => {},
      remove: () => {},
    }),
  });
  Object.assign(body, {
    ownerDocument: doc,
    style: {},
    dataset: {},
    appendChild: () => {},
    querySelectorAll: () => [
      {
        __gjsv: { model: selectedComponent },
        closest: () => null,
        getBoundingClientRect: () => ({ left: 10, top: 10, right: 30, bottom: 30, width: 20, height: 20 }),
      },
    ],
  });

  const eventBase = {
    pointerId: 11,
    ctrlKey: true,
    button: 0,
    target: {
      closest: () => null,
      setPointerCapture: () => {},
    },
    preventDefault: () => {},
    stopPropagation: () => {},
  };

  const detach = attachCanvasMarqueeSelection({
    Canvas: {
      getBody: () => body,
    },
    getSelectedAll: () => [],
    select() {},
  });

  doc.emit('pointerdown', {
    ...eventBase,
    clientX: 0,
    clientY: 0,
  });
  win.emit('pointermove', {
    ...eventBase,
    clientX: 80,
    clientY: 80,
  });
  win.emit('pointerup', {
    ...eventBase,
    clientX: 80,
    clientY: 80,
  });
  win.emit('click', clickEvent);

  assert.equal(clickEvent.preventDefaultCalled, false);
  assert.equal(clickEvent.stopPropagationCalled, false);

  detach();
});

test('SpacingOverlay toolbar profiling logs stay behind a debug gate', () => {
  const originalFlag = globalThis.CCUI_DEBUG_SPACING_OVERLAY;
  const originalConsoleLog = console.log;
  const logs = [];
  const editor = {
    getSelected: () => null,
    refresh: () => {},
  };
  const component = {
    get: (key) => (key === 'id' ? 'hero' : key === 'toolbar' ? [{ command: 'tlb-move' }] : undefined),
    set: () => {},
  };

  console.log = (...args) => {
    logs.push(args);
  };

  try {
    delete globalThis.CCUI_DEBUG_SPACING_OVERLAY;
    syncSpacingOverlayToolbar(editor, component);
    assert.equal(logs.length, 0);

    globalThis.CCUI_DEBUG_SPACING_OVERLAY = true;
    syncSpacingOverlayToolbar(editor, component);
    assert.equal(logs.length, 1);
    assert.equal(logs[0][0], '[SpacingOverlay]');
    assert.equal(logs[0][1], 'toolbar-sync');
    assert.equal(logs[0][2].selectedId, 'hero');
    assert.equal(typeof logs[0][2].durationMs, 'number');
  } finally {
    console.log = originalConsoleLog;
    if (originalFlag === undefined) {
      delete globalThis.CCUI_DEBUG_SPACING_OVERLAY;
    } else {
      globalThis.CCUI_DEBUG_SPACING_OVERLAY = originalFlag;
    }
  }
});

test('isWrapperComponent only treats GrapesJS wrapper nodes as the page root', () => {
  assert.equal(isWrapperComponent({
    getType: () => 'wrapper',
    get: () => undefined,
  }), true);

  assert.equal(isWrapperComponent({
    getType: () => 'default',
    get: (key) => (key === 'type' ? 'default' : undefined),
  }), false);

  assert.equal(isWrapperComponent({
    get: (key) => (key === 'type' ? 'wrapper' : undefined),
  }), true);

  assert.equal(isWrapperComponent(null), false);
});

test('SpacingOverlay send-to-chat diagnostic logs stay behind a debug gate', async () => {
  const source = await readFile(new URL('./SpacingOverlay.tsx', import.meta.url), 'utf8');

  assert.match(source, /CCUI_DEBUG_VISUAL_SEND_TO_CHAT/);
  assert.match(source, /function isVisualSendToChatDebugEnabled\(\)/);
  assert.match(source, /if \(!isVisualSendToChatDebugEnabled\(\)\) \{\s*return;\s*\}/);
});

test('syncSpacingOverlayToolbar skips editor.refresh until Canvas.refresh is ready', () => {
  let refreshCalls = 0;
  const editor = {
    getSelected: () => null,
    refresh: () => {
      refreshCalls += 1;
      throw new TypeError("Cannot read properties of undefined (reading 'refresh')");
    },
    Canvas: {},
  };
  const component = {
    get: (key) => (key === 'id' ? 'hero' : key === 'toolbar' ? [{ command: 'tlb-move' }] : undefined),
    set: () => {},
  };

  assert.doesNotThrow(() => {
    syncSpacingOverlayToolbar(editor, component);
  });
  assert.equal(refreshCalls, 0);
});

test('syncSpacingOverlayToolbar can refresh tool position even when toolbar is already patched', () => {
  const refreshCalls = [];
  const patchedToolbar = [{ command: 'ccui-send-to-ai' }, { command: 'tlb-clone' }];
  const editor = {
    getSelected: () => null,
    refresh: (options) => {
      refreshCalls.push(options);
    },
    Canvas: {
      refresh: () => {},
    },
  };
  const component = {
    get: (key) => (key === 'id' ? 'hero' : key === 'toolbar' ? patchedToolbar : undefined),
    set: () => {
      throw new Error('toolbar should not be rewritten');
    },
  };

  syncSpacingOverlayToolbar(editor, component, { refreshTools: true });

  assert.deepEqual(refreshCalls, [{ tools: true }]);
});

test('attachSpacingOverlayToolbarSync coalesces burst selection refreshes into one frame', () => {
  const fixture = createToolbarSelectionFixture();
  const toolbarSync = attachSpacingOverlayToolbarSync(fixture.editor, () => Promise.resolve());
  fixture.refreshCalls.length = 0;

  fixture.selectHero();
  fixture.emit('component:selected', fixture.editor.getSelected());
  fixture.emit('component:selected', fixture.editor.getSelected());
  fixture.emit('component:selected', fixture.editor.getSelected());

  assert.deepEqual(fixture.refreshCalls, []);
  assert.equal(fixture.getPendingFrameCount(), 1);

  fixture.flushFrame();
  assert.deepEqual(fixture.refreshCalls, [{ tools: true }]);

  toolbarSync();
});

test('SpacingOverlay toolbar refresh preserves layer selection after coalesced selection events', () => {
  const fixture = createToolbarSelectionFixture();
  const toolbarSync = attachSpacingOverlayToolbarSync(fixture.editor, () => Promise.resolve());
  const bridge = createGrapesLikeInspectorBridge(fixture.editor);
  bridge.adapter.getSnapshot();
  fixture.refreshCalls.length = 0;

  const timeline = [];
  const unsubscribe = bridge.adapter.subscribe(() => {
    const snapshot = bridge.adapter.getSnapshot();
    timeline.push({
      selection: snapshot.selection.primarySelectedId,
      layerSelection: [...snapshot.layers.selectedLayerIds],
    });
  });

  fixture.selectHero();
  fixture.emit('component:selected', fixture.editor.getSelected());

  assert.deepEqual(fixture.refreshCalls, []);
  assert.deepEqual(timeline, []);
  assert.equal(fixture.getPendingFrameCount(), 2);

  fixture.flushFrame();
  assert.deepEqual(fixture.refreshCalls, [{ tools: true }]);
  assert.equal(fixture.readToolbar()[0].command, 'ccui-send-to-ai');
  assert.deepEqual(timeline, []);
  assert.equal(fixture.getPendingFrameCount(), 1);

  fixture.flushFrame();
  assert.deepEqual(timeline, [{
    selection: 'hero',
    layerSelection: ['hero'],
  }]);
  assert.equal(fixture.getPendingFrameCount(), 1);

  fixture.flushFrame();
  assert.deepEqual(timeline[1], {
    selection: 'hero',
    layerSelection: ['hero'],
  });

  unsubscribe();
  toolbarSync();
  assert.deepEqual(fixture.commandAdds, ['ccui-send-to-ai']);
  assert.deepEqual(fixture.commandRemoves, ['ccui-send-to-ai']);
});
