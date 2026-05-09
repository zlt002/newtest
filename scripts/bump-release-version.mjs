import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function bumpPatchVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Unsupported release version: ${version}`);
  }

  const [, major, minor, patch] = match;
  return `${major}.${minor}.${Number(patch) + 1}`;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, data) {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export async function bumpReleaseVersion({ rootDir = process.cwd() } = {}) {
  const packageJsonPath = path.resolve(rootDir, 'package.json');
  const packageLockJsonPath = path.resolve(rootDir, 'package-lock.json');
  const packageJson = await readJson(packageJsonPath);
  const packageLockJson = await readJson(packageLockJsonPath);
  const nextVersion = bumpPatchVersion(packageJson.version);

  packageJson.version = nextVersion;
  packageLockJson.version = nextVersion;
  if (packageLockJson.packages?.['']) {
    packageLockJson.packages[''].version = nextVersion;
  }

  await writeJson(packageJsonPath, packageJson);
  await writeJson(packageLockJsonPath, packageLockJson);

  return nextVersion;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  const nextVersion = await bumpReleaseVersion();
  console.log(`Release version bumped to ${nextVersion}`);
}
