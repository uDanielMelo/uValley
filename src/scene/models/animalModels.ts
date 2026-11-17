import { IcosahedronGeometry, type BufferGeometry } from 'three';
import type { AnimalId } from '../../data/animals';
import { ANIMAL_MIN_HITBOX, ANIMAL_SIZES, meters } from '../../data/scale';
import { box, merge, part } from './geometry';

/**
 * Procedural low-poly farm animals. Each kind is a merged vertex-colored body plus one leg
 * geometry (pivot at the hip, so it can swing) placed at `legs`. Origin = ground under the body
 * center; the animal faces +z.
 */
export interface AnimalModel {
  body: BufferGeometry;
  leg: BufferGeometry;
  /** Hip positions [x, y, z] of each leg. */
  legs: ReadonlyArray<readonly [number, number, number]>;
  /** Height of the top of the animal (for the product icon). */
  height: number;
}

type Vec3 = [number, number, number];

const legGeometry = (length: number, width: number, color: string, hoof?: string): BufferGeometry =>
  merge([
    box(width, length, width, color, { position: [0, -length / 2, 0] }),
    ...(hoof ? [box(width * 1.08, length * 0.15, width * 1.08, hoof, { position: [0, -length * 0.93, 0] })] : []),
  ]);

const corners = (x: number, z: number, y: number): Vec3[] => [
  [-x, y, z],
  [x, y, z],
  [-x, y, -z],
  [x, y, -z],
];

const blob = (r: number, color: string, position: Vec3, scale: Vec3 = [1, 1, 1]) =>
  part(new IcosahedronGeometry(r, 0), color, { position, scale });

// Shared colors
const WHITE = '#f4f1ea';
const BLACK = '#2b2622';
const PINK = '#f2a7a7';
const PINK_DARK = '#de8088';
const HORN = '#efe3c4';
const HOOF = '#3a2e26';
const ORANGE = '#f0a030';
const RED = '#d8382e';

const cow = (): AnimalModel => {
  const leg = 0.32;
  return {
    body: merge([
      box(0.42, 0.36, 0.78, WHITE, { position: [0, leg + 0.18, 0] }),
      box(0.44, 0.2, 0.2, BLACK, { position: [0, leg + 0.26, -0.16] }),
      box(0.44, 0.14, 0.14, BLACK, { position: [0.0, leg + 0.2, 0.2] }),
      box(0.25, 0.25, 0.3, WHITE, { position: [0, 0.68, 0.5] }),
      box(0.12, 0.12, 0.08, BLACK, { position: [0.07, 0.75, 0.62] }),
      box(0.26, 0.12, 0.1, PINK, { position: [0, 0.6, 0.67] }),
      box(0.04, 0.09, 0.04, HORN, { position: [-0.1, 0.84, 0.47] }),
      box(0.04, 0.09, 0.04, HORN, { position: [0.1, 0.84, 0.47] }),
      box(0.1, 0.05, 0.06, WHITE, { position: [-0.17, 0.74, 0.45] }),
      box(0.1, 0.05, 0.06, WHITE, { position: [0.17, 0.74, 0.45] }),
      box(0.16, 0.08, 0.16, PINK, { position: [0, leg - 0.02, -0.14] }),
      box(0.03, 0.3, 0.03, WHITE, { position: [0, 0.5, -0.41], rotation: [0.25, 0, 0] }),
      box(0.05, 0.07, 0.05, BLACK, { position: [0, 0.35, -0.45] }),
    ]),
    leg: legGeometry(leg, 0.1, WHITE, HOOF),
    legs: corners(0.14, 0.28, leg),
    height: 0.9,
  };
};

const ox = (): AnimalModel => {
  const leg = 0.34;
  const BROWN = '#7b4b2e';
  const DARK = '#5a3620';
  return {
    body: merge([
      box(0.46, 0.4, 0.86, BROWN, { position: [0, leg + 0.2, 0] }),
      box(0.3, 0.14, 0.22, BROWN, { position: [0, leg + 0.44, 0.24] }),
      box(0.27, 0.27, 0.3, DARK, { position: [0, 0.7, 0.54] }),
      box(0.27, 0.12, 0.1, '#3b2a20', { position: [0, 0.62, 0.71] }),
      box(0.4, 0.05, 0.05, HORN, { position: [0, 0.85, 0.5] }),
      box(0.05, 0.12, 0.05, HORN, { position: [-0.2, 0.9, 0.5] }),
      box(0.05, 0.12, 0.05, HORN, { position: [0.2, 0.9, 0.5] }),
      box(0.03, 0.32, 0.03, DARK, { position: [0, 0.52, -0.45], rotation: [0.25, 0, 0] }),
      box(0.06, 0.08, 0.06, BLACK, { position: [0, 0.36, -0.49] }),
    ]),
    leg: legGeometry(leg, 0.11, BROWN, HOOF),
    legs: corners(0.15, 0.31, leg),
    height: 1.0,
  };
};

