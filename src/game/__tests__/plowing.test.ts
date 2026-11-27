import { describe, expect, it } from 'vitest';
import { MACHINES } from '../../data/machines';
import { SOILS } from '../../data/soil';
import { TASK_MINUTES } from '../../data/workers';
import { tileIndex } from '../grid';
import { buyMachine } from '../machines';
import { soilAt } from '../soil';
import { setPriorities, workSpeed } from '../staff';
import { createInitialState } from '../state';
import { placeStructure } from '../structures';
import type { ActionResult, GameState, Task, Worker } from '../types';
import { applyArea, hoeProgress, stepWorkers, taskContext, taskMinutes } from '../workers';

const unwrap = (r: ActionResult): GameState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

const SEED = 11;
const step = (s: GameState, minutes = 1): GameState => stepWorkers({ ...s, gameMinutes: s.gameMinutes + minutes }, minutes);

/** A free farm tile of the given soil (seed SEED). */
const tileOf = (s: GameState, soil: keyof typeof SOILS): number => {
  for (let y = 33; y <= 55; y++) {
    for (let x = 17; x <= 46; x++) {
      const i = tileIndex(x, y);
      const t = s.tiles[i];
      if (t?.state === 'grass' && !t.road && !t.structure && soilAt(SEED, i) === soil) return i;
    }
  }
  throw new Error(`no ${soil} tile`);
};

const center = (tile: number): { x: number; y: number } => ({ x: (tile % 64) + 0.5, y: Math.floor(tile / 64) + 0.5 });

/** One plain worker standing on `tile`, at `hour`, with a hoe task queued there. */
const setup = (s0: GameState, tile: number, hour: number, crew = 1): GameState => {
  const base = s0.workers[0] as Worker;
  const workers = Array.from({ length: crew }, (_, k): Worker => ({
    ...base,
    id: 500 + k,
    name: `W${k}`,
    skills: [],
    specialty: null,
    priorities: ['hoe'],
    taskId: null,
    path: [],
    progress: 0,
    ...center(tile),
  }));
  const s = { ...s0, workers, gameMinutes: hour * 60 };
  return applyArea(s, 'hoe', [tile], 'wheat', 'queue').state;
};

const hoeTask = (s: GameState): Task => {
  const t = s.tasks.find((task) => task.kind === 'hoe');
  if (!t) throw new Error('no hoe task');
  return t;
};

describe('plowing takes hours', () => {
  it('plowing takes the soil time', () => {
    expect(TASK_MINUTES.hoe).toBe(150);
    const plain = setup(createInitialState(), tileIndex(29, 45), 8);
    expect(taskMinutes(hoeTask(plain), plain.soilSeed, plain.tiles)).toBe(150);
    const seeded = createInitialState(SEED);
    const stony = tileOf(seeded, 'stony');
    const s = setup(seeded, stony, 8);
    expect(taskMinutes(hoeTask(s), s.soilSeed, s.tiles)).toBe(300);
  });

  it('plowing progress survives the end of the shift', () => {
    const tile = tileIndex(29, 45);
    let s = setup(createInitialState(), tile, 19);
    const speed = workSpeed(s.workers[0] as Worker, taskContext(s, hoeTask(s)));
    for (let m = 0; m < 70; m++) s = step(s);
    const kept = hoeTask(s);
    expect(kept.workerId).toBeNull();
    // About an hour of work (the first step goes to picking the task up).
    expect(kept.done ?? 0).toBeGreaterThan(55 * speed);
    expect(kept.done ?? 0).toBeLessThanOrEqual(60 * speed + 1e-9);
    const left = 150 - (kept.done ?? 0);
    // Next morning, the rest of the work only.
    s = { ...s, gameMinutes: 24 * 60 + 6 * 60, workers: s.workers.map((w) => ({ ...w, ...center(tile), path: [] })) };
    let minutes = 0;
    while (s.tiles[tile]?.state !== 'tilled' && minutes < 600) {
      s = step(s);
      minutes++;
    }
    expect(s.tiles[tile]?.state).toBe('tilled');
    expect(Math.abs(minutes - left / speed)).toBeLessThanOrEqual(2);
  });

  it('another worker continues the plowing', () => {
    const tile = tileIndex(29, 45);
    let s = setup(createInitialState(), tile, 8, 2);
    // Only the first worker plows at first.
    s = unwrap(setPriorities(s, 501, ['water']));
    for (let m = 0; m < 30; m++) s = step(s);
    const done = s.workers.find((w) => w.id === 500)?.progress ?? 0;
    expect(done).toBeGreaterThan(0);
    s = unwrap(setPriorities(s, 500, ['water']));
    expect(hoeTask(s).done).toBeCloseTo(done, 6);
    s = unwrap(setPriorities(s, 501, ['hoe']));
    s = step(s, 0.01);
    const second = s.workers.find((w) => w.id === 501);
    expect(second?.taskId).toBe(hoeTask(s).id);
    expect(second?.progress ?? 0).toBeGreaterThanOrEqual(done);
  });

  it('tractor plows five times faster on top of the soil', () => {
    const seeded = { ...createInitialState(SEED), money: 20_000 };
    const shed = unwrap(placeStructure(seeded, 'machineShed', 20, 40, 0, { free: true }));
    const withTractor = unwrap(buyMachine(shed, 'tractor'));
    const clay = tileOf(withTractor, 'clay');
    const base = setup(withTractor, clay, 8);
    const op = base.workers[0] as Worker;
    const machine = base.machines[0];
    if (!machine) throw new Error('no machine');
    const s0: GameState = {
      ...base,
      workers: [{ ...op, skills: ['machinery'], machineId: machine.id, riding: true }],
      machines: base.machines.map((m) => ({ ...m, driverId: op.id })),
    };
    const speed = workSpeed(s0.workers[0] as Worker, taskContext(s0, hoeTask(s0)));
    let s = s0;
    let t = 0;
    const dt = 0.1;
    while (s.tiles[clay]?.state !== 'tilled' && t < 600) {
      s = step(s, dt);
      t += dt;
    }
    expect(s.tiles[clay]?.state).toBe('tilled');
    const expected = (150 * SOILS.clay.plowFactor) / (MACHINES.tractor.workSpeed * speed);
    expect(Math.abs(t - expected)).toBeLessThanOrEqual(1);
  });

  it('taskProgress shows the kept progress', () => {
    const s = setup(createInitialState(), tileIndex(29, 45), 8);
    const task = { ...hoeTask(s), done: 75 };
    expect(hoeProgress(task, s.soilSeed, s.tiles)).toBeCloseTo(0.5);
  });
});
