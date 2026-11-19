import { describe, expect, it } from 'vitest';
import { SEASONS, SEASON_DAYS, WEATHERS, WEATHER_IDS } from '../../data/climate';
import { OPEN_AIR_SPOILAGE, PANTRY_CAPACITY } from '../../data/storage';
import { MINUTES_PER_DAY } from '../../data/world';
import { plant, till, water } from '../actions';
import { applyDayWeather, dayOf, dayOfSeason, seasonGrowth, seasonOf, weatherOf, yearOf } from '../climate';
import { skipToWeather, unlockAll } from '../dev';
import { tileIndex } from '../grid';
import { advanceGame } from '../simulation';
import { createInitialState } from '../state';
import { spoilGoods, storageCapacity, storageUse } from '../storage';
import { placeStructure } from '../structures';
import type { ActionResult, GameState } from '../types';

const unwrap = (result: ActionResult): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

const TILE = tileIndex(31, 51);

type Inventory = GameState['inventory'];

const withGoods = (s: GameState, produce: Inventory['produce'], products: Inventory['products'] = {}): GameState => ({
  ...s,
  inventory: { ...s.inventory, produce, products },
});

describe('seasons', () => {
  it('cycle every SEASON_DAYS days, starting in spring', () => {
    expect(seasonOf(1)).toBe('spring');
    expect(seasonOf(SEASON_DAYS)).toBe('spring');
    expect(seasonOf(SEASON_DAYS + 1)).toBe('summer');
    expect(seasonOf(SEASON_DAYS * 3 + 1)).toBe('winter');
    expect(seasonOf(SEASON_DAYS * 4 + 1)).toBe('spring');
    expect(dayOfSeason(SEASON_DAYS + 2)).toBe(2);
    expect(yearOf(SEASON_DAYS * 4 + 1)).toBe(2);
    expect(dayOf(0)).toBe(1);
    expect(dayOf(MINUTES_PER_DAY)).toBe(2);
  });

  it('change how fast crops grow', () => {
    expect(seasonGrowth(0)).toBe(SEASONS.spring.growth);
    expect(seasonGrowth(SEASON_DAYS * 3 * MINUTES_PER_DAY)).toBe(SEASONS.winter.growth);
  });
});

describe('weather', () => {
  it('is fixed per day, sunny on the first one, and follows the season odds', () => {
    expect(weatherOf(1)).toBe('sunny');
    expect(weatherOf(40)).toBe(weatherOf(40));
    const counts = Object.fromEntries(WEATHER_IDS.map((id) => [id, 0])) as Record<string, number>;
    const days = 4000;
    for (let i = 0; i < days; i++) {
      const day = 2 + i * 28;
      counts[weatherOf(day)] = (counts[weatherOf(day)] ?? 0) + 1;
    }
    // Day 2 + 28k is always spring: the shares match its odds.
    for (const id of WEATHER_IDS) expect((counts[id] ?? 0) / days).toBeCloseTo(SEASONS.spring.weather[id], 1);
  });

  it('rain waters every growing crop for the day', () => {
    const s = unwrap(plant(unwrap(till(createInitialState(), TILE)), TILE, 'wheat'));
    const day = 2;
    const rained = applyDayWeather({ ...s, tiles: s.tiles }, day);
    const rainy = WEATHERS[weatherOf(day)].waters;
    expect(rained.report.watered > 0).toBe(rainy);
    const forced = skipToWeather(s, 'rain');
    expect(forced.tiles[TILE]?.state).toBe('watered');
    expect(forced.tiles[TILE]?.wateredUntil).toBe((dayOf(forced.gameMinutes)) * MINUTES_PER_DAY);
  });

  it('a storm destroys some growing crops (and waters the rest)', () => {
    let s = unlockAll(createInitialState());
    const tiles: number[] = [];
    for (let x = 12; x < 20; x++) for (let y = 19; y < 20; y++) tiles.push(tileIndex(x, y));
    for (let y = 20; y < 24; y++) for (let x = 12; x < 20; x++) tiles.push(tileIndex(x, y));
    let planted = 0;
    for (const t of tiles) {
      const tilled = till(s, t);
      if (!tilled.ok) continue;
      s = unwrap(plant({ ...tilled.state, inventory: { ...tilled.state.inventory, seeds: { wheat: 99 } } }, t, 'wheat'));
      planted++;
    }
    let destroyed = 0;
    let watered = 0;
    for (let k = 0; k < 6; k++) {
      const stormy = skipToWeather({ ...s, gameMinutes: s.gameMinutes + k * MINUTES_PER_DAY * 3 }, 'storm');
      const day = dayOf(stormy.gameMinutes);
      const report = applyDayWeather(s, day).report;
      destroyed += report.destroyed;
      watered += report.watered;
    }
    expect(planted).toBeGreaterThan(10);
    expect(destroyed).toBeGreaterThan(0);
    expect(destroyed).toBeLessThan(watered);
  });

  it('hits the farm at midnight in the simulation', () => {
    const s = unwrap(water(unwrap(plant(unwrap(till(createInitialState(), TILE)), TILE, 'wheat')), TILE));
    const toMidnight = MINUTES_PER_DAY - (s.gameMinutes % MINUTES_PER_DAY);
    const tick = advanceGame(s, toMidnight + 1);
    expect(tick.weatherReports.map((r) => r.day)).toEqual([2]);
  });
});

