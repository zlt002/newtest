import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSourceLocationMap,
  findSourceLocationByIdentity,
} from './sourceLocationMapping.ts';

test('buildSourceLocationMap builds line and column data for nested elements', () => {
  const html = `<!doctype html>
<html>
  <body>
    <section data-ccui-component-id="section-hero">
      <button
        data-ccui-fingerprint="button:cta"
        data-ccui-dom-path="html > body > section[0] > button[0]"
      >Run</button>
    </section>
  </body>
</html>`;

  const mapping = buildSourceLocationMap(html, 7);
  const button = mapping.entries.find((entry) => entry.tagName === 'button');

  assert.equal(mapping.status, 'ready');
  assert.equal(mapping.revision, 7);
  assert.equal(button?.startLine, 5);
  assert.equal(button?.startColumn, 7);
  assert.equal(button?.endLine, 8);
  assert.ok((button?.endColumn ?? 0) > (button?.startColumn ?? 0));
});

test('findSourceLocationByIdentity falls back from componentId to fingerprint and domPath', () => {
  const html = `<!doctype html>
<html>
  <body>
    <div data-ccui-component-id="cmp-a" data-ccui-fingerprint="fp-a" data-ccui-dom-path="html > body > div[0]"></div>
    <div data-ccui-component-id="cmp-b" data-ccui-fingerprint="fp-b" data-ccui-dom-path="html > body > div[1]"></div>
  </body>
</html>`;

  const mapping = buildSourceLocationMap(html);

  const byComponentId = findSourceLocationByIdentity(mapping, {
    componentId: 'cmp-b',
    fingerprint: 'fp-a',
    domPath: 'html > body > div[0]',
  });

  const byFingerprint = findSourceLocationByIdentity(mapping, {
    componentId: 'missing',
    fingerprint: 'fp-b',
    domPath: '',
  });

  const byDomPath = findSourceLocationByIdentity(mapping, {
    componentId: '',
    fingerprint: '',
    domPath: 'html > body > div[1]',
  });

  assert.equal(byComponentId?.componentId, 'cmp-b');
  assert.equal(byFingerprint?.componentId, 'cmp-b');
  assert.equal(byDomPath?.componentId, 'cmp-b');
});

test('findSourceLocationByIdentity returns null when duplicate fingerprint remains ambiguous', () => {
  const html = `<!doctype html>
<html>
  <body>
    <div data-ccui-fingerprint="dup"></div>
    <div data-ccui-fingerprint="dup"></div>
  </body>
</html>`;

  const mapping = buildSourceLocationMap(html);

  const resolvedByDomPath = findSourceLocationByIdentity(mapping, {
    componentId: '',
    fingerprint: 'dup',
    domPath: 'html > body > div[1]',
  });

  const ambiguousWithoutDomPath = findSourceLocationByIdentity(mapping, {
    componentId: '',
    fingerprint: 'dup',
    domPath: '',
  });

  assert.equal(resolvedByDomPath?.domPath, 'html > body > div[1]');
  assert.equal(ambiguousWithoutDomPath, null);
});

test('findSourceLocationByIdentity falls back to loose fingerprint when runtime id is not present in source', () => {
  const html = `<!doctype html>
<html>
  <body>
    <div class="login-header">
      <h1>Welcome back</h1>
    </div>
  </body>
</html>`;

  const mapping = buildSourceLocationMap(html);

  const resolved = findSourceLocationByIdentity(mapping, {
    componentId: 'i4mn',
    fingerprint: 'div|id=i4mn|class=login-header',
    domPath: 'html > body > div[0] > div',
  });

  assert.equal(resolved?.tagName, 'div');
  assert.equal(resolved?.attributes.class, 'login-header');
  assert.equal(resolved?.startLine, 4);
});

test('findSourceLocationByIdentity prefers domPath suffix when loose fingerprints have multiple matches', () => {
  const html = `<!doctype html>
<html>
  <body>
    <div class="shell">
      <form>
        <div class="form-group">Email</div>
        <div class="form-group">Password</div>
      </form>
    </div>
  </body>
</html>`;

  const mapping = buildSourceLocationMap(html);

  const resolved = findSourceLocationByIdentity(mapping, {
    componentId: 'igmy9',
    fingerprint: 'div|id=igmy9|class=form-group',
    domPath: 'html > body > div[0] > div > form > div[0]',
  });

  assert.equal(resolved?.tagName, 'div');
  assert.equal(resolved?.startLine, 6);
  assert.equal(resolved?.startColumn, 9);
});

test('buildSourceLocationMap keeps usable entries when parse5 can recover from malformed html', () => {
  const mapping = buildSourceLocationMap('<div><span></div>', 11);

  assert.equal(mapping.status, 'ready');
  assert.equal(mapping.revision, 11);
  assert.ok((mapping.parseErrors?.length ?? 0) > 0);
  assert.ok(mapping.entries.some((entry) => entry.tagName === 'span'));
});

test('buildSourceLocationMap returns unavailable for empty html', () => {
  const mapping = buildSourceLocationMap('   ');

  assert.equal(mapping.status, 'unavailable');
  assert.match(mapping.reason, /invalid|unavailable|empty/i);
  assert.equal(mapping.entries.length, 0);
});
