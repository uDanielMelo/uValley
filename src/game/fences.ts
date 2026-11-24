/**
 * Player-built fences and gates. A fence sits on one tile of free grass and links to its 8
 * neighbours, so a run may go straight or at 45°. Ordering pays now and queues one 'build' task per
 * tile, like roads; people walk through gates, animals only through open ones.
 */
import { FENCE_MATERIALS, FENCE_RECIPES, FENCE_WORK_MINUTES, type FenceMaterialId, type FencePiece } from '../data/fences';
import { ROAD_RING } from '../data/roads';
import { DEMOLISH_REFUND } from '../data/structures';
import { MAX_TASKS } from '../data/workers';
import { inBounds, isValidTileIndex, tileCoords, tileIndex, withTile } from './grid';
import { ringAround } from './roads';
import { isPasture } from './shelters';
import { footprintOf } from './structures';
import { dropTasks, lastTaskOn, projectTasks } from './tasks';
import {
  fail,
  ok,
  type ActionError,
  type ActionResult,
  type GameState,
  type GridPoint,
  type StructureInstance,
  type Task,
  type Tile,
} from './types';

/** The 8 directions, counter-clockwise from +x, one per 45°. */
const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

/** 8-connected tiles from a to b, snapped to the nearest 0°/45°/90° direction from a (stops at the map edge). */
export const fenceLine = (a: number, b: number): { tiles: number[]; diagonal: boolean } => {
  const p = tileCoords(a);
  const q = tileCoords(b);
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  if (dx === 0 && dy === 0) return { tiles: [a], diagonal: false };
  const octant = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
  const [sx, sy] = DIRECTIONS[octant] ?? [1, 0];
  const diagonal = sx !== 0 && sy !== 0;
  const steps = diagonal ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.abs(sx !== 0 ? dx : dy);
  const tiles = [a];
  for (let k = 1; k <= steps; k++) {
    const x = p.x + sx * k;
    const y = p.y + sy * k;
    if (!inBounds(x, y)) break;
    tiles.push(tileIndex(x, y));
  }
  return { tiles, diagonal };
};

export interface MaterialCount {
  id: FenceMaterialId;
  label: string;
  unit: string;
  amount: number;
}

export interface FencePlan {
  /** The whole snapped line. */
  tiles: number[];
  piece: FencePiece;
  /** Tiles that will be queued. */
  valid: number[];
  /** Tiles skipped (taken or not free). */
  blocked: number[];
  /** Coins for the valid tiles. */
  cost: number;
  /** Summed over the valid tiles, only materials actually used. */
  materials: MaterialCount[];
  error: ActionError | null;
}

/** Price of one tile of a piece: its materials, rounded up. */
export const pieceCost = (piece: FencePiece): number => {
  const recipe = FENCE_RECIPES[piece];
  let total = 0;
  for (const [id, amount] of Object.entries(recipe) as [FenceMaterialId, number][]) total += FENCE_MATERIALS[id].price * amount;
  return Math.ceil(total - 1e-9);
};

/** Why this tile cannot take a fence (or a gate) on these tiles, or null when it can. */
const tileFenceError = (tiles: readonly Tile[], index: number, gate: boolean): ActionError | null => {
  const tile = isValidTileIndex(index) ? tiles[index] : undefined;
  if (!tile) return 'out-of-bounds';
  if (tile.state === 'locked') return 'locked';
  if (tile.structure || tile.cover) return 'structure';
  if (tile.road) return 'road';
  if (tile.fence) return gate && !tile.fence.gate ? null : 'already-fence';
  if (tile.state !== 'grass') return 'not-grass';
  return null;
};

/** Why a fence (or gate) cannot be ordered on this tile, judged on the queued future; null when it can. */
export const fenceError = (state: GameState, tile: number, gate: boolean): ActionError | null =>
  tileFenceError(projectTasks(state).tiles, tile, gate);

