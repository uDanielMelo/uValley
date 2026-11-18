import { describe, expect, it } from 'vitest';
import { ANIMALS } from '../../data/animals';
import { DEMOLISH_REFUND, SHELTER_LEVELS, STRUCTURES } from '../../data/structures';
import { buyAnimal } from '../animals';
import { cancelAllOrders, checkUpgrade, completeAllWork, demolishClick, orderDemolish, orderUpgrade } from '../construction';
import { setTimeOfDay, skipMinutes, spawnAnimals } from '../dev';
import { tileIndex } from '../grid';
import { DEFAULT_SETTINGS, deserialize, serialize } from '../save';
import {
  maxShelterLevel,
  nextShelterLevel,
  shelterCapacity,
  shelterFor,
  shelterSafety,
  stockCap,
} from '../shelters';
import { advanceGame, type FinishedWork } from '../simulation';
import { createInitialState } from '../state';
import { buildCost, isOperational, placeStructure, refundFor, upgradeCost, upgradeMinutes } from '../structures';
import type { ActionResult, GameState, StructureInstance } from '../types';

const unwrap = (result: ActionResult): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

/** 7:00, lots of money and a finished coop at (12, 12). */
const coopFarm = (): GameState =>
  setTimeOfDay(unwrap(placeStructure({ ...createInitialState(), money: 100_000 }, 'chickenCoop', 12, 12)), 7);

const coopOf = (s: GameState): StructureInstance => {
  const coop = s.structures.find((x) => x.type === 'chickenCoop');
  if (!coop) throw new Error('no coop');
  return coop;
};

const run = (state: GameState, minutes: number): { state: GameState; finished: FinishedWork[] } => {
  let s = state;
  const finished: FinishedWork[] = [];
  for (let t = 0; t < minutes; t += 2) {
    const r = advanceGame(s, 2);
    s = r.state;
    finished.push(...r.worksFinished);
  }
  return { state: s, finished };
};

describe('shelter levels', () => {
  it('grow capacity and stock with each level', () => {
    const base = STRUCTURES.chickenCoop.shelter?.capacity ?? 0;
    expect(shelterCapacity({ type: 'chickenCoop' })).toBe(base);
    expect(shelterCapacity({ type: 'chickenCoop', level: 2 })).toBe(16);
    expect(shelterCapacity({ type: 'chickenCoop', level: 3 })).toBe(20);
    expect(stockCap({ type: 'chickenCoop', level: 3 })).toBeGreaterThan(stockCap({ type: 'chickenCoop' }));
  });

  it('stop at level 3 for now; the stable never had automation', () => {
    expect(maxShelterLevel('chickenCoop')).toBe(3);
    expect(maxShelterLevel('stable')).toBe(3);
    expect(nextShelterLevel({ type: 'corral', level: 3 })).toBeNull();
    expect(nextShelterLevel({ type: 'corral' })).toBe(2);
    expect(nextShelterLevel({ type: 'silo' })).toBeNull();
  });

  it('the coop wire mesh adds safety from level 2', () => {
    expect(shelterSafety({ type: 'chickenCoop', level: 2 })).toBeGreaterThan(shelterSafety({ type: 'corral', level: 2 }));
    expect(shelterSafety({ type: 'chickenCoop' })).toBe(shelterSafety({ type: 'corral' }));
  });

  it('cost and work are a share of the shelter build', () => {
    expect(upgradeCost('corral', 2)).toBe(Math.round(buildCost('corral') * SHELTER_LEVELS[2].upgradeShare));
    expect(upgradeMinutes('corral', 3)).toBe(STRUCTURES.corral.buildMinutes);
  });
});

