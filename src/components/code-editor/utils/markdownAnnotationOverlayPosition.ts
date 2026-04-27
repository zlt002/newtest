export type PreviewPosition = {
  x: number;
  y: number;
};

export type PreviewContainerRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export const VIEWPORT_PADDING = 12;

export const calculateViewportSafePosition = (
  position: PreviewPosition,
  width: number,
  viewportWidth: number,
  viewportHeight: number,
  height = 220,
): PreviewPosition => ({
  x: Math.max(VIEWPORT_PADDING, Math.min(position.x, viewportWidth - width - VIEWPORT_PADDING)),
  y: Math.max(VIEWPORT_PADDING, Math.min(position.y, viewportHeight - height - VIEWPORT_PADDING)),
});

export const calculatePreviewCenteredPosition = (
  container: PreviewContainerRect | null,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
): PreviewPosition => {
  if (!container) {
    return calculateViewportSafePosition(
      {
        x: (viewportWidth - width) / 2,
        y: (viewportHeight - height) / 2,
      },
      width,
      viewportWidth,
      viewportHeight,
      height,
    );
  }

  const visibleLeft = Math.max(container.left, VIEWPORT_PADDING);
  const visibleTop = Math.max(container.top, VIEWPORT_PADDING);
  const visibleRight = Math.min(container.left + container.width, viewportWidth - VIEWPORT_PADDING);
  const visibleBottom = Math.min(container.top + container.height, viewportHeight - VIEWPORT_PADDING);

  const visibleWidth = Math.max(0, visibleRight - visibleLeft);
  const visibleHeight = Math.max(0, visibleBottom - visibleTop);

  return calculateViewportSafePosition(
    {
      x: visibleLeft + Math.max(0, (visibleWidth - width) / 2),
      y: visibleTop + Math.max(0, (visibleHeight - height) / 2),
    },
    width,
    viewportWidth,
    viewportHeight,
    height,
  );
};
