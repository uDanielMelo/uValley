import { GRID_SIZE } from '../data/world';
import { inBounds, tileIndex } from './grid';
import type { GridPoint, Tile } from './types';

/** Workers walk on owned land that has no structure. */
export const isWalkable = (tiles: readonly Tile[], x: number, y: number): boolean => {
  if (!inBounds(x, y)) return false;
  const tile = tiles[tileIndex(x, y)];
  return !!tile && tile.state !== 'locked' && !tile.structure;
};

const SAMPLE_STEP = 0.2;

/** True when the straight segment a → b only crosses tiles accepted by `passable`. */
export const segmentClear = (a: GridPoint, b: GridPoint, passable: (x: number, y: number) => boolean): boolean => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / SAMPLE_STEP));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!passable(Math.floor(a.x + dx * t), Math.floor(a.y + dy * t))) return false;
  }
  return true;
};

/** True when the straight segment a → b only crosses walkable tiles. */
export const lineClear = (tiles: readonly Tile[], a: GridPoint, b: GridPoint): boolean =>
  segmentClear(a, b, (x, y) => isWalkable(tiles, x, y));

const NEIGHBOURS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

const octile = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
};

/** A* over tiles (8 directions, no corner cutting). Returns tile indices from start to goal, or null. */
const searchTiles = (
  tiles: readonly Tile[],
  sx: number,
  sy: number,
  gx: number,
  gy: number,
): number[] | null => {
  const start = tileIndex(sx, sy);
  const goal = tileIndex(gx, gy);
  const cost = new Map<number, number>([[start, 0]]);
  const parent = new Map<number, number>();
  const open = new Map<number, number>([[start, octile(sx, sy, gx, gy)]]);
  const closed = new Set<number>();
  const passable = (x: number, y: number) =>
    (x === sx && y === sy) || (x === gx && y === gy) || isWalkable(tiles, x, y);

  while (open.size > 0) {
    let current = -1;
    let best = Infinity;
    for (const [index, f] of open) {
      if (f < best) {
        best = f;
        current = index;
      }
    }
    if (current === goal) {
      const route = [current];
      let node = parent.get(current);
      while (node !== undefined) {
        route.push(node);
        node = parent.get(node);
      }
      return route.reverse();
    }
    open.delete(current);
    closed.add(current);
    const cx = current % GRID_SIZE;
    const cy = Math.floor(current / GRID_SIZE);
    const base = cost.get(current) ?? 0;
    for (const [dx, dy, step] of NEIGHBOURS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(nx, ny) || !passable(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!passable(cx + dx, cy) || !passable(cx, cy + dy))) continue;
      const next = tileIndex(nx, ny);
      if (closed.has(next)) continue;
      const g = base + step;
      if (g >= (cost.get(next) ?? Infinity)) continue;
      cost.set(next, g);
      parent.set(next, current);
      open.set(next, g + octile(nx, ny, gx, gy));
    }
  }
  return null;
};

/**
 * Waypoints (tile space) from `from` to `to`, avoiding structures and locked land.
 * Straight line when possible; otherwise an A* route with redundant corners removed.
 * The last waypoint is always `to`. Falls back to a straight line when no route exists.
 */
export const findPath = (tiles: readonly Tile[], from: GridPoint, to: GridPoint): GridPoint[] => {
  if (lineClear(tiles, from, to)) return [{ ...to }];
  const route = searchTiles(
    tiles,
    Math.floor(from.x),
    Math.floor(from.y),
    Math.floor(to.x),
    Math.floor(to.y),
  );
  if (!route) return [{ ...to }];
  const centers = route.slice(1, -1).map((index) => ({
    x: (index % GRID_SIZE) + 0.5,
    y: Math.floor(index / GRID_SIZE) + 0.5,
  }));
  const points = [...centers, { ...to }];
  // String pulling: skip every waypoint that is directly visible from the current anchor.
  const result: GridPoint[] = [];
  let anchor = from;
  let i = 0;
  while (i < points.length) {
    let far = i;
    for (let j = points.length - 1; j > i; j--) {
      const candidate = points[j];
      if (candidate && lineClear(tiles, anchor, candidate)) {
        far = j;
        break;
      }
    }
    const point = points[far];
    if (!point) break;
    result.push(point);
    anchor = point;
    i = far + 1;
  }
  return result;
};
