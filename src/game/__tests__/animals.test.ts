import { describe, expect, it } from 'vitest';
import { ANIMALS, ANIMAL_IDS, ANIMAL_PRODUCTS, LEASH_RADIUS, MAX_ANIMALS } from '../../data/animals';
import { STARTING_MONEY } from '../../data/economy';
import { MINUTES_PER_DAY } from '../../data/world';
import {
  addAnimal,
  animalActivity,
  animalSalePrice,
  homeOf,
  isInside,
  isPasture,
  laborMultipliers,
  payFeed,
} from '../animals';
import {
  addMoney,
  addSeeds,
  finishAllTasks,
  growAll,
  hireFree,
  readyAllProducts,
  setTimeOfDay,
  skipMinutes,
  spawnAnimals,
  unlockAll,
  waterAll,
} from '../dev';
import { produceValue } from '../economy';
import { tileIndex } from '../grid';
import { DEFAULT_SETTINGS, deserialize, serialize } from '../save';
import { collectShelter } from '../shelters';
import { advanceGame, tick } from '../simulation';
import { createInitialState } from '../state';
import { placeStructure } from '../structures';
import type { ActionResult, GameState } from '../types';
import { toggleTask, type QueueResult } from '../workers';

const unwrap = (result: ActionResult | QueueResult): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

const rich = (): GameState => ({ ...createInitialState(), money: 100_000 });

/** A farm with a finished coop at (28, 44), at 7:00, with lots of money. */
const withCoop = (): GameState => setTimeOfDay(unwrap(placeStructure(rich(), 'chickenCoop', 28, 44)), 7);

const coopOf = (s: GameState) => s.structures.find((x) => x.type === 'chickenCoop');

describe('animals', () => {
  it('every kind moves in once its shelter exists; they live in it', () => {
    for (const kind of ANIMAL_IDS) expect(addAnimal(rich(), kind)).toEqual({ ok: false, error: 'no-shelter' });
    // Every shelter at once needs more pasture than the starting plots hold.
    let s = unlockAll(rich());
    for (const kind of ANIMAL_IDS) s = spawnAnimals(s, kind, 1);
    for (const kind of ANIMAL_IDS) s = unwrap(addAnimal(s, kind));
    expect(s.animals).toHaveLength(ANIMAL_IDS.length * 2);
    for (const a of s.animals) expect(homeOf(s, a)).not.toBeNull();
  });

  it('stops at the farm limit', () => {
    const full = spawnAnimals(rich(), 'chicken', MAX_ANIMALS + 5);
    expect(full.animals).toHaveLength(MAX_ANIMALS);
    expect(addAnimal(full, 'chicken')).toEqual({ ok: false, error: 'max-animals' });
  });

  it('wander over pasture near the shelter while awake and sleep inside at night', () => {
    let s = spawnAnimals(withCoop(), 'chicken', 3);
    const start = s.animals.map((a) => [a.x, a.y]);
    for (let m = 0; m < 240; m++) s = tick(s, 1);
    expect(s.animals.map((a) => [a.x, a.y])).not.toEqual(start);
    for (const a of s.animals) {
      if (a.path.length > 0) continue;
      expect(isPasture(s.tiles, Math.floor(a.x), Math.floor(a.y))).toBe(true);
      const home = homeOf(s, a);
      expect(home && Math.hypot(a.x - home.x, a.y - home.y)).toBeLessThanOrEqual(LEASH_RADIUS + 0.01);
    }

    s = setTimeOfDay(s, 22);
    for (let m = 0; m < 90; m++) s = tick(s, 1);
    expect(s.animals.every((a) => animalActivity(s, a) === 'sleeping')).toBe(true);
    expect(s.animals.every((a) => isInside(s, a))).toBe(true);
  });

  it('lay products in the shelter, where they wait for the crew and can then be sold', () => {
    const s0 = spawnAnimals(withCoop(), 'chicken', 1);
    const coop = coopOf(s0);
    if (!coop) throw new Error('no coop');
    expect(collectShelter(s0, coop.id)).toEqual({ ok: false, error: 'no-product' });
    // Nobody to tend: the egg waits in the coop and a chore is queued.
    // With feed for the midnight meal, and no automatic order to muddle the money.
    const stocked = { ...s0, workers: [], inventory: { ...s0.inventory, feed: 50 }, feedOrder: { auto: false, days: 3 } };
    const laid = skipMinutes(stocked, ANIMALS.chicken.productionHours * 60 * 1.3);
    expect(coopOf(laid)?.stock).toEqual({ egg: 1 });
    expect(laid.tasks.filter((t) => t.kind === 'tend')).toHaveLength(1);
    const s = unwrap(collectShelter(laid, coop.id));
    expect(s.inventory.products.egg).toBe(1);
    expect(coopOf(s)?.stock).toBeUndefined();
    expect(produceValue(s)).toBe(ANIMAL_PRODUCTS.egg.sellPrice);
  });

  it('eat feed from the stock at midnight; hungry animals stop producing', () => {
    const base = spawnAnimals(createInitialState(), 'cow', 2);
    let s = { ...base, inventory: { ...base.inventory, feed: 100 } };
    const fed = advanceGame({ ...s, gameMinutes: MINUTES_PER_DAY - 1 }, 2);
    expect(fed.state.inventory.feed).toBe(100 - ANIMALS.cow.feedKgPerDay * 2);
    expect(fed.hungryAnimals).toBe(0);

    s = payFeed({ ...s, inventory: { ...s.inventory, feed: ANIMALS.cow.feedKgPerDay } }).state;
    expect(s.inventory.feed).toBe(0);
    expect(s.animals.map((a) => a.fed)).toEqual([true, false]);
    const hungry = s.animals[1];
    s = skipMinutes(s, 600);
    expect(s.animals.find((a) => a.id === hungry?.id)?.productMinutes).toBe(0);
  });

  it('draft animals speed up the workers (ox: tilling, horse: walking), capped', () => {
    expect(laborMultipliers(createInitialState())).toEqual({ hoe: 1, walk: 1 });
    const ox = spawnAnimals(createInitialState(), 'ox', 1);
    expect(laborMultipliers(ox).hoe).toBeGreaterThan(1);
    expect(laborMultipliers(spawnAnimals(createInitialState(), 'horse', 6)).walk).toBe(2);

    const minutesToTill = (base: GameState) => {
      const tile = tileIndex(35, 44);
      let s = unwrap(toggleTask(base, 'hoe', tile, 'wheat'));
      for (let m = 1; m < 200; m++) {
        s = tick(s, 1);
        if (s.tiles[tile]?.state === 'tilled') return m;
      }
      return Infinity;
    };
    expect(minutesToTill(ox)).toBeLessThan(minutesToTill(createInitialState()));
  });

  it('are worth less than they cost', () => {
    const s = unwrap(addAnimal(spawnAnimals(rich(), 'horse', 1), 'horse'));
    const horse = s.animals[1];
    if (!horse) throw new Error('no horse');
    expect(animalSalePrice(s.gameMinutes, horse)).toBeLessThan(ANIMALS.horse.purchaseCost);
  });

  it('round-trip in the save', () => {
    let s = spawnAnimals(createInitialState(), 'pig', 2);
    s = tick(s, 30);
    expect(deserialize(serialize(s, DEFAULT_SETTINGS))?.game).toEqual(s);
  });
});

