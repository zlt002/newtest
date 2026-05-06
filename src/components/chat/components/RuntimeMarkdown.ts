import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import oneLight from 'react-syntax-highlighter/dist/esm/styles/prism/one-light.js';
import { getMarkdownLinkAttributes } from '../../chat/view/subcomponents/markdownLinkRouting';
import { resolveMarkdownFileTarget } from '../../chat/view/subcomponents/markdownFileLink';
import { preserveMarkdownHref } from '../../chat/view/subcomponents/markdownUrlTransform';

type RuntimeMarkdownProps = {
  children?: React.ReactNode;
  className?: string;
  onOpenUrl?: ((url: string) => void) | null;
  onFileOpen?: ((filePath: string) => void) | null;
  collapsible?: boolean;
  maxHeight?: string;
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
        className: `whitespace-pre-wrap break-words rounded-md bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.9em] text-neutral-900 dark:border dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 ${className || ''}`,
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

const FILE_LINK_BUTTON_CLASS_NAME = 'inline-flex max-w-full items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-700 transition hover:border-neutral-300 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300 dark:hover:border-neutral-600 dark:hover:text-neutral-100';

function createMarkdownComponents(
  onOpenUrl?: ((url: string) => void) | null,
  onFileOpen?: ((filePath: string) => void) | null,
) {
  return {
    code: CodeBlock,
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
      const fileTarget = resolveMarkdownFileTarget(href);
      if (fileTarget && onFileOpen) {
        return React.createElement(
          'button',
          {
            type: 'button',
            title: fileTarget.filePath,
            className: FILE_LINK_BUTTON_CLASS_NAME,
            onClick: () => onFileOpen(fileTarget.filePath),
            'data-chat-markdown-file-link': fileTarget.filePath,
          },
          React.createElement('span', { className: 'truncate' }, children || fileTarget.fileName),
        );
      }

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
        { className: 'my-2 border-l-4 border-neutral-300 pl-4 italic text-neutral-600 dark:border-neutral-700 dark:text-neutral-300' },
        children,
      ),
    table: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(
        'div',
        { className: 'my-2 overflow-x-auto' },
        React.createElement('table', { className: 'min-w-full border-collapse border border-neutral-200 dark:border-neutral-700' }, children),
      ),
    thead: ({ children }: { children?: React.ReactNode }) =>
      React.createElement('thead', { className: 'bg-neutral-50 dark:bg-neutral-900' }, children),
    th: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(
        'th',
        { className: 'border border-neutral-200 px-3 py-2 text-left text-sm font-semibold dark:border-neutral-700 dark:text-neutral-100' },
        children,
      ),
    td: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(
        'td',
        { className: 'border border-neutral-200 px-3 py-2 align-top text-sm dark:border-neutral-700 dark:text-neutral-200' },
        children,
      ),
  };
}

export function RuntimeMarkdown({
  children,
  className,
  onOpenUrl,
  onFileOpen,
  collapsible = true,
  maxHeight = '320px',
}: RuntimeMarkdownProps) {
  const content = String(children ?? '');
  const remarkPlugins = useMemo(() => [remarkGfm, remarkMath], []);
  const rehypePlugins = useMemo(() => [rehypeKatex], []);
  const markdownComponents = useMemo(() => createMarkdownComponents(onOpenUrl, onFileOpen), [onFileOpen, onOpenUrl]);

  const [expanded, setExpanded] = useState(!collapsible);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const contentInnerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!collapsible) return;
    const el = contentRef.current;
    const inner = contentInnerRef.current;
    if (!el || !inner) return;

    const maxH = parseFloat(maxHeight);
    if (isNaN(maxH) || maxH <= 0) return;

    const checkOverflow = () => {
      setIsOverflowing(inner.offsetHeight > Math.ceil(maxH));
    };

    // Double rAF to ensure layout is complete
    requestAnimationFrame(() => requestAnimationFrame(checkOverflow));

    // Observe content size changes (e.g. streaming text, images loading)
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(checkOverflow);
    });
    observer.observe(inner);

    return () => observer.disconnect();
  }, [content, collapsible, maxHeight]);

  // Auto-scroll content to bottom so latest content is always visible
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (contentRef.current) {
        contentRef.current.scrollTop = contentRef.current.scrollHeight;
      }
    });
  }, []);

  // Scroll to bottom whenever content changes (new streaming text)
  useEffect(() => {
    if (expanded) return; // don't auto-scroll when user manually expanded
    scrollToBottom();
  }, [content, expanded, scrollToBottom]);

  const handleExpand = useCallback(() => {
    setExpanded(true);
    // Scroll to bottom to show latest content after expanding
    requestAnimationFrame(() => {
      if (contentRef.current) {
        contentRef.current.scrollTop = contentRef.current.scrollHeight;
      }
    });
  }, []);

  const handleCollapse = useCallback(() => {
    setExpanded(false);
    // Scroll to bottom to show latest content after collapsing
    requestAnimationFrame(() => {
      if (contentRef.current) {
        contentRef.current.scrollTop = contentRef.current.scrollHeight;
      }
    });
  }, []);

  if (!collapsible) {
    return React.createElement(
      'div',
      { className },
      React.createElement(
        ReactMarkdown,
        {
          remarkPlugins,
          rehypePlugins,
          components: markdownComponents as any,
          urlTransform: preserveMarkdownHref,
        },
        content,
      ),
    );
  }

  return React.createElement(
    'div',
    { className: 'relative' },
    React.createElement(
      'div',
      {
        ref: contentRef,
        className: 'overflow-y-auto',
        style: expanded ? { maxHeight: 'none' } : { maxHeight },
      },
      React.createElement(
        'div',
        { ref: contentInnerRef, className },
        React.createElement(
          ReactMarkdown,
          {
            remarkPlugins,
            rehypePlugins,
            components: markdownComponents as any,
            urlTransform: preserveMarkdownHref,
          },
          content,
        ),
      ),
    ),
    // Expand button overlay (collapsed state) - small corner button
    isOverflowing && !expanded
      ? React.createElement(
          'button',
          {
            type: 'button',
            onClick: handleExpand,
            className: 'absolute bottom-1 right-1 z-10 inline-flex items-center gap-0.5 rounded-md bg-blue-600/90 px-2 py-1 text-[10px] font-medium text-white shadow-sm backdrop-blur-sm hover:bg-blue-700 transition-colors',
          },
          '展开',
          React.createElement(
            'svg',
            { className: 'h-3 w-3', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', strokeWidth: 2 },
            React.createElement(
              'path',
              { strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M19 14l-7 7m0 0l-7-7m7 7V3' },
            ),
          ),
        )
      : null,
    // Collapse button (expanded state) - small inline button
    isOverflowing && expanded
      ? React.createElement(
          'div',
          { className: 'flex justify-end pt-1' },
          React.createElement(
            'button',
            {
              type: 'button',
              onClick: handleCollapse,
              className: 'inline-flex items-center gap-0.5 rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500 hover:bg-neutral-200 transition-colors dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700',
            },
            '收起',
            React.createElement(
              'svg',
              { className: 'h-3 w-3', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', strokeWidth: 2 },
              React.createElement(
                'path',
                { strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M5 10l7-7m0 0l7 7m-7-7v18' },
              ),
            ),
          ),
        )
      : null,
  );
}
