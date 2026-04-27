import test from 'node:test';
import assert from 'node:assert/strict';

import { removeDirectoryWithRetry } from './release-fs.mjs';

test('removeDirectoryWithRetry retries ENOTEMPTY and eventually succeeds', async () => {
  let attempts = 0;

  await removeDirectoryWithRetry('/tmp/release-windows-lite', {
    retries: 2,
    retryDelayMs: 0,
    rmImpl: async () => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error('directory not empty');
        error.code = 'ENOTEMPTY';
        throw error;
      }
    },
  });

  assert.equal(attempts, 2);
});