describe('upgrading', () => {
  it('is crew work, paid up front, and the shelter keeps working meanwhile', () => {
    let s = spawnAnimals(coopFarm(), 'chicken', 2);
    const before = s.money;
    s = unwrap(orderUpgrade(s, coopOf(s).id));
    expect(s.money).toBe(before - upgradeCost('chickenCoop', 2));
    expect(coopOf(s).work).toEqual({ kind: 'upgrade', done: 0, total: upgradeMinutes('chickenCoop', 2), toLevel: 2 });
    expect(isOperational(coopOf(s))).toBe(true);
    expect(shelterFor(s, 'chicken')).toEqual(coopOf(s));
    expect(unwrap(buyAnimal(s, 'chicken')).animals).toHaveLength(3);
    expect(checkUpgrade(s, coopOf(s).id)).toBe('under-construction');

    const { state, finished } = run(s, 400);
    expect(coopOf(state).level).toBe(2);
    expect(coopOf(state).work).toBeUndefined();
    expect(finished).toContainEqual({ type: 'chickenCoop', kind: 'upgrade', level: 2 });
    expect(nextShelterLevel(coopOf(state))).toBe(3);
  });

  it('can be cancelled with a full refund (demolish tool or cancel all)', () => {
    const s0 = coopFarm();
    const s = unwrap(orderUpgrade(s0, coopOf(s0).id));
    const cancelled = demolishClick(s, tileIndex(12, 12));
    expect(cancelled.ok && cancelled.change).toEqual({ kind: 'upgrade-cancelled', type: 'chickenCoop', refund: upgradeCost('chickenCoop', 2) });
    const after = unwrap(cancelled);
    expect(after.money).toBe(s0.money);
    expect(coopOf(after).work).toBeUndefined();
    expect(coopOf(after).level).toBeUndefined();
    expect(cancelAllOrders(s).money).toBe(s0.money);
  });

  it('refuses at the top level, without money, or for non-shelters', () => {
    const s = coopFarm();
    const top: GameState = { ...s, structures: s.structures.map((x) => (x.type === 'chickenCoop' ? { ...x, level: 3 } : x)) };
    expect(orderUpgrade(top, coopOf(top).id)).toEqual({ ok: false, error: 'max-level' });
    expect(orderUpgrade({ ...s, money: 0 }, coopOf(s).id)).toEqual({ ok: false, error: 'not-enough-money' });
    const house = s.structures.find((x) => x.type === 'house');
    expect(orderUpgrade(s, house?.id ?? -1)).toEqual({ ok: false, error: 'no-structure' });
  });

  it('better shelters produce faster', () => {
    const basic = spawnAnimals(coopFarm(), 'chicken', 1);
    const better: GameState = {
      ...basic,
      structures: basic.structures.map((x) => (x.type === 'chickenCoop' ? { ...x, level: 3 } : x)),
    };
    const hours = ANIMALS.chicken.productionHours * 60 * 0.5;
    const progress = (s: GameState) => skipMinutes({ ...s, workers: [] }, hours).animals[0]?.productMinutes ?? 0;
    expect(progress(better)).toBeGreaterThan(progress(basic));
  });

  it('demolishing refunds part of the upgrades too', () => {
    const s = completeAllWork(unwrap(orderUpgrade(coopFarm(), coopOf(coopFarm()).id)));
    expect(coopOf(s).level).toBe(2);
    const refund = refundFor('chickenCoop', 2);
    expect(refund).toBe(Math.floor((buildCost('chickenCoop') + upgradeCost('chickenCoop', 2)) * DEMOLISH_REFUND));
    const done = completeAllWork(unwrap(orderDemolish(s, tileIndex(12, 12))));
    expect(done.money).toBe(s.money + refund);
  });

  it('saves levels and upgrades in progress; v8 saves load at level 1', () => {
    const s = run(unwrap(orderUpgrade(coopFarm(), coopOf(coopFarm()).id)), 30).state;
    expect(deserialize(serialize(s, DEFAULT_SETTINGS))?.game).toEqual(s);
    const leveled: GameState = { ...s, structures: s.structures.map((x) => (x.type === 'chickenCoop' ? { ...x, level: 3, work: undefined } : x)) };
    expect(coopOf(deserialize(serialize(leveled, DEFAULT_SETTINGS))?.game ?? s).level).toBe(3);
    const v8 = JSON.stringify({ saveVersion: 8, savedAt: 0, game: coopFarm(), settings: DEFAULT_SETTINGS });
    expect(coopOf(deserialize(v8)?.game ?? s).level).toBeUndefined();
  });
});
