export type ComposerPrimaryAction = {
  kind: 'send' | 'stop';
  disabled: boolean;
};

export function getComposerPrimaryAction({
  isLoading,
  hasInput,
}: {
  isLoading: boolean;
  hasInput: boolean;
}): ComposerPrimaryAction {
  if (isLoading) {
    return { kind: 'stop', disabled: false };
  }

  return {
    kind: 'send',
    disabled: !hasInput,
  };
}
