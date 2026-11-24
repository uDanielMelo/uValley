import { describe, expect, it } from 'vitest';
import { STAR_LEVELS, MACHINERY_WAGE } from '../../data/workers';
import { DEFAULT_SETTINGS, deserialize, serialize } from '../save';
import { createInitialState } from '../state';
import { hourlyWageFor } from '../staff';
import { placeStructure } from '../structures';
import type { GameState, Machine } from '../types';

const reload = (s: GameState): GameState => {
  const loaded = deserialize(serialize(s, DEFAULT_SETTINGS));
  if (!loaded) throw new Error('save did not load');
  return loaded.game;
};

const houseId = (s: GameState): number => {
  const house = s.structures.find((m) => m.type === 'house');
  if (!house) throw new Error('no house');
  return house.id;
};

describe('machine save', () => {
  it('round-trips machines and riding workers', () => {
    const placed = placeStructure(createInitialState(), 'machineShed', 20, 40, 0, { free: true });
    if (!placed.ok) throw new Error(placed.error);
    const s0 = placed.state;
    const shedId = s0.structures.find((m) => m.type === 'machineShed')?.id ?? -1;
    const [first, ...rest] = s0.workers;
    if (!first) throw new Error('no worker');
    const machine: Machine = {
      id: 900,
      type: 'tractor',
      parkId: shedId,
      slot: 0,
      condition: 62.5,
      rental: { until: 5000, operatorId: first.id },
      driverId: first.id,
      unpaidMinutes: 12,
    };
    const rider = { ...first, machineId: 900, riding: true as const, rentalId: 900 };
    const loaded = reload({ ...s0, machines: [machine], workers: [rider, ...rest] });
    expect(loaded.machines).toEqual([machine]);
    const back = loaded.workers.find((w) => w.id === first.id);
    expect(back?.machineId).toBe(900);
    expect(back?.riding).toBe(true);
    expect(back?.rentalId).toBe(900);
  });

  it('drops a machine with an unknown type', () => {
    const s0 = createInitialState();
    const bad = { id: 900, type: 'plane', parkId: houseId(s0), slot: 0, condition: 50 };
    const raw = JSON.parse(serialize(s0, DEFAULT_SETTINGS)) as { game: Record<string, unknown> };
    raw.game.machines = [bad];
    const loaded = deserialize(JSON.stringify(raw));
    expect(loaded?.game.machines).toEqual([]);
  });

  it('migrates v23 saves with no machines', () => {
    const raw = JSON.parse(serialize(createInitialState(), DEFAULT_SETTINGS)) as { saveVersion: number; game: Record<string, unknown> };
    raw.saveVersion = 23;
    delete raw.game.machines;
    const loaded = deserialize(JSON.stringify(raw));
    expect(loaded?.game.machines).toEqual([]);
  });

  it('pays the machinery wage', () => {
    expect(hourlyWageFor(2, null, ['machinery'])).toBe(STAR_LEVELS[2].hourlyWage + MACHINERY_WAGE);
    expect(hourlyWageFor(2, null, ['farming'])).toBe(STAR_LEVELS[2].hourlyWage);
  });
});

describe('machine pose', () => {
  it('sits in its slot when parked and under its driver when driven', async () => {
    const { machinePose } = await import('../machines');
    const { slotPoint } = await import('../parking');
    const placed = placeStructure(createInitialState(), 'machineShed', 20, 40, 0, { free: true });
    if (!placed.ok) throw new Error('no shed');
    const shed = placed.state.structures[placed.state.structures.length - 1];
    if (!shed) throw new Error('no shed');
    const worker = placed.state.workers[0];
    if (!worker) throw new Error('no worker');
    const machine = { id: 900, type: 'tractor' as const, parkId: shed.id, slot: 1, condition: 100 };
    const parked = machinePose(placed.state, machine);
    const spot = slotPoint(shed, 1);
    expect(parked).toEqual({ x: spot.x, y: spot.y, heading: spot.heading, working: false });
    const driven = {
      ...placed.state,
      workers: placed.state.workers.map((w) => (w.id === worker.id ? { ...w, x: 30.2, y: 50.7, machineId: 900, riding: true as const } : w)),
    };
    const pose = machinePose(driven, { ...machine, driverId: worker.id });
    expect(pose).toMatchObject({ x: 30.2, y: 50.7, heading: null });
  });
});

describe('machine dev tools', () => {
  it('adds a tractor, building a shed when there is none, and wears machines down', async () => {
    const { addMachine, wearMachines } = await import('../dev');
    const s = addMachine(createInitialState(), 'tractor');
    const shed = s.structures.find((x) => x.type === 'machineShed');
    expect(shed?.work).toBeUndefined();
    expect(s.machines).toHaveLength(1);
    expect(s.machines[0]).toMatchObject({ type: 'tractor', parkId: shed?.id, slot: 0, condition: 100 });
    const rented = addMachine(s, 'harvester', true);
    expect(rented.machines[1]?.rental).toBeDefined();
    const worn = wearMachines(rented, 30);
    expect(worn.machines[0]?.condition).toBe(70);
    expect(worn.machines[1]?.condition).toBe(100);
  });
});
