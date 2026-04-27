function tryParseJson(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function normalizeTodosValue(value) {
  if (Array.isArray(value)) {
    return value;
  }

  const parsed = tryParseJson(value);
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.todos)) {
    return parsed.todos;
  }

  return null;
}

export function normalizeTodoWriteInput(input) {
  if (!input || typeof input !== 'object') {
    return input;
  }

  const normalizedTodos = normalizeTodosValue(input.todos);
  if (!normalizedTodos) {
    return input;
  }

  return {
    ...input,
    todos: normalizedTodos,
  };
}
