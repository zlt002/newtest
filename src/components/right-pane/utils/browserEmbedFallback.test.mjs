import test from 'node:test';
import assert from 'node:assert/strict';
import { getBrowserEmbedFallbackReason, isKnownRestrictedEmbedHost } from './browserEmbedFallback.ts';

test('isKnownRestrictedEmbedHost matches qq hostnames and subdomains', () => {
  assert.equal(isKnownRestrictedEmbedHost('qq.com'), true);
  assert.equal(isKnownRestrictedEmbedHost('www.qq.com'), true);
  assert.equal(isKnownRestrictedEmbedHost('im.qq.com'), true);
});

test('isKnownRestrictedEmbedHost ignores unrelated hostnames', () => {
  assert.equal(isKnownRestrictedEmbedHost('example.com'), false);
  assert.equal(isKnownRestrictedEmbedHost('localhost'), false);
});

test('getBrowserEmbedFallbackReason leaves ordinary localhost pages embeddable', () => {
  assert.equal(
    getBrowserEmbedFallbackReason('http://localhost:5173/demo', 'address-bar'),
    null,
  );
});

test('getBrowserEmbedFallbackReason flags known restricted external hosts', () => {
  assert.equal(getBrowserEmbedFallbackReason('https://qq.com', 'address-bar'), 'known-restricted-host');
  assert.equal(getBrowserEmbedFallbackReason('https://www.qq.com', 'external-link'), 'known-restricted-host');
});
