import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('AppTab only allows the built-in tabs after plugin system removal', () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(path.join(currentDir, 'app.ts'), 'utf8');

  assert.equal(source.includes('`plugin:${string}`'), false);
  assert.match(source, /export type AppTab = 'chat' \| 'preview';/);
});

test('SessionProvider is narrowed to Claude only', () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(path.join(currentDir, 'app.ts'), 'utf8');

  assert.match(source, /export type SessionProvider = 'claude';/);
  assert.equal(source.includes("'cursor'"), false);
  assert.equal(source.includes("'codex'"), false);
  assert.equal(source.includes("'gemini'"), false);
});

test('SessionProviderLogo only depends on the Claude logo', () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(
    path.join(currentDir, '../components/llm-logo-provider/SessionProviderLogo.tsx'),
    'utf8',
  );

  assert.match(source, /import ClaudeLogo from '\.\/ClaudeLogo';/);
  assert.equal(source.includes('CodexLogo'), false);
  assert.equal(source.includes('CursorLogo'), false);
  assert.equal(source.includes('GeminiLogo'), false);
});

test('ClaudeLogo uses inline svg instead of a network img src', () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(
    path.join(currentDir, '../components/llm-logo-provider/ClaudeLogo.tsx'),
    'utf8',
  );

  assert.match(source, /<svg/);
  assert.equal(source.includes('<img'), false);
  assert.equal(source.includes('/icons/claude-ai-icon.svg'), false);
});

test('useVersionCheck shares one polling lifecycle per repo key', () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(
    path.join(currentDir, '../hooks/shared/useVersionCheck.ts'),
    'utf8',
  );

  assert.match(source, /const versionCheckIntervals = new Map/);
  assert.match(source, /if \(!versionCheckIntervals\.has\(key\)\)/);
});
