import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import autoprefixer from 'autoprefixer';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';

const projectRoot = process.cwd();
const sourcePath = path.join(projectRoot, 'src', 'index.css');

async function buildIndexCss() {
  const source = await fs.readFile(sourcePath, 'utf8');
  const result = await postcss([
    tailwindcss({ config: path.join(projectRoot, 'tailwind.config.js') }),
    autoprefixer(),
  ]).process(source, {
    from: sourcePath,
  });

  return result.css;
}

test('mobile utility selectors survive Tailwind expansion', async () => {
  const css = await buildIndexCss();

  assert.match(
    css,
    /\.mobile-touch-target\s*\{[\s\S]*?min-height:\s*44px[\s\S]*?min-width:\s*44px[\s\S]*?\}/,
  );
  assert.match(
    css,
    /\.chat-message\.user\s*\{[\s\S]*?justify-content:\s*flex-end[\s\S]*?\}/,
  );
  assert.match(
    css,
    /\.session-name-mobile\s*\{[\s\S]*?overflow:\s*hidden[\s\S]*?text-overflow:\s*ellipsis[\s\S]*?white-space:\s*nowrap[\s\S]*?\}/,
  );
});

test('scroll area scrollbar tokens and keyboard-only visibility selectors are emitted', async () => {
  const css = await buildIndexCss();

  assert.match(css, /--scrollbar-size:\s*6px;/);
  assert.match(css, /--scrollbar-radius:\s*9999px;/);
  assert.match(css, /--scrollbar-thumb-active:/);
  assert.match(
    css,
    /\[data-scroll-container="true"\][^{]*\{[\s\S]*?scrollbar-width:\s*thin[\s\S]*?\}/,
  );
  assert.match(css, /\[data-scroll-container="true"]:hover::-webkit-scrollbar-thumb/);
  assert.match(
    css,
    /html\[data-input-modality="keyboard"\]\s+\[data-scroll-container="true"]:focus-within::-webkit-scrollbar-thumb/,
  );
});

test('brand blue overrides are emitted for legacy purple accents and visual html theme tokens', async () => {
  const css = await buildIndexCss();

  assert.match(css, /\.bg-purple-600,\s*\.bg-violet-600,\s*\.bg-indigo-600/);
  assert.match(css, /--gjs-tertiary-color:\s*#2563eb;/);
  assert.match(css, /--gjs-quaternary-color:\s*#60a5fa;/);
  assert.match(css, /--gjs-color-blue:\s*#2563eb;/);
});

test('vite build does not emit CSS syntax warnings', async () => {
  const output = await new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'build'], {
      cwd: projectRoot,
      shell: true,
      env: process.env,
    });

    let combined = '';

    child.stdout.on('data', (chunk) => {
      combined += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      combined += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`vite build exited with code ${code}\n${combined}`));
        return;
      }
      resolve(combined);
    });
  });

  assert.doesNotMatch(String(output), /\[css-syntax-error\]/);
});
