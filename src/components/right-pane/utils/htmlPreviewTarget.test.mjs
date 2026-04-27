import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveHtmlPreviewTarget } from './htmlPreviewTarget.ts';

test('resolveHtmlPreviewTarget maps project html files to the preview route', () => {
  const result = resolveHtmlPreviewTarget('/demo/reports/hello.html', {
    projectRoot: '/demo',
    projectName: 'demo-project',
    devServerUrl: 'http://localhost:4173',
  });

  assert.equal(result, 'http://localhost:4173/api/projects/demo-project/preview/reports/hello.html');
});

test('resolveHtmlPreviewTarget falls back to window.location.origin when devServerUrl is omitted', () => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    location: {
      origin: 'http://localhost:4273',
    },
  };

  try {
    const result = resolveHtmlPreviewTarget('/demo/public/previews/hello.html', {
      projectRoot: '/demo',
      projectName: 'demo-project',
    });

    assert.equal(result, 'http://localhost:4273/api/projects/demo-project/preview/public/previews/hello.html');
  } finally {
    globalThis.window = previousWindow;
  }
});

test('resolveHtmlPreviewTarget returns null when no reliable preview base url is available', () => {
  const previousWindow = globalThis.window;
  globalThis.window = undefined;

  try {
    const result = resolveHtmlPreviewTarget('/demo/public/previews/hello.html', {
      projectRoot: '/demo',
      projectName: 'demo-project',
    });

    assert.equal(result, null);
  } finally {
    globalThis.window = previousWindow;
  }
});

test('resolveHtmlPreviewTarget returns null for html files outside the project root', () => {
  const result = resolveHtmlPreviewTarget('/other/src/pages/hello.html', {
    projectRoot: '/demo',
    projectName: 'demo-project',
    devServerUrl: 'http://localhost:4173',
  });

  assert.equal(result, null);
});