describe('dev tools', () => {
  it('change money, time, inventory and land', () => {
    let s = addMoney(createInitialState(), 1000);
    expect(s.money).toBe(STARTING_MONEY + 1000);
    s = setTimeOfDay(s, 21.5);
    expect(s.gameMinutes % MINUTES_PER_DAY).toBe(21.5 * 60);
    s = addSeeds(s, 10);
    expect(s.inventory.seeds.corn).toBe(10);
    s = unlockAll(s);
    expect(s.tiles.every((t) => t.state !== 'locked')).toBe(true);
  });

  it('grow, water, finish tasks, hire and ready products', () => {
    const tile = tileIndex(29, 45);
    let s = createInitialState();
    s = unwrap(toggleTask(s, 'hoe', tile, 'wheat'));
    s = unwrap(toggleTask(s, 'seed', tile, 'wheat'));
    s = finishAllTasks(s);
    expect(s.tiles[tile]?.state).toBe('planted');
    expect(s.tasks).toEqual([]);
    s = waterAll(s);
    expect(s.tiles[tile]?.state).toBe('watered');
    s = growAll(s);
    expect(unwrap(toggleTask(s, 'hand', tile, 'wheat')).tasks).toHaveLength(1);

    const hired = hireFree(s);
    expect(hired.workers).toHaveLength(4);
    expect(hired.money).toBe(s.money);

    const horse = readyAllProducts(spawnAnimals(s, 'horse', 1));
    expect(horse.structures.find((x) => x.type === 'stable')?.stock).toBeUndefined();
    const cow = readyAllProducts(spawnAnimals(s, 'cow', 1));
    expect(cow.structures.find((x) => x.type === 'corral')?.stock).toEqual({ milk: 1 });
  });
});
