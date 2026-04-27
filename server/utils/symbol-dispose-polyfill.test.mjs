import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

test('symbol-dispose polyfill restores Symbol.dispose before runtime polyfill import', () => {
  const polyfillPath = path.resolve('server/utils/symbol-dispose-polyfill.js');
  const legacyNodePath = '/usr/local/bin/node';
  if (!fs.existsSync(legacyNodePath)) {
    return;
  }
  const script = `
    await import(${JSON.stringify(`file://${polyfillPath}`)});
    console.log(String(Symbol.dispose), String(Symbol.asyncDispose));
  `;

  const result = spawnSync(legacyNodePath, ['--input-type=module', '--eval', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const output = result.stdout.trim();
  assert.match(output, /Symbol\(Symbol\.dispose\)/);
  assert.match(output, /Symbol\(Symbol\.asyncDispose\)/);
});
