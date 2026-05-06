type RectLike = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width?: number;
  height?: number;
};

export type MarqueeSelectionCandidate<TComponent> = {
  component: TComponent;
  element: {
    contains?: (node: any) => boolean;
    getBoundingClientRect: () => RectLike;
  };
  rect?: RectLike;
};

export type MarqueeSelectionBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export const MARQUEE_SELECTION_MIN_DISTANCE_PX = 6;
export const MARQUEE_SELECTION_MAX_COMPONENTS = 64;
const MARQUEE_SELECTION_COLLAPSE_DESCENDANT_COUNT = 8;

export function buildMarqueeSelectionBox(start: { x: number; y: number }, current: { x: number; y: number }): MarqueeSelectionBox {
  const left = Math.min(start.x, current.x);
  const top = Math.min(start.y, current.y);
  return {
    left,
    top,
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y),
  };
}

export function isMarqueeSelectionDistanceMet(
  start: { x: number; y: number },
  current: { x: number; y: number },
  minDistance = MARQUEE_SELECTION_MIN_DISTANCE_PX,
) {
  return Math.abs(current.x - start.x) >= minDistance || Math.abs(current.y - start.y) >= minDistance;
}

function rectHasArea(rect: RectLike) {
  return (rect.width ?? rect.right - rect.left) > 0 && (rect.height ?? rect.bottom - rect.top) > 0;
}

function isRectCenterInsideBox(rect: RectLike, box: MarqueeSelectionBox) {
  if (!rectHasArea(rect)) {
    return false;
  }

  const centerX = rect.left + ((rect.width ?? rect.right - rect.left) / 2);
  const centerY = rect.top + ((rect.height ?? rect.bottom - rect.top) / 2);
  return centerX >= box.left
    && centerX <= box.left + box.width
    && centerY >= box.top
    && centerY <= box.top + box.height;
}

function getHitAncestors(
  element: HTMLElement,
  hitElements: Set<HTMLElement>,
): Set<HTMLElement> {
  const ancestors = new Set<HTMLElement>();
  let current = element.parentElement;
  while (current) {
    if (hitElements.has(current)) {
      ancestors.add(current);
    }
    current = current.parentElement;
  }
  return ancestors;
}

function getCollapsedHitElements(
  ancestorsMap: Map<HTMLElement, Set<HTMLElement>>,
  ancestorCounts: Map<HTMLElement, number>,
) {
  const denseAncestors = new Set<HTMLElement>();

  for (const [ancestor, count] of ancestorCounts) {
    if (count >= MARQUEE_SELECTION_COLLAPSE_DESCENDANT_COUNT) {
      denseAncestors.add(ancestor);
    }
  }

  if (denseAncestors.size === 0) {
    return denseAncestors;
  }

  const denseAncestorsWithDenseDescendants = new Set<HTMLElement>();
  for (const denseElement of denseAncestors) {
    for (const ancestor of ancestorsMap.get(denseElement) ?? []) {
      if (denseAncestors.has(ancestor)) {
        denseAncestorsWithDenseDescendants.add(ancestor);
      }
    }
  }

  const collapsed = new Set<HTMLElement>();
  for (const ancestor of denseAncestors) {
    if (!denseAncestorsWithDenseDescendants.has(ancestor)) {
      collapsed.add(ancestor);
    }
  }

  return collapsed;
}

function hasCollapsedAncestor(
  element: HTMLElement,
  ancestorsMap: Map<HTMLElement, Set<HTMLElement>>,
  collapsedElements: Set<HTMLElement>,
) {
  for (const ancestor of ancestorsMap.get(element) ?? []) {
    if (collapsedElements.has(ancestor)) {
      return true;
    }
  }

  return false;
}

export function collectMarqueeSelectionComponents<TComponent>(
  candidates: readonly MarqueeSelectionCandidate<TComponent>[],
  box: MarqueeSelectionBox,
  maxComponents = MARQUEE_SELECTION_MAX_COMPONENTS,
): TComponent[] {
  const hits = candidates.filter((candidate) => isRectCenterInsideBox(candidate.rect ?? candidate.element.getBoundingClientRect(), box));

  const hitElements = new Set(hits.map((h) => h.element as HTMLElement));
  const ancestorsMap = new Map<HTMLElement, Set<HTMLElement>>();

  for (const hit of hits) {
    ancestorsMap.set(hit.element as HTMLElement, getHitAncestors(hit.element as HTMLElement, hitElements));
  }

  const ancestorCounts = new Map<HTMLElement, number>();
  for (const [, ancestors] of ancestorsMap) {
    for (const ancestor of ancestors) {
      ancestorCounts.set(ancestor, (ancestorCounts.get(ancestor) ?? 0) + 1);
    }
  }

  const collapsedElements = getCollapsedHitElements(ancestorsMap, ancestorCounts);
  const selectionHits = hits.filter((candidate) => {
    const element = candidate.element as HTMLElement;
    if (collapsedElements.has(element)) {
      return true;
    }

    if (hasCollapsedAncestor(element, ancestorsMap, collapsedElements)) {
      return false;
    }

    return !ancestorCounts.has(element);
  });

  const seen = new Set<TComponent>();
  const selected: TComponent[] = [];

  for (const hit of selectionHits) {
    if (seen.has(hit.component)) {
      continue;
    }

    seen.add(hit.component);
    selected.push(hit.component);

    if (selected.length >= maxComponents) {
      break;
    }
  }

  return selected;
}
