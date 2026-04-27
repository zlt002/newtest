import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const RELEASE_ROOT = 'release/windows-lite';
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

async function main() {
  const releaseDir = resolve(process.cwd(), RELEASE_ROOT);

  await mkdir(releaseDir, { recursive: true });
  await runNpm(['install', '--omit=dev', '--no-audit', '--no-fund'], releaseDir);
  await runNpm(['prune', '--omit=dev', '--no-audit', '--no-fund'], releaseDir);
}

await main();

export { RELEASE_ROOT };
