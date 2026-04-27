export type MarkdownAnnotation = {
  id: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  selectedText: string;
  note: string;
  quoteHash: string;
  createdAt: string;
  updatedAt: string;
};

export type MarkdownAnnotationFile = {
  version: 1;
  filePath: string;
  fileHash?: string;
  annotations: MarkdownAnnotation[];
};
