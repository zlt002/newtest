import { useEffect, useState } from 'react';
import type { InspectorSelection, SelectorSnapshot, StylePropertyViewModel, StyleSectorKey, StyleSnapshot } from '../types';
import GrapesLikeSelectorManager from '../selector/GrapesLikeSelectorManager';
import GrapesLikeProperty from './GrapesLikeProperty';
import GrapesLikeSector from './GrapesLikeSector';

type GrapesLikeStyleManagerProps = {
  selection?: InspectorSelection;
  selector?: SelectorSnapshot;
  style: StyleSnapshot;
  actions: {
    selector?: {
      addClass: (className: string) => void;
      removeClass: (className: string) => void;
      setState: (state: string) => void;
    };
    updateStyle?: (input: { property: string; value: string; targetKind: 'rule' | 'inline' }) => void;
    style?: {
      updateStyle: (input: { property: string; value: string; targetKind: 'rule' | 'inline' }) => void;
    };
  };
};

type SectorState = Record<StyleSectorKey, boolean>;

const DEFAULT_SECTOR_STATE: SectorState = {
  layout: true,
  flex: false,
  spacing: true,
  text: true,
  appearance: true,
  advanced: false,
};

function readPropertyStringValue(property: StylePropertyViewModel | undefined): string {
  const committed = property?.value?.committed;
  if (typeof committed === 'string') {
    return committed;
  }

  if (committed && typeof committed === 'object' && 'value' in committed) {
    return String((committed as { value?: string }).value ?? '');
  }

  return '';
}

function shouldAutoExpandFlex(style: StyleSnapshot): boolean {
  const layout = style.sectors.find((sector) => sector.key === 'layout');
  const display = layout?.properties.find((property) => property.property === 'display');
  return readPropertyStringValue(display) === 'flex';
}

function shouldShowLayoutPositionProperties(style: StyleSnapshot): boolean {
  const layout = style.sectors.find((sector) => sector.key === 'layout');
  const position = layout?.properties.find((property) => property.property === 'position');
  const positionValue = readPropertyStringValue(position);
  return positionValue === 'absolute' || positionValue === 'fixed';
}

function createSectorState(style: StyleSnapshot): SectorState {
  return {
    ...DEFAULT_SECTOR_STATE,
    flex: shouldAutoExpandFlex(style),
  };
}

function getSectorGridClass(sectorKey: StyleSectorKey): string {
  if (sectorKey === 'layout' || sectorKey === 'flex') {
    return 'grid-cols-[repeat(auto-fit,minmax(96px,1fr))] gap-1';
  }

  return 'grid-cols-1 gap-1';
}

export function toggleStyleSector(current: SectorState, key: StyleSectorKey): SectorState {
  return {
    ...current,
    [key]: !current[key],
  };
}

export default function GrapesLikeStyleManager({ selection, selector, style, actions }: GrapesLikeStyleManagerProps) {
  const [expandedSectors, setExpandedSectors] = useState<SectorState>(() => createSectorState(style));
  const shouldShowFlexSector = shouldAutoExpandFlex(style);
  const showLayoutPositionProperties = shouldShowLayoutPositionProperties(style);
  const updateStyle = actions.updateStyle ?? actions.style?.updateStyle;

  useEffect(() => {
    setExpandedSectors((current) => {
      if (shouldShowFlexSector && !current.flex) {
        return { ...current, flex: true };
      }

      if (!shouldShowFlexSector && current.flex) {
        return { ...current, flex: false };
      }

      return current;
    });
  }, [shouldShowFlexSector]);

  return (
    <section
      data-style-manager="true"
      className="flex w-full min-w-0 flex-col gap-1 text-stone-100"
    >
      {selection && selector && actions.selector ? (
        <GrapesLikeSelectorManager selection={selection} selector={selector} actions={actions.selector} />
      ) : null}

      <div className="flex w-full min-w-0 flex-col">
        {style.sectors
          .filter((sector) => sector.key !== 'flex' || shouldShowFlexSector)
          .map((sector) => (
          <GrapesLikeSector
            key={sector.key}
            sectorKey={sector.key}
            title={sector.title}
            hint={sector.key === 'flex' ? '将“显示”设为“弹性布局”后启用' : undefined}
            expanded={expandedSectors[sector.key]}
            onToggle={() => {
              setExpandedSectors((current) => toggleStyleSector(current, sector.key));
            }}
          >
            <div className={`gl-sector-grid grid grid-cols-2 ${getSectorGridClass(sector.key)}`}>
              {sector.properties
                .filter((property) => !(sector.key === 'layout' && (property.property === 'inset' || property.property === 'zIndex')) || showLayoutPositionProperties)
                .map((property) => (
                  <GrapesLikeProperty
                    key={property.property}
                    property={property}
                    targetKind={style.targetKind}
                    onCommit={(value) => {
                      updateStyle?.({
                        property: property.property,
                        value,
                        targetKind: style.targetKind,
                      });
                    }}
                  />
              ))}
            </div>
          </GrapesLikeSector>
          ))}
      </div>
    </section>
  );
}
