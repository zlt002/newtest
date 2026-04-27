type MarkdownAnnotationBannerProps = {
  invalidCount: number;
};

export default function MarkdownAnnotationBanner({
  invalidCount,
}: MarkdownAnnotationBannerProps) {
  if (invalidCount <= 0) {
    return null;
  }

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
      {`有 ${invalidCount} 条标注无法匹配当前内容，请检查原文是否已变更。`}
    </div>
  );
}