const horse = (): AnimalModel => {
  const leg = 0.44;
  const COAT = '#8b5a2b';
  const MANE = '#3a2618';
  return {
    body: merge([
      box(0.32, 0.34, 0.82, COAT, { position: [0, leg + 0.17, 0] }),
      box(0.17, 0.44, 0.2, COAT, { position: [0, 0.86, 0.38], rotation: [0.55, 0, 0] }),
      box(0.16, 0.17, 0.36, COAT, { position: [0, 1.07, 0.57] }),
      box(0.165, 0.1, 0.12, '#6e4520', { position: [0, 1.03, 0.73] }),
      box(0.05, 0.42, 0.12, MANE, { position: [0, 0.94, 0.3], rotation: [0.55, 0, 0] }),
      box(0.04, 0.09, 0.04, COAT, { position: [-0.05, 1.19, 0.47] }),
      box(0.04, 0.09, 0.04, COAT, { position: [0.05, 1.19, 0.47] }),
      box(0.07, 0.42, 0.07, MANE, { position: [0, 0.6, -0.45], rotation: [0.35, 0, 0] }),
      box(0.33, 0.06, 0.3, '#6a3f22', { position: [0, leg + 0.35, 0.02] }),
    ]),
    leg: legGeometry(leg, 0.08, COAT, MANE),
    legs: corners(0.1, 0.3, leg),
    height: 1.25,
  };
};

const pig = (): AnimalModel => {
  const leg = 0.15;
  return {
    body: merge([
      box(0.34, 0.3, 0.56, PINK, { position: [0, leg + 0.15, 0] }),
      box(0.26, 0.24, 0.18, PINK, { position: [0, 0.36, 0.34] }),
      box(0.14, 0.1, 0.06, PINK_DARK, { position: [0, 0.32, 0.45] }),
      box(0.03, 0.03, 0.02, BLACK, { position: [-0.03, 0.32, 0.48] }),
      box(0.03, 0.03, 0.02, BLACK, { position: [0.03, 0.32, 0.48] }),
      box(0.03, 0.03, 0.02, BLACK, { position: [-0.07, 0.42, 0.43] }),
      box(0.03, 0.03, 0.02, BLACK, { position: [0.07, 0.42, 0.43] }),
      box(0.08, 0.07, 0.04, PINK_DARK, { position: [-0.1, 0.5, 0.32], rotation: [0.5, 0, 0] }),
      box(0.08, 0.07, 0.04, PINK_DARK, { position: [0.1, 0.5, 0.32], rotation: [0.5, 0, 0] }),
      box(0.03, 0.08, 0.03, PINK_DARK, { position: [0, 0.4, -0.3], rotation: [-0.6, 0, 0] }),
    ]),
    leg: legGeometry(leg, 0.08, PINK, PINK_DARK),
    legs: corners(0.1, 0.18, leg),
    height: 0.55,
  };
};

const sheep = (): AnimalModel => {
  const leg = 0.22;
  return {
    body: merge([
      blob(0.26, WHITE, [0, leg + 0.18, 0], [1, 0.85, 1.35]),
      blob(0.17, WHITE, [0.07, leg + 0.32, 0.12]),
      blob(0.17, WHITE, [-0.07, leg + 0.32, -0.12]),
      blob(0.15, '#e9e4d8', [0, leg + 0.3, -0.25]),
      box(0.14, 0.16, 0.18, BLACK, { position: [0, 0.5, 0.38] }),
      blob(0.08, WHITE, [0, 0.6, 0.35]),
      box(0.1, 0.04, 0.05, BLACK, { position: [-0.1, 0.53, 0.35], rotation: [0, 0, 0.4] }),
      box(0.1, 0.04, 0.05, BLACK, { position: [0.1, 0.53, 0.35], rotation: [0, 0, -0.4] }),
    ]),
    leg: legGeometry(leg, 0.06, BLACK),
    legs: corners(0.1, 0.17, leg),
    height: 0.72,
  };
};

const goat = (): AnimalModel => {
  const leg = 0.28;
  const COAT = '#e6dccb';
  const TAN = '#b88a5a';
  return {
    body: merge([
      box(0.26, 0.26, 0.52, COAT, { position: [0, leg + 0.13, 0] }),
      box(0.27, 0.14, 0.2, TAN, { position: [0, leg + 0.18, -0.1] }),
      box(0.12, 0.24, 0.13, COAT, { position: [0, 0.6, 0.24], rotation: [0.4, 0, 0] }),
      box(0.14, 0.15, 0.22, COAT, { position: [0, 0.72, 0.33] }),
      box(0.03, 0.15, 0.03, '#8a7a66', { position: [-0.04, 0.85, 0.27], rotation: [-0.6, 0, 0] }),
      box(0.03, 0.15, 0.03, '#8a7a66', { position: [0.04, 0.85, 0.27], rotation: [-0.6, 0, 0] }),
      box(0.04, 0.09, 0.04, '#d8cfbf', { position: [0, 0.6, 0.43] }),
      box(0.09, 0.03, 0.05, COAT, { position: [-0.1, 0.75, 0.3] }),
      box(0.09, 0.03, 0.05, COAT, { position: [0.1, 0.75, 0.3] }),
      box(0.04, 0.1, 0.04, COAT, { position: [0, 0.6, -0.27], rotation: [-0.6, 0, 0] }),
    ]),
    leg: legGeometry(leg, 0.06, COAT, HOOF),
    legs: corners(0.08, 0.18, leg),
    height: 0.9,
  };
};

