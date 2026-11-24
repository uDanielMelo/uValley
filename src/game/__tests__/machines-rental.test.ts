import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY } from '../../data/world';
import { buyMachine, endRentals, rehomeMachines, rentalCost, rentalEnd, rentMachine, resalePrice, returnRental, sellMachine } from '../machines';
import { createInitialState } from '../state';
import { placeStructure } from '../structures';
import { releaseTemps, tempCount } from '../staff';
import { advanceGame } from '../simulation';
import type { ActionResult, GameState, Machine } from '../types';

const unwrap = (r: ActionResult): GameState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const at = (s: GameState, day: number, hour: number): GameState => ({ ...s, gameMinutes: (day - 1) * MINUTES_PER_DAY + hour * 60 });
const rich = (): GameState => ({ ...createInitialState(), money: 5000 });
const withShed = (s: GameState = rich()): GameState => unwrap(placeStructure(s, 'machineShed', 20, 40, 0, { free: true }));
const withLot = (s: GameState = rich()): GameState => unwrap(placeStructure(s, 'parkingLot', 20, 48, 0, { free: true }));
const parkOf = (s: GameState, type: 'machineShed' | 'parkingLot'): number => s.structures.find((x) => x.type === type)?.id ?? -1;
const machine = (over: Partial<Machine> = {}): Machine => ({ id: 900, type: 'tractor', parkId: 1, slot: 0, condition: 100, ...over });

describe('buy and sell', () => {
  it('buys a tractor into the shed', () => {
    const s = withShed();
    const bought = unwrap(buyMachine(s, 'tractor'));
    expect(bought.money).toBe(5000 - 1800);
    expect(bought.machines).toHaveLength(1);
    expect(bought.machines[0]).toMatchObject({ type: 'tractor', parkId: parkOf(s, 'machineShed'), slot: 0, condition: 100 });
    expect(bought.machines[0]?.rental).toBeUndefined();
    expect(buyMachine(rich(), 'tractor')).toEqual({ ok: false, error: 'no-shed' });
    expect(buyMachine({ ...s, money: 10 }, 'tractor')).toEqual({ ok: false, error: 'not-enough-money' });
  });

  it('sells for the resale price', () => {
    const s = unwrap(buyMachine(withShed(), 'tractor'));
    const m = { ...(s.machines[0] as Machine), condition: 50 };
    const state = { ...s, machines: [m], money: 0 };
    expect(resalePrice(m)).toBe(900);
    const sold = unwrap(sellMachine(state, m.id));
    expect(sold.money).toBe(900);
    expect(sold.machines).toEqual([]);
  });

  it('will not sell or return a machine being driven', () => {
    const s = withShed();
    const owned = machine({ parkId: parkOf(s, 'machineShed'), driverId: 1 });
    const rented = machine({ id: 901, slot: 1, driverId: 1, rental: { until: 99999 } });
    const state = { ...s, machines: [owned, rented] };
    expect(sellMachine(state, 900)).toEqual({ ok: false, error: 'machine-busy' });
    expect(returnRental(state, 901)).toEqual({ ok: false, error: 'machine-busy' });
    expect(sellMachine(state, 901)).toEqual({ ok: false, error: 'no-machine' });
  });
});

