import { describe, expect, it } from 'vitest';
import { FERTILIZER, MANURE_PER_DAY, MANURE_PIT_BONUS, MANURE_SICKNESS } from '../../data/fertilizer';
import { MINUTES_PER_DAY } from '../../data/world';
import { fertilize, harvest, plant, till, water } from '../actions';
import { addAnimal, stepAnimals } from '../animals';
import { growthMinutesNeeded } from '../crops';
import { addFertilizer, fillManure, setTimeOfDay } from '../dev';
import { seasonGrowth } from '../climate';
import { buyFertilizer } from '../economy';
import { tileIndex } from '../grid';
import { growTiles } from '../growth';
import { sicknessRisk } from '../health';
import { DEFAULT_SETTINGS, deserialize, serialize } from '../save';
import { collectShelter, manureCap, manureUnits, queueShelterChores } from '../shelters';
import { createInitialState } from '../state';
import { placeStructure } from '../structures';
import type { ActionResult, GameState, StructureInstance } from '../types';
import { toggleTask } from '../workers';

const unwrap = (result: ActionResult): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

/** A free grass tile inside the starting plots. */
const TILE = tileIndex(31, 51);

/** 7:00, lots of money, some fertilizer, a coop at (28, 44) and a pigsty at (33, 44). */
const farm = (): GameState => {
  let s: GameState = { ...createInitialState(), money: 100_000 };
  s = unwrap(placeStructure(s, 'chickenCoop', 28, 44));
  s = unwrap(placeStructure(s, 'pigsty', 33, 44));
  return addFertilizer(setTimeOfDay(s, 7), 5);
};

const shelter = (s: GameState, type: StructureInstance['type']): StructureInstance => {
  const found = s.structures.find((x) => x.type === type);
  if (!found) throw new Error(`no ${type}`);
  return found;
};

const tileAt = (s: GameState) => {
  const tile = s.tiles[TILE];
  if (!tile) throw new Error('no tile');
  return tile;
};

