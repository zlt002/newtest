import { existsSync } from 'node:fs';
import { chmod, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LITE_DISTRIBUTION, RELEASE_ROOT, RELEASE_RUNTIME_DEPENDENCIES } from './release-manifest.mjs';
import { removeDirectoryWithRetry } from './release-fs.mjs';
import { WINDOWS_LITE_PUBLIC_ITEMS } from './windows-lite-optimization.mjs';

const WINDOWS_LITE_SOURCE_CANDIDATES = ['windows-lite', 'windows-lite2'];
const MAC_LITE_SOURCE_CANDIDATES = ['mac-lite'];
const COPY_ITEMS = ['dist', 'server', 'shared', 'package.json', 'package-lock.json'];
const WINDOWS_LITE_SOURCE_EXCLUDED_ENTRIES = new Set(['better-sqlite3', 'start.cmd', 'stop.cmd']);
const EXCLUDED_ROOT_NAMES = new Set(['src', 'docs', '.git', '.github', 'tests', 'test', '__tests__', 'coverage', 'tmp', 'logs']);

function getLiteSourceCandidates() {
  return LITE_DISTRIBUTION === 'mac' ? MAC_LITE_SOURCE_CANDIDATES : WINDOWS_LITE_SOURCE_CANDIDATES;
}

function getRequiredLauncherFiles() {
  return LITE_DISTRIBUTION === 'mac' ? ['start.command', 'stop.command'] : ['start.vbs', 'stop.vbs'];
}

function resolveWindowsLiteSourceDir() {
  const candidates = getLiteSourceCandidates();
  const requiredLauncherFiles = getRequiredLauncherFiles();

  for (const candidate of candidates) {
    const candidatePath = resolve(process.cwd(), candidate);
    if (
      existsSync(candidatePath) &&
      requiredLauncherFiles.every((fileName) => existsSync(resolve(candidatePath, fileName)))
    ) {
      return candidate;
    }
  }

  throw new Error(`Missing ${LITE_DISTRIBUTION} Lite source directory. Expected one of: ${candidates.join(', ')}`);
}

async function main() {
  const releaseDir = resolve(process.cwd(), RELEASE_ROOT);
  const rootPackageJsonPath = resolve(process.cwd(), 'package.json');
  const liteSourceDir = resolveWindowsLiteSourceDir();
  const sourceLiteDir = resolve(process.cwd(), liteSourceDir);

  await removeDirectoryWithRetry(releaseDir);
  await mkdir(releaseDir, { recursive: true });

  for (const item of COPY_ITEMS) {
    const sourcePath = resolve(process.cwd(), item);
    const targetPath = resolve(releaseDir, item);
    await cp(sourcePath, targetPath, { recursive: true, force: true });
  }

  const liteEntries = await readdir(sourceLiteDir);
  for (const entry of liteEntries) {
    if (WINDOWS_LITE_SOURCE_EXCLUDED_ENTRIES.has(entry)) {
      continue;
    }

    await cp(
      resolve(sourceLiteDir, entry),
      resolve(releaseDir, entry),
      { recursive: true, force: true }
    );
  }

  if (LITE_DISTRIBUTION === 'mac') {
    for (const launcherFile of getRequiredLauncherFiles()) {
      await chmod(resolve(releaseDir, launcherFile), 0o755);
    }
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
    name: LITE_DISTRIBUTION === 'mac' ? 'cc-ui-mac-lite' : 'cc-ui-windows-lite',
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
  LITE_DISTRIBUTION,
  MAC_LITE_SOURCE_CANDIDATES,
  RELEASE_ROOT,
  RELEASE_RUNTIME_DEPENDENCIES,
  WINDOWS_LITE_SOURCE_EXCLUDED_ENTRIES,
  WINDOWS_LITE_SOURCE_CANDIDATES,
  resolveWindowsLiteSourceDir,
};