/** What ordering a fence line (or, with `gate`, a gate on `from`) would mean. */
export const fencePlan = (state: GameState, from: number, to: number, gate = false): FencePlan => {
  const line = gate ? { tiles: [from], diagonal: false } : fenceLine(from, to);
  const piece: FencePiece = gate ? 'gate' : line.diagonal ? 'diagonal' : 'straight';
  const future = projectTasks(state).tiles;
  const valid: number[] = [];
  const blocked: number[] = [];
  for (const t of line.tiles) (tileFenceError(future, t, gate) === null ? valid : blocked).push(t);
  const cost = valid.length * pieceCost(piece);
  const recipe = FENCE_RECIPES[piece];
  const materials: MaterialCount[] = [];
  for (const id of Object.keys(FENCE_MATERIALS) as FenceMaterialId[]) {
    const amount = (recipe[id] ?? 0) * valid.length;
    if (amount > 0) materials.push({ id, label: FENCE_MATERIALS[id].label, unit: FENCE_MATERIALS[id].unit, amount });
  }
  const error: ActionError | null =
    valid.length === 0
      ? gate
        ? tileFenceError(future, from, true)
        : 'no-room-for-fence'
      : state.tasks.length + valid.length > MAX_TASKS
        ? 'queue-full'
        : state.money < cost
          ? 'not-enough-money'
          : null;
  return { tiles: line.tiles, piece, valid, blocked, cost, materials, error };
};

/** The fence task still to build on a tile, if the tile's last order is one. */
export const pendingFenceTask = (state: GameState, tile: number): Task | undefined => {
  const last = lastTaskOn(state.tasks, tile);
  return last?.job?.type === 'fence' ? last : undefined;
};

/** Cancels a queued fence task, giving back what was paid for it. */
export const cancelFenceTask = (state: GameState, task: Task): GameState => {
  const refund = task.job?.type === 'fence' ? task.job.cost : 0;
  const dropped = dropTasks(state, (t) => t.id === task.id);
  return { ...dropped, money: dropped.money + refund };
};

const queuePlan = (state: GameState, plan: FencePlan): ActionResult => {
  if (plan.error) return fail(plan.error);
  const cost = pieceCost(plan.piece);
  const gate = plan.piece === 'gate';
  const tasks: Task[] = plan.valid.map((tile, k) => ({
    id: state.nextId + k,
    kind: 'build',
    tile,
    cropId: null,
    workerId: null,
    job: gate ? { type: 'fence', remove: false, gate: true, cost } : { type: 'fence', remove: false, cost },
  }));
  return ok({
    ...state,
    money: state.money - plan.cost,
    tasks: [...state.tasks, ...tasks],
    nextId: state.nextId + tasks.length,
  });
};

/**
 * Orders a fence from `from` to `to` (snapped to 45°), paying for the free tiles and skipping the
 * rest. A single click on a tile whose last order is a fence to build cancels it instead.
 */
export const orderFenceLine = (state: GameState, from: number, to: number): ActionResult => {
  if (from === to) {
    const pending = pendingFenceTask(state, from);
    if (pending?.job?.type === 'fence' && !pending.job.remove) return ok(cancelFenceTask(state, pending));
  }
  return queuePlan(state, fencePlan(state, from, to));
};

/** Orders a gate on one tile: on free grass or on a fence that is not a gate yet. */
export const orderGate = (state: GameState, tile: number): ActionResult => queuePlan(state, fencePlan(state, tile, tile, true));

/** Builds the fence or gate on a tile (what a finished task does; already paid for). */
export const layFence = (state: GameState, index: number, gate: boolean): ActionResult => {
  const error = tileFenceError(state.tiles, index, gate);
  if (error) return fail(error);
  return ok({ ...state, tiles: withTile(state.tiles, index, { state: 'grass', fence: gate ? { gate: true } : {} }) });
};

/** Coins a finished removal gives back. */
export const fenceRefund = (tile: Tile): number =>
  Math.round(DEMOLISH_REFUND * pieceCost(tile.fence?.gate ? 'gate' : 'straight'));

/** Takes the fence off a tile (what a finished removal does), giving back part of its price. */
export const removeFence = (state: GameState, index: number): ActionResult => {
  const tile = isValidTileIndex(index) ? state.tiles[index] : undefined;
  if (!tile?.fence) return fail('no-fence');
  return ok({ ...state, money: state.money + fenceRefund(tile), tiles: withTile(state.tiles, index, { state: 'grass' }) });
};