describe('rental', () => {
  it('rents with an operator', () => {
    const s = at(withLot(), 1, 10);
    expect(rentalCost('tractor', 3, true)).toBe(363);
    const r = unwrap(rentMachine(s, 'tractor', 3, true));
    expect(r.money).toBe(5000 - 363);
    const m = r.machines[0] as Machine;
    expect(m.rental?.until).toBe(rentalEnd(s.gameMinutes, 3));
    const op = r.workers.find((w) => w.id === m.rental?.operatorId);
    expect(op).toMatchObject({ kind: 'temp', rentalId: m.id, hourlyWage: 0, stars: 2, priorities: ['hoe', 'hand'] });
    expect(op?.skills).toContain('machinery');
    expect(tempCount(r)).toBe(0);
    expect(rentMachine(rich(), 'tractor', 1, false)).toEqual({ ok: false, error: 'no-parking' });
    expect(rentMachine({ ...s, money: 5 }, 'tractor', 1, false)).toEqual({ ok: false, error: 'not-enough-money' });
  });

  it('starts tomorrow when rented after the shift', () => {
    expect(rentalEnd(21 * 60, 1)).toBe(MINUTES_PER_DAY + 20 * 60);
    expect(rentalEnd(10 * 60, 1)).toBe(20 * 60);
    expect(rentalEnd(10 * 60, 3)).toBe(2 * MINUTES_PER_DAY + 20 * 60);
  });

  it('ends rentals at the end of the last day', () => {
    const r = unwrap(rentMachine(at(withLot(), 1, 10), 'tractor', 1, true));
    expect(releaseTemps(r).workers.some((w) => w.rentalId !== undefined)).toBe(true);
    const until = (r.machines[0] as Machine).rental?.until ?? 0;
    expect(endRentals({ ...r, gameMinutes: until - 1 }).events).toEqual([]);
    const ended = endRentals({ ...r, gameMinutes: until });
    expect(ended.events).toEqual([{ kind: 'rental-ended', type: 'tractor' }]);
    expect(ended.state.machines).toEqual([]);
    expect(ended.state.workers.some((w) => w.rentalId !== undefined)).toBe(false);
  });

  it('keeps a rented machine until its driver parks', () => {
    const s = withLot();
    const state = { ...s, gameMinutes: 5000, machines: [machine({ parkId: parkOf(s, 'parkingLot'), driverId: 1, rental: { until: 4000 } })] };
    expect(endRentals(state).state.machines).toHaveLength(1);
    expect(endRentals(state).events).toEqual([]);
  });

  it('returns a rental with its operator', () => {
    const r = unwrap(rentMachine(at(withLot(), 1, 10), 'tractor', 1, true));
    const back = unwrap(returnRental(r, (r.machines[0] as Machine).id));
    expect(back.machines).toEqual([]);
    expect(back.workers.some((w) => w.rentalId !== undefined)).toBe(false);
  });

  it('exposes machineEvents from advanceGame', () => {
    const r = unwrap(rentMachine(at(withLot(), 1, 10), 'tractor', 1, false));
    const until = (r.machines[0] as Machine).rental?.until ?? 0;
    const out = advanceGame({ ...r, gameMinutes: until - 1 }, 2);
    expect(out.machineEvents).toEqual([{ kind: 'rental-ended', type: 'tractor' }]);
    expect(advanceGame(r, 0).machineEvents).toEqual([]);
  });
});

describe('rehomeMachines', () => {
  it('rehomes machines whose shed is gone', () => {
    const two = unwrap(placeStructure(withShed(), 'machineShed', 30, 40, 0, { free: true }));
    const fixed = rehomeMachines({ ...two, machines: [machine({ parkId: 9999 })] });
    const ids = two.structures.filter((x) => x.type === 'machineShed').map((x) => x.id);
    expect(ids).toContain(fixed.machines[0]?.parkId);
  });

  it('sells the machine when no slot is left, and drops a rental', () => {
    const s = { ...rich(), money: 0 };
    const gone = rehomeMachines({ ...s, machines: [machine({ parkId: 9999, condition: 50 })] });
    expect(gone.machines).toEqual([]);
    expect(gone.money).toBe(900);
    const rent = rehomeMachines({ ...s, machines: [machine({ id: 5, parkId: 9999, rental: { until: 9, operatorId: 77 } })] });
    expect(rent.machines).toEqual([]);
    expect(rent.money).toBe(0);
  });

  it('cleans dangling references', () => {
    const s = withShed();
    const [w0, w1, ...rest] = s.workers;
    if (!w0 || !w1) throw new Error('workers');
    const state = {
      ...s,
      workers: [{ ...w0, machineId: 555, riding: true as const }, { ...w1, rentalId: 556 }, ...rest],
      machines: [machine({ parkId: parkOf(s, 'machineShed'), driverId: 12345 })],
    };
    const fixed = rehomeMachines(state);
    const a = fixed.workers.find((w) => w.id === w0.id);
    expect(a?.machineId).toBeUndefined();
    expect(a?.riding).toBeUndefined();
    expect(fixed.workers.some((w) => w.id === w1.id)).toBe(false);
    expect(fixed.machines[0]?.driverId).toBeUndefined();
  });
});
