import type { MarkdownAnnotation } from '../types/markdownAnnotations.ts';

export type MarkdownAnnotationPromptItem = Pick<
  MarkdownAnnotation,
  'startLine' | 'startColumn' | 'endLine' | 'endColumn' | 'selectedText' | 'note'
>;

const formatAnnotationRange = (annotation: MarkdownAnnotationPromptItem): string =>
  `${annotation.startLine}:${annotation.startColumn}-${annotation.endLine}:${annotation.endColumn}`;

export const formatMarkdownAnnotationsForChat = ({
  fileName,
  filePath,
  annotations,
}: {
  fileName: string;
  filePath: string;
  annotations: MarkdownAnnotation[];
}): string => {
  return formatMarkdownAnnotationPromptItemsForChat({
    fileName,
    filePath,
    annotations,
  });
};

export const formatMarkdownAnnotationPromptItemsForChat = ({
  fileName,
  filePath,
  annotations,
}: {
  fileName: string;
  filePath: string;
  annotations: MarkdownAnnotationPromptItem[];
}): string => {
  if (annotations.length === 0) {
    return '';
  }

  const lines = [
    `请根据以下 Markdown 标注修改文件 \`${fileName}\`。`,
    `文件路径：\`${filePath}\``,
    '',
    '修改要求：',
    ...annotations.flatMap((annotation, index) => [
      `${index + 1}. 范围：${formatAnnotationRange(annotation)}`,
      `选中文本："""${annotation.selectedText}"""`,
      `标注说明：${annotation.note}`,
      '',
    ]),
    '请保留未提及内容不变，并根据这些标注生成更新后的文档。',
  ];

  return lines.join('\n').trim();
};
