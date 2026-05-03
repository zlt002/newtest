import test from 'node:test';
import assert from 'node:assert/strict';
import { rewriteCanvasHeadAssetUrls, splitCanvasHeadMarkup } from './canvasHeadMarkup.ts';

test('splitCanvasHeadMarkup keeps non-script head markup and extracts script tags separately', () => {
  const result = splitCanvasHeadMarkup(`
    <meta charset="utf-8" />
    <title>Preview</title>
    <link rel="stylesheet" href="/assets/app.css" />
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
      window.demo = true;
    </script>
  `);

  assert.match(result.staticMarkup, /<meta charset="utf-8"/);
  assert.match(result.staticMarkup, /<title>Preview<\/title>/);
  assert.match(result.staticMarkup, /<link rel="stylesheet" href="\/assets\/app\.css"/);
  assert.equal(result.scripts.length, 2);
  assert.deepEqual(result.scripts[0], {
    attributes: {
      src: 'https://cdn.tailwindcss.com',
    },
    content: '',
  });
  assert.deepEqual(result.scripts[1], {
    attributes: {},
    content: 'window.demo = true;',
  });
});

test('rewriteCanvasHeadAssetUrls rewrites relative asset paths against the preview directory', () => {
  const result = rewriteCanvasHeadAssetUrls(`
    <link rel="stylesheet" href="index.css">
    <script src="./scripts/app.js"></script>
    <img src="images/avatar.png">
    <link rel="icon" href="https://example.com/favicon.ico">
  `, 'http://localhost:5173/api/projects/demo/preview/archive/index.html');

  assert.match(result, /href="http:\/\/localhost:5173\/api\/projects\/demo\/preview\/archive\/index\.css"/);
  assert.match(result, /src="http:\/\/localhost:5173\/api\/projects\/demo\/preview\/archive\/scripts\/app\.js"/);
  assert.match(result, /src="http:\/\/localhost:5173\/api\/projects\/demo\/preview\/archive\/images\/avatar\.png"/);
  assert.match(result, /href="https:\/\/example\.com\/favicon\.ico"/);
});
