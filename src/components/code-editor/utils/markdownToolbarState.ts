import type { MarkdownToolbarAnnotationItem } from '../view/subcomponents/MarkdownAnnotationToolbarMenu';

export type MarkdownToolbarState = {
  addToChatInput: (() => void) | null;
  validAnnotationCount: number;
  items: MarkdownToolbarAnnotationItem[];
  onEditAnnotation: ((annotationId: string) => void) | null;
  onDeleteAnnotation: ((annotationId: string) => void) | null;
  onSendAnnotationToChatInput: ((annotationId: string) => void) | null;
};

export const createEmptyMarkdownToolbarState = (): MarkdownToolbarState => ({
  addToChatInput: null,
  validAnnotationCount: 0,
  items: [],
  onEditAnnotation: null,
  onDeleteAnnotation: null,
  onSendAnnotationToChatInput: null,
});

export const isMarkdownToolbarStateEqual = (
  previousState: MarkdownToolbarState,
  nextState: MarkdownToolbarState,
): boolean => {
  if (
    previousState.addToChatInput !== nextState.addToChatInput ||
    previousState.validAnnotationCount !== nextState.validAnnotationCount ||
    previousState.onEditAnnotation !== nextState.onEditAnnotation ||
    previousState.onDeleteAnnotation !== nextState.onDeleteAnnotation ||
    previousState.onSendAnnotationToChatInput !== nextState.onSendAnnotationToChatInput ||
    previousState.items.length !== nextState.items.length
  ) {
    return false;
  }

  return previousState.items.every((item, index) => {
    const nextItem = nextState.items[index];

    return (
      item?.id === nextItem?.id &&
      item?.selectedText === nextItem?.selectedText &&
      item?.note === nextItem?.note &&
      item?.isValid === nextItem?.isValid
    );
  });
};
