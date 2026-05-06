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

test('buildSavedHtml restores inline event attributes for classed elements without ids', () => {
  const source = `<!doctype html>
<html>
<head></head>
<body>
  <span class="popup-trigger" onclick="showPopup()">111</span>
  <script>function showPopup() {}</script>
</body>
</html>`;
  const workspaceDocument = createWorkspaceDocument(source);

  const html = buildSavedHtml({
    snapshot: workspaceDocument.snapshot,
    bodyHtml: '<span class="popup-trigger">111</span>',
    css: '',
  });

  assert.match(html, /<span[^>]+class="popup-trigger"[^>]+onclick="showPopup\(\)"/);
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

test('buildSavedHtmlPreservingHead inlines editable element canvas css without replacing source styles', () => {
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
  assert.match(html, /id="menu-item"[^>]+style="padding-left: 40px; color: #ffffff; background-color: #232f3d;"/);
  assert.doesNotMatch(html, /data-ccui-visual-html-canvas-style="true"/);
  assert.doesNotMatch(html, /#menu-item\{/);
});

test('buildSavedHtmlPreservingHead removes stale orphan canvas css instead of accumulating style tags', () => {
  const source = `<!doctype html>
<html>
<head>
  <style>.business{color:red}</style>
  <style data-ccui-visual-html-canvas-style="true">#old{left:1px}</style>
  <style data-ccui-visual-html-canvas-style="true">#older{left:2px}</style>
</head>
<body><main id="app">old</main></body>
</html>`;

  const html = buildSavedHtmlPreservingHead({
    sourceHtml: source,
    bodyHtml: '<main id="app">new</main>',
    canvasCss: '#app{left:3px}',
  });

  assert.match(html, /\.business\{color:red\}/);
  assert.doesNotMatch(html, /#old\{left:1px\}/);
  assert.doesNotMatch(html, /#older\{left:2px;\}/);
  assert.match(html, /id="app"[^>]+style="left: 3px;"/);
  assert.doesNotMatch(html, /data-ccui-visual-html-canvas-style="true"/);
});

test('buildSavedHtmlPreservingHead keeps previous canvas css when reopening and saving without new Grapes css', () => {
  const source = `<!doctype html>
<html>
<head>
  <style>.business{color:red}</style>
  <style data-ccui-visual-html-canvas-style="true">#irki{background-color:#b46464;}</style>
</head>
<body><h1 id="irki">用户满意度调研</h1></body>
</html>`;

  const html = buildSavedHtmlPreservingHead({
    sourceHtml: source,
    bodyHtml: '<h1 id="irki">用户满意度调研</h1>',
    canvasCss: '* { box-sizing: border-box; } body {margin: 0;}',
  });

  assert.match(html, /\.business\{color:red\}/);
  assert.match(html, /id="irki"[^>]+style="background-color: #b46464;"/);
  assert.doesNotMatch(html, /#irki\{/);
  assert.match(html, /\*\{box-sizing:border-box;\}/);
  assert.match(html, /body\{margin:0;\}/);
  assert.equal((html.match(/data-ccui-visual-html-canvas-style="true"/g) ?? []).length, 1);
});

test('buildSavedHtmlPreservingHead preserves inline visual edits after save and reopen', () => {
  const source = `<!doctype html>
<html>
<head>
  <style>.menu-item{padding-right:96px;color:#ffffff}</style>
</head>
<body>
  <div id="menu-item" class="menu-item">订单中心</div>
</body>
</html>`;

  const firstSave = buildSavedHtmlPreservingHead({
    sourceHtml: source,
    bodyHtml: '<div id="menu-item" class="menu-item">订单中心</div>',
    canvasCss: '#menu-item{padding-right:104px;background-color:#232f3d;}',
  });
  const reopened = createWorkspaceDocument(firstSave);
  const secondSave = buildSavedHtmlPreservingHead({
    sourceHtml: firstSave,
    bodyHtml: reopened.bodyHtml,
    canvasCss: '',
  });

  assert.match(firstSave, /id="menu-item"[^>]+style="padding-right: 104px; background-color: #232f3d;"/);
  assert.match(secondSave, /id="menu-item"[^>]+style="padding-right: 104px; background-color: #232f3d;"/);
  assert.match(secondSave, /\.menu-item\{padding-right:96px;color:#ffffff\}/);
  assert.doesNotMatch(secondSave, /#menu-item\{/);
});

test('buildSavedHtmlPreservingHead does not persist source css into managed canvas style when only text changes', () => {
  const source = `<!doctype html>
<html>
<head>
  <style>.usage-title{color:#131212}.usage-panel{display:flex;gap:16px}</style>
  <style data-ccui-visual-html-canvas-style="true">*{box-sizing:border-box;}body{margin:0;}#__SVG_SPRITE_NODE__{position:absolute;width:0;height:0;}</style>
</head>
<body>
  <div class="usage-panel">
    <h1 class="usage-title">用量统计</h1>
  </div>
</body>
</html>`;

  const html = buildSavedHtmlPreservingHead({
    sourceHtml: source,
    bodyHtml: `
      <div class="usage-panel">
        <h1 class="usage-title">用量11统计</h1>
      </div>
    `,
    canvasCss: '.usage-title{color:#131212}.usage-panel{display:flex;gap:16px}*{box-sizing:border-box;}body{margin:0;}#__SVG_SPRITE_NODE__{position:absolute;width:0;height:0;}',
  });

  assert.match(html, /用量11统计/);
  assert.equal((html.match(/\.usage-title\{color:#131212\}/g) ?? []).length, 1);
  assert.equal((html.match(/\.usage-panel\{display:flex;gap:16px\}/g) ?? []).length, 1);
  assert.equal((html.match(/data-ccui-visual-html-canvas-style="true"/g) ?? []).length, 1);
  assert.match(html, /\*\{box-sizing:border-box;\}/);
  assert.match(html, /body\{margin:0;\}/);
  assert.doesNotMatch(html, /data-ccui-visual-html-canvas-style="true">[^<]*\.usage-title\{/);
  assert.doesNotMatch(html, /data-ccui-visual-html-canvas-style="true">[^<]*\.usage-panel\{/);
});

test('buildSavedHtmlPreservingHead drops duplicated non-id selector rules even when Grapes css expands them to longhand', () => {
  const source = `<!doctype html>
<html>
<head>
  <style>
    .usage-limit-card .usage-indicator-item .progress-bar[data-v-e914a6ea]{border-radius:4px}
    .usage-limit-card .usage-indicator-item .progress-bar-value[data-v-e914a6ea]{border-radius:4px 0 0 4px}
  </style>
  <style data-ccui-visual-html-canvas-style="true">
    .usage-limit-card .usage-indicator-item .progress-bar[data-v-e914a6ea]{border-top-left-radius:4px;border-top-right-radius:4px;border-bottom-right-radius:4px;border-bottom-left-radius:4px;}
  </style>
</head>
<body>
  <div class="usage-limit-card">
    <div class="usage-indicator-item">
      <div data-v-e914a6ea="" class="progress-bar">
        <div data-v-e914a6ea="" class="progress-bar-value" style="width:0%;"></div>
      </div>
      <span>用量统计</span>
    </div>
  </div>
</body>
</html>`;

  const html = buildSavedHtmlPreservingHead({
    sourceHtml: source,
    bodyHtml: `
      <div class="usage-limit-card">
        <div class="usage-indicator-item">
          <div data-v-e914a6ea="" class="progress-bar">
            <div data-v-e914a6ea="" class="progress-bar-value" style="width:0%;"></div>
          </div>
          <span>用量11111统计</span>
        </div>
      </div>
    `,
    canvasCss: `
      .usage-limit-card .usage-indicator-item .progress-bar[data-v-e914a6ea]{border-top-left-radius:4px;border-top-right-radius:4px;border-bottom-right-radius:4px;border-bottom-left-radius:4px;}
      .usage-limit-card .usage-indicator-item .progress-bar-value[data-v-e914a6ea]{border-top-left-radius:4px;border-top-right-radius:0px;border-bottom-right-radius:0px;border-bottom-left-radius:4px;}
    `,
  });

  assert.match(html, /用量11111统计/);
  assert.match(html, /class="progress-bar"/);
  assert.equal((html.match(/data-ccui-visual-html-canvas-style="true"/g) ?? []).length, 0);
  assert.equal((html.match(/class="flex justify-between items-end"/g) ?? []).length, 0);
});

test('buildSavedHtmlPreservingHead self-heals legacy managed canvas css pollution on text-only saves', () => {
  const source = `<!doctype html>
<html>
<head>
  <style>.page-title{font-size:20px;font-weight:600}</style>
  <style data-ccui-visual-html-canvas-style="true">
    *{box-sizing:border-box;}
    body{margin:0;}
    #__SVG_SPRITE_NODE__{position:absolute;width:0px;height:0px;}
    .swiper, :host{display:block;position:relative;}
    .usage-limit-card .usage-indicator-item .progress-bar[data-v-e914a6ea]{border-top-left-radius:4px;border-top-right-radius:4px;border-bottom-right-radius:4px;border-bottom-left-radius:4px;}
    0%, 20%, 53%, 100%{transform:translateZ(0px);}
  </style>
</head>
<body>
  <div class="page-title">用量统计</div>
</body>
</html>`;

  const html = buildSavedHtmlPreservingHead({
    sourceHtml: source,
    bodyHtml: '<div class="page-title">用量11111统计33333333</div>',
    canvasCss: '',
  });

  assert.match(html, /用量11111统计33333333/);
  assert.equal((html.match(/data-ccui-visual-html-canvas-style="true"/g) ?? []).length, 1);
  assert.match(html, /\*\{box-sizing:border-box;\}/);
  assert.match(html, /body\{margin:0;\}/);
  assert.doesNotMatch(html, /\.swiper,\s*:host\{/);
  assert.doesNotMatch(html, /\.progress-bar\[data-v-e914a6ea\]\{/);
  assert.doesNotMatch(html, /0%,\s*20%,\s*53%,\s*100%\{/);
});

test('buildSavedHtmlPreservingHead drops re-exported non-id Grapes css even when legacy managed canvas css was already polluted', () => {
  const source = `<!doctype html>
<html>
<head>
  <style>.page-title{font-size:20px;font-weight:600}</style>
  <style data-ccui-visual-html-canvas-style="true">
    *{box-sizing:border-box;}
    body{margin:0;}
    #__SVG_SPRITE_NODE__{position:absolute;width:0px;height:0px;}
    .swiper, :host{display:block;position:relative;}
  </style>
</head>
<body>
  <div class="page-title">鐢ㄩ噺缁熻</div>
</body>
</html>`;

  const html = buildSavedHtmlPreservingHead({
    sourceHtml: source,
    bodyHtml: '<div class="page-title">鐢ㄩ噺11111缁熻33333333</div>',
    canvasCss: `
      *{box-sizing:border-box;}
      body{margin:0;}
      #__SVG_SPRITE_NODE__{position:absolute;width:0px;height:0px;}
      .swiper, :host{display:block;margin-left:auto;margin-right:auto;position:relative;z-index:1;}
      .help-block[data-v-416c94c8]{box-sizing:border-box;display:flex;width:100%;}
      .justify-between{justify-content:space-between;}
    `,
  });

  assert.match(html, /鐢ㄩ噺11111缁熻33333333/);
  assert.equal((html.match(/data-ccui-visual-html-canvas-style="true"/g) ?? []).length, 1);
  assert.match(html, /\*\{box-sizing:border-box;\}/);
  assert.match(html, /body\{margin:0;\}/);
  assert.doesNotMatch(html, /\.swiper,\s*:host\{/);
  assert.doesNotMatch(html, /\.help-block\[data-v-416c94c8\]\{/);
  assert.doesNotMatch(html, /\.justify-between\{/);
});

test('buildSavedHtmlPreservingHead coalesces repeated canvas selector declarations to the latest value', () => {
  const source = `<!doctype html>
<html>
<head>
  <style data-ccui-visual-html-canvas-style="true">
    * { box-sizing: border-box; } body { margin: 0; } #irki { background-color: #b46464; }
    * { box-sizing: border-box; } body { margin: 0; } #irki { padding-bottom: 16px; }
    * { box-sizing: border-box; } body { margin: 0; } #irki { padding-bottom: 18px; }
  </style>
</head>
<body><h1 id="irki">用户满意度调研</h1></body>
</html>`;

  const html = buildSavedHtmlPreservingHead({
    sourceHtml: source,
    bodyHtml: '<h1 id="irki">用户满意度调研</h1>',
    canvasCss: '* { box-sizing: border-box; } body { margin: 0; } #irki { padding-bottom: 24px; padding-top: 8px; }',
  });

  assert.match(html, /id="irki"[^>]+style="background-color: #b46464; padding-bottom: 24px; padding-top: 8px;"/);
  assert.doesNotMatch(html, /#irki\{/);
  assert.equal((html.match(/padding-bottom:/g) ?? []).length, 1);
  assert.equal((html.match(/\*\{box-sizing:border-box;\}/g) ?? []).length, 1);
  assert.equal((html.match(/body\{margin:0;\}/g) ?? []).length, 1);
});

test('buildSavedHtmlPreservingHead inlines generated Grapes component id rules into body markup', () => {
  const source = `<!doctype html>
<html>
<head><style>.business{color:red}</style></head>
<body><section><div>原始内容</div></section></body>
</html>`;

  const html = buildSavedHtmlPreservingHead({
    sourceHtml: source,
    bodyHtml: '<section><div id="ivrdw">原始内容</div></section>',
    canvasCss: '#ivrdw{padding-left:40px;color:#ffffff;background-color:#232f3d;}',
  });

  assert.match(html, /\.business\{color:red\}/);
  assert.match(html, /id="ivrdw"[^>]+style="padding-left: 40px; color: #ffffff; background-color: #232f3d;"/);
  assert.doesNotMatch(html, /#ivrdw\{/);
});

test('buildSavedHtmlPreservingHead drops runtime and orphan canvas selectors during save', () => {
  const source = `<!doctype html>
<html>
<head><style>.business{color:red}</style></head>
<body>
  <div id="menu-item">订单中心</div>
</body>
</html>`;

  const html = buildSavedHtmlPreservingHead({
    sourceHtml: source,
    bodyHtml: '<div id="menu-item">订单中心</div>',
    canvasCss: `
      #menu-item{padding-left:20px;}
      #el-popover-1{display:none;width:200px;}
      #dropdown-menu-3{display:none;}
      #ghost-node{left:12px;}
      #plasmo-overlay-0{display:flex;}
    `,
  });

  assert.match(html, /id="menu-item"[^>]+style="padding-left: 20px;"/);
  assert.doesNotMatch(html, /#menu-item\{/);
  assert.doesNotMatch(html, /#el-popover-1\{/);
  assert.doesNotMatch(html, /#dropdown-menu-3\{/);
  assert.doesNotMatch(html, /#ghost-node\{/);
  assert.doesNotMatch(html, /#plasmo-overlay-0\{/);
});

test('buildSavedHtmlPreservingHead keeps canvas rules for source hidden runtime nodes', () => {
  const source = `<!doctype html>
<html>
<head><style>.business{color:red}</style></head>
<body>
  <micro-app name="otp-tms">
    <div id="content">内容</div>
    <div role="tooltip" id="el-popover-1" style="display:none;position:absolute;left:-9999px;top:0;">隐藏弹层</div>
  </micro-app>
</body>
</html>`;

  const html = buildSavedHtmlPreservingHead({
    sourceHtml: source,
    bodyHtml: '<micro-app name="otp-tms"><div id="content">内容</div></micro-app>',
    canvasCss: '#el-popover-1{display:none;width:200px;left:-9999px;top:0;}#dropdown-menu-3{display:none;}',
  });

  assert.match(html, /id="el-popover-1"[^>]+display:none/);
  assert.match(html, /#el-popover-1\{display:none;width:200px;left:-9999px;top:0;\}/);
  assert.doesNotMatch(html, /#dropdown-menu-3\{/);
});

test('buildSavedHtmlPreservingHead keeps rules for body nodes even when ids do not match known runtime prefixes', () => {
  const source = `<!doctype html>
<html>
<head></head>
<body><div id="content">内容</div></body>
</html>`;

  const html = buildSavedHtmlPreservingHead({
    sourceHtml: source,
    bodyHtml: '<div id="content">内容</div><div id="custom-layer-1" style="display:none;position:absolute;left:-9999px;top:0;">隐藏层</div>',
    canvasCss: '#custom-layer-1{display:none;width:240px;left:-9999px;top:0;}#ghost-node{left:12px;}',
  });

  assert.match(html, /id="custom-layer-1"[^>]+style="display: none; position: absolute; left: -9999px; top: 0; width: 240px;"/);
  assert.doesNotMatch(html, /#custom-layer-1\{/);
  assert.doesNotMatch(html, /#ghost-node\{/);
});

test('buildSavedHtmlPreservingHead removes managed canvas css when the related element is deleted', () => {
  const source = `<!doctype html>
<html>
<head>
  <style>.business{color:red}</style>
  <style data-ccui-visual-html-canvas-style="true">#deleted-panel{padding-left:20px;color:#fff;}#deleted-child{background-color:#232f3d;}#survivor{margin-left:-4px;}</style>
</head>
<body>
  <div id="deleted-panel">
    <span id="deleted-child">待删除</span>
  </div>
  <div id="survivor">保留</div>
</body>
</html>`;

  const html = buildSavedHtmlPreservingHead({
    sourceHtml: source,
    bodyHtml: '<div id="survivor">保留</div>',
    canvasCss: '#survivor{margin-left:-8px;}',
  });

  assert.doesNotMatch(html, /#deleted-panel\{/);
  assert.doesNotMatch(html, /#deleted-child\{/);
  assert.match(html, /id="survivor"[^>]+style="margin-left: -8px;"/);
  assert.doesNotMatch(html, /#survivor\{/);
});

test('buildSavedHtmlPreservingHead inlines multiple editable canvas id rules', () => {
  const source = `<!doctype html>
<html>
<head></head>
<body><div id="menu-item">订单中心</div><div id="menu-child">子菜单</div></body>
</html>`;

  const html = buildSavedHtmlPreservingHead({
    sourceHtml: source,
    bodyHtml: '<div id="menu-item">订单中心</div><div id="menu-child">子菜单</div>',
    canvasCss: '#menu-item{padding-left:20px;color:#fff;}#menu-child{padding-left:40px;color:#fff;}',
  });

  assert.match(html, /id="menu-item"[^>]+style="padding-left: 20px; color: #fff;"/);
  assert.match(html, /id="menu-child"[^>]+style="padding-left: 40px; color: #fff;"/);
  assert.doesNotMatch(html, /data-ccui-visual-html-canvas-style="true"/);
  assert.doesNotMatch(html, /#menu-item\{/);
  assert.doesNotMatch(html, /#menu-child\{/);
});

test('buildSavedHtmlPreservingHead strips temporary hidden layer edit markup', () => {
  const source = `<!doctype html>
<html>
<head><style>.modal{display:none}</style></head>
<body><div id="modal" class="modal">详情</div></body>
</html>`;

  const html = buildSavedHtmlPreservingHead({
    sourceHtml: source,
    bodyHtml: '<div id="modal" class="modal" style="display: block !important; visibility: visible !important;" data-ccui-hidden-layer-preview="true" data-ccui-hidden-layer-original-style="display%3A%20none%3B">详情</div>',
    canvasCss: '[data-ccui-hidden-layer-preview]{display:block!important;}',
  });

  assert.doesNotMatch(html, /data-ccui-hidden-layer-preview/);
  assert.doesNotMatch(html, /data-ccui-hidden-layer-original-style/);
  assert.doesNotMatch(html, /data-ccui-hidden-layer-edit-style/);
  assert.doesNotMatch(html, /visibility: visible/);
  assert.match(html, /style="display: none;"/);
  assert.doesNotMatch(html, /data-ccui-hidden-layer-preview\]\{display:block/);
  assert.match(html, /\.modal\{display:none\}/);
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
