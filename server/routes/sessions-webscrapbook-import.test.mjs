import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('sessions route exposes a WebScrapBook import endpoint scoped to the session project', async () => {
  const source = await readFile(new URL('./sessions.js', import.meta.url), 'utf8');

  assert.match(source, /WEBSCRAPBOOK_IMPORT_DIR = 'webscrapbook'/);
  assert.match(source, /router\.post\('\/sessions\/:sessionId\/webscrapbook\/import'/);
  assert.match(source, /findSessionLocation\(req\.params\.sessionId\)/);
  assert.match(source, /extractProjectDirectory\(lookup\.projectName\)/);
  assert.match(source, /sanitizeImportedHtmlFilename/);
  assert.match(source, /resolveUniqueImportedHtmlPath/);
  assert.doesNotMatch(source, /JSZip/);
  assert.doesNotMatch(source, /archiveBase64/);
  assert.match(source, /content is required/);
  assert.match(source, /fsPromises\.writeFile\(target\.absolutePath, content, 'utf8'\)/);
});
