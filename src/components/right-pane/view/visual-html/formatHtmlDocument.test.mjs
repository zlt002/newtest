import test from 'node:test';
import assert from 'node:assert/strict';

import { formatHtmlDocument } from './formatHtmlDocument.ts';

test('formatHtmlDocument pretty prints the HTML source document', async () => {
  const source = '<!doctype html><html><head><meta charset="utf-8"><title>x</title></head><body><div><span>Hi</span></div></body></html>';
  const formatted = await formatHtmlDocument(source);

  assert.match(formatted, /<!doctype html>/i);
  assert.match(formatted, /<html>/i);
  assert.match(formatted, /\n\s+<head>/i);
  assert.match(formatted, /\n\s+<body>/i);
  assert.match(formatted, /\n\s+<div>/i);
  assert.notEqual(formatted, source);
});
