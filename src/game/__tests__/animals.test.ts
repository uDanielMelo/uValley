import { describe, expect, it } from 'vitest';
import { ANIMALS, ANIMAL_IDS, ANIMAL_PRODUCTS, LEASH_RADIUS, MAX_ANIMALS } from '../../data/animals';
import { STARTING_MONEY } from '../../data/economy';
import { MINUTES_PER_DAY } from '../../data/world';
import {
  animalActivity,
  animalSalePrice,
  buyAnimal,
  homeOf,
  isInside,
  isPasture,
  laborMultipliers,
  payFeed,
  sellAnimal,
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
import { produceValue, sellAllProduce, sellAnimalProduct } from '../economy';
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

/** A farm with a finished coop at (12, 12), at 7:00, with lots of money. */
const withCoop = (): GameState => setTimeOfDay(unwrap(placeStructure(rich(), 'chickenCoop', 12, 12)), 7);

const coopOf = (s: GameState) => s.structures.find((x) => x.type === 'chickenCoop');

describe('animals', () => {
  it('can buy every kind once its shelter exists; they live in it', () => {
    for (const kind of ANIMAL_IDS) expect(buyAnimal(rich(), kind)).toEqual({ ok: false, error: 'no-shelter' });
    // Every shelter at once needs more pasture than the starting plots hold.
    let s = unlockAll(rich());
    for (const kind of ANIMAL_IDS) s = spawnAnimals(s, kind, 1);
    const before = s.money;
    for (const kind of ANIMAL_IDS) s = unwrap(buyAnimal(s, kind));
    expect(s.animals).toHaveLength(ANIMAL_IDS.length * 2);
    const spent = ANIMAL_IDS.reduce((sum, k) => sum + ANIMALS[k].purchaseCost, 0);
    expect(s.money).toBe(before - spent);
    for (const a of s.animals) expect(homeOf(s, a)).not.toBeNull();
  });

  it('rejects purchases without money and beyond the limit', () => {
    const poor = { ...withCoop(), money: 10 };
    expect(buyAnimal(poor, 'chicken')).toEqual({ ok: false, error: 'not-enough-money' });
    const full = spawnAnimals(rich(), 'chicken', MAX_ANIMALS + 5);
    expect(full.animals).toHaveLength(MAX_ANIMALS);
    expect(buyAnimal(full, 'chicken')).toEqual({ ok: false, error: 'max-animals' });
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
    const laid = skipMinutes({ ...s0, workers: [] }, ANIMALS.chicken.productionHours * 60 + 15);
    expect(coopOf(laid)?.stock).toEqual({ egg: 1 });
    expect(laid.tasks.filter((t) => t.kind === 'tend')).toHaveLength(1);
    const s = unwrap(collectShelter(laid, coop.id));
    expect(s.inventory.products.egg).toBe(1);
    expect(coopOf(s)?.stock).toBeUndefined();
    expect(produceValue(s)).toBe(ANIMAL_PRODUCTS.egg.sellPrice);
    const sold = unwrap(sellAnimalProduct(s, 'egg', 1));
    expect(sold.money).toBe(s.money + ANIMAL_PRODUCTS.egg.sellPrice);
    expect(unwrap(sellAllProduce(s)).inventory.products).toEqual({});
  });

  it('charge feed at midnight; hungry animals stop producing', () => {
    let s = spawnAnimals(createInitialState(), 'cow', 2);
    const fed = advanceGame({ ...s, gameMinutes: MINUTES_PER_DAY - 1 }, 2);
    expect(fed.state.money).toBe(s.money - ANIMALS.cow.feedCostPerDay * 2);
    expect(fed.hungryAnimals).toBe(0);

    s = payFeed({ ...s, money: ANIMALS.cow.feedCostPerDay }).state;
    expect(s.animals.map((a) => a.fed)).toEqual([true, false]);
    const hungry = s.animals[1];
    s = skipMinutes(s, 600);
    expect(s.animals.find((a) => a.id === hungry?.id)?.productMinutes).toBe(0);
  });

  it('draft animals speed up the workers (ox: tilling, horse: walking), capped', () => {
    expect(laborMultipliers(createInitialState())).toEqual({ hoe: 1, walk: 1 });
    const ox = spawnAnimals(createInitialState(), 'ox', 1);
    expect(laborMultipliers(ox).hoe).toBeCloseTo(1 + (ANIMALS.ox.labor.hoe ?? 0));
    expect(laborMultipliers(spawnAnimals(createInitialState(), 'horse', 6)).walk).toBe(2);

    const minutesToTill = (base: GameState) => {
      const tile = tileIndex(19, 12);
      let s = unwrap(toggleTask(base, 'hoe', tile, 'wheat'));
      for (let m = 1; m < 200; m++) {
        s = tick(s, 1);
        if (s.tiles[tile]?.state === 'tilled') return m;
      }
      return Infinity;
    };
    expect(minutesToTill(ox)).toBeLessThan(minutesToTill(createInitialState()));
  });

  it('sells back at a discount', () => {
    const s = unwrap(buyAnimal(spawnAnimals(rich(), 'horse', 1), 'horse'));
    const sold = unwrap(sellAnimal(s, 'horse'));
    expect(sold.animals).toHaveLength(1);
    expect(sold.money).toBe(s.money + animalSalePrice('horse'));
  });

  it('round-trip in the save and migrate v2 saves', () => {
    let s = spawnAnimals(createInitialState(), 'pig', 2);
    s = tick(s, 30);
    expect(deserialize(serialize(s, DEFAULT_SETTINGS))?.game).toEqual(s);

    const { animals: _a, ...v2Game } = createInitialState();
    const { products: _p, ...v2Inventory } = v2Game.inventory;
    const loaded = deserialize(
      JSON.stringify({ saveVersion: 2, savedAt: 0, game: { ...v2Game, inventory: v2Inventory }, settings: {} }),
    );
    expect(loaded?.game.animals).toEqual([]);
    expect(loaded?.game.inventory.products).toEqual({});
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
    const tile = tileIndex(13, 13);
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
