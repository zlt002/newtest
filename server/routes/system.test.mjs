import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolveLiteAppDirFromRouteModuleUrl } from './system.js';

test('resolveLiteAppDirFromRouteModuleUrl resolves the Lite root instead of the server directory', () => {
  const routeModuleUrl = pathToFileURL('/Applications/cc-ui/mac-lite/server/routes/system.js').href;

  assert.equal(
    path.normalize(resolveLiteAppDirFromRouteModuleUrl(routeModuleUrl)),
    path.normalize('/Applications/cc-ui/mac-lite'),
  );
});
