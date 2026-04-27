const ACTIONS_THAT_KEEP_COMPOSER_INPUT: ReadonlySet<string> = new Set(['compact']);

export function shouldResetComposerAfterBuiltInAction(action: string): boolean {
  return !ACTIONS_THAT_KEEP_COMPOSER_INPUT.has(action);
}

export function shouldResetComposerImmediatelyAfterSlashCommandIntercept(): boolean {
  return false;
}
