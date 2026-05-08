import { createWriteStream } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import JSZip from 'jszip';
import { LITE_DISTRIBUTION, RELEASE_ROOT } from './release-manifest.mjs';

const ARCHIVE_EXCLUDED_PATH_PATTERNS = [
  /\/dist\/updates\//,
];

function getDefaultArchiveName(target = 'universal', distribution = LITE_DISTRIBUTION) {
  if (distribution === 'mac') {
    return target === 'arm64'
      ? 'cc-ui-mac-lite-arm64.zip'
      : 'cc-ui-mac-lite.zip';
  }

  return target === 'x64'
    ? 'cc-ui-windows-lite-x64.zip'
    : 'cc-ui-windows-lite.zip';
}

async function addDirectoryToZip(zip, sourceDir, zipPrefix) {
  const entries = await readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = resolve(sourceDir, entry.name);
    const zipPath = `${zipPrefix}/${entry.name}`;
    const normalizedZipPath = zipPath.replaceAll('\\', '/');

    if (ARCHIVE_EXCLUDED_PATH_PATTERNS.some((pattern) => pattern.test(normalizedZipPath))) {
      continue;
    }

    if (entry.isDirectory()) {
      await addDirectoryToZip(zip, sourcePath, zipPath);
      continue;
    }

    try {
      const fileOptions = normalizedZipPath.endsWith('.command')
        ? { unixPermissions: 0o100755 }
        : {};
      zip.file(normalizedZipPath, await readFile(sourcePath), fileOptions);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        continue;
      }

      throw error;
    }
  }
}

async function createReleaseArchive({
  releaseDir = resolve(process.cwd(), RELEASE_ROOT),
  outputFile = resolve(process.cwd(), 'release', getDefaultArchiveName()),
}) {
  const zip = new JSZip();
  const rootName = basename(releaseDir);

  await addDirectoryToZip(zip, releaseDir, rootName);

  const zipStream = zip.generateNodeStream({
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    platform: 'UNIX',
    streamFiles: true,
  });

  await new Promise((resolvePromise, rejectPromise) => {
    const output = createWriteStream(outputFile);
    zipStream.pipe(output);
    output.on('close', resolvePromise);
    output.on('error', rejectPromise);
    zipStream.on('error', rejectPromise);
  });

  return outputFile;
}

function parseTargetArg(argv) {
  const targetArg = argv.find((arg) => arg.startsWith('--target='));
  return targetArg ? targetArg.slice('--target='.length) : 'universal';
}

async function main() {
  const target = parseTargetArg(process.argv.slice(2));
  const outputFile = resolve(process.cwd(), 'release', getDefaultArchiveName(target));
  await createReleaseArchive({ outputFile });
  console.log(`archive created: ${outputFile}`);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  await main();
}

export { createReleaseArchive, getDefaultArchiveName, parseTargetArg, RELEASE_ROOT };
