export type UnitValue = {
  value: string;
  unit: string;
};

export type InspectorSelection = {
  selectedIds: string[];
  primarySelectedId: string | null;
  selectedLabel: string;
  isMultiSelection: boolean;
  isDetached: boolean;
};

export type InspectorStateOption = {
  id: string;
  label: string;
};

export type InspectorClassViewModel = {
  name: string;
  isPrivate?: boolean;
};

export type BoxValue = {
  top: string;
  right: string;
  bottom: string;
  left: string;
  unit: string;
};

export type RadiusValue = {
  topLeft: string;
  topRight: string;
  bottomRight: string;
  bottomLeft: string;
  unit: string;
};

export type BorderValue = BoxValue & {
  style: string;
  color: string;
};

export type ShadowLayerType = 'outside' | 'inset';

export type ShadowLayerValue = {
  horizontal: UnitValue;
  vertical: UnitValue;
  blur: UnitValue;
  spread: UnitValue;
  color: string;
  type: ShadowLayerType;
};

export type StackValue<TLayer> = {
  layers: TLayer[];
};

export type ShadowValue = StackValue<ShadowLayerValue>;

export type ShadowStackValue = ShadowValue;

export type StackLayer = ShadowLayerValue;

export type ShadowLayer = ShadowLayerValue;

export type BoxShadowValue = ShadowValue;

export type TransitionLayerValue = {
  property: string;
  duration: UnitValue;
  timingFunction: string;
};

export type TransitionValue = StackValue<TransitionLayerValue>;

export type TransformLayerValue = {
  functionName: string;
  argument: string;
};

export type TransformValue = StackValue<TransformLayerValue>;

export type SelectorState = {
  selectedLabel: string;
  activeState: string;
  classTags: string[];
};

export type SelectorSnapshot = {
  availableStates: InspectorStateOption[];
  activeState: string;
  commonClasses: InspectorClassViewModel[];
  canAddClass: boolean;
  canRemoveClass: boolean;
  canSyncStyle: boolean;
};

export type SelectorSource = {
  name?: string;
  label?: string;
  type?: string;
  id?: string;
  state?: string | null;
  classes?: readonly string[] | string | null;
};

export type StyleSectorKey = 'layout' | 'flex' | 'spacing' | 'text' | 'appearance' | 'advanced';

export type StyleSector = {
  key: StyleSectorKey;
  title: string;
};

export type StyleValueState<TValue> = {
  committed: TValue;
  draft?: TValue;
  mixed?: boolean;
  disabled?: boolean;
};

export type StylePropertyKind = 'number' | 'select' | 'radio' | 'composite' | 'color' | 'text' | 'shadow' | 'stack';

export type StyleOption = {
  value: string;
  label: string;
  icon?: string;
};

export type StylePropertyViewModel = {
  property: string;
  label: string;
  kind: StylePropertyKind;
  value: StyleValueState<unknown>;
  options?: Array<string | StyleOption>;
  units?: string[];
  placeholder?: string;
};

export type StyleSectorViewModel = {
  key: StyleSectorKey;
  title: string;
  properties: StylePropertyViewModel[];
};

export type StyleSnapshot = {
  targetKind: 'rule' | 'inline';
  sectors: StyleSectorViewModel[];
  hasMixedValues: boolean;
  editable: boolean;
};

export const STYLE_SECTORS = [
  { key: 'layout', title: '布局' },
  { key: 'flex', title: '弹性布局' },
  { key: 'spacing', title: '间距' },
  { key: 'text', title: '文本' },
  { key: 'appearance', title: '外观' },
  { key: 'advanced', title: '高级' },
] as const satisfies readonly StyleSector[];

export type StyleState = {
  layout: {
    display: UnitValue;
    float: UnitValue;
    position: UnitValue;
    inset: BoxValue;
    zIndex: UnitValue;
    width: UnitValue;
    height: UnitValue;
    maxWidth: UnitValue;
    minHeight: UnitValue;
  };
  flex: {
    flexDirection: UnitValue;
    flexWrap: UnitValue;
    justifyContent: UnitValue;
    alignItems: UnitValue;
    alignContent: UnitValue;
    order: UnitValue;
    flexBasis: UnitValue;
    flexGrow: UnitValue;
    flexShrink: UnitValue;
    alignSelf: UnitValue;
  };
  spacing: {
    margin: BoxValue;
    padding: BoxValue;
  };
  text: {
    color: UnitValue;
    fontFamily: UnitValue;
    fontSize: UnitValue;
    fontWeight: UnitValue;
    letterSpacing: UnitValue;
    lineHeight: UnitValue;
    textAlign: UnitValue;
  };
  appearance: {
    backgroundColor: UnitValue;
    border: BorderValue;
    borderRadius: RadiusValue;
    boxShadow: BoxShadowValue;
    opacity: UnitValue;
  };
  advanced: {
    transition: TransitionValue;
    transform: TransformValue;
    perspective: UnitValue;
  };
};

