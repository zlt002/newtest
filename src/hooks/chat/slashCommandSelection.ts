export function insertSlashCommandIntoInput(
  input: string,
  slashPosition: number,
  commandName: string,
): string {
  const textBeforeSlash = input.slice(0, slashPosition);
  const textAfterSlash = input.slice(slashPosition);
  const spaceIndex = textAfterSlash.indexOf(' ');
  const textAfterQuery = spaceIndex !== -1 ? textAfterSlash.slice(spaceIndex) : '';

  return `${textBeforeSlash}${commandName} ${textAfterQuery}`;
}
