import test from 'node:test';
import assert from 'node:assert/strict';
import { splitCanvasHeadMarkup } from './canvasHeadMarkup.ts';

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
