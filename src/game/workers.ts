import type { CropId } from '../data/crops';
import { ROAD_COST, ROAD_WALK_BONUS } from '../data/roads';
import { MINUTES_PER_DAY } from '../data/world';
import { ANIMALS, COLLECT_MINUTES } from '../data/animals';
import { MAX_TASKS, TASK_MINUTES, WALK_SPEED, WORK_END_HOUR, WORK_START_HOUR } from '../data/workers';
import { laborMultipliers } from './animals';
import { careMinutes } from './health';
import { mainSpecies } from './shelters';
import { addWork, cancelAllOrders, roadTaskMinutes, workSpot } from './construction';
import { loaderSpot } from './dock';
import { addShipmentWork, cancelAllLoading, repairHaulTasks } from './shipments';
import { inBounds, tileCoords, tileIndex } from './grid';
import { homeSpot } from './home';
import { addCount } from './inventory';
import { findPath } from './path';
import { hash01 } from './random';
import { gainMastery, harvestBonusChance, unassign, workEffectiveness, workSpeed, type TaskContext } from './staff';
import { applyTask, lastTaskOn, projectTasks } from './tasks';
import {
  type ActionError,
  type GameState,
  type GridPoint,
  type Task,
  type TaskKind,
  type ToolId,
  type Worker,
  type WorkerActivity,
} from './types';

export { applyTask, homeSpot, projectTasks };

// ---------- workers ----------

