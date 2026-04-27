import test from 'node:test';
import assert from 'node:assert/strict';

import { extractClaudeSdkErrorDetails } from './claude-sdk-error.js';

test('extractClaudeSdkErrorDetails includes stderr, stdout, and cause when present', () => {
  const details = extractClaudeSdkErrorDetails({
    stderr: 'API Error: 400 {"error":{"code":"1210"}}',
    stdout: 'partial output',
    cause: { message: 'inner failure' },
  });

  assert.equal(
    details,
    'stderr: API Error: 400 {"error":{"code":"1210"}}\nstdout: partial output\ncause: inner failure',
  );
});

test('extractClaudeSdkErrorDetails returns empty string for missing detail fields', () => {
  assert.equal(extractClaudeSdkErrorDetails(new Error('boom')), '');
});
