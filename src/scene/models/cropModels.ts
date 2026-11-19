import type { BufferGeometry } from 'three';
import { CROP_STAGE_COUNT, type CropId } from '../../data/crops';
import { CROP_HEIGHTS, meters } from '../../data/scale';
import { hash01 } from '../coords';
import { box, cone, cylinder, merge, sphere } from './geometry';

/**
 * Procedural crop models: one merged, vertex-colored geometry per growth stage.
 * To switch to glTF later, replace a builder with geometry extracted from useGLTF.
 */

const GREEN_LIGHT = '#8fd15a';
const GREEN = '#5fa83a';
const GREEN_DARK = '#3f7f2c';
const GOLD = '#e8c25a';
const GOLD_DARK = '#c99a35';
const YELLOW = '#f2d84b';
const RED = '#e0442f';
const STAKE = '#a07a4a';

/** Deterministic scatter of n points inside the tile, as [x, z]. */
const scatter = (n: number, radius: number, seed: number): Array<[number, number]> =>
  Array.from({ length: n }, (_, i) => {
    const angle = hash01(seed + i * 7) * Math.PI * 2;
    const r = Math.sqrt(hash01(seed + i * 13)) * radius;
    return [Math.cos(angle) * r, Math.sin(angle) * r];
  });

const WHEAT_GREEN = '#9cc760';
const WHEAT_GOLDS = ['#e3b54f', '#d9a441', '#edc766', '#c9953a'] as const;

/** Dense field of stalks; heads turn gold at maturity. Stalks lean a little for a natural look. */
const wheat = (stage: number): BufferGeometry => {
  if (stage === 0) {
    return merge(
      scatter(16, 0.44, 11).map(([x, z], i) =>
        cone(0.03, 0.12 + hash01(i + 5) * 0.08, 3, i % 3 ? GREEN_LIGHT : GREEN, {
          position: [x, 0.07, z],
          rotation: [(hash01(i) - 0.5) * 0.5, 0, (hash01(i + 9) - 0.5) * 0.5],
        }),
      ),
    );
  }
  if (stage === 1) {
    return merge(
      scatter(24, 0.45, 23).map(([x, z], i) => {
        const h = 0.28 + hash01(i + 31) * 0.14;
        return box(0.028, h, 0.028, i % 3 ? WHEAT_GREEN : GREEN, {
          position: [x, h / 2, z],
          rotation: [(hash01(i) - 0.5) * 0.3, 0, (hash01(i + 7) - 0.5) * 0.3],
        });
      }),
    );
  }
  return merge(
    scatter(28, 0.46, 37).flatMap(([x, z], i) => {
      const h = 0.46 + hash01(i + 41) * 0.16;
      const lean: [number, number, number] = [(hash01(i) - 0.5) * 0.25, 0, (hash01(i + 3) - 0.5) * 0.25];
      const gold = WHEAT_GOLDS[i % WHEAT_GOLDS.length] ?? GOLD;
      // Head offset follows the lean so it stays on top of the stalk.
      const hx = x - Math.sin(lean[2]) * (h / 2 + 0.08);
      const hz = z + Math.sin(lean[0]) * (h / 2 + 0.08);
      return [
        box(0.022, h, 0.022, GOLD_DARK, { position: [x, h / 2, z], rotation: lean }),
        cone(0.04, 0.16, 4, gold, { position: [hx, h + 0.05, hz], rotation: lean }),
      ];
    }),
  );
};

const cornPlant = (stage: number): BufferGeometry => {
  if (stage === 0) {
    return merge([
      cone(0.06, 0.22, 4, GREEN_LIGHT, { position: [-0.05, 0.11, 0], rotation: [0, 0, 0.3] }),
      cone(0.06, 0.2, 4, GREEN_LIGHT, { position: [0.05, 0.1, 0.02], rotation: [0, 0, -0.3] }),
    ]);
  }
  const height = stage === 1 ? 0.55 : 0.95;
  const parts = [
    cylinder(0.035, 0.05, height, 5, GREEN, { position: [0, height / 2, 0] }),
    box(0.06, 0.02, 0.4, GREEN_DARK, { position: [0, height * 0.35, 0.12], rotation: [0.5, 0, 0] }),
    box(0.4, 0.02, 0.06, GREEN_DARK, { position: [0.12, height * 0.55, 0], rotation: [0, 0, -0.5] }),
    box(0.06, 0.02, 0.36, GREEN, { position: [0, height * 0.75, -0.1], rotation: [-0.5, 0, 0] }),
  ];
  if (stage === 2) {
    parts.push(
      cylinder(0.055, 0.045, 0.22, 6, YELLOW, { position: [0.07, height * 0.5, 0.04], rotation: [0, 0, -0.35] }),
      cylinder(0.055, 0.045, 0.22, 6, YELLOW, { position: [-0.06, height * 0.62, -0.04], rotation: [0.35, 0, 0.3] }),
      cone(0.06, 0.18, 4, GOLD_DARK, { position: [0, height + 0.08, 0] }),
    );
  }
  return merge(parts);
};

