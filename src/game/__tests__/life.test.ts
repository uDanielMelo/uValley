import { describe, expect, it } from 'vitest';
import { ANIMALS, BABY_PRICE, BREEDS, GAME_MINUTES_PER_REAL_HOUR } from '../../data/animals';
import {
  addAnimal,
  animalProduct,
  animalSalePrice,
  buyAnimal,
  laborMultipliers,
  lifeStage,
  productionRate,
  purchasePrice,
  removeDeadAnimals,
  rollAnimalStars,
} from '../animals';
import { ageAnimals, readyAllProducts, setTimeOfDay, spawnAnimals } from '../dev';
import { DEFAULT_SETTINGS, deserialize, serialize } from '../save';
import { advanceGame } from '../simulation';
import { createInitialState } from '../state';
import { placeStructure } from '../structures';
import type { ActionResult, Animal, GameState } from '../types';

const unwrap = (result: ActionResult): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

const HOUR = GAME_MINUTES_PER_REAL_HOUR;

/** 7:00, lots of money, a finished coop and corral. */
const farm = (): GameState => {
  let s: GameState = { ...createInitialState(), money: 100_000 };
  s = unwrap(placeStructure(s, 'chickenCoop', 28, 44));
  s = unwrap(placeStructure(s, 'corral', 33, 44));
  return setTimeOfDay(s, 7);
};

const only = (s: GameState): Animal => {
  const a = s.animals[s.animals.length - 1];
  if (!a) throw new Error('no animal');
  return a;
};

describe('life cycle', () => {
  it('goes baby → young → adult → old over 12 + 12 + 48 + 24 real hours', () => {
    const s = unwrap(addAnimal(farm(), 'chicken', { age: 'baby' }));
    const a = only(s);
    const at = (hours: number) => lifeStage(s.gameMinutes + hours * HOUR, a);
    expect(at(0)).toBe('baby');
    expect(at(11.9)).toBe('baby');
    expect(at(12)).toBe('young');
    expect(at(24)).toBe('adult');
    expect(at(71.9)).toBe('adult');
    expect(at(72)).toBe('old');
  });

  it('bought adults start at the beginning of adulthood', () => {
    const s = unwrap(addAnimal(farm(), 'cow'));
    expect(lifeStage(s.gameMinutes, only(s))).toBe('adult');
    expect(lifeStage(s.gameMinutes - 1, only(s))).toBe('young');
  });

  it('babies do not produce, young and old produce half', () => {
    const s = unwrap(addAnimal(farm(), 'chicken', { age: 'baby' }));
    const a = { ...only(s), stars: 2 as const };
    const rate = (hours: number) => productionRate(s.gameMinutes + hours * HOUR, a);
    expect(rate(0)).toBe(0);
    expect(rate(13)).toBeCloseTo(rate(30) / 2);
    expect(rate(80)).toBeCloseTo(rate(30) / 2);
  });

  it('dies of old age after 96 real hours, freeing its place', () => {
    const s = spawnAnimals(farm(), 'chicken', 2);
    expect(removeDeadAnimals(s).died).toEqual([]);
    const ancient = ageAnimals(s, 96 - 24);
    const tick = advanceGame(ancient, 2);
    expect(tick.animalsDied.map((a) => a.kind)).toEqual(['chicken', 'chicken']);
    expect(tick.state.animals).toEqual([]);
  });
});

describe('breeds and stars', () => {
  it('noble breeds cost more and do better; babies cost half', () => {
    expect(purchasePrice('cow', 'holandesa', 'adult')).toBeGreaterThan(purchasePrice('cow', 'gir', 'adult'));
    expect(purchasePrice('cow', 'gir', 'baby')).toBe(Math.round(ANIMALS.cow.purchaseCost * BABY_PRICE));
    expect(BREEDS.holandesa.production).toBeGreaterThan(BREEDS.gir.production);
    const before = farm();
    const s = unwrap(buyAnimal(before, 'cow', 'holandesa', 'baby'));
    expect(s.money).toBe(before.money - purchasePrice('cow', 'holandesa', 'baby'));
    expect(only(s).breed).toBe('holandesa');
  });

  it('a Merino gives fine wool instead of wool', () => {
    expect(animalProduct({ kind: 'sheep', breed: 'merino' })).toBe('fineWool');
    expect(animalProduct({ kind: 'sheep', breed: 'santaInes' })).toBe('wool');
    const fold = unwrap(placeStructure(farm(), 'sheepfold', 40, 46));
    const merino = unwrap(addAnimal(fold, 'sheep', { breed: 'merino', ignorePasture: true }));
    const stocked = readyAllProducts(merino).structures.find((x) => x.type === 'sheepfold');
    expect(stocked?.stock).toEqual({ fineWool: 1 });
  });

  it('rejects a breed of another species', () => {
    expect(addAnimal(farm(), 'cow', { breed: 'leghorn' })).toEqual({ ok: false, error: 'no-animal' });
  });

  it('stars are rolled from the id (always the same) and speed production up', () => {
    expect(rollAnimalStars(42)).toBe(rollAnimalStars(42));
    const all = new Set(Array.from({ length: 200 }, (_, i) => rollAnimalStars(i)));
    expect(all).toEqual(new Set([1, 2, 3]));
    const base = { breed: 'gir' as const, bornAt: -24 * HOUR };
    expect(productionRate(0, { ...base, stars: 3 })).toBeGreaterThan(productionRate(0, { ...base, stars: 1 }));
  });

  it('old animals and babies sell for less than adults', () => {
    const s = unwrap(addAnimal(farm(), 'cow'));
    const cow = { ...only(s), stars: 2 as const };
    const adult = animalSalePrice(s.gameMinutes, cow);
    expect(animalSalePrice(s.gameMinutes + 50 * HOUR, cow)).toBeLessThan(adult);
    expect(animalSalePrice(s.gameMinutes - 20 * HOUR, cow)).toBeLessThan(adult);
  });

  it('draft help follows breed and age: a calf does not pull, a Guzerá pulls harder', () => {
    const base = farm();
    const nelore = unwrap(addAnimal(base, 'ox', { breed: 'nelore' }));
    const guzera = unwrap(addAnimal(base, 'ox', { breed: 'guzera' }));
    const calf = unwrap(addAnimal(base, 'ox', { age: 'baby' }));
    const same = (s: GameState): GameState => ({ ...s, animals: s.animals.map((a) => ({ ...a, stars: 2 as const })) });
    expect(laborMultipliers(same(guzera)).hoe).toBeGreaterThan(laborMultipliers(same(nelore)).hoe);
    expect(laborMultipliers(calf).hoe).toBe(1);
  });
});

describe('life saves', () => {
  it('round-trips breed, stars and birth time', () => {
    const s = unwrap(buyAnimal(farm(), 'chicken', 'leghorn', 'baby'));
    expect(deserialize(serialize(s, DEFAULT_SETTINGS))?.game).toEqual(s);
  });

});
