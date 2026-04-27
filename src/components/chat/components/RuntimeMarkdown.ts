import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import oneLight from 'react-syntax-highlighter/dist/esm/styles/prism/one-light.js';
import { getMarkdownLinkAttributes } from '../../chat/view/subcomponents/markdownLinkRouting';

type RuntimeMarkdownProps = {
  children?: React.ReactNode;
  className?: string;
  onOpenUrl?: ((url: string) => void) | null;
};

type CodeBlockProps = {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
};

function CodeBlock({ inline, className, children }: CodeBlockProps) {
  const raw = Array.isArray(children) ? children.join('') : String(children ?? '');
  const shouldInline = inline || !/[\r\n]/.test(raw);

  if (shouldInline) {
    return React.createElement(
      'code',
      {
        className: `whitespace-pre-wrap break-words rounded-md bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.9em] text-neutral-900 ${className || ''}`,
      },
      children,
    );
  }

  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : 'text';

  return React.createElement(
    SyntaxHighlighter,
    {
      language,
      style: oneLight,
      customStyle: {
        margin: 0,
        border: 'none',
        boxShadow: 'none',
        background: '#f8fafc',
        borderRadius: '0.5rem',
        fontSize: '0.875rem',
        padding: '1rem',
      },
      codeTagProps: {
        style: {
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        },
      },
    },
    raw,
  );
}

function createMarkdownComponents(onOpenUrl?: ((url: string) => void) | null) {
  return {
    code: CodeBlock,
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
      const { shouldRouteToRightPane, target, rel } = getMarkdownLinkAttributes({
        href,
        onOpenUrl,
      });

      return React.createElement(
        'a',
        {
          href,
          className: 'text-blue-600 hover:underline dark:text-blue-400',
          target,
          rel,
          onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
            if (!shouldRouteToRightPane || !href) {
              return;
            }

            event.preventDefault();
            onOpenUrl?.(href);
          },
        },
        children,
      );
    },
    p: ({ children }: { children?: React.ReactNode }) =>
      React.createElement('div', { className: 'mb-2 last:mb-0' }, children),
    blockquote: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(
        'blockquote',
        { className: 'my-2 border-l-4 border-neutral-300 pl-4 italic text-neutral-600' },
        children,
      ),
    table: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(
        'div',
        { className: 'my-2 overflow-x-auto' },
        React.createElement('table', { className: 'min-w-full border-collapse border border-neutral-200' }, children),
      ),
    thead: ({ children }: { children?: React.ReactNode }) =>
      React.createElement('thead', { className: 'bg-neutral-50' }, children),
    th: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(
        'th',
        { className: 'border border-neutral-200 px-3 py-2 text-left text-sm font-semibold' },
        children,
      ),
    td: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(
        'td',
        { className: 'border border-neutral-200 px-3 py-2 align-top text-sm' },
        children,
      ),
  };
}

export function RuntimeMarkdown({ children, className, onOpenUrl }: RuntimeMarkdownProps) {
  const content = String(children ?? '');
  const remarkPlugins = useMemo(() => [remarkGfm, remarkMath], []);
  const rehypePlugins = useMemo(() => [rehypeKatex], []);
  const markdownComponents = useMemo(() => createMarkdownComponents(onOpenUrl), [onOpenUrl]);

  return React.createElement(
    'div',
    { className },
    React.createElement(
      ReactMarkdown,
      {
        remarkPlugins,
        rehypePlugins,
        components: markdownComponents as any,
      },
      content,
    ),
  );
}
