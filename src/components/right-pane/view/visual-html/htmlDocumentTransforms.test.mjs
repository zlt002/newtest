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
  buildSavedHtmlPreservingHead,
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

test('buildSavedHtmlPreservingHead replaces only body html and keeps source head styles intact', () => {
  const source = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="/app.css">
  <style>.el-menu{list-style:none}.layout{display:flex}</style>
  <style>.vxe-table{width:100%}</style>
</head>
<body class="page" onload="boot()">
  <main id="app" onclick="openPanel()">old</main>
  <script>function boot() {}</script>
</body>
</html>`;

  const html = buildSavedHtmlPreservingHead({
    sourceHtml: source,
    bodyHtml: '<main id="app">new</main>',
  });

  assert.match(html, /<link rel="stylesheet" href="\/app.css">/);
  assert.match(html, /\.el-menu\{list-style:none\}/);
  assert.match(html, /\.vxe-table\{width:100%\}/);
  assert.match(html, /<body class="page" onload="boot\(\)">/);
  assert.match(html, /<main[^>]+id="app"[^>]+onclick="openPanel\(\)"/);
  assert.match(html, /function boot\(\)/);
  assert.doesNotMatch(html, /old/);
});

test('buildSavedHtmlPreservingHead keeps source styles that were stored in body', () => {
  const source = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>.head-rule{color:red}</style>
</head>
<body>
  <style>.el-menu{list-style:none}.wrapper-menu .overflow-text{display:inline-block}</style>
  <main id="app">old</main>
</body>
</html>`;

  const html = buildSavedHtmlPreservingHead({
    sourceHtml: source,
    bodyHtml: '<main id="app">new</main>',
  });

  assert.match(html, /\.head-rule\{color:red\}/);
  assert.match(html, /\.el-menu\{list-style:none\}/);
  assert.match(html, /\.wrapper-menu \.overflow-text\{display:inline-block\}/);
  assert.doesNotMatch(html, /<body>[\s\S]*<style>/);
  assert.doesNotMatch(html, /old/);
});

test('buildSavedHtmlPreservingHead appends canvas css without replacing source styles', () => {
  const source = `<!doctype html>
<html>
<head><style>.el-menu{color:white}</style></head>
<body>
  <nav class="el-menu"><div id="menu-item" class="el-menu-item">订单中心</div></nav>
</body>
</html>`;

  const html = buildSavedHtmlPreservingHead({
    sourceHtml: source,
    bodyHtml: '<nav class="el-menu"><div id="menu-item" class="el-menu-item">订单中心</div></nav>',
    canvasCss: '#menu-item{padding-left:40px;color:#ffffff;background-color:#232f3d;}',
  });

  assert.match(html, /\.el-menu\{color:white\}/);
  assert.match(html, /data-ccui-visual-html-canvas-style="true"/);
  assert.match(html, /#menu-item\{padding-left:40px;color:#ffffff;background-color:#232f3d;\}/);
});

test('buildSavedHtmlPreservingHead patches runtime snapshots without replacing popover body structure', () => {
  const source = `<!doctype html>
<html>
<head><style>.el-popover{position:absolute}.sf-hidden{display:none!important}</style></head>
<body>
  <micro-app name="otp-tms">
    <span class="el-popover__reference-wrapper">
      <div id="menu-title" aria-describedby="el-popover-1" class="el-popover__reference">
        <span id="menu-text" class="overflow-text">订单管理</span>
      </div>
    </span>
    <div role="tooltip" id="el-popover-1" aria-hidden="true" class="el-popover el-popper" style="display:none">runtime tooltip</div>
    <div id="content" class="card">old</div>
  </micro-app>
</body>
</html>`;

  const html = buildSavedHtmlPreservingHead({
    sourceHtml: source,
    bodyHtml: `
      <micro-app name="otp-tms">
        <div id="menu-title" class="el-popover__reference" style="color: red">
          <span id="menu-text" class="overflow-text">订单中心</span>
        </div>
        <div id="content" class="card active" style="width: 120px">new</div>
      </micro-app>
    `,
  });

  assert.match(html, /role="tooltip"[^>]+id="el-popover-1"/);
  assert.match(html, /class="el-popover el-popper"/);
  assert.match(html, /id="el-popover-1"[^>]+style="display:none"/);
  assert.match(html, /aria-describedby="el-popover-1"/);
  assert.match(html, /id="menu-title"[^>]+style="color: red"/);
  assert.match(html, /<span[^>]+id="menu-text"[^>]*>\s*订单中心\s*<\/span>/);
  assert.match(html, /id="content"[^>]+class="card active"[^>]+style="width: 120px"/);
  assert.match(html, /<div[^>]+id="content"[^>]*>\s*new\s*<\/div>/);
});

test('buildSavedHtmlPreservingHead syncs copied Element UI table rows in runtime snapshots', () => {
  const source = `<!doctype html>
<html>
<head><style>.el-table__row{height:48px}.el-popover{display:block}</style></head>
<body>
  <micro-app name="otp-tms">
    <div role="tooltip" id="el-popover-1" class="el-popover el-popper" style="display:none">runtime tooltip</div>
    <table class="el-table__body">
      <tbody>
        <tr class="el-table__row"><td>PD2026042816080376220001</td><td>排单失败</td></tr>
      </tbody>
    </table>
  </micro-app>
</body>
</html>`;

  const rows = Array.from({ length: 6 }, (_, index) => `
        <tr class="el-table__row${index === 5 ? ' gjs-selected' : ''}"><td>PD202604281608037622000${index + 1}</td><td>排单成功</td></tr>`)
    .join('');

  const html = buildSavedHtmlPreservingHead({
    sourceHtml: source,
    bodyHtml: `
      <micro-app name="otp-tms">
        <table class="el-table__body">
          <tbody>${rows}
          </tbody>
        </table>
      </micro-app>
    `,
  });

  assert.equal((html.match(/class="el-table__row"/g) ?? []).length, 6);
  assert.match(html, /PD2026042816080376220006/);
  assert.match(html, /id="el-popover-1"[^>]+style="display:none"/);
  assert.doesNotMatch(html, /gjs-selected/);
});

test('buildSavedHtmlPreservingHead saves arbitrary visible edits while preserving non-editable hidden nodes', () => {
  const source = `<!doctype html>
<html>
<head><style>.el-menu-item{height:40px}.el-popover{position:absolute}</style></head>
<body>
  <micro-app name="otp-tms">
    <nav class="el-menu">
      <div class="el-menu-item">无钉住菜单</div>
    </nav>
    <div id="hidden-popover" role="tooltip" class="el-popover" style="display:none">隐藏弹框</div>
    <div id="offscreen-cache" style="position:absolute;left:-9999px;top:0;width:120px;height:40px">屏幕外缓存</div>
  </micro-app>
</body>
</html>`;

  const html = buildSavedHtmlPreservingHead({
    sourceHtml: source,
    bodyHtml: `
      <micro-app name="otp-tms">
        <nav class="el-menu">
          <div class="el-menu-item">无钉住菜单</div>
          <div class="el-menu-item">无钉住菜单</div>
          <div class="el-menu-item">无钉住菜单</div>
          <div class="el-menu-item">无钉住菜单</div>
        </nav>
      </micro-app>
    `,
  });

  assert.equal((html.match(/class="el-menu-item"/g) ?? []).length, 4);
  assert.match(html, /id="hidden-popover"[^>]+style="display:none"/);
  assert.match(html, /id="offscreen-cache"[^>]+left:-9999px/);
});
