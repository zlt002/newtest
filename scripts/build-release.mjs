import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { RELEASE_ROOT, RELEASE_RUNTIME_DEPENDENCIES } from './release-manifest.mjs';
import { removeDirectoryWithRetry } from './release-fs.mjs';
import { WINDOWS_LITE_PUBLIC_ITEMS } from './windows-lite-optimization.mjs';

const WINDOWS_LITE_SOURCE_CANDIDATES = ['windows-lite', 'windows-lite2'];
const COPY_ITEMS = ['dist', 'server', 'shared', 'package.json', 'package-lock.json'];
const EXCLUDED_ROOT_NAMES = new Set(['src', 'docs', '.git', '.github', 'tests', 'test', '__tests__', 'coverage', 'tmp', 'logs']);

function resolveWindowsLiteSourceDir() {
  for (const candidate of WINDOWS_LITE_SOURCE_CANDIDATES) {
    const candidatePath = resolve(process.cwd(), candidate);
    if (
      existsSync(candidatePath) &&
      existsSync(resolve(candidatePath, 'start.cmd')) &&
      existsSync(resolve(candidatePath, 'start.vbs'))
    ) {
      return candidate;
    }
  }

  throw new Error(`Missing Windows Lite source directory. Expected one of: ${WINDOWS_LITE_SOURCE_CANDIDATES.join(', ')}`);
}

async function main() {
  const releaseDir = resolve(process.cwd(), RELEASE_ROOT);
  const rootPackageJsonPath = resolve(process.cwd(), 'package.json');
  const windowsLiteSourceDir = resolveWindowsLiteSourceDir();
  const sourceWindowsLiteDir = resolve(process.cwd(), windowsLiteSourceDir);

  await removeDirectoryWithRetry(releaseDir);
  await mkdir(releaseDir, { recursive: true });

  for (const item of COPY_ITEMS) {
    const sourcePath = resolve(process.cwd(), item);
    const targetPath = resolve(releaseDir, item);
    await cp(sourcePath, targetPath, { recursive: true, force: true });
  }

  const windowsLiteEntries = await readdir(sourceWindowsLiteDir);
  for (const entry of windowsLiteEntries) {
    await cp(
      resolve(sourceWindowsLiteDir, entry),
      resolve(releaseDir, entry),
      { recursive: true, force: true }
    );
  }

  const publicDir = resolve(releaseDir, 'public');
  await mkdir(publicDir, { recursive: true });
  for (const item of WINDOWS_LITE_PUBLIC_ITEMS) {
    await cp(resolve(process.cwd(), 'public', item), resolve(publicDir, item), { recursive: true, force: true });
  }

  await rm(resolve(releaseDir, 'dist', 'api-docs.html'), { force: true });
  await rm(resolve(releaseDir, 'public', 'convert-icons.md'), { force: true });
  await rm(resolve(releaseDir, 'public', 'api-docs.html'), { force: true });
  await rm(resolve(releaseDir, 'logs'), { recursive: true, force: true });
  await rm(resolve(releaseDir, '.DS_Store'), { force: true });

  const rootPackageJson = JSON.parse(await readFile(rootPackageJsonPath, 'utf8'));
  const releaseDependencies = Object.fromEntries(
    RELEASE_RUNTIME_DEPENDENCIES.map((dependencyName) => {
      const version = rootPackageJson.dependencies?.[dependencyName];
      if (!version) {
        throw new Error(`Missing runtime dependency version in root package.json: ${dependencyName}`);
      }
      return [dependencyName, version];
    })
  );
  const releasePackageJson = {
    name: '@cloudcli-ai/cloudcli-windows-lite',
    private: true,
    type: 'module',
    main: 'server/index.js',
    scripts: {
      server: 'node server/index.js'
    },
    dependencies: releaseDependencies
  };

  await writeFile(
    resolve(releaseDir, 'package.json'),
    `${JSON.stringify(releasePackageJson, null, 2)}\n`,
    'utf8'
  );
}

await main();

export {
  COPY_ITEMS,
  EXCLUDED_ROOT_NAMES,
  RELEASE_ROOT,
  RELEASE_RUNTIME_DEPENDENCIES,
  WINDOWS_LITE_SOURCE_CANDIDATES,
  resolveWindowsLiteSourceDir,
};
