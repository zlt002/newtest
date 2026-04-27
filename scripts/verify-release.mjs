import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  FORBIDDEN_PATHS,
  PRUNE_TARGETS as PRUNED_DEPENDENCY_PATHS,
  RELEASE_ROOT,
  RELEASE_RUNTIME_DEPENDENCIES,
  REQUIRED_PATHS,
} from './release-manifest.mjs';
import { collectPrunableFiles } from './windows-lite-optimization.mjs';

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

  const prunableFiles = await collectPrunableFiles(rootDir);
  if (prunableFiles.length > 0) {
    console.error('[error] release package still contains removable type or sourcemap files');
    console.error(prunableFiles.slice(0, 20).join('\n'));
    process.exit(1);
  }

  console.log('release verification passed');
}

await main();

export { FORBIDDEN_PATHS, PRUNED_DEPENDENCY_PATHS, RELEASE_ROOT, REQUIRED_PATHS };
