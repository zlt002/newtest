import { existsSync } from 'node:fs';
import { cp, mkdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LITE_DISTRIBUTION, RELEASE_ROOT } from './release-manifest.mjs';

const WINDOWS_LITE_BETTER_SQLITE3_SOURCE = 'windows-lite/better-sqlite3';
const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function runNpm(args, cwd) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(NPM_COMMAND, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });

    child.on('error', rejectPromise);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`npm ${args.join(' ')} failed with code ${code ?? 'null'}${signal ? ` signal ${signal}` : ''}`));
    });
  });
}

async function overlayWindowsLiteBetterSqlite3({
  distribution = LITE_DISTRIBUTION,
  projectRoot = process.cwd(),
  releaseDir = resolve(projectRoot, RELEASE_ROOT),
} = {}) {
  if (distribution !== 'windows') {
    return false;
  }

  const sourceDir = resolve(projectRoot, WINDOWS_LITE_BETTER_SQLITE3_SOURCE);
  if (!existsSync(sourceDir)) {
    return false;
  }

  const targetDir = resolve(releaseDir, 'node_modules', 'better-sqlite3');
  await rm(targetDir, { recursive: true, force: true });
  await cp(sourceDir, targetDir, { recursive: true, force: true });
  return true;
}

async function main() {
  const projectRoot = process.cwd();
  const releaseDir = resolve(projectRoot, RELEASE_ROOT);

  await mkdir(releaseDir, { recursive: true });
  await runNpm(['install', '--omit=dev', '--no-audit', '--no-fund'], releaseDir);
  await runNpm(['prune', '--omit=dev', '--no-audit', '--no-fund'], releaseDir);
  await overlayWindowsLiteBetterSqlite3({ projectRoot, releaseDir });
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  await main();
}

export {
  LITE_DISTRIBUTION,
  RELEASE_ROOT,
  WINDOWS_LITE_BETTER_SQLITE3_SOURCE,
  overlayWindowsLiteBetterSqlite3,
};
