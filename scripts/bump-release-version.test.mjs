import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { bumpReleaseVersion } from './bump-release-version.mjs';

test('bumpReleaseVersion increments the root package and lockfile patch versions', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'cc-ui-release-version-'));
  await writeFile(
    path.join(rootDir, 'package.json'),
    JSON.stringify({ name: 'cc-ui', version: '1.28.0' }, null, 2) + '\n',
    'utf8',
  );
  await writeFile(
    path.join(rootDir, 'package-lock.json'),
    JSON.stringify({
      name: 'cc-ui',
      version: '1.28.0',
      lockfileVersion: 3,
      packages: {
        '': {
          name: 'cc-ui',
          version: '1.28.0',
        },
      },
    }, null, 2) + '\n',
    'utf8',
  );

  const nextVersion = await bumpReleaseVersion({ rootDir });

  const packageJson = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));
  const packageLockJson = JSON.parse(await readFile(path.join(rootDir, 'package-lock.json'), 'utf8'));

  assert.equal(nextVersion, '1.28.1');
  assert.equal(packageJson.version, '1.28.1');
  assert.equal(packageLockJson.version, '1.28.1');
  assert.equal(packageLockJson.packages[''].version, '1.28.1');
});
