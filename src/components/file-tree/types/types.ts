import type { LucideIcon } from 'lucide-react';

export type FileTreeViewMode = 'simple' | 'detailed';

export type FileTreeItemType = 'file' | 'directory';

export type FileTreeSortKey = 'name' | 'size' | 'modified';

export type FileTreeSortDirection = 'asc' | 'desc';

export interface FileTreeSortConfig {
  key: FileTreeSortKey;
  direction: FileTreeSortDirection;
}

export interface FileTreeNode {
  name: string;
  type: FileTreeItemType;
  path: string;
  size?: number;
  modified?: string;
  permissionsRwx?: string;
  children?: FileTreeNode[];
  [key: string]: unknown;
}

export interface FileTreeImageSelection {
  name: string;
  path: string;
  projectPath?: string;
  projectName: string;
}

export interface FileIconData {
  icon: LucideIcon;
  color: string;
}

export type FileIconMap = Record<string, FileIconData>;