const tomatoPlant = (stage: number): BufferGeometry => {
  if (stage === 0) {
    return merge([
      sphere(0.1, GREEN_LIGHT, { position: [0, 0.08, 0], scale: [1, 0.8, 1] }),
      box(0.02, 0.1, 0.02, GREEN, { position: [0, 0.04, 0] }),
    ]);
  }
  const r = stage === 1 ? 0.22 : 0.3;
  const parts = [
    box(0.035, r * 2 + 0.2, 0.035, STAKE, { position: [0.12, r + 0.1, 0.12] }),
    sphere(r, GREEN, { position: [0, r, 0] }, 7, 5),
    sphere(r * 0.7, GREEN_DARK, { position: [-0.08, r * 1.5, -0.05] }, 6, 4),
  ];
  if (stage === 2) {
    const fruits: Array<[number, number, number]> = [
      [0.24, 0.3, 0.05],
      [-0.15, 0.22, 0.22],
      [0.05, 0.45, 0.24],
      [-0.25, 0.42, -0.05],
      [0.12, 0.2, -0.24],
      [0.18, 0.55, -0.1],
    ];
    for (const position of fruits) parts.push(sphere(0.075, RED, { position }, 6, 4));
  }
  return merge(parts);
};

/** Several copies of one plant on a tile: [x, z, scale] per spot, each turned differently. */
const cluster = (make: () => BufferGeometry, spots: ReadonlyArray<readonly [number, number, number]>): BufferGeometry =>
  merge(
    spots.map(([x, z, s], i) => {
      const g = make();
      g.scale(s, s, s);
      g.rotateY(i * 1.7);
      g.translate(x, 0, z);
      return g;
    }),
  );

/** A tile of corn: a few stalks, like a small patch of a field. */
const CORN_SPOTS = [
  [-0.25, -0.24, 0.55],
  [0.24, -0.26, 0.5],
  [0, 0.02, 0.58],
  [-0.24, 0.26, 0.52],
  [0.26, 0.24, 0.56],
] as const;
const corn = (stage: number) => cluster(() => cornPlant(stage), CORN_SPOTS);

/** A tile of tomatoes: four staked plants. */
const TOMATO_SPOTS = [
  [-0.22, -0.22, 0.5],
  [0.22, -0.22, 0.48],
  [-0.22, 0.22, 0.48],
  [0.22, 0.22, 0.5],
] as const;
const tomato = (stage: number) => cluster(() => tomatoPlant(stage), TOMATO_SPOTS);

const ORANGE = '#f08a24';
const PUMPKIN = '#e8791f';
const BROWN = '#8a6239';
const STRAW_RED = '#e23b3b';
const APPLE = '#d8342c';
const TRUNK = '#6e4a2a';

/** Rows of leafy tops; the root (carrot or potato) shows at the base when mature. */
const rootCrop = (leaf: string, root: string, rootSize: number) => (stage: number): BufferGeometry => {
  const spots = scatter(stage === 0 ? 6 : 9, 0.38, stage * 17 + 3);
  return merge(
    spots.flatMap(([x, z], i) => {
      const h = stage === 0 ? 0.1 : stage === 1 ? 0.22 : 0.3;
      const parts = [
        cone(0.05, h, 4, i % 2 ? leaf : GREEN_DARK, { position: [x, h / 2, z], rotation: [(hash01(i) - 0.5) * 0.4, 0, 0] }),
        cone(0.04, h * 0.8, 4, leaf, { position: [x + 0.03, h * 0.4, z], rotation: [0, 0, 0.5] }),
      ];
      if (stage === 2) parts.push(sphere(rootSize, root, { position: [x, 0.02, z], scale: [1, 0.7, 1] }, 5, 3));
      return parts;
    }),
  );
};

