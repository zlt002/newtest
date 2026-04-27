import test from 'node:test';
import assert from 'node:assert/strict';

import {
  __testables__,
  createClaudeStreamToolPreviewTracker,
} from './claude-stream-tool-preview.js';

test('parsePartialToolInput extracts partial Write tool input', () => {
  const parsed = __testables__.parsePartialToolInput('"file_path":"/tmp/PRD.md","content":"# Tit');

  assert.deepEqual(parsed, {
    file_path: '/tmp/PRD.md',
    content: '# Tit',
  });
});

test('parsePartialToolInput extracts partial Edit tool input', () => {
  const parsed = __testables__.parsePartialToolInput('"file_path":"/tmp/PRD.md","old_string":"旧段落","new_string":"新段');

  assert.deepEqual(parsed, {
    file_path: '/tmp/PRD.md',
    old_string: '旧段落',
    new_string: '新段',
  });
});

test('tool preview tracker emits Write partials from stream events', () => {
  const tracker = createClaudeStreamToolPreviewTracker();

  const startEvents = tracker.consume({
    type: 'stream_event',
    uuid: 'evt-1',
    session_id: 'session-1',
    event: {
      type: 'content_block_start',
      index: 0,
      content_block: {
        type: 'tool_use',
        id: 'tool-1',
        name: 'Write',
        input: {},
      },
    },
  });

  assert.equal(startEvents.length, 1);
  assert.equal(startEvents[0].type, 'tool_use_partial');
  assert.equal(startEvents[0].toolName, 'Write');
  assert.deepEqual(startEvents[0].toolInput, {});

  const deltaEvents = tracker.consume({
    type: 'stream_event',
    uuid: 'evt-2',
    session_id: 'session-1',
    event: {
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'input_json_delta',
        partial_json: '"file_path":"/tmp/PRD.md","content":"# Title\\nHel',
      },
    },
  });

  assert.equal(deltaEvents.length, 1);
  assert.equal(deltaEvents[0].toolCallId, 'tool-1');
  assert.deepEqual(deltaEvents[0].toolInput, {
    file_path: '/tmp/PRD.md',
    content: '# Title\nHel',
  });
});
