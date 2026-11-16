import { hash01 } from './coords';

/** Deterministic 2D lattice hash in [0, 1). */
const lattice = (x: number, y: number, seed: number): number => hash01(x * 73856093 + y * 19349663 + seed * 83492791);

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Smooth value noise in [0, 1). */
export const valueNoise = (x: number, y: number, seed = 0): number => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const a = lattice(x0, y0, seed);
  const b = lattice(x0 + 1, y0, seed);
  const c = lattice(x0, y0 + 1, seed);
  const d = lattice(x0 + 1, y0 + 1, seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
};

/** Fractal value noise (a few octaves) in roughly [0, 1). */
export const fbm = (x: number, y: number, octaves = 3, seed = 0): number => {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq, seed + i) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
};
