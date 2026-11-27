import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { BufferGeometry, Color, Float32BufferAttribute, Matrix4, type InstancedMesh } from 'three';
import { TILE_COUNT } from '../game/grid';
import type { Tile } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { hash01, indexToWorld } from './coords';
import { PALETTE, SOIL_COLORS } from './palette';
import { usePlowProgress } from './plowing';
import { soilAt } from '../game/soil';
import type { SoilId } from '../data/soil';

const noRaycast = () => null;
const SOIL_TOP = -0.04;
const RIDGES = [-0.33, 0, 0.33];
const RIDGE_WIDTH = 0.3;
const RIDGE_HEIGHT = 0.08;

/** Three triangular furrow ridges running along X across one tile (non-indexed, flat). */
const buildRidges = (): BufferGeometry => {
  const positions: number[] = [];
  const h = RIDGE_HEIGHT;
  const w = RIDGE_WIDTH / 2;
  const x0 = -0.5;
  const x1 = 0.5;
  for (const z of RIDGES) {
    const a = z - w;
    const b = z + w;
    // Two sloped faces.
    positions.push(x0, 0, b, x1, 0, b, x1, h, z, x0, 0, b, x1, h, z, x0, h, z);
    positions.push(x1, 0, a, x0, 0, a, x0, h, z, x1, 0, a, x0, h, z, x1, h, z);
    // End caps (visible at field borders).
    positions.push(x0, 0, a, x0, 0, b, x0, h, z);
    positions.push(x1, 0, b, x1, 0, a, x1, h, z);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
};

const COLORS: Partial<Record<Tile['state'], Color>> = {
  tilled: new Color(PALETTE.furrow),
  planted: new Color(PALETTE.furrow).multiplyScalar(0.93),
  watered: new Color(PALETTE.watered).multiplyScalar(0.85),
};

const FERTILIZED = new Color(PALETTE.fertilizedSoil);
/** How much of the soil type's color shows in worked ground. */
const TINT = 0.25;
const SOIL_TINT = Object.fromEntries(Object.entries(SOIL_COLORS).map(([k, v]) => [k, new Color(v)])) as Record<SoilId, Color>;
const SCALE = new Matrix4();

/** Furrows on every worked tile (tilled, planted or watered), rebuilt when tiles change. */
export function SoilLayer() {
  const ref = useRef<InstancedMesh>(null);
  const tiles = useGameStore((s) => s.game.tiles);
  const seed = useGameStore((s) => s.game.soilSeed);
  const plowing = usePlowProgress();
  const geometry = useMemo(buildRidges, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4();
    const color = new Color();
    let count = 0;
    tiles.forEach((tile, i) => {
      // Grass being plowed shows its furrows rising with the work done.
      const progress = tile.state === 'grass' ? plowing.get(i) : undefined;
      const base = progress !== undefined ? COLORS.tilled : COLORS[tile.state];
      if (!base || tile.structure) return;
      const [x, z] = indexToWorld(i);
      m.makeTranslation(x, progress !== undefined ? 0 : SOIL_TOP, z);
      if (progress !== undefined) m.multiply(SCALE.makeScale(1, progress, 1));
      mesh.setMatrixAt(count, m);
      color.copy(base).multiplyScalar(0.95 + hash01(i * 7) * 0.1);
      // The soil shows a little in the worked ground (reddish terra roxa, pale sand...).
      const soil = tile.cover ? null : soilAt(seed, i);
      if (soil) color.lerp(SOIL_TINT[soil], TINT);
      // Fertilized soil: darker, richer furrows.
      if (tile.fertilized) color.lerp(FERTILIZED, 0.7);
      mesh.setColorAt(count, color);
      count++;
    });
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [tiles, seed, plowing]);

  return (
    <instancedMesh ref={ref} args={[geometry, undefined, TILE_COUNT]} receiveShadow castShadow raycast={noRaycast}>
      <meshStandardMaterial flatShading roughness={1} />
    </instancedMesh>
  );
}
