import { fenceError } from '../game/fences';
import { useMemo } from 'react';
import { STRUCTURES } from '../data/structures';
import { tileCoords } from '../game/grid';
import { checkRoadOrder, previewPlacement } from '../game/construction';
import { anchorFor, footprintOf, structureAt } from '../game/structures';
import { useGameStore } from '../store/gameStore';
import { cornerToWorld } from './coords';
import { PALETTE } from './palette';
import { TranslucentModel } from './TranslucentModel';

const noRaycast = () => null;
const GHOST_OPACITY = 0.55;

interface Area {
  x: number;
  y: number;
  width: number;
  depth: number;
  color: string;
}

function FootprintOverlay({ area, inset = 0.04, opacity = 0.45 }: { area: Area; inset?: number; opacity?: number }) {
  const [x0, z0] = cornerToWorld(area.x, area.y);
  return (
    <mesh
      position={[x0 + area.width / 2, 0.04, z0 + area.depth / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      raycast={noRaycast}
    >
      <planeGeometry args={[area.width - inset, area.depth - inset]} />
      <meshBasicMaterial color={area.color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

/**
 * Build mode preview: the structure under the cursor on a green/red footprint with its road ring
 * (sandy where a road will be opened, orange when the ring does not reach the access road, red
 * where something is in the way), or the target of demolition.
 */
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
    const single = (color: string) => ({ ghost: null, area: { x, y, width: 1, depth: 1, color }, ring: [] as Area[] });
    if (mode === 'road') return single(checkRoadOrder(game, hovered) === null ? PALETTE.hoverValid : PALETTE.hoverInvalid);
    if (mode === 'demolish') {
      const found = structureAt(game, hovered);
      const tile = game.tiles[hovered];
      const roadQueued = game.tasks.some((t) => t.tile === hovered && t.job?.type === 'road');
      if (!found && roadQueued) return single(PALETTE.hoverInvalid);
      if (!found && tile?.road) return single(tile.state === 'locked' ? PALETTE.plotBlocked : PALETTE.hoverInvalid);
      if (!found) return null;
      const fp = footprintOf(found.type, found.x, found.y, found.rotation);
      const removable = STRUCTURES[found.type].cost !== undefined;
      return { ghost: null, area: { ...fp, color: removable ? PALETTE.hoverInvalid : PALETTE.plotBlocked }, ring: [] };
    }
    if (mode === 'fence' || mode === 'gate') return single(fenceError(game, hovered, mode === 'gate') === null ? PALETTE.hoverValid : PALETTE.hoverInvalid);
    const at = anchorFor(mode, x, y, rotation);
    const fp = footprintOf(mode, at.x, at.y, rotation);
    const placement = previewPlacement(game, mode, at.x, at.y, rotation);
    const roadColor = placement.connects ? PALETTE.ghostRoad : PALETTE.ghostRoadCutOff;
    const ring: Area[] = placement.ring.flatMap(({ tile, status }) => {
      if (status === 'road' && placement.connects) return [];
      const c = tileCoords(tile);
      const color = status === 'blocked' ? PALETTE.hoverInvalid : roadColor;
      return [{ x: c.x, y: c.y, width: 1, depth: 1, color }];
    });
    return {
      ghost: { type: mode, x: at.x, y: at.y },
      area: { ...fp, color: placement.error === null ? PALETTE.hoverValid : PALETTE.hoverInvalid },
      ring,
    };
  }, [mode, rotation, hovered, tiles, tasks, money]);

  if (!preview) return null;
  return (
    <group>
      <FootprintOverlay area={preview.area} />
      {preview.ring.map((area) => (
        <FootprintOverlay key={`${area.x},${area.y}`} area={area} inset={0.16} opacity={0.6} />
      ))}
      {preview.ghost && (
        <TranslucentModel
          key={preview.ghost.type}
          type={preview.ghost.type}
          x={preview.ghost.x}
          y={preview.ghost.y}
          rotation={rotation}
          opacity={GHOST_OPACITY}
        />
      )}
    </group>
  );
}
