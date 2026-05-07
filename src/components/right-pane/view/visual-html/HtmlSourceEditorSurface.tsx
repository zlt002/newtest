import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import CodeMirror from '@uiw/react-codemirror';
import { useMemo } from 'react';
import { useCodeEditorSettings } from '../../../code-editor/hooks/useCodeEditorSettings';
import { getLanguageExtensions } from '../../../code-editor/utils/editorExtensions';
import { getEditorStyles } from '../../../code-editor/utils/editorStyles';

export const LARGE_HTML_SOURCE_LIGHTWEIGHT_THRESHOLD = 120_000;

export type HtmlSourceCursorPosition = {
  line: number;
  column: number;
  offset: number;
};

export default function HtmlSourceEditorSurface({
  value,
  onChange,
  onCursorChange,
}: {
  value: string;
  onChange: (value: string) => void;
  onCursorChange?: (position: HtmlSourceCursorPosition) => void;
}) {
  const { isDarkMode, fontSize, showLineNumbers } = useCodeEditorSettings();
  const isLargeSource = value.length >= LARGE_HTML_SOURCE_LIGHTWEIGHT_THRESHOLD;
  const extensions = useMemo(
    () => (isLargeSource ? [EditorView.lineWrapping] : [...getLanguageExtensions('index.html'), EditorView.lineWrapping]),
    [isLargeSource],
  );

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      data-visual-html-mode="source"
      data-visual-html-source-lightweight={isLargeSource ? 'true' : 'false'}
    >
      <style>{getEditorStyles(isDarkMode)}</style>
      <CodeMirror
        value={value}
        onChange={onChange}
        onUpdate={(viewUpdate) => {
          if (!viewUpdate.selectionSet) {
            return;
          }

          const head = viewUpdate.state.selection.main.head;
          const line = viewUpdate.state.doc.lineAt(head);
          onCursorChange?.({
            line: line.number,
            column: head - line.from + 1,
            offset: head,
          });
        }}
        extensions={extensions}
        theme={isDarkMode ? oneDark : undefined}
        height="100%"
        style={{ fontSize: `${fontSize}px`, height: '100%' }}
        basicSetup={{
          lineNumbers: showLineNumbers,
          foldGutter: !isLargeSource && showLineNumbers,
          dropCursor: false,
          allowMultipleSelections: false,
          indentOnInput: !isLargeSource,
          bracketMatching: !isLargeSource,
          closeBrackets: !isLargeSource,
          autocompletion: !isLargeSource,
          highlightSelectionMatches: !isLargeSource,
          searchKeymap: true,
        }}
      />
    </div>
  );
}
