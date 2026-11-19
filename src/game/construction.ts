/**
 * Construction is work for the crew: placing a structure opens a site, demolishing queues the
 * tear-down, and roads are opened or removed tile by tile. Money is paid when ordering (like seeds
 * reserved by the queue) and returned in full when the order is cancelled.
 */
import { ROAD_COST, ROAD_WORK_MINUTES } from '../data/roads';
import { BUILD_CREW_MAX, type ShelterLevel, type StructureId } from '../data/structures';
import { MAX_TASKS } from '../data/workers';
import { inBounds, tileCoords, tileIndex } from './grid';
import { isWalkable } from './path';
import { roadError } from './roads';
import { collectShelter, nextShelterLevel, shelterDef } from './shelters';
import {
  buildCost,
  buildMinutesFor,
  checkDemolish,
  demolishMinutesFor,
  footprintCells,
  footprintOf,
  placeStructure,
  refundFor,
  removeStructure,
  structureAt,
  upgradeCost,
  upgradeMinutes,
} from './structures';
import { dropTasks, lastTaskOn, projectTasks } from './tasks';
import {
  fail,
  ok,
  type ActionError,
  type ActionResult,
  type GameState,
  type GridPoint,
  type Rotation,
  type StructureInstance,
  type StructureWork,
  type Task,
} from './types';

// ---------- the crew around a site ----------

/** Footprint tiles on the edge, clockwise from the top-left corner. */
const edgeCells = (s: StructureInstance): GridPoint[] => {
  const { x, y, width, depth } = footprintOf(s.type, s.x, s.y, s.rotation);
  const ring: GridPoint[] = [];
  for (let dx = 0; dx < width; dx++) ring.push({ x: x + dx, y });
  for (let dy = 1; dy < depth; dy++) ring.push({ x: x + width - 1, y: y + dy });
  if (depth > 1) for (let dx = width - 2; dx >= 0; dx--) ring.push({ x: x + dx, y: y + depth - 1 });
  if (width > 1) for (let dy = depth - 2; dy >= 1; dy--) ring.push({ x, y: y + dy });
  return ring;
};

/** Footprint tiles the crew works from: one task each, spread around the edge (up to BUILD_CREW_MAX). */
export const crewTiles = (s: StructureInstance): number[] => {
  const ring = edgeCells(s);
  const n = Math.min(BUILD_CREW_MAX, ring.length);
  const result: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = ring[Math.floor((i * ring.length) / n)];
    if (c) result.push(tileIndex(c.x, c.y));
  }
  return result;
};

const SIDES: readonly GridPoint[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];
/** How far from the footprint cell's center a builder stands (0.5 is the wall). */
const WALL_REACH = 0.8;

/**
 * Where a builder stands to work on a footprint tile: just outside the wall, on walkable ground,
 * as close as possible to that tile (then to the worker). Null when the site is walled in.
 */
export const workSpot = (state: GameState, s: StructureInstance, tile: number, from: GridPoint): GridPoint | null => {
  const fp = footprintOf(s.type, s.x, s.y, s.rotation);
  const inside = (x: number, y: number) => x >= fp.x && x < fp.x + fp.width && y >= fp.y && y < fp.y + fp.depth;
  const goal = tileCoords(tile);
  let best: GridPoint | null = null;
  let bestScore = Infinity;
  for (const c of footprintCells(fp)) {
    for (const side of SIDES) {
      const nx = c.x + side.x;
      const ny = c.y + side.y;
      if (inside(nx, ny) || !inBounds(nx, ny) || !isWalkable(state.tiles, nx, ny)) continue;
      const spot = { x: c.x + 0.5 + side.x * WALL_REACH, y: c.y + 0.5 + side.y * WALL_REACH };
      const score =
        Math.hypot(c.x - goal.x, c.y - goal.y) * 10 + Math.hypot(spot.x - from.x, spot.y - from.y) * 0.01;
      if (score < bestScore) {
        bestScore = score;
        best = spot;
      }
    }
  }
  return best;
};

// ---------- structure sites ----------

/** Queues the crew tasks for a structure's work (one per crew tile not already queued). */
const addSiteTasks = (state: GameState, s: StructureInstance): GameState => {
  const queued = new Set(
    state.tasks.filter((t) => t.job?.type === 'structure' && t.job.structureId === s.id).map((t) => t.tile),
  );
  let nextId = state.nextId;
  const added: Task[] = [];
  for (const tile of crewTiles(s)) {
    if (queued.has(tile)) continue;
    added.push({ id: nextId++, kind: 'build', tile, cropId: null, workerId: null, job: { type: 'structure', structureId: s.id } });
  }
  return added.length === 0 ? state : { ...state, tasks: [...state.tasks, ...added], nextId };
};

