import test from 'node:test';
import assert from 'node:assert/strict';
import { getFileOpenPayload } from './fileOpenPayload.ts';

test('getFileOpenPayload keeps html open payload free of previewUrl', () => {
  const result = getFileOpenPayload({
    item: {
      type: 'file',
      name: 'preview.html',
      path: '/demo/reports/preview.html',
    },
  });

  assert.deepEqual(result, {
    filePath: '/demo/reports/preview.html',
  });
  assert.equal('previewUrl' in result, false);
});
