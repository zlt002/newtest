export type CodeEditorDiffInfo = {
  old_string?: string;
  new_string?: string;
  [key: string]: unknown;
};

export type FileDraftPreviewOperation = {
  toolId: string;
  filePath: string;
  timestamp: string;
  source: 'Edit' | 'Write';
  mode: 'replace' | 'write';
  oldText?: string;
  newText: string;
  replaceAll?: boolean;
  status: 'pending' | 'committed';
  lineRange?: {
    startLine: number;
    endLine: number;
  } | null;
};

export type CodeEditorFile = {
  name: string;
  path: string;
  projectName?: string;
  diffInfo?: CodeEditorDiffInfo | null;
  [key: string]: unknown;
};

export type CodeEditorSettingsState = {
  isDarkMode: boolean;
  wordWrap: boolean;
  minimapEnabled: boolean;
  showLineNumbers: boolean;
  fontSize: string;
};