const isSiteTask = (structureId: number) => (t: Task) => t.job?.type === 'structure' && t.job.structureId === structureId;

/** Any task on a structure: its site work or its chores (when the structure goes away). */
const isTaskOn = (structureId: number) => (t: Task) =>
  (t.job?.type === 'structure' || t.job?.type === 'shelter') && t.job.structureId === structureId;

const withWork = (state: GameState, structureId: number, work: StructureWork | undefined): GameState => ({
  ...state,
  structures: state.structures.map((s) => {
    if (s.id !== structureId) return s;
    if (work) return { ...s, work };
    const { work: _done, ...rest } = s;
    return rest;
  }),
});

const startWork = (state: GameState, structureId: number, work: StructureWork): GameState => {
  const next = withWork(state, structureId, work);
  const s = next.structures.find((x) => x.id === structureId);
  return s ? addSiteTasks(next, s) : next;
};

/** Why a structure cannot be ordered there, or null when it can (the queue also needs room). */
export const checkStructureOrder = (state: GameState): ActionError | null =>
  state.tasks.length + BUILD_CREW_MAX > MAX_TASKS ? 'queue-full' : null;

/** Opens a construction site: pays the cost, reserves the footprint and queues the crew's work. */
export const orderStructure = (
  state: GameState,
  type: StructureId,
  x: number,
  y: number,
  rotation: Rotation = 0,
): ActionResult => {
  const queueError = checkStructureOrder(state);
  if (queueError) return fail(queueError);
  const placed = placeStructure(state, type, x, y, rotation);
  if (!placed.ok) return placed;
  return ok(startWork(placed.state, state.nextId, { kind: 'build', done: 0, total: buildMinutesFor(type) }));
};

/** Queues the tear-down of the finished structure covering a tile (paid back when it is done). */
export const orderDemolish = (state: GameState, tile: number): ActionResult => {
  const found = checkDemolish(state, tile);
  if (typeof found === 'string') return fail(found);
  const queueError = checkStructureOrder(state);
  if (queueError) return fail(queueError);
  return ok(startWork(state, found.id, { kind: 'demolish', done: 0, total: demolishMinutesFor(found.type) }));
};

/** Why a shelter cannot be upgraded now, or the level it would reach. */
export const checkUpgrade = (state: GameState, structureId: number): ShelterLevel | ActionError => {
  const s = state.structures.find((x) => x.id === structureId);
  if (!s || !shelterDef(s.type)) return 'no-structure';
  if (s.work) return 'under-construction';
  const toLevel = nextShelterLevel(s);
  if (!toLevel) return 'max-level';
  if (state.money < upgradeCost(s.type, toLevel)) return 'not-enough-money';
  return checkStructureOrder(state) ?? toLevel;
};

/** Queues upgrading a shelter to its next level, paying for it now. The shelter keeps working meanwhile. */
export const orderUpgrade = (state: GameState, structureId: number): ActionResult => {
  const toLevel = checkUpgrade(state, structureId);
  if (typeof toLevel === 'string') return fail(toLevel);
  const s = state.structures.find((x) => x.id === structureId);
  if (!s) return fail('no-structure');
  const paid = { ...state, money: state.money - upgradeCost(s.type, toLevel) };
  return ok(startWork(paid, structureId, { kind: 'upgrade', done: 0, total: upgradeMinutes(s.type, toLevel), toLevel }));
};

/**
 * Cancels a structure's work: a site is cleared with a full refund, a demolition is called off and
 * an upgrade is called off with a full refund.
 */
export const cancelWork = (state: GameState, structureId: number): ActionResult => {
  const s = state.structures.find((x) => x.id === structureId);
  if (!s?.work) return fail('no-structure');
  if (s.work.kind === 'demolish') return ok(withWork(dropTasks(state, isSiteTask(structureId)), structureId, undefined));
  if (s.work.kind === 'upgrade') {
    const refund = s.work.toLevel ? upgradeCost(s.type, s.work.toLevel) : 0;
    const called = withWork(dropTasks(state, isSiteTask(structureId)), structureId, undefined);
    return ok({ ...called, money: called.money + refund });
  }
  const removed = removeStructure(dropTasks(state, isTaskOn(structureId)), structureId);
  return ok({ ...removed, money: removed.money + buildCost(s.type) });
};

