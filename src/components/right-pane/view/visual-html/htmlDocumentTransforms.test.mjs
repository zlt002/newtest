import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDocumentSnapshot,
  createWorkspaceDocument,
  buildSavedHtml,
} from './htmlDocumentTransforms.ts';

test('createWorkspaceDocument extracts body html and styles from a full html document', () => {
  const result = createWorkspaceDocument(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <style>body { color: red; }</style>
</head>
<body><main>demo</main></body>
</html>`);

  assert.equal(result.snapshot.htmlAttributes, ' lang="zh-CN"');
  assert.match(result.bodyHtml, /<main>demo<\/main>/);
  assert.match(result.styles, /body \{ color: red; \}/);
});

test('createDocumentSnapshot keeps head markup without managed styles', () => {
  const snapshot = createDocumentSnapshot(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>body { color: red; }</style>
</head>
<body data-page="demo"><main>demo</main></body>
</html>`);

  assert.match(snapshot.headMarkup, /<meta charset="utf-8">/);
  assert.doesNotMatch(snapshot.headMarkup, /<style>/);
  assert.equal(snapshot.bodyAttributes, ' data-page="demo"');
});

test('buildSavedHtml rebuilds a full html document with managed css', () => {
  const html = buildSavedHtml({
    snapshot: {
      htmlAttributes: ' lang="zh-CN"',
      bodyAttributes: ' class="preview"',
      headMarkup: '<meta charset="utf-8">',
    },
    bodyHtml: '<main>demo</main>',
    css: 'body { color: red; }',
  });

  assert.match(html, /<!doctype html>/);
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /<style data-ccui-visual-html-style="true">/);
  assert.match(html, /<body class="preview">/);
  assert.match(html, /<main>\n\s+demo\n\s+<\/main>/);
});

test('buildSavedHtml formats nested body html instead of keeping it on one long line', () => {
  const html = buildSavedHtml({
    snapshot: {
      htmlAttributes: '',
      bodyAttributes: '',
      headMarkup: '',
    },
    bodyHtml: '<div class="card"><div class="title">Welcome back</div><div class="desc">Sign in</div></div>',
    css: '',
  });

  assert.match(
    html,
    /<body>\n\s+<div class="card">\n\s+<div class="title">/,
  );
  assert.doesNotMatch(
    html,
    /<body>\n<div class="card"><div class="title">Welcome back<\/div><div class="desc">Sign in<\/div><\/div>\n<\/body>/,
  );
});
