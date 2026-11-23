import { describe, expect, it } from 'vitest';
import { ANIMALS, PLOT_PASTURE_UNITS } from '../../data/animals';
import { STRUCTURES } from '../../data/structures';
import { addAnimal } from '../animals';
import { orderDemolish, orderStructure } from '../construction';
import { setTimeOfDay, skipMinutes, spawnAnimals, unlockAll } from '../dev';
import { plotIndex, tileIndex } from '../grid';
import { DEFAULT_SETTINGS, deserialize, serialize } from '../save';
import {
  crowdingFactor,
  freeSlots,
  pastureCapacity,
  pastureUsed,
  plotPastureUnits,
  queueShelterChores,
  shelterFor,
  stockCap,
} from '../shelters';
import { advanceGame } from '../simulation';
import { workEffectiveness, workSpeed } from '../staff';
import { createInitialState } from '../state';
import { placeStructure } from '../structures';
import type { ActionResult, GameState, StructureInstance } from '../types';

const unwrap = (result: ActionResult): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

/** 7:00 on a fresh farm with lots of money and a finished coop at (28, 44). */
const coopFarm = (): GameState =>
  setTimeOfDay(unwrap(placeStructure({ ...createInitialState(), money: 100_000 }, 'chickenCoop', 28, 44)), 7);

const coopOf = (s: GameState): StructureInstance => {
  const coop = s.structures.find((x) => x.type === 'chickenCoop');
  if (!coop) throw new Error('no coop');
  return coop;
};

const run = (state: GameState, minutes: number): GameState => {
  let s = state;
  for (let t = 0; t < minutes; t += 2) s = advanceGame(s, 2).state;
  return s;
};

describe('shelters', () => {
  it('house only their species, up to their capacity', () => {
    let s = coopFarm();
    expect(addAnimal(s, 'pig')).toEqual({ ok: false, error: 'no-shelter' });
    const capacity = STRUCTURES.chickenCoop.shelter?.capacity ?? 0;
    for (let i = 0; i < capacity; i++) s = unwrap(addAnimal(s, i % 2 === 0 ? 'chicken' : 'duck'));
    expect(freeSlots(s, coopOf(s))).toBe(0);
    expect(addAnimal(s, 'chicken')).toEqual({ ok: false, error: 'shelter-full' });
  });

  it('a shelter still being built houses nobody', () => {
    const s = unwrap(orderStructure({ ...createInitialState(), money: 5000 }, 'chickenCoop', 28, 44));
    expect(shelterFor(s, 'chicken')).toBe('no-shelter');
  });

  it('cannot be demolished while animals live there', () => {
    const s = unwrap(addAnimal(coopFarm(), 'chicken'));
    expect(orderDemolish(s, tileIndex(28, 44))).toEqual({ ok: false, error: 'shelter-in-use' });
  });
});

describe('pasture', () => {
  it('each plot of free grass holds PLOT_PASTURE_UNITS; buildings and crops take room', () => {
    const s = createInitialState();
    expect(plotPastureUnits(unlockAll(s).tiles, 0)).toBe(PLOT_PASTURE_UNITS);
    // A plot of the fields is all grass; plot (8, 14) holds the shipping bin and the yard's roads.
    expect(plotPastureUnits(s.tiles, plotIndex(8, 10))).toBe(PLOT_PASTURE_UNITS);
    expect(plotPastureUnits(s.tiles, plotIndex(8, 14))).toBe((PLOT_PASTURE_UNITS * 6) / 16);
    const capacity = pastureCapacity(s);
    expect(capacity).toBeLessThan(PLOT_PASTURE_UNITS * s.unlockedPlots.length);
    expect(pastureCapacity(coopFarm())).toBeLessThan(capacity);
  });

  it('blocks purchases beyond the pasture and slows production when overstocked', () => {
    // Only the four plots of the yard, so the pasture fills up quickly.
    const yard = [plotIndex(7, 14), plotIndex(8, 14), plotIndex(7, 15), plotIndex(8, 15)];
    let s = spawnAnimals({ ...createInitialState(), money: 100_000, unlockedPlots: yard }, 'cow', 1);
    while (true) {
      const next = addAnimal(s, 'cow');
      if (!next.ok) {
        expect(['pasture-full', 'shelter-full']).toContain(next.error);
        break;
      }
      s = next.state;
    }
    expect(pastureUsed(s)).toBeLessThanOrEqual(pastureCapacity(s));
    expect(crowdingFactor(s)).toBe(1);
    const crowded = spawnAnimals(s, 'cow', 8);
    expect(pastureUsed(crowded)).toBeGreaterThan(pastureCapacity(crowded));
    expect(crowdingFactor(crowded)).toBeLessThan(1);
  });
});

