import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../utils/api';
import { broadcastFileSyncEvent, subscribeToFileSyncEvents } from '../../../utils/fileSyncEvents';
import type { CodeEditorFile } from '../types/types';
import { isBinaryFile } from '../utils/binaryFile';
import {
  buildDocxDownloadPayload,
  buildMarkdownDownloadPayload,
  triggerBrowserDownload,
} from '../utils/downloadExport';

type UseCodeEditorDocumentParams = {
  file: CodeEditorFile;
  projectPath?: string;
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

export const useCodeEditorDocument = ({ file, projectPath }: UseCodeEditorDocumentParams) => {
  const [content, setContent] = useState('');
  const [persistedContent, setPersistedContent] = useState('');
  const [version, setVersion] = useState<string | null>(null);
  const contentRef = useRef('');
  const persistedContentRef = useRef('');
  const versionRef = useRef<string | null>(null);
  const syncSourceIdRef = useRef(`code-editor-document-${Math.random().toString(36).slice(2)}`);
  const isBinaryRef = useRef(false);
  const canSaveToDiskRef = useRef(false);
  const saveBlockReasonRef = useRef('This file cannot be saved because no disk version is loaded');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isBinary, setIsBinary] = useState(false);
  const fileProjectName = file.projectName ?? projectPath;
  const filePath = file.path;
  const fileName = file.name;
  const fileDiffNewString = file.diffInfo?.new_string;
  const fileDiffOldString = file.diffInfo?.old_string;

  const updateVersion = useCallback((nextVersion: string | null) => {
    versionRef.current = nextVersion;
    setVersion(nextVersion);
  }, []);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    persistedContentRef.current = persistedContent;
  }, [persistedContent]);

  const updateBinaryState = useCallback((nextIsBinary: boolean) => {
    isBinaryRef.current = nextIsBinary;
    setIsBinary(nextIsBinary);
  }, []);

  const updateSaveCapability = useCallback((canSaveToDisk: boolean, saveBlockReason: string | null = null) => {
    canSaveToDiskRef.current = canSaveToDisk;
    saveBlockReasonRef.current = saveBlockReason ?? 'This file cannot be saved because no disk version is loaded';
  }, []);

  const loadFileContent = useCallback(async ({ markLoading = true }: { markLoading?: boolean } = {}) => {
    try {
      if (markLoading) {
        setLoading(true);
      }

      updateBinaryState(false);
      updateSaveCapability(false);
      setSaveError(null);

      // Check if file is binary by extension
      if (isBinaryFile(file.name)) {
        setContent('');
        setPersistedContent('');
        updateVersion(null);
        updateBinaryState(true);
        updateSaveCapability(false, 'Binary files cannot be saved from the editor');
        return;
      }

      // Diff payload may already include full old/new snapshots, so avoid disk read.
      if (file.diffInfo && fileDiffNewString !== undefined && fileDiffOldString !== undefined) {
        setContent(fileDiffNewString);
        setPersistedContent(fileDiffNewString);
        updateVersion(null);
        updateSaveCapability(false, 'Diff snapshots cannot be saved to disk');
        return;
      }

      if (!fileProjectName) {
        throw new Error('Missing project identifier');
      }

      const response = await api.readFile(fileProjectName, filePath);
      if (!response.ok) {
        throw new Error(`Failed to load file: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      setContent(data.content);
      setPersistedContent(data.content);
      updateVersion(data.version ?? null);
      updateSaveCapability(Boolean(data.version), data.version ? null : 'This file cannot be saved because no disk version is loaded');
    } catch (error) {
      const message = getErrorMessage(error);
      console.error('Error loading file:', error);
      const fallbackContent = `// Error loading file: ${message}\n// File: ${fileName}\n// Path: ${filePath}`;
      updateVersion(null);
      updateSaveCapability(false, 'This file cannot be saved because no disk version is loaded');
      setContent(fallbackContent);
      setPersistedContent(fallbackContent);
    } finally {
      if (markLoading) {
        setLoading(false);
      }
    }
  }, [file.diffInfo, file.name, fileDiffNewString, fileDiffOldString, fileName, filePath, fileProjectName, updateBinaryState, updateSaveCapability, updateVersion]);

  useEffect(() => {
    void loadFileContent();
  }, [loadFileContent]);

  useEffect(() => {
    if (!fileProjectName || file.diffInfo || isBinaryFile(file.name)) {
      return undefined;
    }

    return subscribeToFileSyncEvents({
      projectName: fileProjectName,
      filePath,
      sourceId: syncSourceIdRef.current,
      onFileSync: () => {
        if (contentRef.current !== persistedContentRef.current) {
          const conflictMessage = 'File has changed on disk. Reload the file before saving again.';
          updateSaveCapability(false, conflictMessage);
          setSaveError(conflictMessage);
          return;
        }

        void loadFileContent({ markLoading: false });
      },
    });
  }, [file.diffInfo, file.name, filePath, fileProjectName, loadFileContent]);

  const handleSave = useCallback(async () => {
    if (isBinaryRef.current) {
      setSaveError('Binary files cannot be saved from the editor');
      return;
    }

    if (!canSaveToDiskRef.current) {
      setSaveError(saveBlockReasonRef.current);
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      if (!fileProjectName) {
        throw new Error('Missing project identifier');
      }

      const response = await api.saveFile(fileProjectName, filePath, content, versionRef.current ?? undefined);

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const errorData = await response.json();
          if (response.status === 409 && Object.prototype.hasOwnProperty.call(errorData, 'currentVersion')) {
            const currentVersion = errorData.currentVersion ?? null;
            updateVersion(currentVersion);
            updateSaveCapability(
              false,
              'File has changed on disk. Reload the file before saving again.',
            );
            throw new Error('File has changed since last load. Version information has been refreshed; reload the file before saving again.');
          }

          throw new Error(errorData.error || `Save failed: ${response.status}`);
        }

        const textError = await response.text();
        console.error('Non-JSON error response:', textError);
        throw new Error(`Save failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      updateVersion(data.version ?? null);
      broadcastFileSyncEvent({
        projectName: fileProjectName,
        filePath,
        sourceId: syncSourceIdRef.current,
        version: data.version ?? null,
      });
      setPersistedContent(content);

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      const message = getErrorMessage(error);
      console.error('Error saving file:', error);
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  }, [content, filePath, fileProjectName, updateSaveCapability, updateVersion]);

  const handleDownload = useCallback(() => {
    triggerBrowserDownload(buildMarkdownDownloadPayload({
      content,
      fileName: file.name,
    }));
  }, [content, file.name]);

  const handleDownloadAsMarkdown = useCallback(() => {
    triggerBrowserDownload(buildMarkdownDownloadPayload({
      content,
      fileName: file.name,
    }));
  }, [content, file.name]);

  const handleDownloadAsDoc = useCallback(async () => {
    const payload = await buildDocxDownloadPayload({
      content,
      fileName: file.name,
    });
    triggerBrowserDownload(payload);
  }, [content, file.name]);

  return {
    content,
    persistedContent,
    hasUnsavedChanges: content !== persistedContent,
    version,
    setContent,
    loading,
    saving,
    saveSuccess,
    saveError,
    isBinary,
    handleSave,
    handleDownload,
    handleDownloadAsMarkdown,
    handleDownloadAsDoc,
  };
};
