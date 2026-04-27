// @ts-ignore - Node's strip-types runtime resolves the .ts specifier; tsc flags it without this hint.
import { EMPTY_LAYER_NODE, type LayerNode, type LayerNodeViewModel, type LayerSnapshot, type LayerSource } from './types.ts';

const LAYER_TYPE_LABELS: Record<string, string> = {
  div: '容器',
  section: '区块',
  main: '主内容',
  header: '页眉',
  footer: '页脚',
  nav: '导航',
  article: '文章',
  aside: '侧边栏',
  button: '按钮',
  image: '图片',
  img: '图片',
  text: '文本',
  span: '行内',
  link: '链接',
  a: '链接',
  video: '视频',
  ul: '无序列表',
  ol: '有序列表',
  li: '列表项',
  table: '表格',
  tbody: '表体',
  thead: '表头',
  tfoot: '表尾',
  row: '行',
  cell: '单元格',
};

function translateLayerType(type: string): string {
  return LAYER_TYPE_LABELS[type.toLowerCase()] ?? type;
}

function createLayerLabel(source: LayerSource): string {
  const label = String(source.label ?? '').trim();
  const type = String(source.type ?? source.name ?? '').trim();
  const id = String(source.id ?? '').trim();

  if (label) {
    const translated = label.replace(
      /^(div|section|main|header|footer|nav|article|aside|button|image|img|text|span|link|a|video|ul|ol|li|table|tbody|thead|tfoot|row|cell)(\s*#)/i,
      (_, rawType, suffix) => `${translateLayerType(rawType)}${suffix}`,
    );
    if (translated !== label) {
      return translated;
    }

    return label;
  }

  if (type && id) {
    return `${translateLayerType(type)} #${id}`;
  }

  return translateLayerType(type) || id || '组件';
}

export function readLayerTree(source: LayerSource | null | undefined): LayerNode {
  if (!source) {
    return { ...EMPTY_LAYER_NODE, children: [] };
  }

  const children = Array.isArray(source.children)
    ? source.children.map((child) => readLayerTree(child))
    : [];

  return {
    id: String(source.id ?? ''),
    label: createLayerLabel(source),
    visible: source.visible ?? true,
    selected: source.selected ?? false,
    expanded: source.expanded ?? children.length > 0,
    canExpand: source.canExpand ?? children.length > 0,
    children,
  };
}

function collectLayerMetadata(nodes: LayerNodeViewModel[], result: Pick<LayerSnapshot, 'selectedLayerIds' | 'expandedLayerIds'>) {
  nodes.forEach((node) => {
    if (node.selected) {
      result.selectedLayerIds.push(node.id);
    }
    if (node.expanded) {
      result.expandedLayerIds.push(node.id);
    }
    collectLayerMetadata(node.children, result);
  });
}

export function readLayerSnapshot(source: { roots?: readonly LayerSource[] | null } | null | undefined): LayerSnapshot {
  const roots = Array.isArray(source?.roots) ? source.roots.map((entry) => readLayerTree(entry)) : [];
  const result = {
    roots,
    selectedLayerIds: [],
    expandedLayerIds: [],
    sortable: roots.length > 0,
  };
  collectLayerMetadata(roots, result);
  return result;
}
