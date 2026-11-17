import { useLayoutEffect, useMemo, useRef } from 'react';
import { Mesh, type Group, type Material } from 'three';
import { STRUCTURES, type StructureId } from '../data/structures';
import { tileCoords } from '../game/grid';
import { checkRoad } from '../game/roads';
import { anchorFor, checkPlacement, footprintOf, structureAt } from '../game/structures';
import type { Rotation } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { cornerToWorld } from './coords';
import { PALETTE } from './palette';
import { STRUCTURE_MODELS, StructureTransform } from './Structures';

const noRaycast = () => null;
const GHOST_OPACITY = 0.55;

interface Area {
  x: number;
  y: number;
  width: number;
  depth: number;
  color: string;
}

function FootprintOverlay({ area }: { area: Area }) {
  const [x0, z0] = cornerToWorld(area.x, area.y);
  return (
    <mesh
      position={[x0 + area.width / 2, 0.04, z0 + area.depth / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      raycast={noRaycast}
    >
      <planeGeometry args={[area.width - 0.04, area.depth - 0.04]} />
      <meshBasicMaterial color={area.color} transparent opacity={0.45} depthWrite={false} />
    </mesh>
  );
}

/** Translucent, non-interactive copy of a structure model. */
function GhostModel({ type, x, y, rotation }: { type: StructureId; x: number; y: number; rotation: Rotation }) {
  const ref = useRef<Group>(null);
  const Model = STRUCTURE_MODELS[type];

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const clones: Material[] = [];
    root.traverse((obj) => {
      if (!(obj instanceof Mesh)) return;
      obj.raycast = noRaycast;
      obj.castShadow = false;
      const source = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      if (!source) return;
      const clone = (source as Material).clone();
      clone.transparent = true;
      clone.opacity = GHOST_OPACITY;
      clone.depthWrite = false;
      clones.push(clone);
      obj.material = clone;
    });
    return () => clones.forEach((m) => m.dispose());
  }, [type]);

  return (
    <group ref={ref}>
      <StructureTransform type={type} x={x} y={y} rotation={rotation}>
        <Model />
      </StructureTransform>
    </group>
  );
}

/** Build mode preview: the structure under the cursor (green/red footprint), or the target of demolition. */
export function BuildGhost() {
  const mode = useGameStore((s) => s.buildMode);
  const rotation = useGameStore((s) => s.buildRotation);
  const hovered = useGameStore((s) => s.hoveredTile);
  // Change only on real game events, so they are cheap re-validation triggers.
  const tiles = useGameStore((s) => s.game.tiles);
  const tasks = useGameStore((s) => s.game.tasks);
  const money = useGameStore((s) => s.game.money);

  const preview = useMemo(() => {
    if (!mode || hovered === null) return null;
    const game = useGameStore.getState().game;
    const { x, y } = tileCoords(hovered);
    const single = (color: string) => ({ ghost: null, area: { x, y, width: 1, depth: 1, color } });
    if (mode === 'road') return single(checkRoad(game, hovered) === null ? PALETTE.hoverValid : PALETTE.hoverInvalid);
    if (mode === 'demolish') {
      const found = structureAt(game, hovered);
      const tile = game.tiles[hovered];
      if (!found && tile?.road) return single(tile.state === 'locked' ? PALETTE.plotBlocked : PALETTE.hoverInvalid);
      if (!found) return null;
      const fp = footprintOf(found.type, found.x, found.y, found.rotation);
      const removable = STRUCTURES[found.type].cost !== undefined;
      return { ghost: null, area: { ...fp, color: removable ? PALETTE.hoverInvalid : PALETTE.plotBlocked } };
    }
    const at = anchorFor(mode, x, y, rotation);
    const fp = footprintOf(mode, at.x, at.y, rotation);
    const valid = checkPlacement(game, mode, at.x, at.y, rotation) === null;
    return {
      ghost: { type: mode, x: at.x, y: at.y },
      area: { ...fp, color: valid ? PALETTE.hoverValid : PALETTE.hoverInvalid },
    };
  }, [mode, rotation, hovered, tiles, tasks, money]);

  if (!preview) return null;
  return (
    <group>
      <FootprintOverlay area={preview.area} />
      {preview.ghost && (
        <GhostModel
          key={preview.ghost.type}
          type={preview.ghost.type}
          x={preview.ghost.x}
          y={preview.ghost.y}
          rotation={rotation}
        />
      )}
    </group>
  );
}
