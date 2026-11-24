import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY } from '../../data/world';
import {
  availableMachine,
  callMechanic,
  conditionFactor,
  mechanicCost,
  mustPark,
  repairAtWorkshops,
  stepMachines,
} from '../machines';
import { createInitialState } from '../state';
import { placeStructure } from '../structures';
import type { ActionResult, GameState, Machine } from '../types';

const unwrap = (r: ActionResult): GameState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

const shedState = (level: 1 | 2, over: Partial<Machine> = {}, mounted = false): { s: GameState; m: Machine } => {
  const placed = unwrap(placeStructure({ ...createInitialState(), money: 1000 }, 'machineShed', 20, 40, 0, { free: true }));
  const shed = placed.structures.find((x) => x.type === 'machineShed');
  if (!shed) throw new Error('no shed');
  const structures = placed.structures.map((x) => (x.id === shed.id ? { ...x, level } : x));
  const worker = placed.workers[0];
  if (!worker) throw new Error('no worker');
  const m: Machine = {
    id: 900,
    type: 'tractor',
    parkId: shed.id,
    slot: 0,
    condition: 100,
    ...(mounted ? { driverId: worker.id } : {}),
    ...over,
  };
  const workers = mounted ? placed.workers.map((w) => (w.id === worker.id ? { ...w, machineId: 900, riding: true as const } : w)) : placed.workers;
  return { s: { ...placed, structures, workers, machines: [m] }, m };
};

describe('wear and diesel', () => {
  it('wears and burns diesel while driven', () => {
    const { s } = shedState(1, {}, true);
    const r = stepMachines(s, 120);
    expect(r.state.machines[0]?.condition).toBe(97);
    expect(r.state.money).toBe(1000 - 4);
    const rented = shedState(1, { rental: { until: 999999 } }, true).s;
    const r2 = stepMachines(rented, 120);
    expect(r2.state.machines[0]?.condition).toBe(100);
    expect(r2.state.money).toBe(1000);
  });

  it('does not wear a parked machine', () => {
    const { s } = shedState(1);
    expect(stepMachines(s, 120).state).toBe(s);
  });

  it('breaks at zero and goes home', () => {
    const { s } = shedState(1, { condition: 0.5 }, true);
    const r = stepMachines(s, 60);
    const m = r.state.machines[0] as Machine;
    expect(m.condition).toBe(0);
    expect(r.events).toEqual([{ kind: 'broke', type: 'tractor' }]);
    expect(mustPark(r.state, m)).toBe(true);
  });

  it('no money, no diesel', () => {
    const { s } = shedState(1, {}, true);
    const poor = { ...s, money: 1 };
    const r = stepMachines(poor, 60);
    expect(r.events).toContainEqual({ kind: 'no-fuel', type: 'tractor' });
    expect(r.state.money).toBe(1);
    expect(mustPark(r.state, r.state.machines[0] as Machine)).toBe(true);
    // Driving back does not repeat the event.
    expect(stepMachines(r.state, 10).events).toEqual([]);
  });

  it('slow below thirty', () => {
    expect(conditionFactor({ condition: 29 })).toBe(0.7);
    expect(conditionFactor({ condition: 30 })).toBe(1);
  });
});

describe('repair', () => {
  it('the workshop repairs overnight', () => {
    const two = shedState(2, { condition: 50 }).s;
    const r = repairAtWorkshops({ ...two, money: 1000 });
    expect(r.state.machines[0]?.condition).toBe(90);
    expect(r.state.money).toBe(1000 - 120);
    const one = shedState(1, { condition: 50 }).s;
    expect(repairAtWorkshops(one).state.machines[0]?.condition).toBe(50);
    const poor = repairAtWorkshops({ ...two, money: 30 });
    expect(poor.state.machines[0]?.condition).toBe(60);
    expect(poor.state.money).toBe(0);
  });

  it('reports a full repair and skips rentals', () => {
    const { s } = shedState(2, { condition: 90 });
    expect(repairAtWorkshops(s).events).toEqual([{ kind: 'repaired', type: 'tractor' }]);
    const rented = shedState(2, { condition: 50, rental: { until: 99999 } }).s;
    expect(repairAtWorkshops(rented).state.machines[0]?.condition).toBe(50);
  });

  it('the mechanic charges double and is back at six', () => {
    const { s } = shedState(1, { condition: 60 });
    const now = { ...s, gameMinutes: 10 * 60 };
    expect(mechanicCost(now.machines[0] as Machine)).toBe(240);
    const called = unwrap(callMechanic(now, 900));
    expect(called.money).toBe(1000 - 240);
    const until = MINUTES_PER_DAY + 6 * 60;
    expect(called.machines[0]?.repairUntil).toBe(until);
    expect(availableMachine(called, { x: 0, y: 0 }, { kind: 'hoe', tile: 0 } as never)).toBeUndefined();
    const done = stepMachines({ ...called, gameMinutes: until }, 1);
    expect(done.state.machines[0]?.condition).toBe(100);
    expect(done.state.machines[0]?.repairUntil).toBeUndefined();
    expect(done.events).toEqual([{ kind: 'repaired', type: 'tractor' }]);
  });

  it('the mechanic call is refused when it cannot be made', () => {
    const { s } = shedState(1, { condition: 60 });
    expect(callMechanic(s, 1)).toEqual({ ok: false, error: 'no-machine' });
    expect(callMechanic({ ...s, money: 10 }, 900)).toEqual({ ok: false, error: 'not-enough-money' });
    const rented = shedState(1, { condition: 60, rental: { until: 99999 } }).s;
    expect(callMechanic(rented, 900)).toEqual({ ok: false, error: 'no-machine' });
    const busy = shedState(1, { condition: 60 }, true).s;
    expect(callMechanic(busy, 900)).toEqual({ ok: false, error: 'machine-busy' });
    const full = shedState(1).s;
    expect(callMechanic(full, 900)).toEqual({ ok: true, state: full });
  });
});
