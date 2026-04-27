export function extractClaudeSdkErrorDetails(error) {
  if (!error || typeof error !== 'object') {
    return '';
  }

  const details = [];
  const stderr = typeof error.stderr === 'string' ? error.stderr.trim() : '';
  const stdout = typeof error.stdout === 'string' ? error.stdout.trim() : '';
  const causeMessage =
    error.cause && typeof error.cause === 'object' && typeof error.cause.message === 'string'
      ? error.cause.message.trim()
      : '';

  if (stderr) {
    details.push(`stderr: ${stderr}`);
  }

  if (stdout) {
    details.push(`stdout: ${stdout}`);
  }

  if (causeMessage) {
    details.push(`cause: ${causeMessage}`);
  }

  return details.join('\n');
}
