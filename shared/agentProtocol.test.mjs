import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CLIENT_EVENT_TYPES,
  SERVER_EVENT_TYPES,
} from './agentProtocol.js';

test('shared agent protocol exposes pending decision recovery event constants', () => {
  assert.equal(CLIENT_EVENT_TYPES.GET_PENDING_DECISIONS, 'get-pending-decisions');
  assert.equal(SERVER_EVENT_TYPES.PENDING_DECISIONS_RESPONSE, 'pending-decisions-response');
});
