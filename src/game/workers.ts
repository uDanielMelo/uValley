import { CROP_IDS, type CropId } from '../data/crops';
import { ROAD_WALK_BONUS } from '../data/roads';
import { MINUTES_PER_DAY } from '../data/world';
import { MAX_TASKS, TASK_MINUTES, WALK_SPEED, WORK_END_HOUR, WORK_START_HOUR } from '../data/workers';
import { applyTool, plant } from './actions';
import { laborMultipliers } from './animals';
import { inBounds, tileCoords, tileIndex } from './grid';
import { homeSpot } from './home';
import { addCount } from './inventory';
import { findPath } from './path';
import { hash01 } from './random';
import { harvestBonusChance, unassign, workEffectiveness, workSpeed, type TaskContext } from './staff';
import {
  type ActionError,
  type ActionResult,
  fail,
  type GameState,
  type GridPoint,
  type Task,
  type ToolId,
  type Worker,
  type WorkerActivity,
} from './types';

export { homeSpot };

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

/** Runs a task's action against a state. */
export const applyTask = (state: GameState, task: Pick<Task, 'kind' | 'tile' | 'cropId'>): ActionResult => {
  if (task.kind === 'seed') return task.cropId ? plant(state, task.tile, task.cropId) : fail('no-seeds');
  return applyTool(state, task.kind, task.tile, CROP_IDS[0]);
};

/** The state as it will be once every queued task is done (failing tasks are skipped). */
export const projectTasks = (state: GameState): GameState =>
  state.tasks.reduce<GameState>((s, task) => {
    const result = applyTask(s, task);
    return result.ok ? result.state : s;
  }, state);

const removeTask = (state: GameState, taskId: number): GameState => ({
  ...state,
  tasks: state.tasks.filter((t) => t.id !== taskId),
  workers: state.workers.map((w) =>
    w.taskId === taskId ? { ...w, taskId: null, path: [], progress: 0 } : w,
  ),
});

const lastTaskOn = (tasks: readonly Task[], tile: number): Task | undefined => {
  let last: Task | undefined;
  for (const t of tasks) if (t.tile === tile) last = t;
  return last;
};

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

export const clearTasks = (state: GameState): GameState => ({
  ...state,
  tasks: [],
  workers: state.workers.map((w) => (w.taskId === null ? w : { ...w, taskId: null, path: [], progress: 0 })),
});

/** Queued task kinds that no worker has in their list (they would wait forever). */
export const unstaffedKinds = (state: GameState): ToolId[] => {
  const covered = new Set(state.workers.flatMap((w) => w.priorities));
  return [...new Set(state.tasks.map((t) => t.kind))].filter((k) => !covered.has(k));
};

// ---------- simulation ----------

const tileCenter = (tile: number): GridPoint => {
  const { x, y } = tileCoords(tile);
  return { x: x + 0.5, y: y + 0.5 };
};

/** Tasks a free worker may take: unassigned and first in the queue for their tile. */
const availableTasks = (tasks: readonly Task[]): Task[] => {
  const seen = new Set<number>();
  const result: Task[] = [];
  for (const task of tasks) {
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

/** What a task works on: the crop being planted, or the one on the tile (none for tilling). */
export const taskContext = (state: GameState, task: Pick<Task, 'kind' | 'tile' | 'cropId'>): TaskContext => {
  if (task.kind === 'seed') return { kind: task.kind, cropId: task.cropId };
  if (task.kind === 'hoe') return { kind: task.kind, cropId: null };
  return { kind: task.kind, cropId: state.tiles[task.tile]?.crop?.cropId ?? null };
};

/** Effective harvests can give one extra unit (rolled deterministically from the task id). */
const harvestBonus = (state: GameState, worker: Worker, task: Task, cropId: CropId | null): GameState => {
  if (task.kind !== 'hand' || cropId === null) return state;
  const chance = harvestBonusChance(workEffectiveness(worker, { kind: 'hand', cropId }));
  if (hash01(task.id * 7 + 3) >= chance) return state;
  return { ...state, inventory: { ...state.inventory, produce: addCount(state.inventory.produce, cropId, 1) } };
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
        w = { ...w, taskId: task.id, progress: 0, path: findPath(world.tiles, w, tileCenter(task.tile)) };
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
      const progress = w.progress + moved.leftover * workSpeed(w, context) * boost;
      if (progress >= TASK_MINUTES[task.kind]) {
        const result = applyTask({ ...world, tasks, workers }, task);
        if (result.ok) world = harvestBonus(result.state, w, task, context.cropId);
        tasks = tasks.filter((t) => t.id !== task.id);
        w = { ...w, taskId: null, progress: 0 };
      } else {
        w = { ...w, progress };
      }
    }
    workers[i] = w;
  }
  return { ...world, tasks, workers };
};
