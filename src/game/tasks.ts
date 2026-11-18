import { CROP_IDS } from '../data/crops';
import { applyTool, plant } from './actions';
import { layRoad, removeRoad } from './roads';
import { collectShelter } from './shelters';
import { fail, ok, type ActionResult, type GameState, type Task } from './types';

/** What a task needs to be applied. */
export type TaskOrder = Pick<Task, 'kind' | 'tile' | 'cropId' | 'job'>;

/**
 * Runs a finished task's action against a state. Structure work is done bit by bit on the
 * structure itself (construction.ts), so here it only checks that the site still exists.
 */
export const applyTask = (state: GameState, task: TaskOrder): ActionResult => {
  if (task.kind === 'seed') return task.cropId ? plant(state, task.tile, task.cropId) : fail('no-seeds');
  if (task.kind !== 'build' && task.kind !== 'tend') return applyTool(state, task.kind, task.tile, CROP_IDS[0]);
  const job = task.job;
  if (!job) return fail('no-structure');
  // Collecting never fails in the projected queue: a shelter may fill up before the crew gets there.
  if (job.type === 'shelter') {
    const collected = collectShelter(state, job.structureId);
    return collected.ok || collected.error === 'no-product' ? ok(collected.ok ? collected.state : state) : collected;
  }
  if (job.type === 'road') return job.remove ? removeRoad(state, task.tile) : layRoad(state, task.tile);
  return state.structures.some((s) => s.id === job.structureId && s.work) ? ok(state) : fail('no-structure');
};

/** The state as it will be once every queued task is done (failing tasks are skipped). */
export const projectTasks = (state: GameState): GameState =>
  state.tasks.reduce<GameState>((s, task) => {
    const result = applyTask(s, task);
    return result.ok ? result.state : s;
  }, state);

/** The last task queued on a tile (the one a new order on that tile would follow). */
export const lastTaskOn = (tasks: readonly Task[], tile: number): Task | undefined => {
  let last: Task | undefined;
  for (const t of tasks) if (t.tile === tile) last = t;
  return last;
};

/** Removes tasks from the queue; whoever was doing one of them stops. */
export const dropTasks = (state: GameState, drop: (task: Task) => boolean): GameState => {
  const removed = new Set(state.tasks.filter(drop).map((t) => t.id));
  if (removed.size === 0) return state;
  return {
    ...state,
    tasks: state.tasks.filter((t) => !removed.has(t.id)),
    workers: state.workers.map((w) =>
      w.taskId !== null && removed.has(w.taskId) ? { ...w, taskId: null, path: [], progress: 0 } : w,
    ),
  };
};
