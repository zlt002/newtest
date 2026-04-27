type MermaidSvgLike = {
  style: {
    width: string;
    height: string;
    maxWidth: string;
    display: string;
  };
  viewBox?: {
    baseVal?: {
      width?: number;
      height?: number;
    };
  };
  getBoundingClientRect: () => {
    width: number;
    height: number;
  };
};

export const normalizeMermaidSvgElement = (
  svgElement: MermaidSvgLike | null | undefined,
): { contentWidth: number; contentHeight: number } | null => {
  if (!svgElement) {
    return null;
  }

  const viewBox = svgElement.viewBox?.baseVal;
  const rect = svgElement.getBoundingClientRect();
  const contentWidth = viewBox?.width || rect.width || 0;
  const contentHeight = viewBox?.height || rect.height || 0;

  if (!contentWidth || !contentHeight) {
    return null;
  }

  svgElement.style.width = `${contentWidth}px`;
  svgElement.style.height = `${contentHeight}px`;
  svgElement.style.maxWidth = 'none';
  svgElement.style.display = 'block';

  return {
    contentWidth,
    contentHeight,
  };
};
