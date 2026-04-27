import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = '@anthropic-ai/claude-agent-sdk';
const EXPECTED_VERSION = '0.2.116';

function readJsonFile(filePath) {
  return readFile(filePath, 'utf8').then((content) => JSON.parse(content));
}

export async function loadClaudeAgentSdkVersionState(rootDir = process.cwd()) {
  const packageJsonPath = path.resolve(rootDir, 'package.json');
  const packageLockPath = path.resolve(rootDir, 'package-lock.json');
  const installedPackageJsonPath = path.resolve(
    rootDir,
    'node_modules',
    PACKAGE_NAME,
    'package.json'
  );

  const [packageJson, packageLock, installedPackageJson] = await Promise.all([
    readJsonFile(packageJsonPath),
    readJsonFile(packageLockPath),
    readJsonFile(installedPackageJsonPath).catch(() => null),
  ]);

  const packageJsonSpec = packageJson.dependencies?.[PACKAGE_NAME] ?? null;
  const packageLockSpec = packageLock.packages?.['']?.dependencies?.[PACKAGE_NAME] ?? null;
  const lockfileVersion = packageLock.packages?.[`node_modules/${PACKAGE_NAME}`]?.version ?? null;
  const lockfileResolved = packageLock.packages?.[`node_modules/${PACKAGE_NAME}`]?.resolved ?? null;
  const installedVersion = installedPackageJson?.version ?? null;

  return {
    packageJsonSpec,
    packageLockSpec,
    lockfileVersion,
    lockfileResolved,
    installedVersion,
  };
}

export function assertClaudeAgentSdkVersionState(state, expectedVersion = EXPECTED_VERSION) {
  const problems = [];

  if (state.packageJsonSpec !== expectedVersion) {
    problems.push(
      `package.json dependency must be exactly ${expectedVersion}, found ${JSON.stringify(state.packageJsonSpec)}`
    );
  }

  if (state.packageLockSpec !== expectedVersion) {
    problems.push(
      `package-lock.json root dependency must be exactly ${expectedVersion}, found ${JSON.stringify(state.packageLockSpec)}`
    );
  }

  if (state.lockfileVersion !== expectedVersion) {
    problems.push(
      `package-lock.json installed package version must be exactly ${expectedVersion}, found ${JSON.stringify(state.lockfileVersion)}`
    );
  }

  if (
    state.lockfileResolved !==
    `https://registry.npmjs.org/${PACKAGE_NAME}/-/${PACKAGE_NAME.split('/').at(-1)}-${expectedVersion}.tgz`
  ) {
    problems.push(
      `package-lock.json resolved tarball must target ${expectedVersion}, found ${JSON.stringify(state.lockfileResolved)}`
    );
  }

  if (state.installedVersion !== expectedVersion) {
    problems.push(
      `installed node_modules package must be exactly ${expectedVersion}, found ${JSON.stringify(state.installedVersion)}`
    );
  }

  if (problems.length > 0) {
    throw new Error(`Claude Agent SDK version guard failed:\n- ${problems.join('\n- ')}`);
  }
}

export async function checkClaudeAgentSdkVersion(rootDir = process.cwd(), expectedVersion = EXPECTED_VERSION) {
  const state = await loadClaudeAgentSdkVersionState(rootDir);
  assertClaudeAgentSdkVersionState(state, expectedVersion);
  return state;
}

async function main() {
  await checkClaudeAgentSdkVersion();
  console.log(`Claude Agent SDK is pinned to ${EXPECTED_VERSION}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
