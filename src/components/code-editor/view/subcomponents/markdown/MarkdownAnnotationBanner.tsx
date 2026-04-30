type MarkdownAnnotationBannerProps = {
  invalidCount: number;
  isDocumentContentChanged?: boolean;
};

export default function MarkdownAnnotationBanner({
  invalidCount,
  isDocumentContentChanged = false,
}: MarkdownAnnotationBannerProps) {
  if (invalidCount <= 0) {
    return null;
  }

  const message = isDocumentContentChanged
    ? `当前文档内容已变更，有 ${invalidCount} 条历史标注未能匹配。`
    : `有 ${invalidCount} 条标注当前无法重新定位，可能是原文变更或选区映射偏移导致。`;

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
      {message}
    </div>
  );
}
