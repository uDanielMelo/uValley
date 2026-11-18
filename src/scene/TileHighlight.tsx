import { useLayoutEffect, useMemo, useRef } from 'react';
import { Color, Matrix4, PlaneGeometry, type InstancedMesh } from 'three';
import { PLOT_SIZE } from '../data/world';
import { plotStatus } from '../game/economy';
import { TILE_COUNT, plotCoords, plotOfTile, tilesInRect } from '../game/grid';
import { applyArea, areaMode, toggleTask } from '../game/workers';
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

/** Hover feedback: a tile overlay (light/red by tool validity) or a whole locked plot. The hand only marks plots. */
function HoverHighlight() {
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
    if (tool === null) return null;
    const [x, z] = indexToWorld(hovered);
    const valid = toggleTask(game, tool, hovered, crop).ok;
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

const VALID = new Color(PALETTE.hoverValid);
const INVALID = new Color(PALETTE.hoverInvalid);
const CANCEL = new Color(PALETTE.hoverCancel);

/**
 * Area preview while dragging: each tile in the rectangle shows whether the order will be queued
 * (light), left out (red) or cancelled (orange), exactly as releasing would apply it.
 */
function AreaHighlight() {
  const meshRef = useRef<InstancedMesh>(null);
  const area = useGameStore((s) => s.area);
  const tool = useGameStore((s) => s.tool);
  const crop = useGameStore((s) => s.selectedCrop);
  const geometry = useMemo(() => new PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    // Create the color buffer before the first render so the material compiles with it.
    if (!mesh.instanceColor) mesh.setColorAt(0, VALID);
    if (!area || tool === null) {
      mesh.count = 0;
      return;
    }
    const game = useGameStore.getState().game;
    const tiles = tilesInRect(area.anchor, area.current);
    const mode = areaMode(game, tool, area.anchor, crop);
    const changed = new Set(applyArea(game, tool, tiles, crop, mode).changed);
    const m = new Matrix4();
    let count = 0;
    for (const index of tiles) {
      const tile = game.tiles[index];
      // Cancelling only marks the tiles it affects; land for sale is never part of an area.
      if (!tile || tile.state === 'locked' || (mode === 'cancel' && !changed.has(index))) continue;
      const [x, z] = indexToWorld(index);
      m.makeTranslation(x, 0.03, z);
      mesh.setMatrixAt(count, m);
      mesh.setColorAt(count, changed.has(index) ? (mode === 'cancel' ? CANCEL : VALID) : INVALID);
      count++;
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [area, tool, crop]);

  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined, TILE_COUNT]} raycast={noRaycast} frustumCulled={false}>
      <meshBasicMaterial transparent opacity={0.45} depthWrite={false} />
    </instancedMesh>
  );
}

export function TileHighlight() {
  const building = useGameStore((s) => s.buildMode !== null);
  const dragging = useGameStore((s) => s.area !== null && s.area.anchor !== s.area.current);
  if (building) return null;
  return (
    <>
      {!dragging && <HoverHighlight />}
      <AreaHighlight />
    </>
  );
}