export const isWorkTime = (gameMinutes: number): boolean => {
  const hour = (((gameMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY) / 60;
  return hour >= WORK_START_HOUR && hour < WORK_END_HOUR;
};

export const workerActivity = (state: GameState, worker: Worker): WorkerActivity => {
  if (worker.path.length > 0) return 'walking';
  if (worker.taskId !== null) return 'working';
  return isWorkTime(state.gameMinutes) ? 'idle' : 'resting';
};

// ---------- tasks ----------

const removeTask = (state: GameState, taskId: number): GameState => ({
  ...state,
  tasks: state.tasks.filter((t) => t.id !== taskId),
  workers: state.workers.map((w) =>
    w.taskId === taskId ? { ...w, taskId: null, path: [], progress: 0 } : w,
  ),
});

const sameOrder = (task: Task, kind: ToolId, cropId: CropId): boolean =>
  task.kind === kind && (kind !== 'seed' || task.cropId === cropId);

export type QueueResult =
  | { ok: true; state: GameState; change: 'queued' | 'cancelled' }
  | { ok: false; error: ActionError };

/**
 * Click on a tile with a tool: cancels the tile's last queued task when it is the same order,
 * otherwise queues a new task if it will be valid once the tasks before it are done.
 */
export const toggleTask = (
  state: GameState,
  kind: ToolId,
  tile: number,
  cropId: CropId,
): QueueResult => {
  const last = lastTaskOn(state.tasks, tile);
  if (last && sameOrder(last, kind, cropId)) {
    return { ok: true, state: removeTask(state, last.id), change: 'cancelled' };
  }
  if (state.tasks.length >= MAX_TASKS) return { ok: false, error: 'queue-full' };
  const task: Task = { id: state.nextId, kind, tile, cropId: kind === 'seed' ? cropId : null, workerId: null };
  const check = applyTask(projectTasks(state), task);
  if (!check.ok) return { ok: false, error: check.error };
  return {
    ok: true,
    state: { ...state, tasks: [...state.tasks, task], nextId: state.nextId + 1 },
    change: 'queued',
  };
};

/** Dragging over an area queues the order everywhere, or cancels it when it starts on a tile that already has it. */
export type AreaMode = 'queue' | 'cancel';

export const areaMode = (state: GameState, kind: ToolId, anchor: number, cropId: CropId): AreaMode => {
  const last = lastTaskOn(state.tasks, anchor);
  return last && sameOrder(last, kind, cropId) ? 'cancel' : 'queue';
};

export interface AreaResult {
  state: GameState;
  mode: AreaMode;
  /** Tiles that got the order (queue) or lost it (cancel). */
  changed: number[];
  /** First reason a tile was left out, for the message when nothing changed. */
  error: ActionError | null;
}

/**
 * Applies an order to many tiles at once. Queue mode validates each tile against the queued
 * future (with the tiles before it in the area already applied, so seeds run out as expected) and
 * skips tiles that already have the order or would fail. Cancel mode removes the order from the
 * tiles where it is the last one queued.
 */
export const applyArea = (
  state: GameState,
  kind: ToolId,
  tiles: readonly number[],
  cropId: CropId,
  mode: AreaMode,
): AreaResult => {
  if (mode === 'cancel') {
    const removed = new Set<number>();
    const changed: number[] = [];
    for (const tile of tiles) {
      const last = lastTaskOn(state.tasks, tile);
      if (last && sameOrder(last, kind, cropId)) {
        removed.add(last.id);
        changed.push(tile);
      }
    }
    if (removed.size === 0) return { state, mode, changed, error: null };
    const next: GameState = {
      ...state,
      tasks: state.tasks.filter((t) => !removed.has(t.id)),
      workers: state.workers.map((w) =>
        w.taskId !== null && removed.has(w.taskId) ? { ...w, taskId: null, path: [], progress: 0 } : w,
      ),
    };
    return { state: next, mode, changed, error: null };
  }

  let projected = projectTasks(state);
  let nextId = state.nextId;
  let error: ActionError | null = null;
  const added: Task[] = [];
  const changed: number[] = [];
  for (const tile of tiles) {
    const last = lastTaskOn(state.tasks, tile);
    if (last && sameOrder(last, kind, cropId)) continue;
    if (state.tasks.length + added.length >= MAX_TASKS) {
      error = 'queue-full';
      break;
    }
    const task: Task = { id: nextId, kind, tile, cropId: kind === 'seed' ? cropId : null, workerId: null };
    const result = applyTask(projected, task);
    if (!result.ok) {
      error ??= result.error;
      continue;
    }
    projected = result.state;
    added.push(task);
    changed.push(tile);
    nextId++;
  }
  if (added.length === 0) return { state, mode, changed, error };
  return { state: { ...state, tasks: [...state.tasks, ...added], nextId }, mode, changed, error };
};

/**
 * Empties the queue: sites, demolitions and customers' loadings are called off and queued roads
 * refunded. Freight already being loaded keeps its loaders (the sale is closed).
 */
export const clearTasks = (state: GameState): GameState => repairHaulTasks(cancelAllOrders(cancelAllLoading(state)));

/** Queued task kinds that no worker has in their list (they would wait forever). */
export const unstaffedKinds = (state: GameState): TaskKind[] => {
  const covered = new Set(state.workers.flatMap((w) => w.priorities));
  return [...new Set(state.tasks.map((t) => t.kind))].filter((k) => !covered.has(k));
};

// ---------- simulation ----------

const tileCenter = (tile: number): GridPoint => {
  const { x, y } = tileCoords(tile);
  return { x: x + 0.5, y: y + 0.5 };
};

/**
 * Where a worker stands to do a task: on its tile, beside the wall for structure and shelter
 * work, or between the platform and the vehicle when loading at the dock.
 */
export const taskSpot = (state: GameState, task: Task, from: GridPoint): GridPoint => {
  const job = task.job;
  if (job?.type === 'shipment') {
    const shipment = state.shipments.find((s) => s.id === job.shipmentId);
    const dock = shipment && state.structures.find((s) => s.id === shipment.dockId);
    return dock ? loaderSpot(dock, shipment?.bay ?? 0, job.slot) : tileCenter(task.tile);
  }
  if (job?.type !== 'structure' && job?.type !== 'shelter') return tileCenter(task.tile);
  const site = state.structures.find((s) => s.id === job.structureId);
  return (site && workSpot(state, site, task.tile, from)) ?? tileCenter(task.tile);
};

/** Work minutes (at speed 1) of a task that is done in one go (structure work and loading accumulate). */
export const taskMinutes = (task: Task): number => {
  if (task.kind === 'haul') return 1;
  if (task.kind === 'tend') return careMinutes(task.job) ?? COLLECT_MINUTES;
  if (task.kind === 'build') return roadTaskMinutes(task.job?.type === 'road' && task.job.remove);
  return TASK_MINUTES[task.kind];
};

/** How far along a worker's current job is (0–1): the whole site for structure work. Null when idle. */
export const taskProgress = (state: GameState, worker: Worker): number | null => {
  const task = worker.taskId === null ? undefined : state.tasks.find((t) => t.id === worker.taskId);
  if (!task) return null;
  const job = task.job;
  if (job?.type === 'structure') {
    const work = state.structures.find((s) => s.id === job.structureId)?.work;
    return work && work.total > 0 ? Math.min(1, work.done / work.total) : null;
  }
  if (job?.type === 'shipment') {
    const work = state.shipments.find((s) => s.id === job.shipmentId)?.work;
    return work && work.total > 0 ? Math.min(1, work.done / work.total) : null;
  }
  return Math.min(1, worker.progress / taskMinutes(task));
};

/**
 * Tasks a free worker may take: unassigned and first in the queue for their tile. Loaders never
 * change their tile, so several of them (each at their own spot by the vehicle) share it.
 */
const availableTasks = (tasks: readonly Task[]): Task[] => {
  const seen = new Set<number>();
  const result: Task[] = [];
  for (const task of tasks) {
    if (task.kind === 'haul') {
      if (task.workerId === null) result.push(task);
      continue;
    }
    if (seen.has(task.tile)) continue;
    seen.add(task.tile);
    if (task.workerId === null) result.push(task);
  }
  return result;
};

/** The task a free worker takes: the first kind in their priority list that has work, then the nearest. */
const bestTask = (worker: Worker, tasks: readonly Task[]): Task | undefined => {
  let best: Task | undefined;
  let bestRank = Infinity;
  let bestDistance = Infinity;
  for (const task of availableTasks(tasks)) {
    const rank = worker.priorities.indexOf(task.kind);
    if (rank < 0 || rank > bestRank) continue;
    const c = tileCenter(task.tile);
    const d = Math.hypot(c.x - worker.x, c.y - worker.y);
    if (rank < bestRank || d < bestDistance) {
      best = task;
      bestRank = rank;
      bestDistance = d;
    }
  }
  return best;
};

/** What a task works on: the crop being planted or the one on the tile, or the animals tended. */
export const taskContext = (state: GameState, task: Pick<Task, 'kind' | 'tile' | 'cropId' | 'job'>): TaskContext => {
  if (task.kind === 'seed') return { kind: task.kind, cropId: task.cropId };
  if (task.kind === 'tend') {
    const job = task.job;
    if (job?.type === 'medicate') {
      return { kind: task.kind, cropId: null, animalId: state.animals.find((a) => a.id === job.animalId)?.kind ?? null };
    }
    if (job?.type === 'carcass') {
      return { kind: task.kind, cropId: null, animalId: state.carcasses.find((c) => c.id === job.carcassId)?.kind ?? null };
    }
    return { kind: task.kind, cropId: null, animalId: job?.type === 'shelter' ? mainSpecies(state, job.structureId) : null };
  }
  if (task.kind === 'hoe' || task.kind === 'build' || task.kind === 'haul') return { kind: task.kind, cropId: null };
  return { kind: task.kind, cropId: state.tiles[task.tile]?.crop?.cropId ?? null };
};

/**
 * Effective harvests and collections can give one extra unit (rolled deterministically from the
 * task id): a crop when harvesting, the main product when collecting at a shelter.
 */
const effectivenessBonus = (state: GameState, worker: Worker, task: Task, context: TaskContext): GameState => {
  if (task.kind !== 'hand' && task.job?.type !== 'shelter') return state;
  if (hash01(task.id * 7 + 3) >= harvestBonusChance(workEffectiveness(worker, context))) return state;
  const { inventory } = state;
  if (task.kind === 'hand' && context.cropId) {
    return { ...state, inventory: { ...inventory, produce: addCount(inventory.produce, context.cropId, 1) } };
  }
  const product = context.animalId ? ANIMALS[context.animalId].product : null;
  if (task.kind === 'tend' && task.job?.type === 'shelter' && product) {
    return { ...state, inventory: { ...inventory, products: addCount(inventory.products, product, 1) } };
  }
  return state;
};

/** Walks along the path for up to `minutes`. Returns the moved worker and unused minutes. */
const walk = (worker: Worker, minutes: number, speed: number): { worker: Worker; leftover: number } => {
  let budget = minutes * speed;
  let { x, y } = worker;
  let index = 0;
  while (index < worker.path.length && budget > 0) {
    const target = worker.path[index];
    if (!target) break;
    const d = Math.hypot(target.x - x, target.y - y);
    if (d <= budget) {
      x = target.x;
      y = target.y;
      budget -= d;
      index++;
    } else {
      x += ((target.x - x) / d) * budget;
      y += ((target.y - y) / d) * budget;
      budget = 0;
    }
  }
  const path = index === 0 ? worker.path : worker.path.slice(index);
  return { worker: { ...worker, x, y, path }, leftover: budget / speed };
};

const HOME_EPSILON = 0.05;

/** Walking speed multiplier for the tile the worker is standing on (roads are faster). */
const groundSpeed = (state: GameState, worker: Worker): number => {
  const x = Math.floor(worker.x);
  const y = Math.floor(worker.y);
  return inBounds(x, y) && state.tiles[tileIndex(x, y)]?.road ? 1 + ROAD_WALK_BONUS : 1;
};

/**
 * Moves every worker for `minutes` of game time: picks tasks (by each worker's priorities),
 * walks, works at a speed set by their attributes and applies finished tasks to the farm.
 * Outside work hours (and when idle) workers head home.
 */
export const stepWorkers = (state: GameState, minutes: number): GameState => {
  if (minutes <= 0 || state.workers.length === 0) return state;
  const workTime = isWorkTime(state.gameMinutes);
  const labor = laborMultipliers(state);
  let world = state;
  let tasks = state.tasks;
  const workers = state.workers.slice();

  for (let i = 0; i < workers.length; i++) {
    let w = workers[i];
    if (!w) continue;

    const assigned = w.taskId;
    if (assigned !== null && !tasks.some((t) => t.id === assigned)) {
      w = { ...w, taskId: null, path: [], progress: 0 };
    }
    if (!workTime && w.taskId !== null) {
      tasks = unassign(tasks, w.id);
      w = { ...w, taskId: null, path: [], progress: 0 };
    }
    if (workTime && w.taskId === null) {
      const task = bestTask(w, tasks);
      if (task) {
        const workerId = w.id;
        tasks = tasks.map((t) => (t.id === task.id ? { ...t, workerId } : t));
        w = { ...w, taskId: task.id, progress: 0, path: findPath(world.tiles, w, taskSpot(world, task, w)) };
      }
    }
    if (w.taskId === null && w.path.length === 0) {
      const home = homeSpot(world, i);
      if (Math.hypot(home.x - w.x, home.y - w.y) > HOME_EPSILON) {
        w = { ...w, path: findPath(world.tiles, w, home) };
      }
    }

    const moved = walk(w, minutes, WALK_SPEED * labor.walk * groundSpeed(world, w));
    w = moved.worker;

    const taskId = w.taskId;
    const task = taskId === null ? undefined : tasks.find((t) => t.id === taskId);
    if (task && w.path.length === 0 && moved.leftover > 0) {
      const boost = task.kind === 'hoe' ? labor.hoe : 1;
      const context = taskContext(world, task);
      const work = moved.leftover * workSpeed(w, context) * boost;
      const job = task.job;
      if (job?.type === 'structure') {
        // Site work is kept on the structure, so it survives the end of the shift and crew changes.
        world = addWork({ ...world, tasks, workers }, job.structureId, work);
        tasks = world.tasks;
        if (!world.structures.find((s) => s.id === job.structureId)?.work) {
          // Finished (the site's tasks are gone), or a stray task without a site.
          tasks = tasks.filter((t) => t.id !== task.id);
          w = { ...w, taskId: null, progress: 0 };
        }
      } else if (job?.type === 'shipment') {
        // Loading is kept on the shipment: several loaders add to it and it survives crew changes.
        world = addShipmentWork({ ...world, tasks, workers }, job.shipmentId, work);
        tasks = world.tasks;
        if (!world.shipments.find((s) => s.id === job.shipmentId)?.work) {
          tasks = tasks.filter((t) => t.id !== task.id);
          w = { ...w, taskId: null, progress: 0 };
        }
      } else {
        const progress = w.progress + work;
        if (progress >= taskMinutes(task)) {
          const result = applyTask({ ...world, tasks, workers }, task);
          if (result.ok) world = effectivenessBonus(result.state, w, task, context);
          // A road that can no longer be opened gives its money back.
          else if (job?.type === 'road' && !job.remove) world = { ...world, money: world.money + ROAD_COST };
          tasks = tasks.filter((t) => t.id !== task.id);
          w = { ...w, taskId: null, progress: 0 };
          // Work on a crop builds mastery of it.
          if (result.ok && context.cropId && task.kind !== 'tend' && task.kind !== 'build') w = gainMastery(w, context.cropId);
        } else {
          w = { ...w, progress };
        }
      }
    }
    workers[i] = w;
  }
  return { ...world, tasks, workers };
};