const chicken = (): AnimalModel => {
  const leg = 0.1;
  return {
    body: merge([
      box(0.18, 0.17, 0.22, WHITE, { position: [0, leg + 0.085, 0] }),
      box(0.13, 0.13, 0.06, WHITE, { position: [0, 0.27, -0.12], rotation: [-0.4, 0, 0] }),
      box(0.1, 0.12, 0.1, WHITE, { position: [0, 0.32, 0.1] }),
      box(0.03, 0.06, 0.07, RED, { position: [0, 0.4, 0.1] }),
      box(0.03, 0.05, 0.03, RED, { position: [0, 0.27, 0.16] }),
      box(0.04, 0.03, 0.05, ORANGE, { position: [0, 0.32, 0.17] }),
      box(0.02, 0.02, 0.02, BLACK, { position: [-0.05, 0.34, 0.12] }),
      box(0.02, 0.02, 0.02, BLACK, { position: [0.05, 0.34, 0.12] }),
      box(0.02, 0.1, 0.14, '#e8e2d4', { position: [-0.1, 0.2, 0] }),
      box(0.02, 0.1, 0.14, '#e8e2d4', { position: [0.1, 0.2, 0] }),
    ]),
    leg: legGeometry(leg, 0.025, ORANGE),
    legs: [
      [-0.04, leg, 0],
      [0.04, leg, 0],
    ],
    height: 0.45,
  };
};

const duck = (): AnimalModel => {
  const leg = 0.07;
  return {
    body: merge([
      box(0.2, 0.15, 0.3, WHITE, { position: [0, leg + 0.075, 0] }),
      box(0.12, 0.1, 0.08, WHITE, { position: [0, 0.2, -0.17], rotation: [-0.6, 0, 0] }),
      box(0.1, 0.2, 0.1, WHITE, { position: [0, 0.27, 0.12] }),
      box(0.07, 0.03, 0.09, ORANGE, { position: [0, 0.32, 0.21] }),
      box(0.02, 0.02, 0.02, BLACK, { position: [-0.05, 0.34, 0.15] }),
      box(0.02, 0.02, 0.02, BLACK, { position: [0.05, 0.34, 0.15] }),
      box(0.02, 0.08, 0.18, '#e9e4d8', { position: [-0.105, 0.17, -0.01] }),
      box(0.02, 0.08, 0.18, '#e9e4d8', { position: [0.105, 0.17, -0.01] }),
    ]),
    leg: legGeometry(leg, 0.03, ORANGE),
    legs: [
      [-0.05, leg, 0],
      [0.05, leg, 0],
    ],
    height: 0.42,
  };
};

const BUILDERS: Record<AnimalId, () => AnimalModel> = { cow, ox, horse, pig, sheep, goat, chicken, duck };

/** A model plus the transform that fits it to the species' real size (ANIMAL_SIZES). */
export interface FittedAnimalModel extends AnimalModel {
  /** Scale [x, y, z] applied to the whole figure: y from the real height, z from the real length. */
  fit: Vec3;
  /** Real standing height in world units. */
  worldHeight: number;
  /** Clickable box size [x, y, z] in model units (never smaller than ANIMAL_MIN_HITBOX). */
  hitbox: Vec3;
  /** Center of the hitbox in model units. */
  hitboxCenter: Vec3;
}

const fitModel = (kind: AnimalId, model: AnimalModel): FittedAnimalModel => {
  model.body.computeBoundingBox();
  const box3 = model.body.boundingBox;
  const top = box3 ? box3.max.y : model.height;
  const length = box3 ? box3.max.z - box3.min.z : 1;
  const width = box3 ? box3.max.x - box3.min.x : 1;
  const size = ANIMAL_SIZES[kind];
  const sy = meters(size.height) / top;
  const sz = meters(size.length) / length;
  const fit: Vec3 = [sy, sy, sz];
  const minBox = meters(ANIMAL_MIN_HITBOX);
  const hitbox: Vec3 = [
    Math.max(width, minBox / fit[0]),
    Math.max(top, minBox / fit[1]),
    Math.max(length, minBox / fit[2]),
  ];
  const centerZ = box3 ? (box3.max.z + box3.min.z) / 2 : 0;
  return { ...model, fit, worldHeight: meters(size.height), hitbox, hitboxCenter: [0, hitbox[1] / 2, centerZ] };
};

const cache = new Map<AnimalId, FittedAnimalModel>();

/** Shared model per kind (built once, reused by every animal of that kind). */
export const animalModel = (kind: AnimalId): FittedAnimalModel => {
  let model = cache.get(kind);
  if (!model) {
    model = fitModel(kind, BUILDERS[kind]());
    cache.set(kind, model);
  }
  return model;
};
