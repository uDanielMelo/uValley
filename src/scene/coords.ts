import { GRID_SIZE } from '../data/world';
import { tileCoords } from '../game/grid';

/** Tile thickness; tile tops sit at y = 0. */
export const TILE_HEIGHT = 0.2;

const HALF = GRID_SIZE / 2;

/** World X/Z of a tile's center. Grid center is the world origin. */
export const tileToWorld = (x: number, y: number): [number, number] => [x - HALF + 0.5, y - HALF + 0.5];

export const indexToWorld = (index: number): [number, number] => {
  const { x, y } = tileCoords(index);
  return tileToWorld(x, y);
};

/** World X/Z of a tile corner (grid line intersection). */
export const cornerToWorld = (x: number, y: number): [number, number] => [x - HALF, y - HALF];

/** Deterministic pseudo-random in [0, 1) from an integer seed. */
export { hash01 } from '../game/random';
