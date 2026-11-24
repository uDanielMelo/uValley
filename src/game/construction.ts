/**
 * Construction is work for the crew: placing a structure opens a site, demolishing queues the
 * tear-down, and roads are opened or removed tile by tile. Money is paid when ordering (like seeds
 * reserved by the queue) and returned in full when the order is cancelled.
 */
import { ROAD_COST, ROAD_WORK_MINUTES } from '../data/roads';
import { BUILD_CREW_MAX, type ShelterLevel, type StructureId } from '../data/structures';
import { MAX_TASKS } from '../data/workers';
import { inBounds, tileCoords, tileIndex } from './grid';
import { cancelFenceTask, orderFenceRemoval, pendingFenceTask } from './fences';
import { isWalkable } from './path';
import { roadError, roadNetwork } from './roads';
import { collectShelter, nextShelterLevel, shelterDef } from './shelters';
import { isDock, nextDockLevel, upgradeRoads } from './dock';
import { nextShedLevel } from './parking';
import {
  buildCost,
  buildMinutesFor,
  checkDemolish,
  checkPlacement,
  demolishMinutesFor,
  footprintCells,
  footprintOf,
  needsRoadAccess,
  occupyFootprint,
  placementCost,
  refundFor,
  removeStructure,
  ringPlan,
  structureAt,
  upgradeCost,
  upgradeMinutes,
  type RingPlan,
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
export const checkStructureOrder = (state: GameState, extraTasks = 0): ActionError | null =>
  state.tasks.length + BUILD_CREW_MAX + extraTasks > MAX_TASKS ? 'queue-full' : null;

/** What ordering a structure there would mean: why not, the price, its road ring and whether it reaches the network. */
export interface PlacementPreview {
  error: ActionError | null;
  /** The structure plus the new road tiles of its ring. */
  cost: number;
  /** Ring tiles inside the map and what each would be. */
  ring: RingPlan['cells'];
  /** Ring tiles that still need a road. */
  newRoads: number[];
  /** The ring touches a road linked to the access road (counting queued roads), or no road is needed. */
  connects: boolean;
}

/** Judges an order on the queued future: the ring may use queued roads, and must reach the network to work. */
export const previewPlacement = (
  state: GameState,
  type: StructureId,
  x: number,
  y: number,
  rotation: Rotation,
): PlacementPreview => {
  const future = projectTasks(state).tiles;
  const plan = ringPlan(future, type, x, y, rotation);
  const network = roadNetwork(future);
  const linked = (index: number): boolean => {
    if (network.has(index)) return true;
    const { x: cx, y: cy } = tileCoords(index);
    return SIDES.some((d) => inBounds(cx + d.x, cy + d.y) && network.has(tileIndex(cx + d.x, cy + d.y)));
  };
  const error =
    checkPlacement(state, type, x, y, rotation, future) ?? checkStructureOrder(state, plan.newRoads.length);
  return {
    error,
    cost: placementCost(type, plan.newRoads.length),
    ring: plan.cells,
    newRoads: plan.newRoads,
    connects: !needsRoadAccess(type) || plan.cells.some((c) => c.status !== 'blocked' && linked(c.tile)),
  };
};

/**
 * Opens a construction site: pays for it and for its road ring, reserves the footprint and queues
 * the crew's work, with one road task (tied to the site) per ring tile still without a road.
 */
export const orderStructure = (
  state: GameState,
  type: StructureId,
  x: number,
  y: number,
  rotation: Rotation = 0,
): ActionResult => {
  const preview = previewPlacement(state, type, x, y, rotation);
  if (preview.error) return fail(preview.error);
  const siteId = state.nextId;
  const placed = occupyFootprint(state, type, x, y, rotation, preview.cost);
  const site = startWork(placed, siteId, { kind: 'build', done: 0, total: buildMinutesFor(type) });
  let nextId = site.nextId;
  const roads: Task[] = preview.newRoads.map((tile) => ({
    id: nextId++,
    kind: 'build',
    tile,
    cropId: null,
    workerId: null,
    job: { type: 'road', remove: false, siteId },
  }));
  return ok({ ...site, tasks: [...site.tasks, ...roads], nextId });
};

/** Queues the tear-down of the finished structure covering a tile (paid back when it is done). */
export const orderDemolish = (state: GameState, tile: number): ActionResult => {
  const found = checkDemolish(state, tile);
  if (typeof found === 'string') return fail(found);
  const queueError = checkStructureOrder(state);
  if (queueError) return fail(queueError);
  return ok(startWork(state, found.id, { kind: 'demolish', done: 0, total: demolishMinutesFor(found.type) }));
};

/** New road tiles a dock upgrade needs for its bays (judged on the queued future), or why it cannot have them. */
export const dockUpgradeRoads = (state: GameState, s: StructureInstance, toLevel: ShelterLevel): number[] | ActionError => {
  if (!isDock(s) || (toLevel !== 2 && toLevel !== 3)) return [];
  const future = projectTasks(state);
  const tiles = upgradeRoads(future.tiles, s, toLevel);
  return tiles.some((t) => t < 0 || roadError(future, t) !== null) ? 'no-room-for-road' : tiles;
};

/** What an upgrade costs in all: the upgrade itself plus the new road it needs. */
export const upgradeTotal = (state: GameState, s: StructureInstance, toLevel: ShelterLevel): number => {
  const roads = dockUpgradeRoads(state, s, toLevel);
  return upgradeCost(s.type, toLevel) + (typeof roads === 'string' ? 0 : roads.length * ROAD_COST);
};

/** Why a shelter or the dock cannot be upgraded now, or the level it would reach. */
export const checkUpgrade = (state: GameState, structureId: number): ShelterLevel | ActionError => {
  const s = state.structures.find((x) => x.id === structureId);
  if (!s || (!shelterDef(s.type) && !isDock(s) && s.type !== 'machineShed')) return 'no-structure';
  if (s.work) return 'under-construction';
  const toLevel = isDock(s) ? nextDockLevel(s) : s.type === 'machineShed' ? nextShedLevel(s) : nextShelterLevel(s);
  if (!toLevel) return 'max-level';
  const roads = dockUpgradeRoads(state, s, toLevel);
  if (typeof roads === 'string') return roads;
  if (state.money < upgradeCost(s.type, toLevel) + roads.length * ROAD_COST) return 'not-enough-money';
  return checkStructureOrder(state, roads.length) ?? toLevel;
};

/**
 * Queues upgrading a shelter or the dock to its next level, paying for it now (a dock also pays for
 * and queues the road its new bays need). It keeps working meanwhile.
 */
export const orderUpgrade = (state: GameState, structureId: number): ActionResult => {
  const toLevel = checkUpgrade(state, structureId);
  if (typeof toLevel === 'string') return fail(toLevel);
  const s = state.structures.find((x) => x.id === structureId);
  if (!s) return fail('no-structure');
  const roads = dockUpgradeRoads(state, s, toLevel);
  if (typeof roads === 'string') return fail(roads);
  const paid = { ...state, money: state.money - upgradeCost(s.type, toLevel) - roads.length * ROAD_COST };
  const site = startWork(paid, structureId, { kind: 'upgrade', done: 0, total: upgradeMinutes(s.type, toLevel), toLevel });
  let nextId = site.nextId;
  const roadTasks: Task[] = roads.map((tile) => ({
    id: nextId++,
    kind: 'build',
    tile,
    cropId: null,
    workerId: null,
    job: { type: 'road', remove: false, siteId: structureId },
  }));
  return ok({ ...site, tasks: [...site.tasks, ...roadTasks], nextId });
};

const isRingRoadOf = (structureId: number) => (t: Task) =>
  t.job?.type === 'road' && !t.job.remove && t.job.siteId === structureId;

/**
 * Cancels a structure's work: a site is cleared with a full refund (its queued ring roads too; the
 * ones already opened stay), a demolition is called off and an upgrade is called off with a full
 * refund.
 */
export const cancelWork = (state: GameState, structureId: number): ActionResult => {
  const s = state.structures.find((x) => x.id === structureId);
  if (!s?.work) return fail('no-structure');
  if (s.work.kind === 'demolish') return ok(withWork(dropTasks(state, isSiteTask(structureId)), structureId, undefined));
  if (s.work.kind === 'upgrade') {
    // The upgrade and the road still queued for it come back (a dock's new bays).
    const roads = state.tasks.filter(isRingRoadOf(structureId)).length;
    const refund = (s.work.toLevel ? upgradeCost(s.type, s.work.toLevel) : 0) + roads * ROAD_COST;
    const called = withWork(dropTasks(state, (t) => isSiteTask(structureId)(t) || isRingRoadOf(structureId)(t)), structureId, undefined);
    return ok({ ...called, money: called.money + refund });
  }
  const roads = state.tasks.filter(isRingRoadOf(structureId)).length;
  const cleared = dropTasks(state, (t) => isTaskOn(structureId)(t) || isRingRoadOf(structureId)(t));
  const removed = removeStructure(cleared, structureId);
  return ok({ ...removed, money: removed.money + buildCost(s.type) + roads * ROAD_COST });
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
  | { kind: 'road-removal-queued' }
  | { kind: 'fence-cancelled'; refund: number }
  | { kind: 'fence-removal-queued' };

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
  const fence = pendingFenceTask(state, tile);
  if (fence?.job?.type === 'fence') {
    return { ok: true, state: cancelFenceTask(state, fence), change: { kind: 'fence-cancelled', refund: fence.job.cost } };
  }
  const found = structureAt(state, tile);
  if (found?.work) {
    const result = cancelWork(state, found.id);
    if (!result.ok) return result;
    const { kind, toLevel } = found.work;
    const ringRefund = state.tasks.filter(isRingRoadOf(found.id)).length * ROAD_COST;
    const change: DemolishChange =
      kind === 'build'
        ? { kind: 'build-cancelled', type: found.type, refund: buildCost(found.type) + ringRefund }
        : kind === 'upgrade'
          ? { kind: 'upgrade-cancelled', type: found.type, refund: (toLevel ? upgradeCost(found.type, toLevel) : 0) + ringRefund }
          : { kind: 'demolish-cancelled', type: found.type };
    return { ok: true, state: result.state, change };
  }
  if (found) {
    const result = orderDemolish(state, tile);
    const refund = refundFor(found.type, found.level);
    return result.ok ? { ok: true, state: result.state, change: { kind: 'demolish-queued', type: found.type, refund } } : result;
  }
  if (state.tiles[tile]?.fence) {
    const result = orderFenceRemoval(state, tile);
    return result.ok ? { ok: true, state: result.state, change: { kind: 'fence-removal-queued' } } : result;
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
  // Sites first: they refund their own ring roads.
  let next: GameState = state;
  for (const s of state.structures) {
    if (!s.work) continue;
    const result = cancelWork(next, s.id);
    if (result.ok) next = result.state;
  }
  const roadRefund = next.tasks.filter((t) => t.job?.type === 'road' && !t.job.remove).length * ROAD_COST;
  const fenceRefund = next.tasks.reduce((sum, t) => sum + (t.job?.type === 'fence' ? t.job.cost : 0), 0);
  return dropTasks({ ...next, money: next.money + roadRefund + fenceRefund }, () => true);
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
      if (!job || job.type === 'structure' || job.type === 'road' || job.type === 'fence') return true;
      return job.type === 'shelter' && !shelters.has(job.structureId);
    }
    if (t.kind !== 'build') return false;
    if (job?.type === 'fence') return false;
    return !job || (job.type !== 'structure' && job.type !== 'road') || (job.type === 'structure' && !sites.has(job.structureId));
  });
  for (const s of next.structures) if (s.work) next = addSiteTasks(next, s);
  return next;
};
