export function shouldCaptureLegacyAnnotationBaselineHash({
  storedFileHash,
  legacyBaselineHash,
  annotationCount,
  invalidAnnotationCount,
}: {
  storedFileHash?: string;
  legacyBaselineHash?: string | null;
  annotationCount: number;
  invalidAnnotationCount: number;
}): boolean {
  return (
    !storedFileHash &&
    !legacyBaselineHash &&
    annotationCount > 0 &&
    invalidAnnotationCount === 0
  );
}

export function isMarkdownAnnotationDocumentChanged({
  storedFileHash,
  legacyBaselineHash,
  contentHash,
}: {
  storedFileHash?: string;
  legacyBaselineHash?: string | null;
  contentHash: string;
}): boolean {
  const baselineHash = storedFileHash ?? legacyBaselineHash;
  return typeof baselineHash === 'string' && baselineHash !== contentHash;
}
