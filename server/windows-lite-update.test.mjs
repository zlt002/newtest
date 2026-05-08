import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';

import {
  GITLAB_MAC_LITE_ZIP_URL,
  GITLAB_WINDOWS_LITE_ZIP_URL,
  LITE_UPDATE_STATE_FILE,
  buildMacLiteUpdaterScript,
  buildWindowsLiteUpdaterScript,
  fetchWindowsLiteUpdateInfo,
  getWindowsLiteUpdateStatus,
  getLiteUpdateDistribution,
  prepareWindowsLiteUpdate,
  validateWindowsLiteZip,
} from './windows-lite-update.js';

function createResponse({ ok = true, status = 200, headers = {}, buffer = null } = {}) {
  const normalizedHeaders = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    ok,
    status,
    headers: {
      get(name) {
        return normalizedHeaders.get(String(name).toLowerCase()) || null;
      },
    },
    async buffer() {
      return buffer;
    },
  };
}

async function createMacLiteZipBuffer() {
  const zip = new JSZip();
  zip.file('dist/index.html', '<!doctype html>');
  zip.file('server/index.js', 'console.log("server");');
  zip.file('package.json', '{"type":"module"}');
  zip.file('start.command', '#!/bin/bash\n');
  zip.file('stop.command', '#!/bin/bash\n');
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('uses the GitLab raw Windows Lite zip as the only update source', () => {
  assert.equal(
    GITLAB_WINDOWS_LITE_ZIP_URL,
    'https://git.midea.com/zhanglt21/claudecodeuibox/-/raw/main/cc-ui-windows-lite-x64.zip',
  );
  assert.equal(
    GITLAB_MAC_LITE_ZIP_URL,
    'https://git.midea.com/zhanglt21/claudecodeuibox/-/raw/main/cc-ui-mac-lite-arm64.zip',
  );
});

test('validateWindowsLiteZip accepts a complete Windows Lite archive', async () => {
  const zip = new JSZip();
  zip.file('dist/index.html', '<!doctype html>');
  zip.file('server/index.js', 'console.log("server");');
  zip.file('package.json', '{"type":"module"}');
  zip.file('start.vbs', 'CreateObject("WScript.Shell")');
  zip.file('stop.vbs', 'CreateObject("WScript.Shell")');

  const result = await validateWindowsLiteZip(await zip.generateAsync({ type: 'nodebuffer' }));

  assert.deepEqual(result, { valid: true, missingPaths: [] });
});

test('validateWindowsLiteZip reports missing required Windows Lite paths', async () => {
  const zip = new JSZip();
  zip.file('dist/index.html', '<!doctype html>');
  zip.file('server/index.js', 'console.log("server");');

  const result = await validateWindowsLiteZip(await zip.generateAsync({ type: 'nodebuffer' }));

  assert.deepEqual(result, {
    valid: false,
    missingPaths: ['package.json', 'start.vbs', 'stop.vbs'],
  });
});

test('validateWindowsLiteZip accepts a complete Mac Lite archive', async () => {
  const zip = new JSZip();
  zip.file('dist/index.html', '<!doctype html>');
  zip.file('server/index.js', 'console.log("server");');
  zip.file('package.json', '{"type":"module"}');
  zip.file('start.command', '#!/bin/bash\n');
  zip.file('stop.command', '#!/bin/bash\n');

  const result = await validateWindowsLiteZip(await zip.generateAsync({ type: 'nodebuffer' }), {
    platform: 'darwin',
  });

  assert.deepEqual(result, { valid: true, missingPaths: [] });
});

test('buildWindowsLiteUpdaterScript stops the current server, replaces files, and restarts start.vbs', () => {
  const script = buildWindowsLiteUpdaterScript({
    appDir: 'C:\\cc-ui',
    extractDir: 'C:\\Temp\\cc-ui-update',
    serverPid: 1234,
  });

  assert.match(script, /taskkill \/PID 1234 \/F/);
  assert.doesNotMatch(script, /taskkill \/PID 1234 \/T \/F/);
  assert.match(script, /robocopy "C:\\Temp\\cc-ui-update" "C:\\cc-ui"/);
  assert.match(script, /start "" "C:\\cc-ui\\start.vbs"/);
});

test('buildMacLiteUpdaterScript stops the current server, replaces files, restores command permissions, and restarts start.command', () => {
  const script = buildMacLiteUpdaterScript({
    appDir: '/Applications/cc-ui/mac-lite',
    extractDir: '/tmp/cc-ui-update/package',
    serverPid: 1234,
  });

  assert.match(script, /kill 1234/);
  assert.match(script, /rsync -a --delete '\/tmp\/cc-ui-update\/package\/' '\/Applications\/cc-ui\/mac-lite'\//);
  assert.match(script, /chmod \+x '\/Applications\/cc-ui\/mac-lite\/start.command' '\/Applications\/cc-ui\/mac-lite\/stop.command'/);
  assert.match(script, /nohup \/bin\/bash '\/Applications\/cc-ui\/mac-lite\/start.command' >\/dev\/null 2>&1 &/);
});

test('getLiteUpdateDistribution selects Mac Lite metadata on darwin', () => {
  const distribution = getLiteUpdateDistribution({ platform: 'darwin' });

  assert.equal(distribution.name, 'mac-lite');
  assert.equal(distribution.packageUrl, GITLAB_MAC_LITE_ZIP_URL);
  assert.deepEqual(distribution.requiredPaths, [
    'dist/index.html',
    'server/index.js',
    'package.json',
    'start.command',
    'stop.command',
  ]);
});

test('getLiteUpdateDistribution allows environment overrides for local update testing', () => {
  const previousWindowsUrl = process.env.CC_UI_WINDOWS_LITE_ZIP_URL;
  const previousProjectUrl = process.env.CC_UI_LITE_PROJECT_URL;
  process.env.CC_UI_WINDOWS_LITE_ZIP_URL = 'http://127.0.0.1:3001/updates/local-test.zip';
  process.env.CC_UI_LITE_PROJECT_URL = 'http://127.0.0.1:3001/updates/';

  try {
    const distribution = getLiteUpdateDistribution({ platform: 'win32' });

    assert.equal(distribution.packageUrl, 'http://127.0.0.1:3001/updates/local-test.zip');
    assert.equal(distribution.projectUrl, 'http://127.0.0.1:3001/updates/');
  } finally {
    if (previousWindowsUrl === undefined) {
      delete process.env.CC_UI_WINDOWS_LITE_ZIP_URL;
    } else {
      process.env.CC_UI_WINDOWS_LITE_ZIP_URL = previousWindowsUrl;
    }
    if (previousProjectUrl === undefined) {
      delete process.env.CC_UI_LITE_PROJECT_URL;
    } else {
      process.env.CC_UI_LITE_PROJECT_URL = previousProjectUrl;
    }
  }
});

test('fetchWindowsLiteUpdateInfo reports no update when the package URL is not reachable', async () => {
  const requestedUrls = [];
  const result = await fetchWindowsLiteUpdateInfo(async (url) => {
    requestedUrls.push(url);
    return {
    ok: false,
    status: 404,
    headers: new Map(),
    };
  }, { platform: 'darwin' });

  assert.deepEqual(result, {
    updateAvailable: false,
    packageUrl: GITLAB_MAC_LITE_ZIP_URL,
    projectUrl: 'https://git.midea.com/zhanglt21/claudecodeuibox/-/tree/main',
    packageId: null,
    lastModified: null,
  });
  assert.deepEqual(requestedUrls, [GITLAB_MAC_LITE_ZIP_URL]);
});

test('getWindowsLiteUpdateStatus suppresses updates when the current package id matches the remote package id', async () => {
  const appDir = await mkdtemp(path.join(os.tmpdir(), 'cc-ui-lite-update-status-'));
  await writeFile(
    path.join(appDir, LITE_UPDATE_STATE_FILE),
    JSON.stringify({ packageId: 'W/"etag-1"' }),
    'utf8',
  );

  const result = await getWindowsLiteUpdateStatus({
    appDir,
    platform: 'darwin',
    fetchImpl: async () => createResponse({
      headers: {
        etag: 'W/"etag-1"',
        'last-modified': 'Fri, 08 May 2026 00:00:00 GMT',
      },
    }),
  });

  assert.equal(result.updateAvailable, false);
  assert.equal(result.currentPackageId, 'W/"etag-1"');
  assert.equal(result.packageId, 'W/"etag-1"');
});

test('prepareWindowsLiteUpdate writes the downloaded package id into the extracted package', async () => {
  const appDir = await mkdtemp(path.join(os.tmpdir(), 'cc-ui-lite-update-prepare-'));
  const zipBuffer = await createMacLiteZipBuffer();
  const requestedMethods = [];

  const result = await prepareWindowsLiteUpdate({
    appDir,
    platform: 'darwin',
    serverPid: 1234,
    fetchImpl: async (_url, options = {}) => {
      requestedMethods.push(options.method || 'GET');
      if (options.method === 'HEAD') {
        return createResponse({
          headers: {
            etag: 'W/"etag-2"',
            'last-modified': 'Fri, 08 May 2026 01:00:00 GMT',
          },
        });
      }

      return createResponse({ buffer: zipBuffer });
    },
  });

  const state = JSON.parse(await readFile(path.join(result.extractDir, LITE_UPDATE_STATE_FILE), 'utf8'));
  assert.deepEqual(requestedMethods, ['HEAD', 'GET']);
  assert.equal(state.packageId, 'W/"etag-2"');
  assert.equal(state.packageUrl, GITLAB_MAC_LITE_ZIP_URL);
  assert.equal(state.platform, 'darwin');
});
