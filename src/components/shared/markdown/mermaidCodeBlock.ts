export type MarkdownCodeBlockInfo = {
  rawContent: string;
  looksMultiline: boolean;
  shouldRenderInline: boolean;
  language: string;
};

type ParseMarkdownCodeBlockInput = {
  inline?: boolean;
  className?: string;
  rawContent: string;
};

export const parseMarkdownCodeBlock = ({
  inline,
  className,
  rawContent,
}: ParseMarkdownCodeBlockInput): MarkdownCodeBlockInfo => {
  const looksMultiline = /[\r\n]/.test(rawContent);
  const shouldRenderInline = Boolean(inline) || !looksMultiline;
  const languageMatch = /language-([\w-]+)/.exec(className || '');
  const language = languageMatch ? languageMatch[1].toLowerCase() : 'text';

  return {
    rawContent,
    looksMultiline,
    shouldRenderInline,
    language,
  };
};

export const shouldRenderMermaidBlock = (input: ParseMarkdownCodeBlockInput): boolean => {
  const codeBlock = parseMarkdownCodeBlock(input);
  return !codeBlock.shouldRenderInline && codeBlock.language === 'mermaid';
};
