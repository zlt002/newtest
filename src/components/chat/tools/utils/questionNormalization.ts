import type { Question } from '../../types/types';

function isQuestionOptionArray(value: unknown): value is Array<{ label: string; [key: string]: unknown }> {
  return Array.isArray(value) && value.every((option) => (
    option &&
    typeof option === 'object' &&
    typeof option.label === 'string'
  ));
}

function isQuestion(value: unknown): value is Question {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).question === 'string' &&
    isQuestionOptionArray((value as Record<string, unknown>).options)
  );
}

export function normalizeQuestions(value: unknown): Question[] {
  if (Array.isArray(value)) {
    return value.filter(isQuestion);
  }

  if (isQuestion(value)) {
    return [value];
  }

  return [];
}
