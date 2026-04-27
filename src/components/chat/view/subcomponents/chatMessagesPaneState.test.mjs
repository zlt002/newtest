import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldRenderChatEmptyState } from './chatMessagesPaneState.ts';

test('renders empty state only when there are no messages and nothing is loading', () => {
  assert.equal(
    shouldRenderChatEmptyState({
      chatMessagesLength: 0,
      isLoadingSessionMessages: false,
      isLoading: false,
    }),
    true,
  );
});

test('does not render empty state while loading stored session messages', () => {
  assert.equal(
    shouldRenderChatEmptyState({
      chatMessagesLength: 0,
      isLoadingSessionMessages: true,
      isLoading: false,
    }),
    false,
  );
});

test('does not render empty state while the first chat turn is still loading', () => {
  assert.equal(
    shouldRenderChatEmptyState({
      chatMessagesLength: 0,
      isLoadingSessionMessages: false,
      isLoading: true,
    }),
    false,
  );
});

test('does not render empty state once at least one chat message exists', () => {
  assert.equal(
    shouldRenderChatEmptyState({
      chatMessagesLength: 1,
      hasRenderableV2History: false,
      isLoadingSessionMessages: false,
      isLoading: false,
    }),
    false,
  );
});

test('does not render empty state when V2 history is renderable even if legacy chat messages are empty', () => {
  assert.equal(
    shouldRenderChatEmptyState({
      chatMessagesLength: 0,
      hasRenderableV2History: true,
      isLoadingSessionMessages: false,
      isLoading: false,
    }),
    false,
  );
});
