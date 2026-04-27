import {
  useEffect,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  clampMermaidScale,
  computeCenteredViewport,
  computeFitViewport,
  type MermaidViewport,
} from './mermaidViewport';
import { MERMAID_RENDER_CONFIG } from './mermaidRenderConfig.ts';
import { normalizeMermaidSvgElement } from './mermaidSvgPresentation';

type MermaidBlockProps = {
  chart: string;
  className?: string;
} & HTMLAttributes<HTMLDivElement>;

let mermaidInitialized = false;

const ensureMermaidInitialized = (mermaidApi: {
  initialize: (config: Record<string, unknown>) => void;
}) => {
  if (mermaidInitialized) {
    return;
  }

  mermaidApi.initialize(MERMAID_RENDER_CONFIG);
  mermaidInitialized = true;
};

export default function MermaidBlock({
  chart,
  className = '',
  ...props
}: MermaidBlockProps) {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [viewport, setViewport] = useState<MermaidViewport>({ scale: 1, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const reactId = useId();
  const renderId = `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const resetViewport = () => {
    const measurement = getDiagramMeasurement();
    if (!measurement) {
      return;
    }

    setViewport(
      computeFitViewport({
        containerWidth: measurement.containerWidth,
        containerHeight: measurement.containerHeight,
        contentWidth: measurement.contentWidth,
        contentHeight: measurement.contentHeight,
        padding: 24,
      }),
    );
  };

  const getDiagramMeasurement = () => {
    const container = containerRef.current;
    const svgElement = container?.querySelector('svg') as SVGSVGElement | null | undefined;
    const normalizedSvg = normalizeMermaidSvgElement(svgElement);

    if (!container || !normalizedSvg) {
      return null;
    }

    return {
      containerWidth: container.clientWidth,
      containerHeight: container.clientHeight,
      contentWidth: normalizedSvg.contentWidth,
      contentHeight: normalizedSvg.contentHeight,
    };
  };

  useEffect(() => {
    let cancelled = false;

    const renderChart = async () => {
      try {
        const mermaidModule = await import('mermaid');
        const mermaidApi = mermaidModule.default;
        ensureMermaidInitialized(mermaidApi);
        const { svg: renderedSvg } = await mermaidApi.render(renderId, chart);

        if (!cancelled) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (renderError) {
        if (!cancelled) {
          setSvg('');
          setError(renderError instanceof Error ? renderError.message : 'Mermaid render failed');
        }
      }
    };

    void renderChart();

    return () => {
      cancelled = true;
    };
  }, [chart, renderId]);

  useEffect(() => {
    if (!svg || error) {
      return;
    }

    resetViewport();

    const handleResize = () => {
      resetViewport();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [svg, error]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!svg) {
      return;
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: viewport.x,
      originY: viewport.y,
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    setViewport((current) => ({
      ...current,
      x: dragState.originX + (event.clientX - dragState.startX),
      y: dragState.originY + (event.clientY - dragState.startY),
    }));
  };

  const endDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    dragStateRef.current = null;
    setIsDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleZoom = (factor: number) => {
    setViewport((current) => ({
      ...current,
      scale: clampMermaidScale(current.scale * factor),
    }));
  };

  const handleActualSize = () => {
    const measurement = getDiagramMeasurement();
    if (!measurement) {
      return;
    }

    setViewport(
      computeCenteredViewport({
        containerWidth: measurement.containerWidth,
        containerHeight: measurement.containerHeight,
        contentWidth: measurement.contentWidth,
        contentHeight: measurement.contentHeight,
        scale: 1,
      }),
    );
  };

  const handleFitWidth = () => {
    const measurement = getDiagramMeasurement();
    if (!measurement) {
      return;
    }

    setViewport(
      computeCenteredViewport({
        containerWidth: measurement.containerWidth,
        containerHeight: measurement.containerHeight,
        contentWidth: measurement.contentWidth,
        contentHeight: measurement.contentHeight,
        scale: measurement.containerWidth / Math.max(measurement.contentWidth, 1),
      }),
    );
  };

  if (error) {
    return (
      <div
        {...props}
        data-mermaid-block="true"
        data-mermaid-error="true"
        className={`my-2 overflow-x-auto rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200 ${className}`}
      >
        <div className="mb-2 font-medium">Mermaid render failed</div>
        <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs">{chart}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div
        {...props}
        data-mermaid-block="true"
        className={`my-2 overflow-x-auto rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 ${className}`}
      >
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Mermaid
        </div>
        <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-slate-600 dark:text-slate-300">{chart}</pre>
      </div>
    );
  }

  return (
    <div
      {...props}
      data-mermaid-block="true"
      className={`my-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 ${className}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span>拖拽平移，按钮缩放</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded border border-slate-200 px-2 py-1 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
            onClick={handleFitWidth}
          >
            适配宽度
          </button>
          <button
            type="button"
            className="rounded border border-slate-200 px-2 py-1 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
            onClick={handleActualSize}
          >
            100%
          </button>
          <button
            type="button"
            className="rounded border border-slate-200 px-2 py-1 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
            onClick={() => handleZoom(0.9)}
          >
            -
          </button>
          <button
            type="button"
            className="rounded border border-slate-200 px-2 py-1 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
            onClick={resetViewport}
          >
            重置
          </button>
          <button
            type="button"
            className="rounded border border-slate-200 px-2 py-1 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
            onClick={() => handleZoom(1.1)}
          >
            +
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        className={`relative h-[70vh] min-h-[420px] overflow-hidden rounded-md bg-slate-50 dark:bg-slate-950 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDragging}
        onPointerCancel={endDragging}
        onDoubleClick={resetViewport}
      >
        <div
          className="absolute left-0 top-0 origin-top-left select-none"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  );
}
