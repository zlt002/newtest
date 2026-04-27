import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PRUNE_TARGETS, RELEASE_ROOT } from './release-manifest.mjs';
import { collectPrunableFiles } from './windows-lite-optimization.mjs';

async function main() {
  const releaseDir = resolve(process.cwd(), RELEASE_ROOT);

  for (const target of PRUNE_TARGETS) {
    await rm(resolve(releaseDir, target), { recursive: true, force: true });
  }

  const prunableFiles = await collectPrunableFiles(releaseDir);
  for (const filePath of prunableFiles) {
    await rm(filePath, { force: true });
  }
}

await main();

export { PRUNE_TARGETS, RELEASE_ROOT };
