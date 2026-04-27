export const appendTextToChatInput = (currentInput: string, nextText: string): string => {
  const trimmedNext = nextText.trim();
  if (!trimmedNext) {
    return currentInput;
  }

  const trimmedCurrent = currentInput.trimEnd();
  if (!trimmedCurrent) {
    return trimmedNext;
  }

  return `${trimmedCurrent}\n\n${trimmedNext}`;
};
