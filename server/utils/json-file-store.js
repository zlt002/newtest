import fs from 'node:fs/promises';
import path from 'node:path';

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export async function readJsonObjectFile(filepath, {
  fileSystem = fs,
} = {}) {
  try {
    return normalizeObject(JSON.parse(await fileSystem.readFile(filepath, 'utf8')));
  } catch {
    return {};
  }
}

export async function updateJsonObjectFile(filepath, updater, {
  fileSystem = fs,
} = {}) {
  const current = await readJsonObjectFile(filepath, { fileSystem });
  const next = normalizeObject(await updater(current));
  await fileSystem.mkdir(path.dirname(filepath), { recursive: true });
  await fileSystem.writeFile(filepath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}