describe('fertilizing', () => {
  it('needs worked soil and fertilizer, uses one unit, and only once', () => {
    const s = farm();
    expect(fertilize(s, TILE)).toEqual({ ok: false, error: 'not-fertilizable' });
    const tilled = unwrap(till(s, TILE));
    const done = unwrap(fertilize(tilled, TILE));
    expect(tileAt(done).fertilized).toBe(true);
    expect(done.inventory.fertilizer).toBe(4);
    expect(fertilize(done, TILE)).toEqual({ ok: false, error: 'already-fertilized' });
    expect(fertilize({ ...tilled, inventory: { ...tilled.inventory, fertilizer: 0 } }, TILE)).toEqual({
      ok: false,
      error: 'no-fertilizer',
    });
  });

  it('stays through planting, watering and drying, and is used up at harvest', () => {
    let s = unwrap(fertilize(unwrap(till(farm(), TILE)), TILE));
    s = unwrap(water(unwrap(plant(s, TILE, 'wheat')), TILE));
    expect(tileAt(s).fertilized).toBe(true);
    // A whole day later the watering has worn off: the tile is planted again, still fertilized.
    const dried = growTiles(s.tiles, s.gameMinutes, s.gameMinutes + MINUTES_PER_DAY);
    expect(dried[TILE]?.state).toBe('planted');
    expect(dried[TILE]?.fertilized).toBe(true);

    const crop = tileAt(s).crop;
    if (!crop) throw new Error('no crop');
    const grown = { ...crop, growthMinutes: growthMinutesNeeded(crop) };
    const ripe = { ...s, tiles: s.tiles.map((t, i) => (i === TILE ? { ...t, crop: grown } : t)) };
    const harvested = unwrap(harvest(ripe, TILE));
    expect(tileAt(harvested)).toEqual({ state: 'tilled' });
    expect(harvested.inventory.produce.wheat ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('makes the crop grow faster while watered', () => {
    const base = unwrap(water(unwrap(plant(unwrap(till(farm(), TILE)), TILE, 'wheat')), TILE));
    const rich = unwrap(fertilize(base, TILE));
    const from = base.gameMinutes;
    const plainGrowth = growTiles(base.tiles, from, from + 60)[TILE]?.crop?.growthMinutes ?? 0;
    const richGrowth = growTiles(rich.tiles, from, from + 60)[TILE]?.crop?.growthMinutes ?? 0;
    expect(plainGrowth).toBeCloseTo(60 * seasonGrowth(from));
    expect(richGrowth).toBeCloseTo(plainGrowth * FERTILIZER.growth);
  });

  it('sometimes gives an extra unit at harvest (fertilized only)', () => {
    let extras = 0;
    let plain = 0;
    for (let i = 0; i < 40; i++) {
      let s = { ...farm(), gameMinutes: 7 * 60 + i * 37 };
      s = unwrap(plant(unwrap(till(s, TILE)), TILE, 'wheat'));
      const crop = tileAt(s).crop;
      if (!crop) throw new Error('no crop');
      const grown = { ...crop, growthMinutes: growthMinutesNeeded(crop) };
      const ripe = (fertilized: boolean): GameState => ({
        ...s,
        tiles: s.tiles.map((t, k) => (k === TILE ? { ...t, ...(fertilized ? { fertilized: true as const } : {}), crop: grown } : t)),
      });
      extras += (unwrap(harvest(ripe(true), TILE)).inventory.produce.wheat ?? 0) - 1;
      plain += (unwrap(harvest(ripe(false), TILE)).inventory.produce.wheat ?? 0) - 1;
    }
    expect(plain).toBe(0);
    expect(extras).toBeGreaterThan(4);
    expect(extras).toBeLessThan(28);
  });

  it('can be queued after tilling on the same tile', () => {
    let s = farm();
    const queued = toggleTask(s, 'hoe', TILE, 'wheat');
    if (!queued.ok) throw new Error(queued.error);
    s = queued.state;
    const then = toggleTask(s, 'fertilize', TILE, 'wheat');
    expect(then.ok).toBe(true);
  });

  it('is sold at the shop', () => {
    const s = farm();
    const bought = unwrap(buyFertilizer(s, 10));
    expect(bought.inventory.fertilizer).toBe(15);
    expect(bought.money).toBe(s.money - 10 * FERTILIZER.price);
  });
});

describe('manure', () => {
  it('piles up at the shelter with every animal, faster at the pigsty with a manure pit', () => {
    let s = unwrap(addAnimal(unwrap(addAnimal(farm(), 'chicken')), 'pig'));
    s = stepAnimals(s, MINUTES_PER_DAY);
    expect(shelter(s, 'chickenCoop').manure).toBeCloseTo(MANURE_PER_DAY.chicken);
    expect(shelter(s, 'pigsty').manure).toBeCloseTo(MANURE_PER_DAY.pig);

    const pit = { ...s, structures: s.structures.map((x) => (x.type === 'pigsty' ? { ...x, level: 3 as const, manure: 0 } : x)) };
    expect(shelter(stepAnimals(pit, MINUTES_PER_DAY), 'pigsty').manure).toBeCloseTo(MANURE_PER_DAY.pig * MANURE_PIT_BONUS);
  });

  it('stops at the cap', () => {
    const s = stepAnimals(fillManure(unwrap(addAnimal(farm(), 'pig'))), MINUTES_PER_DAY);
    const sty = shelter(s, 'pigsty');
    expect(sty.manure).toBe(manureCap(sty));
  });

  it('whole units are collected as fertilizer by the shelter chore; the fraction stays', () => {
    let s = unwrap(addAnimal(farm(), 'pig'));
    s = { ...s, structures: s.structures.map((x) => (x.type === 'pigsty' ? { ...x, manure: 2.4 } : x)) };
    const sty = shelter(s, 'pigsty');
    expect(manureUnits(sty)).toBe(2);
    const queued = queueShelterChores(s);
    expect(queued.tasks.some((t) => t.job?.type === 'shelter' && t.job.structureId === sty.id)).toBe(true);
    const collected = unwrap(collectShelter(s, sty.id));
    expect(collected.inventory.fertilizer).toBe(s.inventory.fertilizer + 2);
    expect(shelter(collected, 'pigsty').manure).toBeCloseTo(0.4);
    // Less than a unit: nothing to collect yet.
    expect(queueShelterChores({ ...collected, tasks: [] }).tasks).toHaveLength(0);
  });

  it('a shelter full of manure makes its animals sick more often', () => {
    const s = unwrap(addAnimal(farm(), 'pig'));
    const pig = s.animals[0];
    if (!pig) throw new Error('no pig');
    expect(sicknessRisk(fillManure(s), pig)).toBeCloseTo(sicknessRisk(s, pig) * MANURE_SICKNESS);
  });
});

describe('save', () => {
  it('keeps fertilizer, fertilized tiles and manure', () => {
    let s = unwrap(fertilize(unwrap(till(farm(), TILE)), TILE));
    s = { ...s, structures: s.structures.map((x) => (x.type === 'pigsty' ? { ...x, manure: 1.25 } : x)) };
    expect(deserialize(serialize(s, DEFAULT_SETTINGS))?.game).toEqual(s);
  });

});