describe('storage', () => {
  it('the pantry holds PANTRY_CAPACITY; silos, warehouses, barns and cold rooms add room', () => {
    let s: GameState = { ...unlockAll(createInitialState()), money: 100_000 };
    expect(storageCapacity(s)).toEqual({ general: PANTRY_CAPACITY, grain: 0, cold: 0 });
    s = unwrap(placeStructure(s, 'silo', 28, 51));
    s = unwrap(placeStructure(s, 'coldRoom', 31, 51));
    s = unwrap(placeStructure(s, 'barn', 36, 51));
    expect(storageCapacity(s)).toEqual({ general: PANTRY_CAPACITY + 100, grain: 80, cold: 30 });
  });

  it('grain goes to the silo, perishables to the cold room, the rest is in general storage or the open', () => {
    let s: GameState = { ...unlockAll(createInitialState()), money: 100_000 };
    s = unwrap(placeStructure(s, 'silo', 28, 51));
    s = unwrap(placeStructure(s, 'coldRoom', 31, 51));
    const use = storageUse(withGoods(s, { wheat: 100, tomato: 20 }, { milk: 20, wool: 25 }));
    expect(use.grainUsed).toBe(80);
    expect(use.coldUsed).toBe(30);
    expect(use.total).toBe(165);
    expect(use.generalUsed).toBe(55);
    expect(use.openAir).toBe(55 - PANTRY_CAPACITY);
  });

  it('perishables spoil a little each night; wheat and wool keep', () => {
    // 28 units: all fit in the pantry.
    const s = withGoods(createInitialState(), { wheat: 5, tomato: 10 }, { wool: 5, milk: 8 });
    const { state, spoiled } = spoilGoods(s, 2);
    expect(state.inventory.produce.wheat).toBe(5);
    expect(state.inventory.products.wool).toBe(5);
    expect(spoiled.produce.tomato ?? 0).toBeGreaterThanOrEqual(1);
    expect(spoiled.products.milk ?? 0).toBeGreaterThanOrEqual(1);
    expect(state.inventory.produce.tomato).toBe(10 - (spoiled.produce.tomato ?? 0));
  });

  it('goods in the cold room or the silo keep; goods in the open spoil fast', () => {
    let s: GameState = { ...unlockAll(createInitialState()), money: 100_000 };
    s = unwrap(placeStructure(s, 'coldRoom', 31, 51));
    const cold = spoilGoods(withGoods(s, { tomato: 20 }, { milk: 10 }), 2);
    expect(cold.spoiled.total).toBe(0);

    const open = spoilGoods(withGoods(createInitialState(), { wheat: 100 }), 2);
    // 70 of the 100 do not fit in the pantry: about a quarter of them is lost.
    expect(open.spoiled.produce.wheat ?? 0).toBeGreaterThan(70 * OPEN_AIR_SPOILAGE * 0.6);
  });

  it('spoils more in summer than in winter', () => {
    const goods = withGoods(createInitialState(), { tomato: 30 });
    const summer = spoilGoods(goods, SEASON_DAYS + 1).spoiled.total;
    const winter = spoilGoods(goods, SEASON_DAYS * 3 + 1).spoiled.total;
    expect(summer).toBeGreaterThan(winter);
  });
});
