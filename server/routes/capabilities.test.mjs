import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';

import { createCapabilitiesRouter } from './capabilities.js';

async function withCapabilitiesTestServer({ homeDir, routerOptions } = {}, fn) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.testHomeDir = homeDir;
    next();
  });
  app.use('/api/capabilities', createCapabilitiesRouter(routerOptions));
  const server = app.listen(0, '127.0.0.1');

  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('POST command -> GET list -> PATCH -> DELETE full flow', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'ccui-cap-route-home-'));

  try {
    await withCapabilitiesTestServer({ homeDir }, async (baseUrl) => {
      const createResponse = await fetch(`${baseUrl}/api/capabilities`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'command',
          scope: 'user',
          name: 'Daily Deploy',
          content: '# Daily Deploy\nCreate release\n',
        }),
      });
      const createBody = await createResponse.json();

      assert.equal(createResponse.status, 200);
      assert.equal(createBody.success, true);
      assert.equal(createBody.capability.name, 'Daily-Deploy');

      const listResponse = await fetch(`${baseUrl}/api/capabilities?type=command`);
      const listBody = await listResponse.json();

      assert.equal(listResponse.status, 200);
      assert.deepEqual(listBody.capabilities.map((capability) => capability.name), ['Daily-Deploy']);
      assert.equal(listBody.capabilities[0].description, 'Create release');

      const detailResponse = await fetch(`${baseUrl}/api/capabilities/${encodeURIComponent(listBody.capabilities[0].id)}`);
      const detailBody = await detailResponse.json();

      assert.equal(detailResponse.status, 200);
      assert.equal(detailBody.success, true);
      assert.equal(detailBody.capability.name, 'Daily-Deploy');
      assert.equal(detailBody.content, '# Daily Deploy\nCreate release\n');

      const updateResponse = await fetch(`${baseUrl}/api/capabilities/${encodeURIComponent(createBody.capability.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: '# Daily Deploy\nShip release\n' }),
      });
      const updateBody = await updateResponse.json();

      assert.equal(updateResponse.status, 200);
      assert.equal(updateBody.capability.description, 'Ship release');
      assert.equal(
        await readFile(path.join(homeDir, '.claude', 'commands', 'Daily-Deploy.md'), 'utf8'),
        '# Daily Deploy\nShip release\n',
      );

      const deleteResponse = await fetch(`${baseUrl}/api/capabilities/${encodeURIComponent(createBody.capability.id)}`, {
        method: 'DELETE',
      });
      const deleteBody = await deleteResponse.json();

      assert.equal(deleteResponse.status, 200);
      assert.deepEqual(deleteBody, {
        success: true,
        result: { deleted: true },
      });

      const emptyListResponse = await fetch(`${baseUrl}/api/capabilities?type=command`);
      const emptyListBody = await emptyListResponse.json();
      assert.deepEqual(emptyListBody.capabilities, []);
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('GET command list includes enabled plugin commands as readonly capabilities', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'ccui-cap-plugin-home-'));
  const pluginDir = path.join(homeDir, 'plugin-root');

  try {
    await mkdir(path.join(pluginDir, 'commands'), { recursive: true });
    await writeFile(path.join(pluginDir, 'commands', 'search.md'), '# Search\nSearch the repository\n', 'utf8');

    await withCapabilitiesTestServer({
      homeDir,
      routerOptions: {
        listPlugins: async () => [
          {
            id: 'repo-tools@example',
            path: pluginDir,
            enabled: true,
          },
        ],
      },
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/capabilities?type=command`);
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.success, true);
      assert.deepEqual(body.capabilities.map((capability) => capability.name), ['search']);
      assert.equal(body.capabilities[0].description, 'Search the repository');
      assert.equal(body.capabilities[0].source.kind, 'plugin');
      assert.equal(body.capabilities[0].editable, false);

      const detailResponse = await fetch(`${baseUrl}/api/capabilities/${encodeURIComponent(body.capabilities[0].id)}`);
      const detailBody = await detailResponse.json();

      assert.equal(detailResponse.status, 200);
      assert.equal(detailBody.success, true);
      assert.equal(detailBody.content, '# Search\nSearch the repository\n');
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});
