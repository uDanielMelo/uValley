import type { BufferGeometry } from 'three';
import type { CropId } from '../../data/crops';
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

const corn = (stage: number): BufferGeometry => {
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

const tomato = (stage: number): BufferGeometry => {
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

export const CROP_MODELS: Record<CropId, (stage: number) => BufferGeometry> = { wheat, corn, tomato };
