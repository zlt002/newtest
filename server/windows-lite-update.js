import fs from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import JSZip from 'jszip';
import fetch from 'node-fetch';

export const GITLAB_WINDOWS_LITE_ZIP_URL = 'https://git.midea.com/zhanglt21/claudecodeuibox/-/raw/main/cc-ui-windows-lite-x64.zip';
export const GITLAB_MAC_LITE_ZIP_URL = 'https://git.midea.com/zhanglt21/claudecodeuibox/-/raw/main/cc-ui-mac-lite-arm64.zip';
export const GITLAB_WINDOWS_LITE_PROJECT_URL = 'https://git.midea.com/zhanglt21/claudecodeuibox/-/tree/main';

export const LITE_COMMON_REQUIRED_PATHS = [
  'dist/index.html',
  'server/index.js',
  'package.json',
];
export const LITE_UPDATE_STATE_FILE = '.ccui-update.json';

export const LITE_UPDATE_DISTRIBUTIONS = {
  win32: {
    name: 'windows-lite',
    packageUrl: GITLAB_WINDOWS_LITE_ZIP_URL,
    projectUrl: GITLAB_WINDOWS_LITE_PROJECT_URL,
    packageIdFallback: 'cc-ui-windows-lite-x64.zip',
    requiredPaths: [
      ...LITE_COMMON_REQUIRED_PATHS,
      'start.vbs',
      'stop.vbs',
    ],
  },
  darwin: {
    name: 'mac-lite',
    packageUrl: GITLAB_MAC_LITE_ZIP_URL,
    projectUrl: GITLAB_WINDOWS_LITE_PROJECT_URL,
    packageIdFallback: 'cc-ui-mac-lite-arm64.zip',
    requiredPaths: [
      ...LITE_COMMON_REQUIRED_PATHS,
      'start.command',
      'stop.command',
    ],
  },
};

export const LITE_WINDOWS_REQUIRED_PATHS = LITE_UPDATE_DISTRIBUTIONS.win32.requiredPaths;
export const WINDOWS_LITE_REQUIRED_PATHS = LITE_WINDOWS_REQUIRED_PATHS;

const LITE_UPDATE_PACKAGE_URL_ENV = {
  win32: 'CC_UI_WINDOWS_LITE_ZIP_URL',
  darwin: 'CC_UI_MAC_LITE_ZIP_URL',
};

function normalizePackageId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function getLiteUpdateDistribution({ platform = process.platform } = {}) {
  const distribution = LITE_UPDATE_DISTRIBUTIONS[platform];
  if (!distribution) {
    throw new Error(`Lite online update is not supported on ${platform}.`);
  }

  const packageUrlEnvName = LITE_UPDATE_PACKAGE_URL_ENV[platform];
  return {
    ...distribution,
    packageUrl: normalizePackageId(process.env[packageUrlEnvName]) || distribution.packageUrl,
    projectUrl: normalizePackageId(process.env.CC_UI_LITE_PROJECT_URL) || distribution.projectUrl,
  };
}

function toZipPath(value) {
  return value.replaceAll('\\', '/').replace(/^\/+/, '');
}

function getCommonRootPrefix(entries) {
  const firstSegments = new Set();

  for (const entry of entries) {
    const [firstSegment, ...rest] = entry.split('/');
    if (!firstSegment || rest.length === 0) {
      return '';
    }
    firstSegments.add(firstSegment);
  }

  return firstSegments.size === 1 ? `${[...firstSegments][0]}/` : '';
}

function normalizeArchiveEntries(zip) {
  const rawEntries = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .map((entry) => toZipPath(entry.name));
  const commonRootPrefix = getCommonRootPrefix(rawEntries);

  return rawEntries.map((entry) => {
    if (commonRootPrefix && entry.startsWith(commonRootPrefix)) {
      return entry.slice(commonRootPrefix.length);
    }
    return entry;
  });
}

export async function validateLiteZip(zipBuffer, { platform = 'win32' } = {}) {
  const distribution = getLiteUpdateDistribution({ platform });
  const zip = await JSZip.loadAsync(zipBuffer);
  const entries = new Set(normalizeArchiveEntries(zip));
  const missingPaths = distribution.requiredPaths.filter((requiredPath) => !entries.has(requiredPath));

  return {
    valid: missingPaths.length === 0,
    missingPaths,
  };
}

