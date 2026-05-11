import test from 'node:test';
import assert from 'node:assert/strict';

import {
  readJsonObjectFile,
  updateJsonObjectFile,
} from './json-file-store.js';

function createMemoryFs(initialFiles = {}) {
  const files = { ...initialFiles };
  const mkdirCalls = [];
  return {
    files,
    mkdirCalls,
    async readFile(filepath, encoding) {
      assert.equal(encoding, 'utf8');
      if (!(filepath in files)) {
        const error = new Error(`ENOENT: ${filepath}`);
        error.code = 'ENOENT';
        throw error;
      }
      return files[filepath];
    },
    async mkdir(filepath, options) {
      mkdirCalls.push({ filepath, options });
    },
    async writeFile(filepath, content, encoding) {
      assert.equal(encoding, 'utf8');
      files[filepath] = content;
    },
  };
}

test('readJsonObjectFile returns empty object for missing or invalid files', async () => {
  const fs = createMemoryFs({
    '/bad.json': 'not json',
    '/array.json': '[]',
  });

  assert.deepEqual(await readJsonObjectFile('/missing.json', { fileSystem: fs }), {});
  assert.deepEqual(await readJsonObjectFile('/bad.json', { fileSystem: fs }), {});
  assert.deepEqual(await readJsonObjectFile('/array.json', { fileSystem: fs }), {});
});

test('updateJsonObjectFile preserves unknown fields and writes formatted JSON', async () => {
  const fs = createMemoryFs({
    '/tmp/settings.json': JSON.stringify({
      permissions: { allow: ['Read(*)'] },
      env: { EXISTING: 'keep' },
    }),
  });

  const result = await updateJsonObjectFile('/tmp/settings.json', (current) => ({
    ...current,
    env: {
      ...current.env,
      ANTHROPIC_MODEL: 'sonnet',
    },
  }), { fileSystem: fs });

  assert.deepEqual(result, {
    permissions: { allow: ['Read(*)'] },
    env: {
      EXISTING: 'keep',
      ANTHROPIC_MODEL: 'sonnet',
    },
  });
  assert.equal(
    fs.files['/tmp/settings.json'],
    `${JSON.stringify(result, null, 2)}\n`,
  );
  assert.deepEqual(fs.mkdirCalls, [
    { filepath: '/tmp', options: { recursive: true } },
  ]);
});
