import { parse } from 'parse5';

export type SourceLocationIdentity = {
  componentId: string | null;
  fingerprint: string | null;
  domPath: string | null;
};

export type SourceLocationEntry = {
  componentId: string | null;
  fingerprint: string;
  domPath: string;
  tagName: string;
  attributes: Record<string, string>;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

export type SourceLocationMap =
  | {
      status: 'ready';
      revision: number;
      entries: SourceLocationEntry[];
      parseErrors: string[];
    }
  | {
      status: 'unavailable';
      revision: number;
      reason: string;
      entries: SourceLocationEntry[];
      parseErrors: string[];
    };

export type SourceCursorPosition = {
  line: number;
  column: number;
  offset?: number;
};

type DomPathElement = {
  tagName: string;
  parentElement: DomPathElement | null;
  children: ArrayLike<DomPathElement>;
};

const COMPONENT_ID_ATTRIBUTES = ['data-ccui-component-id', 'data-gjs-id'];
const FINGERPRINT_ATTRIBUTES = ['data-ccui-fingerprint'];
const DOM_PATH_ATTRIBUTES = ['data-ccui-dom-path'];
const RUNTIME_ONLY_ATTRIBUTE_PATTERNS = [
  /^data-gjs-/i,
];
const RUNTIME_ONLY_ATTRIBUTES = new Set([
  'contenteditable',
  'draggable',
  'spellcheck',
  'data-highlightable',
  'data-gjs-highlightable',
]);
export const FINGERPRINT_PRIORITY_ATTRIBUTES = [
  'id',
  'class',
  'name',
  'type',
  'role',
  'aria-label',
  'href',
  'src',
  'alt',
  'title',
];

function toAttributeRecord(attrs: Array<{ name: string; value: string }> | undefined): Record<string, string> {
  if (!attrs || attrs.length === 0) {
    return {};
  }

  return attrs.reduce<Record<string, string>>((result, attribute) => {
    result[attribute.name] = attribute.value;
    return result;
  }, {});
}

function readFirstNonEmptyAttribute(attributes: Record<string, string>, names: readonly string[]): string | null {
  for (const name of names) {
    const value = String(attributes[name] ?? '').trim();
    if (value) {
      return value;
    }
  }

  return null;
}

function stripRuntimeOnlyClassNames(value: string) {
  return value
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => !entry.startsWith('gjs-'))
    .join(' ');
}

export function sanitizeSourceLocationAttributes(attributes: Record<string, string>): Record<string, string> {
  return Object.entries(attributes).reduce<Record<string, string>>((result, [name, rawValue]) => {
    if (RUNTIME_ONLY_ATTRIBUTES.has(name) || RUNTIME_ONLY_ATTRIBUTE_PATTERNS.some((pattern) => pattern.test(name))) {
      return result;
    }

    const value = String(rawValue ?? '').trim();
    if (!value) {
      return result;
    }

    if (name === 'class') {
      const cleanedClassName = stripRuntimeOnlyClassNames(value);
      if (cleanedClassName) {
        result[name] = cleanedClassName;
      }
      return result;
    }

    result[name] = value;
    return result;
  }, {});
}

