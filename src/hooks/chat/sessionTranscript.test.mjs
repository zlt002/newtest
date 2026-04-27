import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSessionTranscript, buildTranscriptFilename } from './sessionTranscript.ts';

test('buildSessionTranscript renders markdown transcript sections for user and assistant messages', () => {
  const transcript = buildSessionTranscript(
    [
      { type: 'user', content: 'Fix the failing slash command flow', timestamp: '2026-04-12T10:00:00.000Z' },
      { type: 'assistant', content: 'I found the competing input reset path.', timestamp: '2026-04-12T10:01:00.000Z' },
    ],
    'markdown',
    { sessionTitle: 'Slash Command Debugging' },
  );

  assert.match(transcript, /^# Slash Command Debugging/m);
  assert.match(transcript, /## User \(2026-04-12T10:00:00.000Z\)/);
  assert.match(transcript, /## Assistant \(2026-04-12T10:01:00.000Z\)/);
});

test('buildSessionTranscript renders plain text transcript entries', () => {
  const transcript = buildSessionTranscript(
    [
      { type: 'assistant', content: 'Starting debug workflow...', timestamp: '2026-04-12T10:02:00.000Z' },
    ],
    'text',
  );

  assert.equal(
    transcript,
    '[2026-04-12T10:02:00.000Z] Assistant: Starting debug workflow...',
  );
});

test('buildTranscriptFilename normalizes the session title into a safe file name', () => {
  assert.equal(buildTranscriptFilename('Slash Command / Debugging', 'md'), 'slash-command-debugging.md');
});
