export const MIN_MERMAID_SCALE = 0.2;
export const MAX_MERMAID_SCALE = 3;

export type MermaidViewport = {
  scale: number;
  x: number;
  y: number;
};

type FitViewportInput = {
  containerWidth: number;
  containerHeight: number;
  contentWidth: number;
  contentHeight: number;
  padding: number;
};

type CenteredViewportInput = {
  containerWidth: number;
  containerHeight: number;
  contentWidth: number;
  contentHeight: number;
  scale: number;
};

type WheelZoomViewportInput = MermaidViewport & {
  pointerX: number;
  pointerY: number;
  deltaY: number;
};

export const clampMermaidScale = (scale: number): number =>
  Math.min(MAX_MERMAID_SCALE, Math.max(MIN_MERMAID_SCALE, scale));

export const computeCenteredViewport = ({
  containerWidth,
  containerHeight,
  contentWidth,
  contentHeight,
  scale,
}: CenteredViewportInput): MermaidViewport => {
  const nextScale = clampMermaidScale(scale);
  return {
    scale: nextScale,
    x: (containerWidth - (contentWidth * nextScale)) / 2,
    y: (containerHeight - (contentHeight * nextScale)) / 2,
  };
};

export const computeFitViewport = ({
  containerWidth,
  containerHeight,
  contentWidth,
  contentHeight,
  padding,
}: FitViewportInput): MermaidViewport => {
  const usableWidth = Math.max(containerWidth - (padding * 2), 1);
  const usableHeight = Math.max(containerHeight - (padding * 2), 1);
  const widthScale = usableWidth / Math.max(contentWidth, 1);
  const heightScale = usableHeight / Math.max(contentHeight, 1);
  const scale = Math.min(widthScale, heightScale, 1);

  return computeCenteredViewport({
    containerWidth,
    containerHeight,
    contentWidth,
    contentHeight,
    scale,
  });
};

export const computeWheelZoomViewport = ({
  pointerX,
  pointerY,
  deltaY,
  scale,
  x,
  y,
}: WheelZoomViewportInput): MermaidViewport => {
  const zoomFactor = deltaY < 0 ? 1.1 : 0.9;
  const nextScale = clampMermaidScale(scale * zoomFactor);

  if (nextScale === scale) {
    return { scale, x, y };
  }

  const contentX = (pointerX - x) / scale;
  const contentY = (pointerY - y) / scale;

  return {
    scale: nextScale,
    x: pointerX - (contentX * nextScale),
    y: pointerY - (contentY * nextScale),
  };
};