export function buildSourceLocationFingerprint(tagName: string, attributes: Record<string, string>): string {
  const sanitizedAttributes = sanitizeSourceLocationAttributes(attributes);
  const explicitFingerprint = readFirstNonEmptyAttribute(sanitizedAttributes, FINGERPRINT_ATTRIBUTES);
  if (explicitFingerprint) {
    return explicitFingerprint;
  }

  const priorityAttributes = FINGERPRINT_PRIORITY_ATTRIBUTES
    .map((name) => {
      const value = String(sanitizedAttributes[name] ?? '').trim();
      return value ? `${name}=${value}` : '';
    })
    .filter(Boolean)
    .join('|');

  const extraAttributes = Object.entries(sanitizedAttributes)
    .filter(([name, value]) => {
      if (!value.trim()) {
        return false;
      }

      return ![
        ...COMPONENT_ID_ATTRIBUTES,
        ...FINGERPRINT_ATTRIBUTES,
        ...DOM_PATH_ATTRIBUTES,
        ...FINGERPRINT_PRIORITY_ATTRIBUTES,
      ].includes(name);
    })
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}=${value}`)
    .join('|');

  return [tagName, priorityAttributes, extraAttributes].filter(Boolean).join('|');
}

function buildDomPath(tagName: string, parentPath: string, siblingIndex: number): string {
  const segment = siblingIndex >= 0 ? `${tagName}[${siblingIndex}]` : tagName;
  return parentPath ? `${parentPath} > ${segment}` : segment;
}

function buildLocationFromNode(node: any): SourceLocationEntry | null {
  const sourceCodeLocation = node?.sourceCodeLocation;
  if (!sourceCodeLocation) {
    return null;
  }

  const attributes = toAttributeRecord(node?.attrs);
  const componentId = readFirstNonEmptyAttribute(attributes, COMPONENT_ID_ATTRIBUTES);
  const domPath = readFirstNonEmptyAttribute(attributes, DOM_PATH_ATTRIBUTES) ?? '';

  return {
    componentId,
    fingerprint: buildSourceLocationFingerprint(node.tagName, attributes),
    domPath,
    tagName: String(node.tagName ?? '').toLowerCase(),
    attributes,
    startLine: sourceCodeLocation.startLine,
    startColumn: sourceCodeLocation.startCol,
    endLine: sourceCodeLocation.endLine,
    endColumn: sourceCodeLocation.endCol,
  };
}

export function buildSourceLocationDomPathFromElement(element: DomPathElement | null | undefined): string | null {
  if (!element || typeof element.tagName !== 'string') {
    return null;
  }

  const segments: string[] = [];
  let current: DomPathElement | null = element;
  while (current) {
    const tagName = current.tagName.toLowerCase();
    const parent: DomPathElement | null = current.parentElement;
    if (parent) {
      const sameTagSiblings = Array.from(parent.children as ArrayLike<DomPathElement>)
        .filter((child) => child.tagName.toLowerCase() === tagName);
      const siblingIndex = sameTagSiblings.indexOf(current);
      segments.push(sameTagSiblings.length > 1 ? `${tagName}[${Math.max(siblingIndex, 0)}]` : tagName);
    } else {
      segments.push(tagName);
    }
    current = parent;
  }

  return segments.reverse().join(' > ');
}

function chooseBestMatch(candidates: SourceLocationEntry[], domPath: string): SourceLocationEntry | null {
  if (candidates.length === 0) {
    return null;
  }

  if (candidates.length === 1) {
    return candidates[0] ?? null;
  }

  const nextDomPath = domPath.trim();
  if (!nextDomPath) {
    return null;
  }

  const narrowedCandidates = candidates.filter((entry) => entry.domPath === nextDomPath);
  if (narrowedCandidates.length === 1) {
    return narrowedCandidates[0] ?? null;
  }

  return null;
}

function parseFingerprint(fingerprint: string): { tagName: string; attributes: Record<string, string> } | null {
  const trimmed = fingerprint.trim();
  if (!trimmed) {
    return null;
  }

  const [tagName, ...attributeSegments] = trimmed.split('|');
  const nextTagName = String(tagName ?? '').trim().toLowerCase();
  if (!nextTagName) {
    return null;
  }

  const attributes = attributeSegments.reduce<Record<string, string>>((result, segment) => {
    const separatorIndex = segment.indexOf('=');
    if (separatorIndex <= 0) {
      return result;
    }

    const name = segment.slice(0, separatorIndex).trim();
    const value = segment.slice(separatorIndex + 1).trim();
    if (!name || !value) {
      return result;
    }

    result[name] = value;
    return result;
  }, {});

  return {
    tagName: nextTagName,
    attributes,
  };
}

function omitAttribute(attributes: Record<string, string>, attributeName: string) {
  const { [attributeName]: _omitted, ...rest } = attributes;
  return rest;
}

function normalizeDomPathSegment(segment: string) {
  return segment.trim().replace(/\[\d+\]/g, '');
}

function scoreDomPathSuffix(leftDomPath: string, rightDomPath: string, normalize = false): number {
  const leftSegments = leftDomPath
    .split('>')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => (normalize ? normalizeDomPathSegment(segment) : segment));
  const rightSegments = rightDomPath
    .split('>')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => (normalize ? normalizeDomPathSegment(segment) : segment));

  let score = 0;
  let leftIndex = leftSegments.length - 1;
  let rightIndex = rightSegments.length - 1;

  while (leftIndex >= 0 && rightIndex >= 0) {
    if (leftSegments[leftIndex] !== rightSegments[rightIndex]) {
      break;
    }

    score += 1;
    leftIndex -= 1;
    rightIndex -= 1;
  }

  return score;
}

function chooseBestLooseFingerprintMatch(
  candidates: SourceLocationEntry[],
  identity: SourceLocationIdentity,
): SourceLocationEntry | null {
  if (candidates.length === 0) {
    return null;
  }

  if (candidates.length === 1) {
    return candidates[0] ?? null;
  }

  const domPath = String(identity.domPath ?? '').trim();
  let bestCandidate: SourceLocationEntry | null = null;
  let bestScore = -1;
  let hasTie = false;

  for (const candidate of candidates) {
    const exactSuffix = domPath ? scoreDomPathSuffix(domPath, candidate.domPath, false) : 0;
    const normalizedSuffix = domPath ? scoreDomPathSuffix(domPath, candidate.domPath, true) : 0;
    const score = (normalizedSuffix * 100) + exactSuffix;

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
      hasTie = false;
      continue;
    }

    if (score === bestScore) {
      hasTie = true;
    }
  }

  if (!bestCandidate) {
    return null;
  }

  if (bestScore <= 0) {
    return null;
  }

  return hasTie ? null : bestCandidate;
}

function findLooseFingerprintMatch(
  mapping: SourceLocationMap & { status: 'ready' },
  identity: SourceLocationIdentity,
): SourceLocationEntry | null {
  const parsedFingerprint = parseFingerprint(String(identity.fingerprint ?? ''));
  if (!parsedFingerprint) {
    return null;
  }

  const attributesWithoutId = omitAttribute(parsedFingerprint.attributes, 'id');
  if (Object.keys(attributesWithoutId).length === Object.keys(parsedFingerprint.attributes).length) {
    return null;
  }

  const looseFingerprint = buildSourceLocationFingerprint(parsedFingerprint.tagName, attributesWithoutId);
  const candidates = mapping.entries.filter((entry) => {
    if (entry.tagName !== parsedFingerprint.tagName) {
      return false;
    }

    const entryLooseFingerprint = buildSourceLocationFingerprint(
      entry.tagName,
      omitAttribute(entry.attributes, 'id'),
    );

    return entryLooseFingerprint === looseFingerprint;
  });

  return chooseBestLooseFingerprintMatch(candidates, identity);
}

function collectEntries(node: any, parentPath = '', entries: SourceLocationEntry[] = []): SourceLocationEntry[] {
  const childNodes = (Array.isArray(node?.childNodes) ? node.childNodes : []) as any[];
  const siblingTotals = childNodes.reduce((counts: Map<string, number>, childNode: any) => {
    if (childNode && typeof childNode === 'object' && typeof childNode.tagName === 'string') {
      const tagName = String(childNode.tagName).toLowerCase();
      counts.set(tagName, (counts.get(tagName) ?? 0) + 1);
    }

    return counts;
  }, new Map<string, number>());
  const siblingCounts = new Map<string, number>();

  for (const childNode of childNodes) {
    if (!childNode || typeof childNode !== 'object') {
      continue;
    }

    if (typeof childNode.tagName === 'string') {
      const tagName = String(childNode.tagName).toLowerCase();
      const siblingIndex = siblingCounts.get(tagName) ?? 0;
      siblingCounts.set(tagName, siblingIndex + 1);
      const totalCount = siblingTotals.get(tagName) ?? 0;

      const nextPath = buildDomPath(tagName, parentPath, totalCount > 1 ? siblingIndex : -1);
      const entry = buildLocationFromNode(childNode);

      if (entry) {
        entries.push({
          ...entry,
          domPath: entry.domPath || nextPath,
        });
      }

      if (tagName === 'template' && childNode.content) {
        collectEntries(childNode.content, nextPath, entries);
      } else {
        collectEntries(childNode, nextPath, entries);
      }
    }
  }

  return entries;
}

export function buildSourceLocationMap(html: string, revision = 0): SourceLocationMap {
  if (!String(html ?? '').trim()) {
    return {
      status: 'unavailable',
      revision,
      reason: 'empty html input',
      entries: [],
      parseErrors: [],
    };
  }

  const parseErrors: string[] = [];
  const document = parse(html, {
    sourceCodeLocationInfo: true,
    onParseError: (error) => {
      parseErrors.push(String(error?.code ?? 'parse-error'));
    },
  });

  const entries = collectEntries(document);

  if (entries.length === 0) {
    return {
      status: 'unavailable',
      revision,
      reason: parseErrors.length > 0 ? `no source locations available (${parseErrors[0]})` : 'no source locations available',
      entries: [],
      parseErrors,
    };
  }

  return {
    status: 'ready',
    revision,
    entries,
    parseErrors,
  };
}

export function findSourceLocationByIdentity(
  mapping: SourceLocationMap,
  identity: SourceLocationIdentity,
): SourceLocationEntry | null {
  if (mapping.status !== 'ready') {
    return null;
  }

  const componentId = String(identity.componentId ?? '').trim();
  const fingerprint = String(identity.fingerprint ?? '').trim();
  const domPath = String(identity.domPath ?? '').trim();

  if (componentId) {
    const byComponentId = chooseBestMatch(
      mapping.entries.filter((entry) => entry.componentId === componentId),
      domPath,
    );
    if (byComponentId) {
      return byComponentId;
    }
  }

  if (fingerprint) {
    const byFingerprint = chooseBestMatch(
      mapping.entries.filter((entry) => entry.fingerprint === fingerprint),
      domPath,
    );
    if (byFingerprint) {
      return byFingerprint;
    }
  }

  if (domPath) {
    const byDomPath = chooseBestMatch(
      mapping.entries.filter((entry) => entry.domPath === domPath),
      domPath,
    );
    if (byDomPath) {
      return byDomPath;
    }
  }

  const byLooseFingerprint = findLooseFingerprintMatch(mapping, identity);
  if (byLooseFingerprint) {
    return byLooseFingerprint;
  }

  return null;
}

function compareLocation(leftLine: number, leftColumn: number, rightLine: number, rightColumn: number): number {
  if (leftLine !== rightLine) {
    return leftLine - rightLine;
  }

  return leftColumn - rightColumn;
}

function getCursorBoundaryDistance(entry: SourceLocationEntry, position: SourceCursorPosition): number {
  const startsBeforeCursor = compareLocation(entry.startLine, entry.startColumn, position.line, position.column) <= 0;
  const endsAfterCursor = compareLocation(entry.endLine, entry.endColumn, position.line, position.column) >= 0;

  if (startsBeforeCursor && endsAfterCursor) {
    return 0;
  }

  const beforeStart = compareLocation(position.line, position.column, entry.startLine, entry.startColumn) < 0;
  if (beforeStart) {
    return ((entry.startLine - position.line) * 1000) + Math.abs(entry.startColumn - position.column);
  }

  return ((position.line - entry.endLine) * 1000) + Math.abs(position.column - entry.endColumn);
}

export function findNearestSourceLocationEntry(
  mapping: SourceLocationMap,
  position: SourceCursorPosition,
): SourceLocationEntry | null {
  if (mapping.status !== 'ready' || mapping.entries.length === 0) {
    return null;
  }

  let bestEntry: SourceLocationEntry | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const entry of mapping.entries) {
    const nextDistance = getCursorBoundaryDistance(entry, position);
    if (nextDistance < bestDistance) {
      bestDistance = nextDistance;
      bestEntry = entry;
      continue;
    }

    if (nextDistance === bestDistance && bestEntry) {
      const currentSpan = compareLocation(bestEntry.endLine, bestEntry.endColumn, bestEntry.startLine, bestEntry.startColumn);
      const nextSpan = compareLocation(entry.endLine, entry.endColumn, entry.startLine, entry.startColumn);
      if (nextSpan < currentSpan) {
        bestEntry = entry;
      }
    }
  }

  return bestEntry;
}