const carrot = rootCrop(GREEN_LIGHT, ORANGE, 0.05);
const potato = rootCrop(GREEN, BROWN, 0.07);

/** Sprawling vine with big leaves; round orange pumpkins at maturity. */
const pumpkin = (stage: number): BufferGeometry => {
  const leaves = scatter(stage === 0 ? 4 : 8, 0.4, 51).map(([x, z], i) =>
    box(0.18, 0.03, 0.18, i % 2 ? GREEN : GREEN_DARK, { position: [x, 0.06 + stage * 0.04, z], rotation: [0, hash01(i) * 3, 0.2] }),
  );
  if (stage < 2) return merge(leaves);
  return merge([
    ...leaves,
    sphere(0.16, PUMPKIN, { position: [-0.15, 0.13, 0.1], scale: [1.2, 0.85, 1.2] }, 8, 5),
    sphere(0.13, PUMPKIN, { position: [0.2, 0.11, -0.12], scale: [1.2, 0.85, 1.2] }, 8, 5),
    cylinder(0.015, 0.02, 0.06, 4, GREEN_DARK, { position: [-0.15, 0.27, 0.1] }),
  ]);
};

/** Low rosettes in rows; red berries at maturity. */
const strawberry = (stage: number): BufferGeometry => {
  const spots = scatter(8, 0.38, 77);
  return merge(
    spots.flatMap(([x, z], i) => {
      const r = stage === 0 ? 0.05 : stage === 1 ? 0.08 : 0.1;
      const parts = [sphere(r, i % 2 ? GREEN : GREEN_LIGHT, { position: [x, r * 0.6, z], scale: [1, 0.6, 1] }, 5, 3)];
      if (stage === 2) parts.push(cone(0.035, 0.06, 5, STRAW_RED, { position: [x + 0.06, 0.04, z], rotation: [Math.PI, 0, 0] }));
      return parts;
    }),
  );
};

/** Fruit tree: a sapling, a young tree, then a full crown with fruit. */
const fruitTree = (fruit: string, crown: string) => (stage: number): BufferGeometry => {
  if (stage === 0) {
    return merge([
      box(0.03, 0.3, 0.03, TRUNK, { position: [0, 0.15, 0] }),
      sphere(0.1, GREEN_LIGHT, { position: [0, 0.32, 0] }, 5, 3),
    ]);
  }
  const h = stage === 1 ? 0.6 : 1;
  const parts = [
    cylinder(0.05, 0.08, h * 0.5, 5, TRUNK, { position: [0, h * 0.25, 0] }),
    sphere(h * 0.38, crown, { position: [0, h * 0.68, 0] }, 7, 5),
    sphere(h * 0.26, GREEN_DARK, { position: [h * 0.18, h * 0.82, -h * 0.1] }, 6, 4),
  ];
  if (stage === 2) {
    for (let i = 0; i < 9; i++) {
      const a = hash01(i * 7 + 1) * Math.PI * 2;
      const y = h * (0.5 + hash01(i * 11 + 2) * 0.4);
      parts.push(sphere(0.05, fruit, { position: [Math.cos(a) * h * 0.36, y, Math.sin(a) * h * 0.36] }, 5, 3));
    }
  }
  return merge(parts);
};

const orange = fruitTree(ORANGE, GREEN);
const apple = fruitTree(APPLE, GREEN);

export const CROP_MODELS: Record<CropId, (stage: number) => BufferGeometry> = {
  wheat,
  corn,
  tomato,
  carrot,
  potato,
  pumpkin,
  strawberry,
  orange,
  apple,
};

const heightScales = new Map<CropId, number>();

/**
 * Vertical scale that makes the mature stage CROP_HEIGHTS tall; earlier stages use the same
 * factor so they keep their proportion. Width is untouched so the crop still fills the tile.
 */
export const cropHeightScale = (cropId: CropId): number => {
  let scale = heightScales.get(cropId);
  if (scale === undefined) {
    const mature = CROP_MODELS[cropId](CROP_STAGE_COUNT - 1);
    mature.computeBoundingBox();
    const top = mature.boundingBox?.max.y ?? 1;
    mature.dispose();
    scale = meters(CROP_HEIGHTS[cropId]) / top;
    heightScales.set(cropId, scale);
  }
  return scale;
};
