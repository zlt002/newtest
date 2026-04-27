function isQuestionOptionArray(value) {
  return Array.isArray(value) && value.every((option) => (
    option &&
    typeof option === 'object' &&
    typeof option.label === 'string'
  ));
}

function isQuestion(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof value.question === 'string' &&
    isQuestionOptionArray(value.options)
  );
}

function normalizeQuestions(value) {
  if (Array.isArray(value)) {
    return value.filter(isQuestion);
  }

  if (isQuestion(value)) {
    return [value];
  }

  return [];
}

export function normalizeAskUserQuestionInput(input) {
  if (!input || typeof input !== 'object') {
    return input;
  }

  const candidateQuestions = normalizeQuestions(input.questions ?? input.question);
  if (candidateQuestions.length === 0) {
    return input;
  }

  const { question: _legacyQuestion, ...rest } = input;
  return {
    ...rest,
    questions: candidateQuestions,
  };
}
