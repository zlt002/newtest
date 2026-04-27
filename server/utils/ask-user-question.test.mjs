import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeAskUserQuestionInput } from './ask-user-question.js';

test('normalizeAskUserQuestionInput converts a legacy single question into questions array', () => {
  const normalized = normalizeAskUserQuestionInput({
    question: {
      header: 'Choice',
      question: 'Which option?',
      options: [{ label: 'A' }, { label: 'B' }],
    },
  });

  assert.deepEqual(normalized, {
    questions: [
      {
        header: 'Choice',
        question: 'Which option?',
        options: [{ label: 'A' }, { label: 'B' }],
      },
    ],
  });
});

test('normalizeAskUserQuestionInput removes the unexpected legacy question field when questions are valid', () => {
  const normalized = normalizeAskUserQuestionInput({
    question: {
      question: 'Old',
      options: [{ label: 'A' }, { label: 'B' }],
    },
    questions: {
      question: 'New',
      options: [{ label: '1' }, { label: '2' }],
    },
    answers: { New: '1' },
  });

  assert.deepEqual(normalized, {
    questions: [
      {
        question: 'New',
        options: [{ label: '1' }, { label: '2' }],
      },
    ],
    answers: { New: '1' },
  });
});

test('normalizeAskUserQuestionInput leaves unrelated input untouched', () => {
  const input = { foo: 'bar' };
  assert.equal(normalizeAskUserQuestionInput(input), input);
});
