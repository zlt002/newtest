import type { FileTreeNode } from '../types/types';

export const getFileTreeChatInsertText = (item: FileTreeNode): string => item.path || '';
