import { describe, expect, it } from 'vitest';
import { MACHINES } from '../../data/machines';
import type { SkillId } from '../../data/workers';
import { tileIndex } from '../grid';
import { homeSpot } from '../home';
import { availableMachine, buyMachine, machineCanDo, releaseOrphanMachines } from '../machines';
import { dismissWorker } from '../staff';
import { createInitialState } from '../state';
import { placeStructure } from '../structures';
import type { ActionResult, GameState, Machine, Task, Worker } from '../types';
import { applyArea, stepWorkers } from '../workers';

const unwrap = (r: ActionResult): GameState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

/** Free grass east of the shed's link road (which runs down x = 27). */
const ROW = [tileIndex(29, 45), tileIndex(30, 45), tileIndex(31, 45)];

const firstWorker = (s: GameState): Worker => {
  const w = s.workers[0];
  if (!w) throw new Error('no worker');
  return w;
};
const firstMachine = (s: GameState): Machine => {
  const m = s.machines[0];
  if (!m) throw new Error('no machine');
  return m;
};

/** A shed with `tractors` tractors and a single worker with the given skills, at 8h. */
const setup = (skills: SkillId[] = ['machinery'], tractors = 1): GameState => {
  let s = unwrap(placeStructure({ ...createInitialState(), money: 20_000 }, 'machineShed', 20, 40, 0, { free: true }));
  for (let k = 0; k < tractors; k++) s = unwrap(buyMachine(s, 'tractor'));
  const op: Worker = { ...firstWorker(s), skills, specialty: null, priorities: ['hoe', 'hand'], taskId: null, path: [], progress: 0 };
  return { ...s, workers: [op], gameMinutes: 8 * 60 };
};

const queueHoe = (s: GameState, tiles: number[] = ROW): GameState => applyArea(s, 'hoe', tiles, 'wheat', 'queue').state;

/** `s` with worker `w` riding machine `m` (both already in the state). */
const mount = (s: GameState, workerId: number, machineId: number, at?: { x: number; y: number }): GameState => ({
  ...s,
  workers: s.workers.map((w) => (w.id === workerId ? { ...w, ...at, machineId, riding: true as const, path: [] } : w)),
  machines: s.machines.map((m) => (m.id === machineId ? { ...m, driverId: workerId } : m)),
});

const step = (s: GameState, minutes = 1): GameState => stepWorkers({ ...s, gameMinutes: s.gameMinutes + minutes }, minutes);

const allTilled = (s: GameState, tiles: number[] = ROW): boolean => tiles.every((t) => s.tiles[t]?.state === 'tilled');

