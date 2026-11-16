import { IcosahedronGeometry, type BufferGeometry } from 'three';
import { hash01 } from '../coords';
import { PALETTE } from '../palette';
import { cone, cylinder, merge, part, sphere } from './geometry';

/**
 * Procedural nature props, each a single merged vertex-colored geometry for InstancedMesh.
 * Origin = base on the ground.
 */

const blob = (radius: number, color: string, position: [number, number, number], scale: [number, number, number]) =>
  part(new IcosahedronGeometry(radius, 0), color, { position, scale, rotation: [position[0], position[2], 0] });

/** A clump of grass blades. */
export const grassTuft = (seed: number): BufferGeometry =>
  merge(
    Array.from({ length: 7 }, (_, i) => {
      const angle = hash01(seed + i * 5) * Math.PI * 2;
      const r = hash01(seed + i * 9) * 0.09;
      const h = 0.1 + hash01(seed + i * 13) * 0.12;
      return cone(0.025, h, 3, i % 3 === 0 ? PALETTE.grassBladeDark : PALETTE.grassBlade, {
        position: [Math.cos(angle) * r, h / 2, Math.sin(angle) * r],
        rotation: [(hash01(seed + i) - 0.5) * 0.6, 0, (hash01(seed + i * 3) - 0.5) * 0.6],
      });
    }),
  );

/** Grass with a few small flowers. */
export const flowerTuft = (color: string, seed: number): BufferGeometry =>
  merge([
    grassTuft(seed),
    ...Array.from({ length: 3 }, (_, i) => {
      const x = (hash01(seed + i * 17) - 0.5) * 0.18;
      const z = (hash01(seed + i * 19) - 0.5) * 0.18;
      const h = 0.12 + hash01(seed + i * 23) * 0.08;
      return merge([
        cylinder(0.006, 0.006, h, 3, PALETTE.grassBladeDark, { position: [x, h / 2, z] }),
        sphere(0.028, color, { position: [x, h, z] }, 5, 3),
      ]);
    }),
  ]);

export const rock = (): BufferGeometry =>
  merge([
    blob(0.22, PALETTE.rock, [0, 0.08, 0], [1.2, 0.6, 1]),
    blob(0.12, PALETTE.rockDark, [0.18, 0.04, 0.06], [1, 0.7, 1]),
  ]);

/** Round deciduous tree with a lumpy canopy. */
export const roundTree = (variant: number): BufferGeometry => {
  const greens = [PALETTE.foliageA, PALETTE.foliageB, PALETTE.foliageC];
  const g = (i: number) => greens[(variant + i) % greens.length] ?? PALETTE.foliageA;
  return merge([
    cylinder(0.09, 0.14, 1.1, 6, PALETTE.trunk, { position: [0, 0.55, 0] }),
    cylinder(0.04, 0.05, 0.4, 4, PALETTE.trunk, { position: [0.12, 1.0, 0], rotation: [0, 0, -0.7] }),
    blob(0.62, g(0), [0, 1.55, 0], [1, 0.9, 1]),
    blob(0.42, g(1), [0.38, 1.35, 0.15], [1, 0.9, 1]),
    blob(0.4, g(2), [-0.3, 1.4, -0.2], [1, 0.9, 1]),
    blob(0.36, g(1), [0.05, 1.95, 0.1], [1, 0.9, 1]),
  ]);
};

/** Layered conifer. */
export const pineTree = (): BufferGeometry =>
  merge([
    cylinder(0.08, 0.12, 0.6, 5, PALETTE.trunk, { position: [0, 0.3, 0] }),
    cone(0.7, 1.0, 7, PALETTE.pineA, { position: [0, 0.95, 0] }),
    cone(0.55, 0.85, 7, PALETTE.pineB, { position: [0, 1.45, 0] }),
    cone(0.38, 0.7, 7, PALETTE.pineA, { position: [0, 1.9, 0] }),
  ]);

export const bush = (): BufferGeometry =>
  merge([
    blob(0.32, PALETTE.bush, [0, 0.22, 0], [1.2, 0.8, 1]),
    blob(0.24, PALETTE.foliageA, [0.25, 0.2, 0.1], [1, 0.8, 1]),
    blob(0.22, PALETTE.foliageB, [-0.2, 0.18, -0.12], [1, 0.8, 1]),
  ]);