/** Queues taking a built fence away (free; part of its price comes back when it is done). */
export const orderFenceRemoval = (state: GameState, tile: number): ActionResult => {
  if (state.tasks.length >= MAX_TASKS) return fail('queue-full');
  if (!projectTasks(state).tiles[tile]?.fence) return fail('no-fence');
  const task: Task = { id: state.nextId, kind: 'build', tile, cropId: null, workerId: null, job: { type: 'fence', remove: true, cost: 0 } };
  return ok({ ...state, tasks: [...state.tasks, task], nextId: state.nextId + 1 });
};

/** Opens or closes a gate at once. */
export const toggleGate = (state: GameState, index: number): ActionResult => {
  const tile = isValidTileIndex(index) ? state.tiles[index] : undefined;
  if (!tile?.fence) return fail('no-fence');
  if (!tile.fence.gate) return fail('not-gate');
  const fence = tile.fence.open ? { gate: true as const } : { gate: true as const, open: true as const };
  return ok({ ...state, tiles: withTile(state.tiles, index, { ...tile, fence }) });
};

/** Work minutes (at speed 1) of a fence task. */
export const fenceTaskMinutes = (job: { remove: boolean; gate?: true }): number =>
  job.remove ? FENCE_WORK_MINUTES.remove : job.gate ? FENCE_WORK_MINUTES.gate : FENCE_WORK_MINUTES.build;

// ---------- animals ----------

/** Animals may stand here: pasture, or an open gate. */
export const animalPassable = (tiles: readonly Tile[], x: number, y: number): boolean => {
  if (isPasture(tiles, x, y)) return true;
  const fence = inBounds(x, y) ? tiles[tileIndex(x, y)]?.fence : undefined;
  return fence?.gate === true && fence.open === true;
};

const areaCache = new WeakMap<readonly Tile[], Map<string, ReadonlySet<number>>>();

/**
 * Tiles a shelter's animals may graze: everything reachable (4 directions, over pasture and open
 * gates) from the grass just outside the shelter's road ring. Fences, closed gates, roads and
 * buildings bound it. Cached per tiles array.
 */
export const pastureArea = (tiles: readonly Tile[], shelter: Pick<StructureInstance, 'type' | 'x' | 'y' | 'rotation'>): ReadonlySet<number> => {
  const key = `${shelter.type}:${shelter.x}:${shelter.y}:${shelter.rotation}`;
  let byShelter = areaCache.get(tiles);
  const cached = byShelter?.get(key);
  if (cached) return cached;
  const area = new Set<number>();
  const queue: number[] = [];
  for (const c of ringAround(footprintOf(shelter.type, shelter.x, shelter.y, shelter.rotation), ROAD_RING + 1)) {
    if (!animalPassable(tiles, c.x, c.y)) continue;
    const index = tileIndex(c.x, c.y);
    if (!area.has(index)) {
      area.add(index);
      queue.push(index);
    }
  }
  while (queue.length > 0) {
    const current = queue.pop();
    if (current === undefined) break;
    const { x, y } = tileCoords(current);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (!animalPassable(tiles, nx, ny)) continue;
      const next = tileIndex(nx, ny);
      if (area.has(next)) continue;
      area.add(next);
      queue.push(next);
    }
  }
  if (!byShelter) {
    byShelter = new Map();
    areaCache.set(tiles, byShelter);
  }
  byShelter.set(key, area);
  return area;
};

/** True when a fence stands on the grass just outside the shelter's road ring (a pen built tight around it). */
export const pennedTight = (tiles: readonly Tile[], shelter: Pick<StructureInstance, 'type' | 'x' | 'y' | 'rotation'>): boolean =>
  ringAround(footprintOf(shelter.type, shelter.x, shelter.y, shelter.rotation), ROAD_RING + 1).some(
    (c) => inBounds(c.x, c.y) && tiles[tileIndex(c.x, c.y)]?.fence !== undefined,
  );

/** Centre of the area tile nearest to p, or null when the area is empty. */
export const nearestInArea = (area: ReadonlySet<number>, p: GridPoint): GridPoint | null => {
  let best: GridPoint | null = null;
  let bestDistance = Infinity;
  for (const index of area) {
    const { x, y } = tileCoords(index);
    const d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y);
    if (d < bestDistance) {
      bestDistance = d;
      best = { x: x + 0.5, y: y + 0.5 };
    }
  }
  return best;
};
