import { useMemo } from 'react';
import { PLOT_SIZE } from '../data/world';
import { plotStatus } from '../game/economy';
import { plotCoords, plotOfTile } from '../game/grid';
import { toggleTask } from '../game/workers';
import { useGameStore } from '../store/gameStore';
import { cornerToWorld, indexToWorld } from './coords';
import { PALETTE } from './palette';

interface Highlight {
  x: number;
  z: number;
  size: number;
  color: string;
}

const noRaycast = () => null;

/** Hover feedback: a tile overlay (light/red by tool validity) or a whole locked plot. */
export function TileHighlight() {
  const hovered = useGameStore((s) => s.hoveredTile);
  const tool = useGameStore((s) => s.tool);
  const crop = useGameStore((s) => s.selectedCrop);
  // These only change on real game events (not every frame), so they are cheap triggers.
  const tiles = useGameStore((s) => s.game.tiles);
  const inventory = useGameStore((s) => s.game.inventory);
  const unlockedPlots = useGameStore((s) => s.game.unlockedPlots);
  const tasks = useGameStore((s) => s.game.tasks);

  const highlight = useMemo<Highlight | null>(() => {
    if (hovered === null) return null;
    const tile = tiles[hovered];
    if (!tile) return null;
    const game = useGameStore.getState().game;
    if (tile.state === 'locked') {
      const plot = plotOfTile(hovered);
      const { plotX, plotY } = plotCoords(plot);
      const [cx, cz] = cornerToWorld(plotX * PLOT_SIZE, plotY * PLOT_SIZE);
      return {
        x: cx + PLOT_SIZE / 2,
        z: cz + PLOT_SIZE / 2,
        size: PLOT_SIZE,
        color: plotStatus(game, plot) === 'available' ? PALETTE.plotAvailable : PALETTE.plotBlocked,
      };
    }
    const [x, z] = indexToWorld(hovered);
    const valid = tile.structure === 'shippingBin' || toggleTask(game, tool, hovered, crop).ok;
    return { x, z, size: 1, color: valid ? PALETTE.hoverValid : PALETTE.hoverInvalid };
  }, [hovered, tool, crop, tiles, inventory, unlockedPlots, tasks]);

  if (!highlight) return null;
  return (
    <mesh position={[highlight.x, 0.03, highlight.z]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
      <planeGeometry args={[highlight.size * 0.98, highlight.size * 0.98]} />
      <meshBasicMaterial color={highlight.color} transparent opacity={0.4} depthWrite={false} />
    </mesh>
  );
}
