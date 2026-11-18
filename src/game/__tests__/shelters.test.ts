import { describe, expect, it } from 'vitest';
import { ANIMALS, PLOT_PASTURE_UNITS } from '../../data/animals';
import { STRUCTURES } from '../../data/structures';
import { buyAnimal } from '../animals';
import { orderDemolish, orderStructure } from '../construction';
import { setTimeOfDay, skipMinutes, spawnAnimals, unlockAll } from '../dev';
import { tileIndex } from '../grid';
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

/** 7:00 on a fresh farm with lots of money and a finished coop at (12, 12). */
const coopFarm = (): GameState =>
  setTimeOfDay(unwrap(placeStructure({ ...createInitialState(), money: 100_000 }, 'chickenCoop', 12, 12)), 7);

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
    expect(buyAnimal(s, 'pig')).toEqual({ ok: false, error: 'no-shelter' });
    const capacity = STRUCTURES.chickenCoop.shelter?.capacity ?? 0;
    for (let i = 0; i < capacity; i++) s = unwrap(buyAnimal(s, i % 2 === 0 ? 'chicken' : 'duck'));
    expect(freeSlots(s, coopOf(s))).toBe(0);
    expect(buyAnimal(s, 'chicken')).toEqual({ ok: false, error: 'shelter-full' });
  });

  it('a shelter still being built houses nobody', () => {
    const s = unwrap(orderStructure({ ...createInitialState(), money: 5000 }, 'chickenCoop', 12, 12));
    expect(shelterFor(s, 'chicken')).toBe('no-shelter');
  });

  it('cannot be demolished while animals live there', () => {
    const s = unwrap(buyAnimal(coopFarm(), 'chicken'));
    expect(orderDemolish(s, tileIndex(12, 12))).toEqual({ ok: false, error: 'shelter-in-use' });
  });
});

describe('pasture', () => {
  it('each plot of free grass holds PLOT_PASTURE_UNITS; buildings and crops take room', () => {
    const s = createInitialState();
    expect(plotPastureUnits(unlockAll(s).tiles, 0)).toBe(PLOT_PASTURE_UNITS);
    // Plot (3, 3) covers tiles 12–15 on both axes: the house takes one of its 16 tiles.
    expect(plotPastureUnits(s.tiles, 3 * 8 + 3)).toBe((PLOT_PASTURE_UNITS * 15) / 16);
    const capacity = pastureCapacity(s);
    expect(capacity).toBeLessThan(PLOT_PASTURE_UNITS * s.unlockedPlots.length);
    expect(pastureCapacity(coopFarm())).toBeLessThan(capacity);
  });

  it('blocks purchases beyond the pasture and slows production when overstocked', () => {
    let s = spawnAnimals({ ...createInitialState(), money: 100_000 }, 'cow', 1);
    while (true) {
      const next = buyAnimal(s, 'cow');
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
    s = skipMinutes({ ...s, workers: [] }, ANIMALS.chicken.productionHours * 60 + 15);
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
    const cap = stockCap('chickenCoop');
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
    const done = run(unwrap(orderDemolish(stocked, tileIndex(12, 12))), 200);
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

  it('migrates a v7 save: animals move into shelters (built for free if needed) and keep ready products', () => {
    const s = coopFarm();
    const v7Animals = [
      { id: 900, kind: 'chicken', x: 14.5, y: 13.5, target: null, waitMinutes: 0, productMinutes: 0, hasProduct: true, fed: true },
      { id: 901, kind: 'cow', x: 18.5, y: 13.5, target: { x: 18, y: 12 }, waitMinutes: 0, productMinutes: 60, hasProduct: false, fed: true },
    ];
    const v7 = {
      ...s,
      animals: v7Animals,
      workers: s.workers.map((w) => ({ ...w, priorities: w.priorities.filter((k) => k !== 'tend') })),
      nextId: 1000,
    };
    const loaded = deserialize(JSON.stringify({ saveVersion: 7, savedAt: 0, game: v7, settings: DEFAULT_SETTINGS }));
    if (!loaded) throw new Error('not loaded');
    const game = loaded.game;
    expect(game.animals).toHaveLength(2);
    const chicken = game.animals.find((a) => a.id === 900);
    const cow = game.animals.find((a) => a.id === 901);
    expect(chicken?.shelterId).toBe(coopOf(game).id);
    expect(game.structures.find((x) => x.id === cow?.shelterId)?.type).toBe('corral');
    expect(chicken?.productMinutes).toBe(ANIMALS.chicken.productionHours * 60);
    expect(game.workers.every((w) => w.priorities[w.priorities.length - 1] === 'tend')).toBe(true);
    expect(game.money).toBe(s.money);
  });
});
