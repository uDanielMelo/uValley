import type { ThreeEvent } from '@react-three/fiber';
import { STRUCTURES, STRUCTURE_IDS, type StructureId } from '../data/structures';
import type { Rotation, StructureWorkKind } from '../game/types';
import { useGameStore, type GameStore } from '../store/gameStore';
import { ConstructionSite } from './ConstructionSite';
import { ShelterBadge } from './ShelterBadge';
import { STRUCTURE_MODELS, StructureTransform, type PlacedProps } from './structureModels';

export { STRUCTURE_MODELS, StructureTransform };

/** Click handlers per structure (structures without one let clicks fall through to tiles). */
const ON_CLICK: Partial<Record<StructureId, () => void>> = {
  shippingBin: () => useGameStore.getState().showPanel('inventory'),
  bunkhouse: () => useGameStore.getState().showPanel('workers'),
};

const stopDown = (e: ThreeEvent<PointerEvent>) => {
  if (e.button === 0 && !useGameStore.getState().buildMode) e.stopPropagation();
};

function PlacedStructure({ type, x, y, rotation }: PlacedProps) {
  const Model = STRUCTURE_MODELS[type];
  const handler = ON_CLICK[type];
  const onClick = handler
    ? (e: ThreeEvent<MouseEvent>) => {
        // In build mode clicks go to the tile under the cursor instead.
        if (e.button !== 0 || useGameStore.getState().buildMode) return;
        e.stopPropagation();
        handler();
      }
    : undefined;
  return (
    <group
      onClick={onClick}
      onPointerDown={handler ? stopDown : undefined}
      onPointerOver={handler ? () => (document.body.style.cursor = 'pointer') : undefined}
      onPointerOut={handler ? () => (document.body.style.cursor = '') : undefined}
    >
      <StructureTransform type={type} x={x} y={y} rotation={rotation}>
        <Model />
      </StructureTransform>
    </group>
  );
}

interface Placed extends PlacedProps {
  id: number;
  work: StructureWorkKind | null;
}

const isStructureId = (v: string): v is StructureId => STRUCTURE_IDS.some((id) => id === v);
const isWorkKind = (v: string): v is StructureWorkKind => v === 'build' || v === 'demolish';

/** "id:type:x:y:rotation:work" per structure: changes only when something is placed, finished or removed. */
const layoutKey = (s: GameStore): string =>
  s.game.structures.map((x) => `${x.id}:${x.type}:${x.x}:${x.y}:${x.rotation}:${x.work?.kind ?? ''}`).join(',');

const parseLayout = (key: string): Placed[] =>
  key
    .split(',')
    .filter(Boolean)
    .flatMap((entry) => {
      const [id, type, x, y, rotation, work] = entry.split(':');
      if (!type || !isStructureId(type)) return [];
      const r = Number(rotation);
      return [
        {
          id: Number(id),
          type,
          x: Number(x),
          y: Number(y),
          rotation: (r === 1 || r === 2 || r === 3 ? r : 0) as Rotation,
          work: work && isWorkKind(work) ? work : null,
        },
      ];
    });

/**
 * Renders the placed structures. Work progress changes the structure list every frame, so the
 * layout is selected as a string and progress is read inside the sites' useFrame.
 */
export function Structures() {
  const key = useGameStore(layoutKey);
  return (
    <group>
      {parseLayout(key).map((s) =>
        s.work ? (
          <ConstructionSite key={`${s.id}-${s.work}`} id={s.id} type={s.type} x={s.x} y={s.y} rotation={s.rotation} kind={s.work} />
        ) : (
          <group key={s.id}>
            <PlacedStructure type={s.type} x={s.x} y={s.y} rotation={s.rotation} />
            {STRUCTURES[s.type].shelter && <ShelterBadge id={s.id} type={s.type} x={s.x} y={s.y} rotation={s.rotation} />}
          </group>
        ),
      )}
    </group>
  );
}