/**
 * Finishes a structure's work: the building is ready, the shelter reaches its new level, or it is
 * gone, part of what it cost comes back and whatever products were left in it go to the inventory.
 */
export const completeWork = (state: GameState, structureId: number): GameState => {
  const s = state.structures.find((x) => x.id === structureId);
  if (!s?.work) return state;
  if (s.work.kind === 'build') return withWork(dropTasks(state, isSiteTask(structureId)), structureId, undefined);
  if (s.work.kind === 'upgrade') {
    const toLevel = s.work.toLevel;
    const done = withWork(dropTasks(state, isSiteTask(structureId)), structureId, undefined);
    return toLevel
      ? { ...done, structures: done.structures.map((x) => (x.id === structureId ? { ...x, level: toLevel } : x)) }
      : done;
  }
  const emptied = collectShelter(state, structureId);
  const removed = removeStructure(dropTasks(emptied.ok ? emptied.state : state, isTaskOn(structureId)), structureId);
  return { ...removed, money: removed.money + refundFor(s.type, s.level) };
};

/** Adds work minutes to a site; finishes it when the work is complete. */
export const addWork = (state: GameState, structureId: number, minutes: number): GameState => {
  const s = state.structures.find((x) => x.id === structureId);
  if (!s?.work || minutes <= 0) return state;
  const done = s.work.done + minutes;
  if (done >= s.work.total) return completeWork(state, structureId);
  return withWork(state, structureId, { ...s.work, done });
};

/** Share of a structure's work already done (0–1), or null when nothing is under way. */
export const workProgress = (s: StructureInstance): number | null =>
  s.work ? (s.work.total > 0 ? Math.min(1, s.work.done / s.work.total) : 1) : null;

/** Finishes every site and demolition at once (dev tools). */
export const completeAllWork = (state: GameState): GameState =>
  state.structures.reduce((s, x) => (x.work ? completeWork(s, x.id) : s), state);

// ---------- roads ----------

/** The last road task on a tile, if the tile's last order is one. */
const pendingRoadTask = (state: GameState, tile: number): Task | undefined => {
  const last = lastTaskOn(state.tasks, tile);
  return last?.job?.type === 'road' ? last : undefined;
};

const roadTask = (state: GameState, tile: number, remove: boolean): Task => ({
  id: state.nextId,
  kind: 'build',
  tile,
  cropId: null,
  workerId: null,
  job: { type: 'road', remove },
});

/** Why a road cannot be ordered on this tile (judged on the queued future), or null when it can. */
export const checkRoadOrder = (state: GameState, tile: number): ActionError | null => {
  if (state.tasks.length >= MAX_TASKS) return 'queue-full';
  const error = roadError(projectTasks(state), tile);
  if (error) return error;
  return state.money < ROAD_COST ? 'not-enough-money' : null;
};

/** Queues opening a road tile, paying for it now. */
export const orderRoad = (state: GameState, tile: number): ActionResult => {
  const error = checkRoadOrder(state, tile);
  if (error) return fail(error);
  return ok({
    ...state,
    money: state.money - ROAD_COST,
    tasks: [...state.tasks, roadTask(state, tile, false)],
    nextId: state.nextId + 1,
  });
};

/** Queues removing the road on a tile of the farm. */
export const orderRoadRemoval = (state: GameState, tile: number): ActionResult => {
  if (state.tasks.length >= MAX_TASKS) return fail('queue-full');
  const future = projectTasks(state).tiles[tile];
  if (!future?.road) return fail('no-road');
  if (future.state === 'locked') return fail('locked');
  return ok({ ...state, tasks: [...state.tasks, roadTask(state, tile, true)], nextId: state.nextId + 1 });
};

/** Cancels a queued road task, returning what was paid for it. */
const cancelRoadTask = (state: GameState, task: Task): GameState => {
  const refund = task.job?.type === 'road' && !task.job.remove ? ROAD_COST : 0;
  const dropped = dropTasks(state, (t) => t.id === task.id);
  return { ...dropped, money: dropped.money + refund };
};

/** Work minutes (at speed 1) of a road task. */
export const roadTaskMinutes = (remove: boolean): number =>
  remove ? ROAD_WORK_MINUTES.remove : ROAD_WORK_MINUTES.build;

