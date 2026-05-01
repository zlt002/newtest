import test from 'node:test';
import assert from 'node:assert/strict';
import { isHtmlEligibleForVisualEditing } from './htmlVisualEligibility.ts';

test('isHtmlEligibleForVisualEditing returns false for template-heavy html', () => {
  const content = `
    <!doctype html>
    <html>
      <body>
        <div>{{ user.name }}</div>
        {% if featureEnabled %}
          <section><%= legacy_partial %></section>
        {% endif %}
      </body>
    </html>
  `;

  assert.equal(isHtmlEligibleForVisualEditing(content), false);
});

test('isHtmlEligibleForVisualEditing returns true for simple complete html', () => {
  const content = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Demo</title>
      </head>
      <body>
        <main>
          <h1>Hello</h1>
          <p>Simple visual editing candidate.</p>
        </main>
      </body>
    </html>
  `;

  assert.equal(isHtmlEligibleForVisualEditing(content), true);
});

test('isHtmlEligibleForVisualEditing returns false for incomplete html fragments', () => {
  const content = `
    <body>
      <main>
        <h1>Fragment only</h1>
      </main>
    </body>
  `;

  assert.equal(isHtmlEligibleForVisualEditing(content), false);
});

test('isHtmlEligibleForVisualEditing returns true for pages with Tailwind CDN script', () => {
  const content = `
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <title>Tailwind CDN</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body>
        <main class="p-6 text-slate-900">Safe shell</main>
      </body>
    </html>
  `;

  assert.equal(isHtmlEligibleForVisualEditing(content), true);
});

test('isHtmlEligibleForVisualEditing returns false for pages with non-whitelisted external scripts', () => {
  const content = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>External Script</title>
        <script src="/assets/app.js"></script>
        <script async src="https://cdn.example.com/widget.js"></script>
      </head>
      <body>
        <main>Safe shell</main>
      </body>
    </html>
  `;

  assert.equal(isHtmlEligibleForVisualEditing(content), false);
});

test('isHtmlEligibleForVisualEditing returns true for pages with light inline scripts', () => {
  const content = `
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <title>Login</title>
      </head>
      <body>
        <form onsubmit="return handleLogin(event)">
          <input id="username" />
          <input id="password" type="password" />
        </form>
        <script>
          function handleLogin(event) {
            event.preventDefault();
            return false;
          }
        </script>
      </body>
    </html>
  `;

  assert.equal(isHtmlEligibleForVisualEditing(content), true);
});

test('isHtmlEligibleForVisualEditing returns true for pages with heavy inline scripts', () => {
  const content = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Inline Script</title>
      </head>
      <body>
        <script>
          const items = Array.from({ length: 80 }, (_, index) => index).join(',');
          window.bootstrap = () => {
            ${'console.log(items);'.repeat(80)}
          };
          document.addEventListener('click', () => {
            ${'console.log("clicked");'.repeat(80)}
          });
        </script>
      </body>
    </html>
  `;

  assert.equal(isHtmlEligibleForVisualEditing(content), true);
});
