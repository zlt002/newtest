import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectPreviewDependencyPaths,
  shouldRefreshPreviewForFileChange,
} from './browserPreviewDependencies.ts';

function createFakeDocument(nodesBySelector) {
  return {
    querySelectorAll(selector) {
      return nodesBySelector[selector] ?? [];
    },
  };
}

function createFakeElement(attributes) {
  return {
    getAttribute(name) {
      return attributes[name] ?? null;
    },
  };
}

test('collectPreviewDependencyPaths resolves local stylesheet and script dependencies', () => {
  const document = createFakeDocument({
    'link[rel~="stylesheet"][href]': [
      createFakeElement({ href: '/api/projects/demo/preview/styles/login.css', rel: 'stylesheet' }),
    ],
    'script[src]': [
      createFakeElement({ src: '/api/projects/demo/preview/scripts/login.js' }),
    ],
  });

  const result = collectPreviewDependencyPaths({
    document,
    previewUrl: 'http://localhost:4173/api/projects/demo/preview/index.html',
    projectPath: '/workspace/demo',
  });

  assert.deepEqual(result, [
    '/workspace/demo/styles/login.css',
    '/workspace/demo/scripts/login.js',
  ]);
});

test('collectPreviewDependencyPaths decodes encoded preview resource paths', () => {
  const document = createFakeDocument({
    'link[rel~="stylesheet"][href]': [
      createFakeElement({ href: '/api/projects/demo/preview/styles/login%20page.css', rel: 'stylesheet' }),
    ],
    'script[src]': [],
  });

  const result = collectPreviewDependencyPaths({
    document,
    previewUrl: 'http://localhost:4173/api/projects/demo/preview/index.html',
    projectPath: '/workspace/demo',
  });

  assert.deepEqual(result, ['/workspace/demo/styles/login page.css']);
});

test('collectPreviewDependencyPaths ignores off-origin resources', () => {
  const document = createFakeDocument({
    'link[rel~="stylesheet"][href]': [
      createFakeElement({ href: 'https://cdn.example.com/styles/login.css', rel: 'stylesheet' }),
    ],
    'script[src]': [
      createFakeElement({ src: '/api/projects/demo/preview/scripts/login.js' }),
    ],
  });

  const result = collectPreviewDependencyPaths({
    document,
    previewUrl: 'http://localhost:4173/api/projects/demo/preview/index.html',
    projectPath: '/workspace/demo',
  });

  assert.deepEqual(result, ['/workspace/demo/scripts/login.js']);
});

test('shouldRefreshPreviewForFileChange returns true when the html file changes', () => {
  assert.equal(
    shouldRefreshPreviewForFileChange({
      previewFilePath: '/workspace/demo/index.html',
      dependencyPaths: ['/workspace/demo/styles/login.css'],
      changedFilePath: '/workspace/demo/index.html',
    }),
    true,
  );
});

test('shouldRefreshPreviewForFileChange returns true when a dependency file changes', () => {
  assert.equal(
    shouldRefreshPreviewForFileChange({
      previewFilePath: '/workspace/demo/index.html',
      dependencyPaths: ['/workspace/demo/styles/login.css', '/workspace/demo/scripts/login.js'],
      changedFilePath: '/workspace/demo/scripts/login.js',
    }),
    true,
  );
});

test('shouldRefreshPreviewForFileChange returns false for unrelated file changes', () => {
  assert.equal(
    shouldRefreshPreviewForFileChange({
      previewFilePath: '/workspace/demo/index.html',
      dependencyPaths: ['/workspace/demo/styles/login.css'],
      changedFilePath: '/workspace/demo/src/app.ts',
    }),
    false,
  );
});
