import { Color, type BufferGeometry } from 'three';
import { meters } from '../../data/scale';
import { box, cone, merge } from './geometry';

/**
 * A low-poly four-legged predator in meters (a fox at scale 1; the wild dog and the puma reuse it,
 * tinted and scaled). Origin = ground under the body; it faces +z. Legs are part of the body: it
 * is only seen for a few seconds, running off.
 */
export const predatorGeometry = (color: string): BufferGeometry => {
  const body = color;
  const dark = `#${new Color(color).multiplyScalar(0.55).getHexString()}`;
  const light = '#f2e6d4';
  const m = meters;
  return merge([
    box(m(0.22), m(0.2), m(0.55), body, { position: [0, m(0.33), 0] }),
    box(m(0.16), m(0.06), m(0.4), light, { position: [0, m(0.24), 0.01] }),
    box(m(0.17), m(0.16), m(0.18), body, { position: [0, m(0.42), m(0.33)] }),
    cone(m(0.06), m(0.16), 4, dark, { position: [0, m(0.4), m(0.48)], rotation: [Math.PI / 2, Math.PI / 4, 0] }),
    cone(m(0.04), m(0.1), 4, dark, { position: [m(-0.05), m(0.54), m(0.31)] }),
    cone(m(0.04), m(0.1), 4, dark, { position: [m(0.05), m(0.54), m(0.31)] }),
    box(m(0.1), m(0.1), m(0.4), body, { position: [0, m(0.36), m(-0.42)], rotation: [-0.35, 0, 0] }),
    box(m(0.07), m(0.07), m(0.1), light, { position: [0, m(0.29), m(-0.62)], rotation: [-0.35, 0, 0] }),
    ...[
      [-0.07, 0.2],
      [0.07, 0.2],
      [-0.07, -0.2],
      [0.07, -0.2],
    ].map(([x = 0, z = 0]) => box(m(0.05), m(0.24), m(0.05), dark, { position: [m(x), m(0.12), m(z)] })),
  ]);
};
