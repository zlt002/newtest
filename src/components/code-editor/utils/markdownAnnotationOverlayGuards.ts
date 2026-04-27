export const MARKDOWN_ANNOTATION_OVERLAY_SELECTOR = '[data-markdown-annotation-overlay="true"]';

export const isEventFromMarkdownAnnotationOverlay = (target: EventTarget | null): boolean => {
  if (!target || typeof target !== 'object' || !('closest' in target) || typeof target.closest !== 'function') {
    return false;
  }

  return Boolean(target.closest(MARKDOWN_ANNOTATION_OVERLAY_SELECTOR));
};