export type StyleStatePatch = {
  layout?: Partial<{
    display: Partial<UnitValue>;
    float: Partial<UnitValue>;
    position: Partial<UnitValue>;
    inset: Partial<BoxValue>;
    zIndex: Partial<UnitValue>;
    width: Partial<UnitValue>;
    height: Partial<UnitValue>;
    maxWidth: Partial<UnitValue>;
    minHeight: Partial<UnitValue>;
  }>;
  flex?: Partial<Record<keyof StyleState['flex'], Partial<UnitValue>>>;
  spacing?: Partial<{
    margin: Partial<BoxValue>;
    padding: Partial<BoxValue>;
  }>;
  text?: Partial<{
    color: Partial<UnitValue>;
    fontFamily: Partial<UnitValue>;
    fontSize: Partial<UnitValue>;
    fontWeight: Partial<UnitValue>;
    letterSpacing: Partial<UnitValue>;
    lineHeight: Partial<UnitValue>;
    textAlign: Partial<UnitValue>;
  }>;
  appearance?: Partial<{
    backgroundColor: Partial<UnitValue>;
    border: Partial<BorderValue>;
    borderRadius: Partial<RadiusValue>;
    boxShadow: Partial<BoxShadowValue>;
    opacity: Partial<UnitValue>;
  }>;
  advanced?: Partial<{
    transition: Partial<TransitionValue>;
    transform: Partial<TransformValue>;
    perspective: Partial<UnitValue>;
  }>;
};

export type LayerSource = {
  label?: string;
  name?: string;
  type?: string;
  id?: string;
  visible?: boolean;
  selected?: boolean;
  expanded?: boolean;
  canExpand?: boolean;
  children?: readonly LayerSource[] | null;
};

export type LayerNode = {
  id: string;
  label: string;
  visible: boolean;
  selected: boolean;
  expanded: boolean;
  canExpand: boolean;
  children: LayerNode[];
};

export type LayerNodeViewModel = {
  id: string;
  label: string;
  visible: boolean;
  selected: boolean;
  expanded: boolean;
  canExpand: boolean;
  children: LayerNodeViewModel[];
};

export type LayerSnapshot = {
  roots: LayerNodeViewModel[];
  selectedLayerIds: string[];
  expandedLayerIds: string[];
  sortable: boolean;
};

export type InspectorSnapshot = {
  selection: InspectorSelection;
  selector: SelectorSnapshot;
  style: StyleSnapshot;
  layers: LayerSnapshot;
  capabilities: {
    canEditSelectors: boolean;
    canEditStyles: boolean;
    canEditLayers: boolean;
  };
};

export const EMPTY_SELECTOR_STATE: SelectorState = {
  selectedLabel: '',
  activeState: '',
  classTags: [],
};

export const EMPTY_INSPECTOR_SELECTION: InspectorSelection = {
  selectedIds: [],
  primarySelectedId: null,
  selectedLabel: '',
  isMultiSelection: false,
  isDetached: false,
};

export const EMPTY_SELECTOR_SNAPSHOT: SelectorSnapshot = {
  availableStates: [{ id: '', label: '默认状态' }],
  activeState: '',
  commonClasses: [],
  canAddClass: true,
  canRemoveClass: true,
  canSyncStyle: false,
};

export const EMPTY_STYLE_STATE: StyleState = {
  layout: {
    display: { value: '', unit: '' },
    float: { value: '', unit: '' },
    position: { value: '', unit: '' },
    inset: { top: '', right: '', bottom: '', left: '', unit: '' },
    zIndex: { value: '', unit: '' },
    width: { value: '', unit: '' },
    height: { value: '', unit: '' },
    maxWidth: { value: '', unit: '' },
    minHeight: { value: '', unit: '' },
  },
  flex: {
    flexDirection: { value: '', unit: '' },
    flexWrap: { value: '', unit: '' },
    justifyContent: { value: '', unit: '' },
    alignItems: { value: '', unit: '' },
    alignContent: { value: '', unit: '' },
    order: { value: '', unit: '' },
    flexBasis: { value: '', unit: '' },
    flexGrow: { value: '', unit: '' },
    flexShrink: { value: '', unit: '' },
    alignSelf: { value: '', unit: '' },
  },
  spacing: {
    margin: { top: '', right: '', bottom: '', left: '', unit: '' },
    padding: { top: '', right: '', bottom: '', left: '', unit: '' },
  },
  text: {
    color: { value: '', unit: '' },
    fontFamily: { value: '', unit: '' },
    fontSize: { value: '', unit: '' },
    fontWeight: { value: '', unit: '' },
    letterSpacing: { value: '', unit: '' },
    lineHeight: { value: '', unit: '' },
    textAlign: { value: '', unit: '' },
  },
  appearance: {
    backgroundColor: { value: '', unit: '' },
    border: {
      top: '', right: '', bottom: '', left: '', unit: '', style: '', color: '',
    },
    borderRadius: {
      topLeft: '',
      topRight: '',
      bottomRight: '',
      bottomLeft: '',
      unit: '',
    },
    boxShadow: { layers: [] },
    opacity: { value: '', unit: '' },
  },
  advanced: {
    transition: { layers: [] },
    transform: { layers: [] },
    perspective: { value: '', unit: '' },
  },
};

export const EMPTY_LAYER_NODE: LayerNode = {
  id: '',
  label: '',
  visible: true,
  selected: false,
  expanded: false,
  canExpand: false,
  children: [],
};

export const EMPTY_LAYER_SNAPSHOT: LayerSnapshot = {
  roots: [],
  selectedLayerIds: [],
  expandedLayerIds: [],
  sortable: false,
};

export const EMPTY_STYLE_SNAPSHOT: StyleSnapshot = {
  targetKind: 'inline',
  sectors: [],
  hasMixedValues: false,
  editable: true,
};

export const EMPTY_INSPECTOR_SNAPSHOT: InspectorSnapshot = {
  selection: EMPTY_INSPECTOR_SELECTION,
  selector: EMPTY_SELECTOR_SNAPSHOT,
  style: EMPTY_STYLE_SNAPSHOT,
  layers: EMPTY_LAYER_SNAPSHOT,
  capabilities: {
    canEditSelectors: true,
    canEditStyles: true,
    canEditLayers: true,
  },
};
