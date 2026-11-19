import { describe, expect, it } from 'vitest';
import { BUILDABLE_IDS, LIGHT_SAFETY_CAP, STRUCTURES } from '../../data/structures';
import { addAnimal } from '../animals';
import { setTimeOfDay, unlockAll } from '../dev';
import { exposure } from '../health';
import { effectiveSafety, lightingBonus, shelterDoor, shelterSafety } from '../shelters';
import { createInitialState } from '../state';
import { placeStructure } from '../structures';
import type { ActionResult, GameState, StructureInstance } from '../types';

const unwrap = (result: ActionResult): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

const coopFarm = (): GameState => {
  const s: GameState = { ...unlockAll(createInitialState()), money: 100_000 };
  return unwrap(placeStructure(s, 'chickenCoop', 12, 12));
};

const coopOf = (s: GameState): StructureInstance => {
  const coop = s.structures.find((x) => x.type === 'chickenCoop');
  if (!coop) throw new Error('no coop');
  return coop;
};

/** Places a lamp on the first free tile at the given offset from the coop's door. */
const lampNear = (s: GameState, dx: number, dy: number): GameState => {
  const door = shelterDoor(coopOf(s));
  return unwrap(placeStructure(s, 'lampPost', Math.floor(door.x + dx), Math.floor(door.y + dy)));
};

describe('decorations', () => {
  it('can all be built and cost something', () => {
    const decor = BUILDABLE_IDS.filter((id) => STRUCTURES[id].category === 'decor');
    expect(decor).toEqual(['lampPost', 'flowerBed', 'bench', 'scarecrow', 'tree', 'fountain']);
    for (const id of decor) expect(STRUCTURES[id].cost).toBeGreaterThan(0);
  });
});

describe('lamp posts', () => {
  it('make nearby shelters safer, up to the cap', () => {
    let s = coopFarm();
    const coop = coopOf(s);
    expect(lightingBonus(s, coop)).toBe(0);
    s = lampNear(s, 0, 1);
    expect(lightingBonus(s, coop)).toBeCloseTo(0.1);
    expect(effectiveSafety(s, coop)).toBeCloseTo(shelterSafety(coop) + 0.1);
    s = lampNear(s, 1, 1);
    s = lampNear(s, -1, 1);
    expect(lightingBonus(s, coop)).toBeCloseTo(LIGHT_SAFETY_CAP);
  });

  it('far away lamps do nothing, and a lamp still being built neither', () => {
    let s = coopFarm();
    s = lampNear(s, 0, 8);
    expect(lightingBonus(s, coopOf(s))).toBe(0);
    let site = coopFarm();
    site = lampNear(site, 0, 1);
    const building = { kind: 'build' as const, done: 0, total: 60 };
    site = { ...site, structures: site.structures.map((x) => (x.type === 'lampPost' ? { ...x, work: building } : x)) };
    expect(lightingBonus(site, coopOf(site))).toBe(0);
  });

  it('lower the predator exposure of the animals asleep inside', () => {
    const s = setTimeOfDay(unwrap(addAnimal(coopFarm(), 'chicken')), 23);
    const hen = s.animals[0];
    if (!hen) throw new Error('no hen');
    const lit = lampNear(s, 0, 1);
    expect(exposure(lit, hen, coopOf(lit))).toBeLessThan(exposure(s, hen, coopOf(s)));
  });
});
