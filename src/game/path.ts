import { ROAD_WALK_BONUS } from '../data/roads';
import { GRID_SIZE } from '../data/world';
import { inBounds, tileIndex } from './grid';
import type { GridPoint, Tile } from './types';

/** Workers walk on owned land that has no structure. */
export const isWalkable = (tiles: readonly Tile[], x: number, y: number): boolean => {
  if (!inBounds(x, y)) return false;
  const tile = tiles[tileIndex(x, y)];
  return !!tile && tile.state !== 'locked' && !tile.structure;
};

/** Cost of crossing one road tile (open ground costs 1): roads are walked faster, so routes prefer them. */
const ROAD_STEP = 1 / (1 + ROAD_WALK_BONUS);
/** Straight walks shorter than this (tiles) never look for a road. */
const SHORT_WALK = 3;

const isRoadAt = (tiles: readonly Tile[], x: number, y: number): boolean =>
  inBounds(x, y) && tiles[tileIndex(x, y)]?.road === true;

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

/** Octile distance at road cost, so the estimate never overshoots. */
const estimate = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)) * ROAD_STEP;
};

/** Binary min-heap of tile indices by score; an index may be pushed again with a better score. */
class Frontier {
  private readonly items: number[] = [];
  private readonly scores: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, score: number): void {
    const { items, scores } = this;
    let i = items.length;
    items.push(item);
    scores.push(score);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const parentScore = scores[parent] ?? 0;
      if (parentScore <= score) break;
      items[i] = items[parent] ?? 0;
      scores[i] = parentScore;
      i = parent;
    }
    items[i] = item;
    scores[i] = score;
  }

  pop(): number | undefined {
    const { items, scores } = this;
    const top = items[0];
    const lastItem = items.pop();
    const lastScore = scores.pop();
    if (items.length === 0 || lastItem === undefined || lastScore === undefined) return top;
    let i = 0;
    for (;;) {
      const left = i * 2 + 1;
      const right = left + 1;
      let smallest = i;
      let best = lastScore;
      const leftScore = scores[left];
      if (leftScore !== undefined && leftScore < best) {
        smallest = left;
        best = leftScore;
      }
      const rightScore = scores[right];
      if (rightScore !== undefined && rightScore < best) smallest = right;
      if (smallest === i) break;
      items[i] = items[smallest] ?? 0;
      scores[i] = scores[smallest] ?? 0;
      i = smallest;
    }
    items[i] = lastItem;
    scores[i] = lastScore;
    return top;
  }
}

/**
 * A* over tiles (8 directions, no corner cutting). A step costs less on roads, so routes follow
 * them when that is quicker. Returns tile indices from start to goal, or null.
 */
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
  const closed = new Set<number>();
  const open = new Frontier();
  open.push(start, estimate(sx, sy, gx, gy));
  const passable = (x: number, y: number) =>
    (x === sx && y === sy) || (x === gx && y === gy) || isWalkable(tiles, x, y);
  const ground = (x: number, y: number) => (isRoadAt(tiles, x, y) ? ROAD_STEP : 1);

  while (open.size > 0) {
    const current = open.pop();
    if (current === undefined) break;
    if (closed.has(current)) continue;
    if (current === goal) {
      const route = [current];
      let node = parent.get(current);
      while (node !== undefined) {
        route.push(node);
        node = parent.get(node);
      }
      return route.reverse();
    }
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
      // Half of each step is walked on either tile.
      const g = base + (step * (ground(cx, cy) + ground(nx, ny))) / 2;
      if (g >= (cost.get(next) ?? Infinity)) continue;
      cost.set(next, g);
      parent.set(next, current);
      open.push(next, g + estimate(nx, ny, gx, gy));
    }
  }
  return null;
};

/**
 * Waypoints (tile space) from `from` to `to`, avoiding structures and locked land and taking the
 * roads when they are quicker. Short or all-road walks go straight; otherwise an A* route is pulled
 * tight, but never across open ground where it runs along a road (people keep to the roads and
 * their bends). The last waypoint is always `to`. Falls back to a straight line when no route exists.
 */
export const findPath = (tiles: readonly Tile[], from: GridPoint, to: GridPoint): GridPoint[] => {
  const walkable = (x: number, y: number) => isWalkable(tiles, x, y);
  const onRoad = (x: number, y: number) => isRoadAt(tiles, x, y);
  if (segmentClear(from, to, walkable)) {
    const short = Math.hypot(to.x - from.x, to.y - from.y) < SHORT_WALK;
    if (short || segmentClear(from, to, onRoad)) return [{ ...to }];
  }
  const route = searchTiles(tiles, Math.floor(from.x), Math.floor(from.y), Math.floor(to.x), Math.floor(to.y));
  if (!route) return [{ ...to }];
  const centers = route.slice(1, -1).map((index) => ({
    x: (index % GRID_SIZE) + 0.5,
    y: Math.floor(index / GRID_SIZE) + 0.5,
  }));
  const points = [...centers, { ...to }];
  // points[k] lies on route[k + 1]: whether it is on a road.
  const roadPoint = route.slice(1).map((index) => onRoad(index % GRID_SIZE, Math.floor(index / GRID_SIZE)));
  const result: GridPoint[] = [];
  let anchor = from;
  let i = 0;
  while (i < points.length) {
    let far = i;
    for (let j = points.length - 1; j > i; j--) {
      const candidate = points[j];
      if (!candidate || !segmentClear(anchor, candidate, walkable)) continue;
      // Skipping road waypoints is only fine along the road itself.
      if (roadPoint.slice(i, j).some(Boolean) && !segmentClear(anchor, candidate, onRoad)) continue;
      far = j;
      break;
    }
    const point = points[far];
    if (!point) break;
    result.push(point);
    anchor = point;
    i = far + 1;
  }
  return result;
};
