import { rm } from 'node:fs/promises';

const RETRYABLE_RM_ERROR_CODES = new Set(['EBUSY', 'ENOTEMPTY', 'EPERM']);

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function removeDirectoryWithRetry(
  targetPath,
  {
    retries = 5,
    retryDelayMs = 100,
    rmImpl = rm,
  } = {}
) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await rmImpl(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (!RETRYABLE_RM_ERROR_CODES.has(error?.code) || attempt === retries) {
        throw error;
      }
      await wait(retryDelayMs * (attempt + 1));
    }
  }

  throw lastError;
}

export { removeDirectoryWithRetry, RETRYABLE_RM_ERROR_CODES };