describe('mounted operator', () => {
  it('an operator fetches the tractor and plows', () => {
    let s = queueHoe(setup());
    let rode = false;
    for (let k = 0; k < 600 && !allTilled(s); k++) {
      s = step(s);
      const w = firstWorker(s);
      if (w.riding && firstMachine(s).driverId === w.id) rode = true;
    }
    expect(rode).toBe(true);
    expect(allTilled(s)).toBe(true);
  });

  it('plows five times faster mounted', () => {
    const dt = 0.1;
    const tile = tileIndex(26, 45);
    const minutesToPlow = (mounted: boolean): number => {
      const base = setup();
      const id = firstWorker(base).id;
      let s = queueHoe(
        mounted
          ? mount(base, id, firstMachine(base).id, { x: 26.5, y: 45.5 })
          : { ...base, machines: [], workers: base.workers.map((w) => ({ ...w, x: 26.5, y: 45.5 })) },
        [tile],
      );
      let t = 0;
      while (s.tiles[tile]?.state !== 'tilled' && t < 200) {
        s = step(s, dt);
        t += dt;
      }
      return t;
    };
    const foot = minutesToPlow(false);
    const mounted = minutesToPlow(true);
    expect(foot).toBeGreaterThan(1);
    expect(Math.abs(foot - MACHINES.tractor.workSpeed * mounted)).toBeLessThanOrEqual(MACHINES.tractor.workSpeed * dt + 1e-9);
  });

  it('non-operators ignore machines', () => {
    let s = queueHoe(setup(['farming']));
    for (let k = 0; k < 600 && !allTilled(s); k++) {
      s = step(s);
      expect(firstMachine(s).driverId).toBeUndefined();
      expect(firstWorker(s).machineId).toBeUndefined();
    }
    expect(allTilled(s)).toBe(true);
  });

  it('the harvester skips orchards and greenhouses', () => {
    const s0 = setup();
    const orange = tileIndex(29, 46);
    const covered = tileIndex(30, 46);
    const wheat = tileIndex(31, 46);
    const coveredGrass = tileIndex(32, 46);
    const tiles = s0.tiles.slice();
    const crop = (cropId: 'orange' | 'wheat') => ({ state: 'planted' as const, crop: { cropId, growthMinutes: 100_000 } });
    tiles[orange] = { ...crop('orange') };
    tiles[covered] = { ...crop('wheat'), cover: true };
    tiles[wheat] = { ...crop('wheat') };
    tiles[coveredGrass] = { state: 'grass', cover: true };
    const s = { ...s0, tiles };
    const task = (kind: Task['kind'], tile: number): Task => ({ id: 1, kind, tile, cropId: null, workerId: null });
    expect(machineCanDo(s, 'harvester', task('hand', orange))).toBe(false);
    expect(machineCanDo(s, 'harvester', task('hand', covered))).toBe(false);
    expect(machineCanDo(s, 'harvester', task('hand', wheat))).toBe(true);
    expect(machineCanDo(s, 'harvester', task('hoe', tileIndex(33, 46)))).toBe(false);
    expect(machineCanDo(s, 'tractor', task('hoe', coveredGrass))).toBe(false);
    expect(machineCanDo(s, 'tractor', task('hoe', tileIndex(33, 46)))).toBe(true);
  });

  it('parks at the end of the shift', () => {
    const base = setup();
    const id = firstWorker(base).id;
    const machine = firstMachine(base);
    let s = queueHoe(mount({ ...base, gameMinutes: 19 * 60 + 50 }, id, machine.id, { x: 26.5, y: 45.5 }), [tileIndex(30, 52)]);
    // He takes the task and drives off to it.
    s = step(s);
    const taskId = firstWorker(s).taskId;
    expect(taskId).not.toBeNull();
    expect(firstWorker(s).riding).toBe(true);
    expect(s.tasks[0]?.workerId).toBe(id);
    // Cross 20h still mid-task: the task goes back to the queue, unassigned.
    s = { ...s, gameMinutes: 19 * 60 + 59 };
    s = step(s);
    expect(s.gameMinutes).toBe(20 * 60);
    expect(firstWorker(s).taskId).toBeNull();
    expect(firstWorker(s).riding).toBe(true);
    expect(s.tasks).toEqual([expect.objectContaining({ id: taskId, workerId: null })]);
    for (let k = 0; k < 120 && firstWorker(s).machineId !== undefined; k++) s = step(s);
    const w = firstWorker(s);
    expect(w.machineId).toBeUndefined();
    expect(w.riding).toBeUndefined();
    expect(w.taskId).toBeNull();
    const parked = firstMachine(s);
    expect(parked.driverId).toBeUndefined();
    expect(parked).toMatchObject({ parkId: machine.parkId, slot: machine.slot });
    // Off the machine, he heads home like everyone else.
    expect(w.path.at(-1)).toEqual(homeSpot(s, 0));
    // The dropped task waits in the queue for tomorrow.
    expect(s.tiles[tileIndex(30, 52)]?.state).toBe('grass');
    expect(s.tasks).toEqual([expect.objectContaining({ id: taskId, workerId: null })]);
  });

  it.each([
    ['breaks', (m: Machine): Machine => ({ ...m, condition: 0 })],
    ['is taken by the mechanic', (m: Machine): Machine => ({ ...m, repairUntil: 30 * 60 })],
  ])('drops the task and parks when the machine %s mid-task', (_label, stop) => {
    const base = setup();
    const id = firstWorker(base).id;
    const machine = firstMachine(base);
    let s = queueHoe(mount(base, id, machine.id, { x: 26.5, y: 45.5 }), [tileIndex(30, 52)]);
    s = step(s);
    const taskId = firstWorker(s).taskId;
    expect(taskId).not.toBeNull();
    expect(firstWorker(s).path.length).toBeGreaterThan(0);
    s = { ...s, machines: s.machines.map(stop) };
    s = step(s);
    expect(firstWorker(s).taskId).toBeNull();
    expect(firstWorker(s).riding).toBe(true);
    expect(s.tasks).toEqual([expect.objectContaining({ id: taskId, workerId: null })]);
    for (let k = 0; k < 120 && firstWorker(s).machineId !== undefined; k++) s = step(s);
    expect(firstWorker(s).machineId).toBeUndefined();
    expect(firstWorker(s).riding).toBeUndefined();
    expect(firstMachine(s).driverId).toBeUndefined();
    expect(firstMachine(s)).toMatchObject({ parkId: machine.parkId, slot: machine.slot });
    expect(s.tiles[tileIndex(30, 52)]?.state).toBe('grass');
    // Still on shift, he goes back to the task on foot (the machine stays in its bay).
    s = step(s);
    expect(firstWorker(s).taskId).toBe(taskId);
    expect(firstWorker(s).machineId).toBeUndefined();
    expect(firstMachine(s).driverId).toBeUndefined();
  });

  it('drops the reservation when the task is cancelled', () => {
    let s = step(queueHoe(setup()));
    const w = firstWorker(s);
    expect(w.machineId).toBe(firstMachine(s).id);
    expect(w.riding).toBeUndefined();
    expect(firstMachine(s).driverId).toBe(w.id);
    s = applyArea(s, 'hoe', ROW, 'wheat', 'cancel').state;
    s = step(s);
    expect(firstMachine(s).driverId).toBeUndefined();
    expect(firstWorker(s).machineId).toBeUndefined();
  });

  it('a dismissed driver leaves no orphan machine', () => {
    const base = setup();
    const id = firstWorker(base).id;
    const s = mount(base, id, firstMachine(base).id, { x: 26.5, y: 45.5 });
    const gone = unwrap(dismissWorker(s, id));
    expect(firstMachine(gone).driverId).toBe(id);
    expect(firstMachine(releaseOrphanMachines(gone)).driverId).toBeUndefined();
  });

  it('cleans a rider whose machine is gone or driven by someone else', () => {
    const base = setup();
    const w = { ...firstWorker(base), machineId: 4242, riding: true as const };
    const cleaned = releaseOrphanMachines({ ...base, workers: [w] });
    expect(firstWorker(cleaned).machineId).toBeUndefined();
    expect(firstWorker(cleaned).riding).toBeUndefined();
  });

  it('a cut-off shed lends nothing but takes machines back', () => {
    const base = setup(['machinery'], 2);
    const driver = firstWorker(base);
    const other: Worker = { ...driver, id: 777, name: 'Outro', x: 26.5, y: 47.5 };
    const [m0, m1] = base.machines;
    if (!m0 || !m1) throw new Error('two tractors expected');
    let s = mount({ ...base, workers: [driver, other] }, driver.id, m0.id, { x: 26.5, y: 45.5 });
    const task: Task = { id: 1, kind: 'hoe', tile: tileIndex(26, 47), cropId: null, workerId: null };
    expect(availableMachine(s, other, task)?.id).toBe(m1.id);
    // Erase the shed's road ring.
    const tiles = s.tiles.map((t, i) => {
      const x = i % 64;
      const y = Math.floor(i / 64);
      if (x < 19 || x > 23 || y < 39 || y > 42 || !t.road) return t;
      const { road: _road, ...rest } = t;
      return rest;
    });
    s = { ...s, tiles };
    expect(availableMachine(s, other, task)).toBeUndefined();
    for (let k = 0; k < 120 && firstWorker(s).machineId !== undefined; k++) s = step(s);
    expect(firstWorker(s).machineId).toBeUndefined();
    expect(s.machines.find((m) => m.id === m0.id)?.driverId).toBeUndefined();
  });

  it('a broken machine goes back to its bay', () => {
    const base = setup();
    const id = firstWorker(base).id;
    const broken = { ...base, machines: base.machines.map((m) => ({ ...m, condition: 0 })) };
    let s = queueHoe(mount(broken, id, firstMachine(base).id, { x: 26.5, y: 45.5 }), [tileIndex(26, 45)]);
    for (let k = 0; k < 120 && firstWorker(s).machineId !== undefined; k++) s = step(s);
    expect(firstWorker(s).machineId).toBeUndefined();
    expect(firstMachine(s).driverId).toBeUndefined();
    // The broken machine did not plow: the worker parked it first.
    expect(s.tiles[tileIndex(26, 45)]?.state).toBe('grass');
    expect(s.tasks[0]?.kind).toBe('hoe');
  });
});