export const validateWindowsLiteZip = validateLiteZip;

export async function extractLiteZip(zipBuffer, extractDir) {
  const zip = await JSZip.loadAsync(zipBuffer);
  const rawEntries = Object.values(zip.files).filter((entry) => !entry.dir);
  const commonRootPrefix = getCommonRootPrefix(rawEntries.map((entry) => toZipPath(entry.name)));

  await rm(extractDir, { recursive: true, force: true });
  await mkdir(extractDir, { recursive: true });

  for (const entry of rawEntries) {
    let relativePath = toZipPath(entry.name);
    if (commonRootPrefix && relativePath.startsWith(commonRootPrefix)) {
      relativePath = relativePath.slice(commonRootPrefix.length);
    }
    if (!relativePath || relativePath.includes('..')) {
      continue;
    }

    const targetPath = path.resolve(extractDir, relativePath);
    const normalizedExtractDir = path.resolve(extractDir);
    if (!targetPath.startsWith(`${normalizedExtractDir}${path.sep}`)) {
      continue;
    }

    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, await entry.async('nodebuffer'));
  }
}

export const extractWindowsLiteZip = extractLiteZip;

export async function readLiteUpdateState(appDir) {
  if (!appDir) {
    return null;
  }

  try {
    const content = await fs.promises.readFile(path.join(appDir, LITE_UPDATE_STATE_FILE), 'utf8');
    const parsed = JSON.parse(content);
    const packageId = normalizePackageId(parsed?.packageId);
    return packageId
      ? {
          ...parsed,
          packageId,
        }
      : null;
  } catch {
    return null;
  }
}

async function writeLiteUpdateState(targetDir, {
  updateInfo,
  platform,
} = {}) {
  const packageId = normalizePackageId(updateInfo?.packageId);
  if (!targetDir || !packageId) {
    return;
  }

  await writeFile(
    path.join(targetDir, LITE_UPDATE_STATE_FILE),
    `${JSON.stringify({
      packageId,
      packageUrl: updateInfo?.packageUrl || null,
      lastModified: updateInfo?.lastModified || null,
      platform,
      updatedAt: new Date().toISOString(),
    }, null, 2)}\n`,
    'utf8',
  );
}

export function buildWindowsLiteUpdaterScript({ appDir, extractDir, serverPid }) {
  return [
    '@echo off',
    'setlocal',
    'chcp 65001 >nul',
    'echo [INFO] Stopping current CC UI service...',
    `taskkill /PID ${serverPid} /F >nul 2>nul`,
    'timeout /t 2 /nobreak >nul',
    'echo [INFO] Copying Windows Lite update files...',
    `robocopy "${extractDir}" "${appDir}" /E /NFL /NDL /NJH /NJS /NP >nul`,
    'set "ROBOCOPY_EXIT=%ERRORLEVEL%"',
    'if %ROBOCOPY_EXIT% GEQ 8 (',
    '  echo [ERROR] Failed to copy update files. Robocopy exit code: %ROBOCOPY_EXIT%',
    '  pause',
    '  exit /b %ROBOCOPY_EXIT%',
    ')',
    'echo [INFO] Restarting CC UI...',
    `start "" "${appDir}\\start.vbs"`,
    'endlocal',
    'exit /b 0',
    '',
  ].join('\r\n');
}

function shellSingleQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

export function buildMacLiteUpdaterScript({ appDir, extractDir, serverPid }) {
  const quotedAppDir = shellSingleQuote(appDir);
  const quotedExtractDir = shellSingleQuote(`${extractDir}/`);
  const quotedStartCommand = shellSingleQuote(path.posix.join(appDir, 'start.command'));
  const quotedStopCommand = shellSingleQuote(path.posix.join(appDir, 'stop.command'));

  return [
    '#!/bin/bash',
    'set -euo pipefail',
    'echo "[INFO] Stopping current CC UI service..."',
    `kill ${serverPid} >/dev/null 2>&1 || true`,
    'sleep 2',
    'echo "[INFO] Copying Lite update files..."',
    `rsync -a --delete ${quotedExtractDir} ${quotedAppDir}/`,
    `chmod +x ${quotedStartCommand} ${quotedStopCommand}`,
    'echo "[INFO] Restarting CC UI..."',
    `nohup /bin/bash ${quotedStartCommand} >/dev/null 2>&1 &`,
    '',
  ].join('\n');
}

