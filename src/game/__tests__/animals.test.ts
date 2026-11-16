import { describe, expect, it } from 'vitest';
import { ANIMALS, ANIMAL_IDS, ANIMAL_PRODUCTS, MAX_ANIMALS } from '../../data/animals';
import { STARTING_MONEY } from '../../data/economy';
import { MINUTES_PER_DAY } from '../../data/world';
import {
  animalActivity,
  animalSalePrice,
  buyAnimal,
  collectProduct,
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
import { advanceGame, tick } from '../simulation';
import { createInitialState } from '../state';
import type { ActionResult, GameState } from '../types';
import { toggleTask, type QueueResult } from '../workers';

const unwrap = (result: ActionResult | QueueResult): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

const rich = (): GameState => ({ ...createInitialState(), money: 100_000 });

describe('animals', () => {
  it('can buy every kind; they spawn on pasture near the house', () => {
    let s = rich();
    for (const kind of ANIMAL_IDS) s = unwrap(buyAnimal(s, kind));
    expect(s.animals).toHaveLength(ANIMAL_IDS.length);
    const spent = ANIMAL_IDS.reduce((sum, k) => sum + ANIMALS[k].purchaseCost, 0);
    expect(s.money).toBe(100_000 - spent);
    for (const a of s.animals) expect(isPasture(s.tiles, Math.floor(a.x), Math.floor(a.y))).toBe(true);
  });

  it('rejects purchases without money and beyond the limit', () => {
    const poor = { ...createInitialState(), money: 10 };
    expect(buyAnimal(poor, 'cow')).toEqual({ ok: false, error: 'not-enough-money' });
    const full = spawnAnimals(rich(), 'chicken', MAX_ANIMALS + 5);
    expect(full.animals).toHaveLength(MAX_ANIMALS);
    expect(buyAnimal(full, 'chicken')).toEqual({ ok: false, error: 'max-animals' });
  });

  it('wander only over pasture while awake and sleep at night', () => {
    let s = spawnAnimals(createInitialState(), 'sheep', 3);
    const start = s.animals.map((a) => [a.x, a.y]);
    for (let m = 0; m < 240; m++) {
      s = tick(s, 1);
      for (const a of s.animals) expect(isPasture(s.tiles, Math.floor(a.x), Math.floor(a.y))).toBe(true);
    }
    expect(s.animals.map((a) => [a.x, a.y])).not.toEqual(start);

    s = setTimeOfDay(s, 23);
    const asleep = s.animals.map((a) => [a.x, a.y]);
    for (let m = 0; m < 60; m++) s = tick(s, 1);
    expect(s.animals.map((a) => [a.x, a.y])).toEqual(asleep);
    expect(s.animals.every((a) => animalActivity(s, a) === 'sleeping')).toBe(true);
  });

  it('produce while fed and the product can be collected and sold', () => {
    let s = spawnAnimals(createInitialState(), 'chicken', 1);
    const id = s.animals[0]?.id ?? -1;
    expect(collectProduct(s, id)).toEqual({ ok: false, error: 'no-product' });
    s = skipMinutes(s, ANIMALS.chicken.productionHours * 60 + 15);
    expect(s.animals[0]?.hasProduct).toBe(true);
    s = unwrap(collectProduct(s, id));
    expect(s.inventory.products.egg).toBe(1);
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
    expect(laborMultipliers(spawnAnimals(createInitialState(), 'horse', 20)).walk).toBe(2);

    const tile = tileIndex(13, 13);
    const minutesToTill = (base: GameState) => {
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
    const s = unwrap(buyAnimal(rich(), 'horse'));
    const sold = unwrap(sellAnimal(s, 'horse'));
    expect(sold.animals).toEqual([]);
    expect(sold.money).toBe(100_000 - ANIMALS.horse.purchaseCost + animalSalePrice('horse'));
    expect(sellAnimal(sold, 'horse')).toEqual({ ok: false, error: 'no-animal' });
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

    const ready = readyAllProducts(spawnAnimals(s, 'horse', 1));
    expect(ready.animals[0]?.hasProduct).toBe(false);
    expect(readyAllProducts(spawnAnimals(s, 'cow', 1)).animals[0]?.hasProduct).toBe(true);
  });
});
