import { useEffect, useMemo } from 'react';
import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, MeshBasicMaterial, PlaneGeometry } from 'three';
import { STRUCTURES } from '../data/structures';
import { GRID_SIZE, PLOT_SIZE } from '../data/world';
import { footprintOf } from '../game/structures';
import { useGameStore } from '../store/gameStore';
import { PALETTE } from './palette';

const HALF = GRID_SIZE / 2;
const noRaycast = () => null;
/** Just above the ground and the soil, under the build ghost. */
const Y = 0.03;

const PAPER = new MeshBasicMaterial({ color: PALETTE.blueprintPaper, transparent: true, opacity: 0.55, depthWrite: false });
const GRID = new LineBasicMaterial({ color: PALETTE.blueprintLine, transparent: true, opacity: 0.35, depthWrite: false });
const PLOT = new LineBasicMaterial({ color: PALETTE.blueprintLine, transparent: true, opacity: 0.8, depthWrite: false });
const WALLS = new LineBasicMaterial({ color: PALETTE.blueprintWall, transparent: true, opacity: 0.95, depthWrite: false });

/** Line segments along a list of [x0, z0, x1, z1] in world units. */
const segments = (lines: readonly (readonly [number, number, number, number])[], y: number): BufferGeometry => {
  const positions: number[] = [];
  for (const [x0, z0, x1, z1] of lines) positions.push(x0, y, z0, x1, y, z1);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return geometry;
};

/** The farm's tile grid, with the plot lines stronger. */
const gridLines = (): { tiles: BufferGeometry; plots: BufferGeometry } => {
  const tiles: [number, number, number, number][] = [];
  const plots: [number, number, number, number][] = [];
  for (let i = 0; i <= GRID_SIZE; i++) {
    const v = i - HALF;
    const list = i % PLOT_SIZE === 0 ? plots : tiles;
    list.push([v, -HALF, v, HALF], [-HALF, v, HALF, v]);
  }
  return { tiles: segments(tiles, Y + 0.002), plots: segments(plots, Y + 0.004) };
};

/** Outline of every structure footprint (as on a floor plan). */
function Footprints() {
  const key = useGameStore((s) => s.game.structures.map((x) => `${x.type}:${x.x}:${x.y}:${x.rotation}`).join(','));
  const geometry = useMemo(() => {
    const lines: [number, number, number, number][] = [];
    for (const entry of key.split(',').filter(Boolean)) {
      const [type = '', sx = '0', sy = '0', rot = '0'] = entry.split(':');
      const def = Object.values(STRUCTURES).find((d) => d.id === type);
      if (!def) continue;
      const fp = footprintOf(def.id, Number(sx), Number(sy), Number(rot) as 0 | 1 | 2 | 3);
      const x0 = fp.x - HALF + 0.06;
      const z0 = fp.y - HALF + 0.06;
      const x1 = fp.x + fp.width - HALF - 0.06;
      const z1 = fp.y + fp.depth - HALF - 0.06;
      lines.push([x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]);
    }
    return segments(lines, Y + 0.006);
  }, [key]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <lineSegments geometry={geometry} material={WALLS} raycast={noRaycast} renderOrder={3} />;
}

/**
 * Blueprint look while building: blue paper over the farm, the tile and plot grid and every
 * footprint outlined. The camera tilts to a top view meanwhile (CameraRig).
 */
export function Blueprint() {
  const active = useGameStore((s) => s.buildMode !== null || s.panel === 'build');
  const paper = useMemo(() => new PlaneGeometry(GRID_SIZE, GRID_SIZE).rotateX(-Math.PI / 2), []);
  const grid = useMemo(gridLines, []);
  useEffect(
    () => () => {
      paper.dispose();
      grid.tiles.dispose();
      grid.plots.dispose();
    },
    [paper, grid],
  );
  if (!active) return null;
  return (
    <group>
      <mesh geometry={paper} material={PAPER} position={[0, Y, 0]} raycast={noRaycast} renderOrder={2} />
      <lineSegments geometry={grid.tiles} material={GRID} raycast={noRaycast} renderOrder={3} />
      <lineSegments geometry={grid.plots} material={PLOT} raycast={noRaycast} renderOrder={3} />
      <Footprints />
    </group>
  );
}
