import type { ThreeEvent } from '@react-three/fiber';
import { SHELTER_LEVEL_IDS, STRUCTURES, STRUCTURE_IDS, type ShelterLevel, type StructureId } from '../data/structures';
import type { Rotation, StructureWorkKind } from '../game/types';
import { useGameStore, type GameStore } from '../store/gameStore';
import { ConstructionSite } from './ConstructionSite';
import { setHoverCursor } from './cursor';
import { ShelterUpgrades } from './models/ShelterUpgrades';
import { SelectionOutline } from './SelectionOutline';
import { ShelterBadge } from './ShelterBadge';
import { STRUCTURE_MODELS, StructureTransform, type PlacedProps } from './structureModels';

export { STRUCTURE_MODELS, StructureTransform };

/** Max pointer travel (px) for a click to count as a click and not a camera drag. */
const CLICK_TOLERANCE = 5;

const handMode = (): boolean => {
  const { tool, buildMode } = useGameStore.getState();
  return tool === null && buildMode === null;
};

/** A finished structure. With the hand, clicking selects it (its card opens); otherwise clicks reach the tile. */
function PlacedStructure({ id, type, x, y, rotation, level }: PlacedProps & { id: number; level: ShelterLevel }) {
  const Model = STRUCTURE_MODELS[type];
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.button !== 0 || e.delta > CLICK_TOLERANCE || !handMode()) return;
    e.stopPropagation();
    useGameStore.getState().selectStructure(id);
  };
  return (
    <group onClick={onClick} onPointerOver={() => handMode() && setHoverCursor(true)} onPointerOut={() => setHoverCursor(false)}>
      <StructureTransform type={type} x={x} y={y} rotation={rotation}>
        <Model />
        <ShelterUpgrades type={type} level={level} />
      </StructureTransform>
    </group>
  );
}

interface Placed extends PlacedProps {
  id: number;
  work: StructureWorkKind | null;
  level: ShelterLevel;
}

const isStructureId = (v: string): v is StructureId => STRUCTURE_IDS.some((id) => id === v);
const isWorkKind = (v: string): v is StructureWorkKind => v === 'build' || v === 'demolish' || v === 'upgrade';

/** "id:type:x:y:rotation:work:level" per structure: changes only when something is placed, finished, upgraded or removed. */
const layoutKey = (s: GameStore): string =>
  s.game.structures
    .map((x) => `${x.id}:${x.type}:${x.x}:${x.y}:${x.rotation}:${x.work?.kind ?? ''}:${x.level ?? 1}`)
    .join(',');

const parseLayout = (key: string): Placed[] =>
  key
    .split(',')
    .filter(Boolean)
    .flatMap((entry) => {
      const [id, type, x, y, rotation, work, level] = entry.split(':');
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
          level: SHELTER_LEVEL_IDS.find((l) => String(l) === level) ?? 1,
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
      {parseLayout(key).map((s) => (
        <group key={`${s.id}-${s.work ?? 'done'}`}>
          {s.work ? (
            <ConstructionSite id={s.id} type={s.type} x={s.x} y={s.y} rotation={s.rotation} kind={s.work} level={s.level} />
          ) : (
            <PlacedStructure id={s.id} type={s.type} x={s.x} y={s.y} rotation={s.rotation} level={s.level} />
          )}
          {STRUCTURES[s.type].shelter && s.work !== 'build' && (
            <ShelterBadge id={s.id} type={s.type} x={s.x} y={s.y} rotation={s.rotation} />
          )}
        </group>
      ))}
      <SelectionOutline />
    </group>
  );
}
