import { describe, expect, it } from 'vitest';
import { STAR_LEVELS, MACHINERY_WAGE } from '../../data/workers';
import { DEFAULT_SETTINGS, deserialize, serialize } from '../save';
import { createInitialState } from '../state';
import { hourlyWageFor } from '../staff';
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
    const s0 = createInitialState();
    const [first, ...rest] = s0.workers;
    if (!first) throw new Error('no worker');
    const machine: Machine = {
      id: 900,
      type: 'tractor',
      parkId: houseId(s0),
      slot: 0,
      condition: 62.5,
      rental: { until: 5000, operatorId: 901 },
      driverId: 901,
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