export type RoadClick = { ok: true; state: GameState; change: 'queued' | 'cancelled' } | { ok: false; error: ActionError };

/** Road tool on a tile: cancels a road queued there, otherwise orders one. */
export const roadClick = (state: GameState, tile: number): RoadClick => {
  const pending = pendingRoadTask(state, tile);
  if (pending?.job?.type === 'road' && !pending.job.remove) {
    return { ok: true, state: cancelRoadTask(state, pending), change: 'cancelled' };
  }
  const result = orderRoad(state, tile);
  return result.ok ? { ok: true, state: result.state, change: 'queued' } : result;
};

// ---------- the demolish tool ----------

export type DemolishChange =
  | { kind: 'build-cancelled'; type: StructureId; refund: number }
  | { kind: 'upgrade-cancelled'; type: StructureId; refund: number }
  | { kind: 'demolish-queued'; type: StructureId; refund: number }
  | { kind: 'demolish-cancelled'; type: StructureId }
  | { kind: 'road-cancelled'; refund: number }
  | { kind: 'road-removal-queued' };

export type DemolishClick = { ok: true; state: GameState; change: DemolishChange } | { ok: false; error: ActionError };

/**
 * Demolish tool on a tile. It undoes what is pending there (a queued road, a site, an upgrade, a
 * demolition) and otherwise queues tearing down the structure or the road.
 */
export const demolishClick = (state: GameState, tile: number): DemolishClick => {
  const pending = pendingRoadTask(state, tile);
  if (pending?.job?.type === 'road') {
    const refund = pending.job.remove ? 0 : ROAD_COST;
    return { ok: true, state: cancelRoadTask(state, pending), change: { kind: 'road-cancelled', refund } };
  }
  const found = structureAt(state, tile);
  if (found?.work) {
    const result = cancelWork(state, found.id);
    if (!result.ok) return result;
    const { kind, toLevel } = found.work;
    const change: DemolishChange =
      kind === 'build'
        ? { kind: 'build-cancelled', type: found.type, refund: buildCost(found.type) }
        : kind === 'upgrade'
          ? { kind: 'upgrade-cancelled', type: found.type, refund: toLevel ? upgradeCost(found.type, toLevel) : 0 }
          : { kind: 'demolish-cancelled', type: found.type };
    return { ok: true, state: result.state, change };
  }
  if (found) {
    const result = orderDemolish(state, tile);
    const refund = refundFor(found.type, found.level);
    return result.ok ? { ok: true, state: result.state, change: { kind: 'demolish-queued', type: found.type, refund } } : result;
  }
  if (state.tiles[tile]?.road) {
    const result = orderRoadRemoval(state, tile);
    return result.ok ? { ok: true, state: result.state, change: { kind: 'road-removal-queued' } } : result;
  }
  return { ok: false, error: 'no-road' };
};

// ---------- whole queue ----------

/** "Cancel everything": empties the queue, calls off every site and demolition and refunds roads. */
export const cancelAllOrders = (state: GameState): GameState => {
  const roadRefund = state.tasks.filter((t) => t.job?.type === 'road' && !t.job.remove).length * ROAD_COST;
  let next: GameState = { ...state, money: state.money + roadRefund };
  for (const s of state.structures) {
    if (!s.work) continue;
    const result = cancelWork(next, s.id);
    if (result.ok) next = result.state;
  }
  return dropTasks(next, () => true);
};

/**
 * Keeps the queue and the sites consistent (after loading a save): drops construction and chore
 * tasks without their structure and requeues the crew of sites that lost their tasks.
 */
export const repairSiteTasks = (state: GameState): GameState => {
  const sites = new Set(state.structures.filter((s) => s.work).map((s) => s.id));
  const shelters = new Set(state.structures.filter((s) => shelterDef(s.type)).map((s) => s.id));
  let next = dropTasks(state, (t) => {
    const job = t.job;
    // Animal care (medicate, carcass) is checked by queueAnimalCare as the game runs.
    if (t.kind === 'tend') {
      if (!job || job.type === 'structure' || job.type === 'road') return true;
      return job.type === 'shelter' && !shelters.has(job.structureId);
    }
    if (t.kind !== 'build') return false;
    return !job || (job.type !== 'structure' && job.type !== 'road') || (job.type === 'structure' && !sites.has(job.structureId));
  });
  for (const s of next.structures) if (s.work) next = addSiteTasks(next, s);
  return next;
};
