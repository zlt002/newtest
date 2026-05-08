import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolveLiteAppDirFromRouteModuleUrl } from './system.js';

test('resolveLiteAppDirFromRouteModuleUrl resolves the Lite root instead of the server directory', () => {
  const appDir = path.join(os.tmpdir(), 'cc-ui', 'mac-lite');
  const routeModuleUrl = pathToFileURL(path.join(appDir, 'server', 'routes', 'system.js')).href;

  assert.equal(
    path.normalize(resolveLiteAppDirFromRouteModuleUrl(routeModuleUrl)),
    path.normalize(appDir),
  );
});
