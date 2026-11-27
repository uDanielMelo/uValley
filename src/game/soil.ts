import { CROPS, type CropId } from '../data/crops';
import { CROP_SOIL, SOILS, SOIL_IDS, SOIL_RATINGS, WITHER_AT, type SoilId, type SoilRating } from '../data/soil';
import { growthMinutesNeeded } from './crops';
import { GRID_SIZE } from '../data/world';
import { TILE_COUNT } from './grid';
import { hash01 } from './random';
import type { Tile } from './types';

/** The farm's soil is derived from `GameState.soilSeed` and never saved tile by tile. */

/** Lattice value at an integer cell, in [0, 1). */
const lattice = (seed: number, cx: number, cy: number, salt: number): number =>
  hash01(seed * 1013 + salt * 7919 + cx * 92821 + cy * 68917);

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Smooth value noise with cells `sx` × `sy` tiles wide. */
const valueNoise = (seed: number, x: number, y: number, sx: number, sy: number, salt: number): number => {
  const fx = x / sx;
  const fy = y / sy;
  const cx = Math.floor(fx);
  const cy = Math.floor(fy);
  const tx = smooth(fx - cx);
  const ty = smooth(fy - cy);
  const a = lattice(seed, cx, cy, salt);
  const b = lattice(seed, cx + 1, cy, salt);
  const c = lattice(seed, cx, cy + 1, salt);
  const d = lattice(seed, cx + 1, cy + 1, salt);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
};

/** Upland soils by rising noise value (the floodplain is placed first, as bands). */
const UPLAND: readonly SoilId[] = ['sandy', 'terraRoxa', 'clay', 'stony'];

/** Indices sorted by value, ascending. */
const ranked = (values: Float64Array, indices: number[]): number[] =>
  indices.slice().sort((i, j) => (values[i] ?? 0) - (values[j] ?? 0));

const generate = (seed: number): Uint8Array => {
  const grid = new Uint8Array(TILE_COUNT);
  const upland = new Float64Array(TILE_COUNT);
  const lowland = new Float64Array(TILE_COUNT);
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const i = y * GRID_SIZE + x;
      upland[i] = valueNoise(seed, x, y, 11, 11, 1) * 0.8 + valueNoise(seed, x, y, 5, 5, 2) * 0.2;
      // Stretched along x: the floodplain reads as bands, like low ground by a stream.
      lowland[i] = valueNoise(seed, x, y, 26, 7, 3) * 0.85 + valueNoise(seed, x, y, 6, 6, 4) * 0.15;
    }
  }
  const all = Array.from({ length: TILE_COUNT }, (_, i) => i);
  // Quantiles hit the target shares exactly: the top of the lowland noise is floodplain...
  const flood = Math.round(TILE_COUNT * SOILS.floodplain.share);
  const byLowland = ranked(lowland, all);
  const floodTiles = new Set(byLowland.slice(TILE_COUNT - flood));
  const floodIndex = SOIL_IDS.indexOf('floodplain');
  for (const i of floodTiles) grid[i] = floodIndex;
  // ...and the rest is split by the upland noise.
  const rest = ranked(upland, all.filter((i) => !floodTiles.has(i)));
  const uplandShare = 1 - SOILS.floodplain.share;
  let start = 0;
  UPLAND.forEach((id, k) => {
    const end = k === UPLAND.length - 1 ? rest.length : start + Math.round((rest.length * SOILS[id].share) / uplandShare);
    const value = SOIL_IDS.indexOf(id);
    for (let n = start; n < end; n++) grid[rest[n] ?? 0] = value;
    start = end;
  });
  return grid;
};

/** The starting land (x 16–47, y 32–63) should show at least this many soil types. */
const START_TYPES = 3;
const START = { x0: 16, x1: 47, y0: 32, y1: 63 } as const;

const startTypes = (grid: Uint8Array): number => {
  const types = new Set<number>();
  for (let y = START.y0; y <= START.y1; y++) for (let x = START.x0; x <= START.x1; x++) types.add(grid[y * GRID_SIZE + x] ?? 0);
  return types.size;
};

const cache = new Map<number, Uint8Array>();

/** Soil type index (into SOIL_IDS) of every tile for a seed. Cached. */
export const soilGrid = (seed: number): Uint8Array => {
  const hit = cache.get(seed);
  if (hit) return hit;
  // Shift the noise until the starting land is varied enough (almost always the first try).
  let grid = generate(seed);
  for (let k = 1; k < 16 && startTypes(grid) < START_TYPES; k++) grid = generate(seed + k * 104729);
  cache.set(seed, grid);
  return grid;
};

/** Soil of a tile; null when the farm has uniform soil (no seed). */
export const soilAt = (seed: number | null, tile: number): SoilId | null => {
  if (seed === null) return null;
  return SOIL_IDS[soilGrid(seed)[tile] ?? 0] ?? null;
};

/** How a crop does on a tile: a greenhouse (or a greenhouse crop) ignores the soil. */
export const cropRating = (seed: number | null, tile: Tile, tileIndex: number, cropId: CropId): SoilRating => {
  if (tile.cover || cropId === 'strawberry' || CROPS[cropId].kind === 'greenhouse') return 'neutral';
  const soil = soilAt(seed, tileIndex);
  return soil ? CROP_SOIL[cropId][soil] : 'neutral';
};

export const soilYield = (rating: SoilRating): number => SOIL_RATINGS[rating].yield;

/** Multiplies the time to plow a tile (1 under a greenhouse or with uniform soil). */
export const plowFactor = (seed: number | null, tile: Tile, tileIndex: number): number => {
  if (tile.cover) return 1;
  const soil = soilAt(seed, tileIndex);
  return soil ? SOILS[soil].plowFactor : 1;
};

/** Multiplies the pasture a tile of grass gives. */
export const pastureFactor = (seed: number | null, tileIndex: number): number => {
  const soil = soilAt(seed, tileIndex);
  return soil ? SOILS[soil].pastureFactor : 1;
};

/** Whole units from a soil multiplier: the fraction becomes one more unit when `roll` (0–1) is under it. */
export const soilUnits = (multiplier: number, roll: number): number => {
  const whole = Math.floor(multiplier);
  return whole + (roll < multiplier - whole ? 1 : 0);
};

/**
 * Crops on bad soil wither when they grow past WITHER_AT of their growth between `before` and `tiles`:
 * the tile goes back to plain tilled soil (the fertilizer is lost too). Crops already past it (a save from
 * before the soil, plants left by a demolished greenhouse) are spared. Returns the same array when nothing
 * withers.
 */
export const witherCrops = (
  before: readonly Tile[],
  tiles: Tile[],
  seed: number | null,
): { tiles: Tile[]; withered: Partial<Record<CropId, number>> } => {
  const withered: Partial<Record<CropId, number>> = {};
  if (seed === null) return { tiles, withered };
  let next: Tile[] | null = null;
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    const crop = tile?.crop;
    if (!tile || !crop) continue;
    const threshold = growthMinutesNeeded(crop) * WITHER_AT;
    if (crop.growthMinutes < threshold) continue;
    const earlier = before[i]?.crop;
    if (earlier && earlier.cropId === crop.cropId && earlier.growthMinutes >= threshold) continue;
    if (cropRating(seed, tile, i, crop.cropId) !== 'bad') continue;
    next ??= tiles.slice();
    next[i] = { state: 'tilled' };
    withered[crop.cropId] = (withered[crop.cropId] ?? 0) + 1;
  }
  return { tiles: next ?? tiles, withered };
};
