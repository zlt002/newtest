import test from 'node:test';
import assert from 'node:assert/strict';

import { register } from 'node:module';

const loaderSource = `
export async function resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && specifier.endsWith('.js')) {
    try {
      return await nextResolve(specifier.slice(0, -3) + '.ts', context);
    } catch {
      return nextResolve(specifier, context);
    }
  }

  return nextResolve(specifier, context);
}
`;

register(`data:text/javascript,${encodeURIComponent(loaderSource)}`, import.meta.url);

const {
  createDocumentSnapshot,
  createWorkspaceDocument,
  buildSavedHtml,
} = await import('./htmlDocumentTransforms.ts');

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

test('buildSavedHtml preserves body scripts when visual canvas html omits them', () => {
  const source = `<!doctype html>
<html>
<head></head>
<body>
  <h2 onclick="showModal()">员工信息登记</h2>
  <div id="infoModal"></div>
  <script>
    function showModal() {
      document.getElementById('infoModal').style.display = 'flex';
    }
  </script>
</body>
</html>`;
  const workspaceDocument = createWorkspaceDocument(source);

  assert.doesNotMatch(workspaceDocument.bodyHtml, /<script>/);

  const html = buildSavedHtml({
    snapshot: workspaceDocument.snapshot,
    bodyHtml: '<h2 onclick="showModal()">员工信息登记</h2><div id="infoModal"></div>',
    css: '',
  });

  assert.match(html, /<script>/);
  assert.match(html, /function showModal\(\)/);
});

test('buildSavedHtml restores inline event attributes stripped by the visual canvas', () => {
  const source = `<!doctype html>
<html>
<head></head>
<body>
  <h2 id="title" onclick="showModal()" title="点击查看详情">员工信息登记</h2>
  <script>function showModal() {}</script>
</body>
</html>`;
  const workspaceDocument = createWorkspaceDocument(source);

  const html = buildSavedHtml({
    snapshot: workspaceDocument.snapshot,
    bodyHtml: '<h2 id="title" title="点击查看详情">员工信息登记</h2>',
    css: '',
  });

  assert.match(html, /<h2[^>]+id="title"[^>]+onclick="showModal\(\)"/);
});
