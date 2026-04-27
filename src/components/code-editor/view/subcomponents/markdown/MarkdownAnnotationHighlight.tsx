import type { MarkdownAnnotation } from '../../../types/markdownAnnotations.ts';

type MarkdownAnnotationHighlightProps = {
  text: string;
  annotations: MarkdownAnnotation[];
  isFocused?: boolean;
  onActivate?: ((annotationId: string) => void) | null;
};

const buildTitle = (annotations: MarkdownAnnotation[]): string =>
  annotations
    .map((annotation, index) => `${index + 1}. ${annotation.note}`)
    .join('\n');

export default function MarkdownAnnotationHighlight({
  text,
  annotations,
  isFocused = false,
  onActivate = null,
}: MarkdownAnnotationHighlightProps) {
  if (annotations.length === 0) {
    return <>{text}</>;
  }

  const primaryAnnotationId = annotations[0]?.id ?? null;

  return (
    <mark
      title={buildTitle(annotations)}
      onClick={primaryAnnotationId && onActivate ? () => onActivate(primaryAnnotationId) : undefined}
      className={`rounded px-0.5 text-inherit decoration-transparent ${
        isFocused
          ? 'bg-blue-200/80 ring-1 ring-blue-400 dark:bg-blue-500/30 dark:ring-blue-300'
          : 'bg-amber-200/70 dark:bg-amber-500/25'
      } ${primaryAnnotationId && onActivate ? 'cursor-pointer transition-colors hover:bg-amber-300/80 dark:hover:bg-amber-500/35' : ''}`}
    >
      {text}
    </mark>
  );
}
