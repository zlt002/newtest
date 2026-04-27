import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BROWSER_IFRAME_REFERRER_POLICY,
  BROWSER_IFRAME_SANDBOX,
  createBrowserPaneState,
  getBrowserIframeSandbox,
  navigateBrowserPaneState,
  resetBrowserPaneState,
  refreshBrowserPaneState,
  syncBrowserPaneAddress,
  moveBrowserPaneHistory,
} from './browserPaneState.ts';

test('browser iframe sandbox omits allow-same-origin while keeping interactive capabilities', () => {
  assert.equal(BROWSER_IFRAME_SANDBOX, 'allow-forms allow-modals allow-popups allow-scripts');
  assert.doesNotMatch(BROWSER_IFRAME_SANDBOX, /allow-same-origin/);
  assert.equal(BROWSER_IFRAME_REFERRER_POLICY, 'strict-origin-when-cross-origin');
});

test('getBrowserIframeSandbox always uses the external browser sandbox', () => {
  assert.equal(getBrowserIframeSandbox(), BROWSER_IFRAME_SANDBOX);
});

test('createBrowserPaneState seeds history, address, and refresh state', () => {
  assert.deepEqual(createBrowserPaneState('http://localhost:5173/start'), {
    entries: ['http://localhost:5173/start'],
    currentIndex: 0,
    addressValue: 'http://localhost:5173/start',
    refreshKey: 0,
  });
});

test('navigateBrowserPaneState keeps the current page when address is invalid', () => {
  const previousState = createBrowserPaneState('http://localhost:5173/start');
  const nextState = navigateBrowserPaneState(previousState, 'example.com');

  assert.deepEqual(nextState, previousState);
});

test('navigateBrowserPaneState normalizes localhost addresses before navigating', () => {
  const previousState = createBrowserPaneState('http://localhost:5173/start');
  const nextState = navigateBrowserPaneState(previousState, 'localhost:3000/demo');

  assert.deepEqual(nextState, {
    entries: ['http://localhost:5173/start', 'http://localhost:3000/demo'],
    currentIndex: 1,
    addressValue: 'http://localhost:3000/demo',
    refreshKey: 0,
  });
});

test('resetBrowserPaneState replaces history and address when target url changes', () => {
  const previousState = navigateBrowserPaneState(
    createBrowserPaneState('http://localhost:5173/start'),
    'localhost:3000/demo',
  );

  assert.deepEqual(resetBrowserPaneState(previousState, 'http://localhost:5173/reset'), {
    entries: ['http://localhost:5173/reset'],
    currentIndex: 0,
    addressValue: 'http://localhost:5173/reset',
    refreshKey: 0,
  });
});

test('refreshBrowserPaneState increments the refresh key without changing history', () => {
  const previousState = navigateBrowserPaneState(
    createBrowserPaneState('http://localhost:5173/start'),
    'localhost:3000/demo',
  );

  assert.deepEqual(refreshBrowserPaneState(previousState), {
    ...previousState,
    refreshKey: previousState.refreshKey + 1,
  });
});

test('syncBrowserPaneAddress keeps the address bar aligned with the current url', () => {
  const state = {
    ...createBrowserPaneState('http://localhost:5173/start'),
    addressValue: 'localhost:3000/draft',
  };

  assert.deepEqual(syncBrowserPaneAddress(state, 'http://localhost:5173/start'), {
    ...state,
    addressValue: 'http://localhost:5173/start',
  });
});

test('moveBrowserPaneHistory navigates backward without losing address sync', () => {
  const state = navigateBrowserPaneState(
    navigateBrowserPaneState(createBrowserPaneState('http://localhost:5173/start'), 'localhost:3000/one'),
    'localhost:3000/two',
  );

  assert.deepEqual(moveBrowserPaneHistory(state, 1), {
    entries: ['http://localhost:5173/start', 'http://localhost:3000/one', 'http://localhost:3000/two'],
    currentIndex: 1,
    addressValue: 'http://localhost:3000/one',
    refreshKey: 0,
  });
});