describe('collecting', () => {
  it('the crew collects the shelter products as a tend task', () => {
    let s = spawnAnimals(coopFarm(), 'chicken', 4);
    // Same stars for all, so they lay together.
    s = { ...s, animals: s.animals.map((a) => ({ ...a, stars: 2 as const })) };
    s = skipMinutes({ ...s, workers: [], inventory: { ...s.inventory, feed: 50 } }, ANIMALS.chicken.productionHours * 60 + 15);
    expect(coopOf(s).stock?.egg).toBe(4);
    const tend = s.tasks.find((t) => t.kind === 'tend');
    expect(tend?.job).toEqual({ type: 'shelter', structureId: coopOf(s).id });

    const crew = setTimeOfDay({ ...s, workers: createInitialState().workers }, 8);
    const done = run(crew, 60);
    expect(coopOf(done).stock).toBeUndefined();
    expect(done.inventory.products.egg ?? 0).toBeGreaterThanOrEqual(4);
    expect(done.tasks.filter((t) => t.kind === 'tend')).toEqual([]);
  });

  it('queues one chore per shelter at a time', () => {
    const s = spawnAnimals(coopFarm(), 'chicken', 2);
    const stocked: GameState = {
      ...s,
      structures: s.structures.map((x) => (x.type === 'chickenCoop' ? { ...x, stock: { egg: 2 } } : x)),
    };
    const once = queueShelterChores(stocked);
    expect(queueShelterChores(once).tasks).toEqual(once.tasks);
    expect(once.tasks).toHaveLength(1);
  });

  it('production waits while the shelter is full', () => {
    const s = spawnAnimals(coopFarm(), 'chicken', 1);
    const cap = stockCap({ type: 'chickenCoop' });
    const full: GameState = {
      ...s,
      workers: [],
      structures: s.structures.map((x) => (x.type === 'chickenCoop' ? { ...x, stock: { egg: cap } } : x)),
    };
    const later = skipMinutes(full, ANIMALS.chicken.productionHours * 60 * 2);
    expect(coopOf(later).stock?.egg).toBe(cap);
  });

  it('animal care uses the animals skill and the animal specialty', () => {
    const base = { name: 'X', age: 30, stars: 2, hourlyWage: 2 } as const;
    const task = { kind: 'tend', cropId: null, animalId: 'chicken' } as const;
    const carer = { ...base, skills: ['animals' as const], specialty: null };
    const farmer = { ...base, skills: ['farming' as const], specialty: null };
    const expert = { ...carer, specialty: { kind: 'animal', id: 'chicken' } as const };
    expect(workSpeed(carer, task)).toBeGreaterThan(workSpeed(farmer, task));
    expect(workEffectiveness(expert, task)).toBeGreaterThan(workEffectiveness(carer, task));
  });

  it('a demolished shelter hands over what was left in it', () => {
    const s = coopFarm();
    const stocked: GameState = {
      ...s,
      structures: s.structures.map((x) => (x.type === 'chickenCoop' ? { ...x, stock: { egg: 3 } } : x)),
    };
    const done = run(unwrap(orderDemolish(stocked, tileIndex(28, 44))), 200);
    expect(done.structures.some((x) => x.type === 'chickenCoop')).toBe(false);
    expect(done.inventory.products.egg).toBe(3);
  });
});

describe('shelter saves', () => {
  it('round-trips shelters, stock and housed animals', () => {
    let s = spawnAnimals(coopFarm(), 'chicken', 2);
    s = { ...s, structures: s.structures.map((x) => (x.type === 'chickenCoop' ? { ...x, stock: { egg: 2 } } : x)) };
    s = run(s, 30);
    expect(deserialize(serialize(s, DEFAULT_SETTINGS))?.game).toEqual(s);
  });

});
