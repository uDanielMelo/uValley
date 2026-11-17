import { CROP_IDS, type CropId } from '../data/crops';
import { ROAD_WALK_BONUS } from '../data/roads';
import { MINUTES_PER_DAY } from '../data/world';
import {
  DAILY_WAGE,
  FAMILY,
  HIRED_EFFICIENCY,
  HIRED_NAMES,
  HIRE_COST,
  HOME_POSITION,
  MAX_TASKS,
  MAX_WORKERS,
  TASK_MINUTES,
  WALK_SPEED,
  WORK_END_HOUR,
  WORK_START_HOUR,
  type WorkerTemplate,
} from '../data/workers';
import { applyTool, plant } from './actions';
import { laborMultipliers } from './animals';
import { inBounds, tileCoords, tileIndex } from './grid';
import { findPath } from './path';
import {
  fail,
  ok,
  type ActionError,
  type ActionResult,
  type GameState,
  type GridPoint,
  type Task,
  type ToolId,
  type Worker,
  type WorkerActivity,
  type WorkerKind,
} from './types';

// ---------- workers ----------

/** Resting spot for the n-th worker: a small cluster in front of the house door. */
export const homeSpot = (slot: number): GridPoint => ({
  x: HOME_POSITION.x + ((slot % 4) - 1.5) * 0.3,
  y: HOME_POSITION.y + Math.floor(slot / 4) * 0.25,
});

const makeWorker = (id: number, slot: number, template: WorkerTemplate, kind: WorkerKind): Worker => {
  const home = homeSpot(slot);
  return {
    id,
    name: template.name,
    role: template.role,
    kind,
    efficiency: template.efficiency,
    x: home.x,
    y: home.y,
    taskId: null,
    path: [],
    progress: 0,
  };
};

/** The starting family, with ids starting at `firstId`. */
export const createFamily = (firstId: number): Worker[] =>
  FAMILY.map((template, i) => makeWorker(firstId + i, i, template, 'family'));

export const isWorkTime = (gameMinutes: number): boolean => {
  const hour = (((gameMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY) / 60;
  return hour >= WORK_START_HOUR && hour < WORK_END_HOUR;
};

export const workerActivity = (state: GameState, worker: Worker): WorkerActivity => {
  if (worker.path.length > 0) return 'walking';
  if (worker.taskId !== null) return 'working';
  return isWorkTime(state.gameMinutes) ? 'idle' : 'resting';
};

const nextHiredName = (workers: readonly Worker[]): string => {
  const used = new Set(workers.map((w) => w.name));
  const free = HIRED_NAMES.find((name) => !used.has(name));
  if (free) return free;
  const hired = workers.filter((w) => w.kind === 'hired').length;
  return `${HIRED_NAMES[hired % HIRED_NAMES.length] ?? 'Ajudante'} ${hired + 1}`;
};

export const hireWorker = (state: GameState): ActionResult => {
  if (state.workers.length >= MAX_WORKERS) return fail('max-workers');
  if (state.money < HIRE_COST) return fail('not-enough-money');
  const template: WorkerTemplate = {
    name: nextHiredName(state.workers),
    role: 'Contratado',
    efficiency: HIRED_EFFICIENCY,
  };
  const worker = makeWorker(state.nextId, state.workers.length, template, 'hired');
  return ok({
    ...state,
    money: state.money - HIRE_COST,
    workers: [...state.workers, worker],
    nextId: state.nextId + 1,
  });
};

/** Releases a worker's task back to the queue. */
const unassign = (tasks: readonly Task[], workerId: number): Task[] =>
  tasks.map((t) => (t.workerId === workerId ? { ...t, workerId: null } : t));

export const fireWorker = (state: GameState, workerId: number): ActionResult => {
  const worker = state.workers.find((w) => w.id === workerId);
  if (!worker || worker.kind !== 'hired') return fail('not-hired');
  return ok({
    ...state,
    workers: state.workers.filter((w) => w.id !== workerId),
    tasks: unassign(state.tasks, workerId),
  });
};

/** Pays every hired worker; those who can't be paid leave. Returns the names of who left. */
export const payWages = (state: GameState): { state: GameState; left: string[] } => {
  let money = state.money;
  let tasks = state.tasks;
  const left: string[] = [];
  const workers = state.workers.filter((w) => {
    if (w.kind !== 'hired') return true;
    if (money >= DAILY_WAGE) {
      money -= DAILY_WAGE;
      return true;
    }
    left.push(w.name);
    tasks = unassign(tasks, w.id);
    return false;
  });
  if (left.length === 0 && money === state.money) return { state, left };
  return { state: { ...state, money, workers, tasks }, left };
};

export const dailyWages = (state: GameState): number =>
  state.workers.filter((w) => w.kind === 'hired').length * DAILY_WAGE;

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
  let last: Task | undefined;
  for (const t of state.tasks) if (t.tile === tile) last = t;
  if (last && last.kind === kind && (kind !== 'seed' || last.cropId === cropId)) {
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

export const clearTasks = (state: GameState): GameState => ({
  ...state,
  tasks: [],
  workers: state.workers.map((w) => (w.taskId === null ? w : { ...w, taskId: null, path: [], progress: 0 })),
});

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

const nearestTask = (worker: Worker, tasks: readonly Task[]): Task | undefined => {
  let best: Task | undefined;
  let bestDistance = Infinity;
  for (const task of availableTasks(tasks)) {
    const c = tileCenter(task.tile);
    const d = Math.hypot(c.x - worker.x, c.y - worker.y);
    if (d < bestDistance) {
      best = task;
      bestDistance = d;
    }
  }
  return best;
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
 * Moves every worker for `minutes` of game time: picks tasks, walks, works and applies finished
 * tasks to the farm. Outside work hours (and when idle) workers head home.
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
      const task = nearestTask(w, tasks);
      if (task) {
        const workerId = w.id;
        tasks = tasks.map((t) => (t.id === task.id ? { ...t, workerId } : t));
        w = { ...w, taskId: task.id, progress: 0, path: findPath(world.tiles, w, tileCenter(task.tile)) };
      }
    }
    if (w.taskId === null && w.path.length === 0) {
      const home = homeSpot(i);
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
      const progress = w.progress + moved.leftover * w.efficiency * boost;
      if (progress >= TASK_MINUTES[task.kind]) {
        const result = applyTask({ ...world, tasks, workers }, task);
        if (result.ok) world = result.state;
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