export async function fetchLiteUpdateInfo(fetchImpl = fetch, { platform = process.platform } = {}) {
  const distribution = getLiteUpdateDistribution({ platform });
  let response = await fetchImpl(distribution.packageUrl, { method: 'HEAD' });
  if (response.status === 405) {
    response = await fetchImpl(distribution.packageUrl, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
    });
  }
  if (!response.ok) {
    if ([401, 403, 404].includes(response.status)) {
      return {
        updateAvailable: false,
        packageUrl: distribution.packageUrl,
        projectUrl: distribution.projectUrl,
        packageId: null,
        lastModified: null,
      };
    }

    throw new Error(`Lite update package is not reachable: ${response.status}`);
  }

  return {
    updateAvailable: true,
    packageUrl: distribution.packageUrl,
    projectUrl: distribution.projectUrl,
    packageId: response.headers.get('etag') || response.headers.get('last-modified') || distribution.packageIdFallback,
    lastModified: response.headers.get('last-modified'),
  };
}

export const fetchWindowsLiteUpdateInfo = fetchLiteUpdateInfo;

export async function getLiteUpdateStatus({
  appDir,
  fetchImpl = fetch,
  platform = process.platform,
} = {}) {
  const updateInfo = await fetchLiteUpdateInfo(fetchImpl, { platform });
  const installedState = await readLiteUpdateState(appDir);
  const currentPackageId = normalizePackageId(installedState?.packageId);
  const remotePackageId = normalizePackageId(updateInfo.packageId);

  return {
    ...updateInfo,
    currentPackageId,
    updateAvailable: Boolean(updateInfo.updateAvailable && (!currentPackageId || currentPackageId !== remotePackageId)),
  };
}

export const getWindowsLiteUpdateStatus = getLiteUpdateStatus;

export async function prepareLiteUpdate({
  appDir,
  fetchImpl = fetch,
  platform = process.platform,
  serverPid = process.pid,
} = {}) {
  const distribution = getLiteUpdateDistribution({ platform });
  const updateInfo = await fetchLiteUpdateInfo(fetchImpl, { platform });

  if (!updateInfo.updateAvailable) {
    throw new Error('No Lite update package is available.');
  }

  const installedState = await readLiteUpdateState(appDir);
  const currentPackageId = normalizePackageId(installedState?.packageId);
  const remotePackageId = normalizePackageId(updateInfo.packageId);
  if (currentPackageId && remotePackageId && currentPackageId === remotePackageId) {
    throw new Error('The latest Lite update package is already installed.');
  }

  const response = await fetchImpl(distribution.packageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download Lite update package: ${response.status}`);
  }

  const zipBuffer = typeof response.buffer === 'function'
    ? await response.buffer()
    : Buffer.from(await response.arrayBuffer());
  const validation = await validateLiteZip(zipBuffer, { platform });
  if (!validation.valid) {
    throw new Error(`Invalid Lite update package. Missing: ${validation.missingPaths.join(', ')}`);
  }

  const updateRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cc-ui-windows-lite-update-'));
  const extractDir = path.join(updateRoot, 'package');
  const updaterScriptPath = path.join(updateRoot, platform === 'win32' ? 'apply-update.cmd' : 'apply-update.sh');

  await extractLiteZip(zipBuffer, extractDir);
  await writeLiteUpdateState(extractDir, { updateInfo, platform });
  await writeFile(
    updaterScriptPath,
    platform === 'win32'
      ? buildWindowsLiteUpdaterScript({ appDir, extractDir, serverPid })
      : buildMacLiteUpdaterScript({ appDir, extractDir, serverPid }),
    'utf8',
  );

  return {
    updateRoot,
    extractDir,
    updaterScriptPath,
  };
}

export const prepareWindowsLiteUpdate = prepareLiteUpdate;

export function launchLiteUpdater(updaterScriptPath) {
  const isWindowsScript = updaterScriptPath.toLowerCase().endsWith('.cmd');
  const child = spawn(isWindowsScript ? 'cmd.exe' : '/bin/bash', isWindowsScript ? ['/c', updaterScriptPath] : [updaterScriptPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

export const launchWindowsLiteUpdater = launchLiteUpdater;
