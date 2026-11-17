import { useEffect, useMemo } from 'react';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { TILE_COUNT } from '../game/grid';
import type { Tile } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { hash01, indexToWorld } from './coords';
import { InstancedProps } from './InstancedProps';
import { bush, flowerTuft, grassTuft, rock, roundTree } from './models/natureModels';
import { PALETTE } from './palette';

const UP = new Vector3(0, 1, 0);
const TUFTS_PER_TILE = 3;
const VARIANTS = ['grass', 'flowerW', 'flowerY', 'rock', 'tree', 'bush'] as const;
type Variant = (typeof VARIANTS)[number];

const WIND: Record<Variant, number> = { grass: 0.35, flowerW: 0.35, flowerY: 0.35, rock: 0, tree: 0.03, bush: 0.05 };

/** Picks a prop variant for one slot of a tile: mostly grass, a few flowers, rare pebbles. */
const pickVariant = (r: number): Variant => {
  if (r < 0.86) return 'grass';
  if (r < 0.93) return 'flowerW';
  if (r < 0.993) return 'flowerY';
  return 'rock';
};

const hasGrass = (tile: Tile): boolean =>
  !tile.structure && !tile.road && (tile.state === 'grass' || tile.state === 'locked');

/** Matrices per variant for every grassy tile. Deterministic per tile, so props never jump. */
const layout = (tiles: readonly Tile[]): Record<Variant, Matrix4[]> => {
  const result: Record<Variant, Matrix4[]> = { grass: [], flowerW: [], flowerY: [], rock: [], tree: [], bush: [] };
  const q = new Quaternion();
  tiles.forEach((tile, i) => {
    if (!hasGrass(tile)) return;
    const [cx, cz] = indexToWorld(i);
    const y = tile.state === 'locked' ? -0.02 : 0;
    // Land for sale is a bit wild: a few trees and bushes, cleared when the plot is bought.
    if (tile.state === 'locked') {
      const r = hash01(i * 7 + 5);
      const wild: Variant | null = r < 0.045 ? 'tree' : r < 0.11 ? 'bush' : null;
      if (wild) {
        const s = wild === 'tree' ? 0.6 + hash01(i + 77) * 0.35 : 0.7 + hash01(i + 78) * 0.4;
        q.setFromAxisAngle(UP, hash01(i + 79) * Math.PI * 2);
        result[wild].push(
          new Matrix4().compose(
            new Vector3(cx + (hash01(i + 80) - 0.5) * 0.4, y, cz + (hash01(i + 81) - 0.5) * 0.4),
            q,
            new Vector3(s, s, s),
          ),
        );
      }
    }
    for (let k = 0; k < TUFTS_PER_TILE; k++) {
      const seed = i * 13 + k * 101;
      const variant = pickVariant(hash01(seed));
      const s = variant === 'rock' ? 0.35 + hash01(seed + 4) * 0.3 : 0.95 + hash01(seed + 5) * 0.6;
      q.setFromAxisAngle(UP, hash01(seed + 3) * Math.PI * 2);
      result[variant].push(
        new Matrix4().compose(
          new Vector3(cx + (hash01(seed + 1) - 0.5) * 0.85, y, cz + (hash01(seed + 2) - 0.5) * 0.85),
          q,
          new Vector3(s, s, s),
        ),
      );
    }
  });
  return result;
};

/** Grass tufts, flowers and pebbles on grassy tiles (gone once tilled), plus wild trees on land for sale. */
export function GrassLayer() {
  const tiles = useGameStore((s) => s.game.tiles);
  const geometries = useMemo(
    () => ({
      grass: grassTuft(5),
      flowerW: flowerTuft(PALETTE.flowerWhite, 77),
      flowerY: flowerTuft(PALETTE.flowerYellow, 91),
      rock: rock(),
      tree: roundTree(2),
      bush: bush(),
    }),
    [],
  );
  useEffect(() => () => Object.values(geometries).forEach((g) => g.dispose()), [geometries]);
  const matrices = useMemo(() => layout(tiles), [tiles]);

  return (
    <group>
      {VARIANTS.map((v) => (
        <InstancedProps
          key={v}
          geometry={geometries[v]}
          matrices={matrices[v]}
          capacity={TILE_COUNT * TUFTS_PER_TILE}
          wind={WIND[v]}
          castShadow={v === 'rock' || v === 'tree' || v === 'bush'}
        />
      ))}
    </group>
  );
}
