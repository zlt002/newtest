import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  FORBIDDEN_PATHS,
  PRUNE_TARGETS as PRUNED_DEPENDENCY_PATHS,
  RELEASE_ROOT,
  RELEASE_RUNTIME_DEPENDENCIES,
  REQUIRED_PATHS,
} from './release-manifest.mjs';
import { collectPrunableFiles } from './windows-lite-optimization.mjs';

async function findBetterSqlite3BinaryCandidates(rootDir) {
  const betterSqlite3Root = resolve(rootDir, 'node_modules', 'better-sqlite3');
  const directCandidates = [
    resolve(betterSqlite3Root, 'build', 'Release', 'better_sqlite3.node'),
    resolve(betterSqlite3Root, 'build', 'Debug', 'better_sqlite3.node'),
    resolve(betterSqlite3Root, 'build', 'better_sqlite3.node'),
  ];

  const bindingRoot = resolve(betterSqlite3Root, 'lib', 'binding');
  if (!existsSync(bindingRoot)) {
    return directCandidates;
  }

  const bindingEntries = await readdir(bindingRoot, { withFileTypes: true });
  return [
    ...directCandidates,
    ...bindingEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) => resolve(bindingRoot, entry.name, 'better_sqlite3.node')),
  ];
}

async function hasBetterSqlite3Binary(rootDir) {
  const candidates = await findBetterSqlite3BinaryCandidates(rootDir);
  return candidates.some((candidatePath) => existsSync(candidatePath));
}

async function main() {
  const rootDir = resolve(process.cwd(), RELEASE_ROOT);

  for (const relativePath of REQUIRED_PATHS) {
    const absolutePath = resolve(rootDir, relativePath);
    if (!existsSync(absolutePath)) {
      console.error(`[error] Missing required path: ${relativePath}`);
      process.exit(1);
    }
  }

  for (const relativePath of FORBIDDEN_PATHS) {
    const absolutePath = resolve(rootDir, relativePath);
    if (existsSync(absolutePath)) {
      console.error(`[error] Forbidden path still exists: ${relativePath}`);
      process.exit(1);
    }
  }

  for (const relativePath of PRUNED_DEPENDENCY_PATHS) {
    const absolutePath = resolve(rootDir, relativePath);
    if (existsSync(absolutePath)) {
      console.error(`[error] Pruned dependency path still exists: ${relativePath}`);
      process.exit(1);
    }
  }

  const packageJsonPath = resolve(rootDir, 'package.json');
  const releasePackageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  const dependencyNames = Object.keys(releasePackageJson.dependencies ?? {}).sort();
  const expectedDependencyNames = [...RELEASE_RUNTIME_DEPENDENCIES].sort();

  if (JSON.stringify(dependencyNames) !== JSON.stringify(expectedDependencyNames)) {
    console.error('[error] release package.json dependencies do not match the whitelist');
    console.error('actual:', dependencyNames.join(', '));
    console.error('expected:', expectedDependencyNames.join(', '));
    process.exit(1);
  }

  for (const dependencyName of RELEASE_RUNTIME_DEPENDENCIES) {
    const dependencyPath = resolve(rootDir, 'node_modules', ...dependencyName.split('/'));
    if (!existsSync(dependencyPath)) {
      console.error(`[error] Missing runtime dependency directory: node_modules/${dependencyName}`);
      process.exit(1);
    }
  }

  if (!(await hasBetterSqlite3Binary(rootDir))) {
    console.error('[error] Missing better-sqlite3 native binary in the release package');
    process.exit(1);
  }

  const prunableFiles = await collectPrunableFiles(rootDir);
  if (prunableFiles.length > 0) {
    console.error('[error] release package still contains removable type or sourcemap files');
    console.error(prunableFiles.slice(0, 20).join('\n'));
    process.exit(1);
  }

  console.log('release verification passed');
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  await main();
}

export {
  FORBIDDEN_PATHS,
  PRUNED_DEPENDENCY_PATHS,
  RELEASE_ROOT,
  REQUIRED_PATHS,
  hasBetterSqlite3Binary,
};
