import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../../utils/api.js';
import type {
  MarkdownAnnotation,
  MarkdownAnnotationFile,
} from '../types/markdownAnnotations.ts';

type UseMarkdownAnnotationsParams = {
  enabled?: boolean;
  projectName?: string;
  filePath: string;
  content: string;
};

export type UseMarkdownAnnotationsResult = {
  annotationFile: MarkdownAnnotationFile | null;
  annotations: MarkdownAnnotation[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  loadAnnotations: () => Promise<MarkdownAnnotationFile>;
  saveAnnotationFile: (nextAnnotationFile: MarkdownAnnotationFile) => Promise<MarkdownAnnotationFile>;
  saveAnnotation: (annotation: MarkdownAnnotation) => Promise<MarkdownAnnotationFile>;
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

const isMarkdownAnnotation = (value: unknown): value is MarkdownAnnotation => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const annotation = value as Record<string, unknown>;

  return (
    typeof annotation.id === 'string' &&
    typeof annotation.startLine === 'number' &&
    typeof annotation.startColumn === 'number' &&
    typeof annotation.endLine === 'number' &&
    typeof annotation.endColumn === 'number' &&
    typeof annotation.selectedText === 'string' &&
    typeof annotation.note === 'string' &&
    typeof annotation.quoteHash === 'string' &&
    typeof annotation.createdAt === 'string' &&
    typeof annotation.updatedAt === 'string'
  );
};

const normalizeAnnotationFile = (
  filePath: string,
  annotationFile: unknown,
): MarkdownAnnotationFile => {
  if (!annotationFile || typeof annotationFile !== 'object') {
    return createEmptyAnnotationFile(filePath);
  }

  const candidate = annotationFile as Partial<MarkdownAnnotationFile> & {
    annotations?: unknown[];
  };

  return {
    version: 1,
    filePath: typeof candidate.filePath === 'string' ? candidate.filePath : filePath,
    fileHash: typeof candidate.fileHash === 'string' ? candidate.fileHash : undefined,
    annotations: Array.isArray(candidate.annotations)
      ? candidate.annotations.filter(isMarkdownAnnotation)
      : [],
  };
};

export function createEmptyAnnotationFile(filePath: string): MarkdownAnnotationFile {
  return {
    version: 1,
    filePath,
    annotations: [],
  };
}

export function upsertAnnotation(
  annotationFile: MarkdownAnnotationFile,
  annotation: MarkdownAnnotation,
): MarkdownAnnotationFile {
  const existingAnnotations = annotationFile.annotations.filter((item) => item.id !== annotation.id);

  return {
    ...annotationFile,
    annotations: [...existingAnnotations, annotation],
  };
}

export function useMarkdownAnnotations({
  enabled = true,
  projectName,
  filePath,
}: UseMarkdownAnnotationsParams): UseMarkdownAnnotationsResult {
  const emptyAnnotationFile = useMemo(
    () => createEmptyAnnotationFile(filePath),
    [filePath],
  );
  const [annotationFile, setAnnotationFile] = useState<MarkdownAnnotationFile | null>(
    enabled ? emptyAnnotationFile : null,
  );
  const [loading, setLoading] = useState(enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const annotationFileRef = useRef<MarkdownAnnotationFile | null>(enabled ? emptyAnnotationFile : null);
  const savingRef = useRef(false);

  useEffect(() => {
    annotationFileRef.current = annotationFile;
  }, [annotationFile]);

  const loadAnnotations = useCallback(async () => {
    if (!enabled) {
      setAnnotationFile(null);
      annotationFileRef.current = null;
      setLoading(false);
      return emptyAnnotationFile;
    }

    if (!projectName) {
      setAnnotationFile(emptyAnnotationFile);
      annotationFileRef.current = emptyAnnotationFile;
      setLoading(false);
      setError(null);
      return emptyAnnotationFile;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.readMarkdownAnnotations(projectName, filePath);

      if (!response.ok) {
        throw new Error(`Failed to load markdown annotations: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const nextAnnotationFile = normalizeAnnotationFile(filePath, data);
      setAnnotationFile(nextAnnotationFile);
      annotationFileRef.current = nextAnnotationFile;
      return nextAnnotationFile;
    } catch (loadError) {
      const message = getErrorMessage(loadError);
      setError(message);
      setAnnotationFile(emptyAnnotationFile);
      annotationFileRef.current = emptyAnnotationFile;
      return emptyAnnotationFile;
    } finally {
      setLoading(false);
    }
  }, [emptyAnnotationFile, enabled, filePath, projectName]);

  const saveAnnotationFile = useCallback(async (nextAnnotationFile: MarkdownAnnotationFile) => {
    if (savingRef.current) {
      return annotationFileRef.current ?? nextAnnotationFile;
    }

    if (!enabled || !projectName) {
      setAnnotationFile(nextAnnotationFile);
      annotationFileRef.current = nextAnnotationFile;
      return nextAnnotationFile;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);

    try {
      const response = await api.saveMarkdownAnnotations(projectName, filePath, nextAnnotationFile);

      if (!response.ok) {
        throw new Error(`Failed to save markdown annotations: ${response.status} ${response.statusText}`);
      }

      await response.json();
      setAnnotationFile(nextAnnotationFile);
      annotationFileRef.current = nextAnnotationFile;
      return nextAnnotationFile;
    } catch (saveError) {
      const message = getErrorMessage(saveError);
      setError(message);
      throw saveError;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [enabled, filePath, projectName]);

  const saveAnnotation = useCallback(async (annotation: MarkdownAnnotation) => {
    if (savingRef.current) {
      return annotationFileRef.current ?? emptyAnnotationFile;
    }

    const currentAnnotationFile = annotationFileRef.current ?? emptyAnnotationFile;
    const nextAnnotationFile = upsertAnnotation(currentAnnotationFile, annotation);

    return saveAnnotationFile(nextAnnotationFile);
  }, [emptyAnnotationFile, saveAnnotationFile]);

  useEffect(() => {
    void loadAnnotations();
  }, [loadAnnotations]);

  return {
    annotationFile,
    annotations: annotationFile?.annotations ?? [],
    loading,
    saving,
    error,
    loadAnnotations,
    saveAnnotationFile,
    saveAnnotation,
  };
}
