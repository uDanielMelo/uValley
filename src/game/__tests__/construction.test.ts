import { describe, expect, it } from 'vitest';
import { ROAD_COST, ROAD_WORK_MINUTES } from '../../data/roads';
import { BUILD_CREW_MAX } from '../../data/structures';
import { BUNKHOUSE_BEDS, WORK_END_HOUR } from '../../data/workers';
import { MINUTES_PER_DAY } from '../../data/world';
import {
  cancelAllOrders,
  crewTiles,
  demolishClick,
  orderDemolish,
  orderRoad,
  orderStructure,
  repairSiteTasks,
  roadClick,
  workSpot,
} from '../construction';
import { hireFree, setTimeOfDay } from '../dev';
import { tileCoords, tileIndex, withTile } from '../grid';
import { homeSpot } from '../home';
import { isWalkable } from '../path';
import { DEFAULT_SETTINGS, deserialize, serialize } from '../save';
import { advanceGame, type FinishedWork } from '../simulation';
import { freeBeds, workSpeed } from '../staff';
import { createInitialState } from '../state';
import {
  bedCount,
  buildCost,
  buildMinutesFor,
  demolishMinutesFor,
  footprintCells,
  footprintOf,
  hasRoadAccess,
  placeStructure,
  refundFor,
  ringCells,
} from '../structures';
import type { GameState, StructureInstance, Worker } from '../types';
import { unstaffedKinds } from '../workers';

const unwrap = <T extends { ok: true; state: GameState } | { ok: false; error: string }>(result: T): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

// Free owned grass in the fields north of the yard: no road reaches it.
const FREE_X = 28;
const FREE_Y = 44;
const FREE = tileIndex(FREE_X, FREE_Y);
// Free grass beside the access road: a ring there runs along it.
const NEAR_X = 33;
const NEAR_Y = 60;
const NEAR = tileIndex(NEAR_X, NEAR_Y);

/** Opens road on tiles at once. */
const withRoadAt = (s: GameState, tiles: readonly number[]): GameState => ({
  ...s,
  tiles: tiles.reduce((acc, i) => withTile(acc, i, { state: 'grass', road: true }), s.tiles),
});

/** A fresh farm at 7:00 with plenty of money. */
const farm = (): GameState => ({ ...setTimeOfDay(createInitialState(), 7), money: 5000 });

const site = (s: GameState): StructureInstance => {
  const found = s.structures[s.structures.length - 1];
  if (!found) throw new Error('no structure');
  return found;
};

/** Runs the simulation in small steps, collecting finished works. */
const run = (state: GameState, minutes: number): { state: GameState; finished: FinishedWork[] } => {
  let s = state;
  const finished: FinishedWork[] = [];
  for (let t = 0; t < minutes; t += 2) {
    const result = advanceGame(s, 2);
    s = result.state;
    finished.push(...result.worksFinished);
  }
  return { state: s, finished };
};

/** Keeps only the given workers. */
const crewOf = (s: GameState, count: number): GameState => ({ ...s, workers: s.workers.slice(0, count) });

describe('construction orders', () => {
  it('opens a site: pays, reserves the footprint and queues one task per crew tile', () => {
    const s0 = farm();
    const s = unwrap(orderStructure(s0, 'silo', FREE_X, FREE_Y));
    const silo = site(s);
    // A 2×2 silo has a ring of 12 road tiles, paid with the order.
    expect(s.money).toBe(s0.money - buildCost('silo') - 12 * ROAD_COST);
    expect(silo.work).toEqual({ kind: 'build', done: 0, total: buildMinutesFor('silo') });
    expect(s.tiles[FREE]?.structure).toBe('silo');
    const tasks = s.tasks.filter((t) => t.job?.type === 'structure' && t.job.structureId === silo.id);
    expect(tasks).toHaveLength(BUILD_CREW_MAX);
    expect(new Set(tasks.map((t) => t.tile)).size).toBe(tasks.length);
    expect(tasks.every((t) => t.kind === 'build')).toBe(true);
  });

  it('spreads the crew around the edge, on footprint tiles', () => {
    const s = unwrap(orderStructure(farm(), 'barn', FREE_X, FREE_Y));
    const barn = site(s);
    const cells = new Set(footprintCells(footprintOf(barn.type, barn.x, barn.y, barn.rotation)).map((c) => tileIndex(c.x, c.y)));
    const tiles = crewTiles(barn);
    expect(tiles).toHaveLength(BUILD_CREW_MAX);
    expect(tiles.every((t) => cells.has(t))).toBe(true);
    // The center of a 3×3 barn has no wall to work from.
    expect(tiles).not.toContain(tileIndex(FREE_X + 1, FREE_Y + 1));
  });

  it('puts builders just outside the wall, on walkable ground', () => {
    const s = unwrap(orderStructure(farm(), 'chickenCoop', FREE_X, FREE_Y));
    const coop = site(s);
    for (const tile of crewTiles(coop)) {
      const spot = workSpot(s, coop, tile, { x: 32, y: 50 });
      expect(spot).not.toBeNull();
      if (!spot) continue;
      const x = Math.floor(spot.x);
      const y = Math.floor(spot.y);
      expect(isWalkable(s.tiles, x, y)).toBe(true);
      const { x: tx, y: ty } = tileCoords(tile);
      expect(Math.abs(x - tx) + Math.abs(y - ty)).toBe(1);
    }
  });

  it('a bunkhouse under construction gives no beds and no door to rest at', () => {
    const s0 = farm();
    const s = unwrap(orderStructure(s0, 'bunkhouse', FREE_X, FREE_Y));
    expect(bedCount(s)).toBe(bedCount(s0));
    expect(freeBeds(s)).toBe(freeBeds(s0));
    expect(homeSpot(s, 0)).toEqual(homeSpot(s0, 0));
  });

  it('cancelling a site refunds everything and frees the land', () => {
    const s0 = farm();
    const s = unwrap(orderStructure(s0, 'chickenCoop', FREE_X, FREE_Y));
    const result = demolishClick(s, FREE);
    const refund = buildCost('chickenCoop') + 10 * ROAD_COST;
    expect(result.ok && result.change).toEqual({ kind: 'build-cancelled', type: 'chickenCoop', refund });
    const after = unwrap(result);
    expect(after.money).toBe(s0.money);
    expect(after.tasks).toEqual([]);
    expect(after.structures).toHaveLength(s0.structures.length);
    expect(after.tiles[FREE]?.structure).toBeUndefined();
  });
});

describe('road rings', () => {
  it('queues the ring as road tasks tied to the site, sharing roads already there', () => {
    const s0 = farm();
    const s = unwrap(orderStructure(s0, 'chickenCoop', NEAR_X, NEAR_Y));
    const coop = site(s);
    const ring = ringCells('chickenCoop', NEAR_X, NEAR_Y, 0).map((c) => tileIndex(c.x, c.y));
    const roads = s.tasks.filter((t) => t.job?.type === 'road');
    // Part of the ring is the yard's street and the access road already: those need no new road.
    const shared = ring.filter((i) => s0.tiles[i]?.road).length;
    expect(shared).toBeGreaterThan(0);
    expect(roads).toHaveLength(ring.length - shared);
    expect(roads.every((t) => t.job?.type === 'road' && !t.job.remove && t.job.siteId === coop.id)).toBe(true);
    expect(s.money).toBe(s0.money - buildCost('chickenCoop') - roads.length * ROAD_COST);
  });

  it('needs free grass (or road) all around, inside the map', () => {
    const s0 = farm();
    const tilled = withTile(s0.tiles, tileIndex(FREE_X - 1, FREE_Y), { state: 'tilled' });
    expect(orderStructure({ ...s0, tiles: tilled }, 'chickenCoop', FREE_X, FREE_Y)).toEqual({
      ok: false,
      error: 'no-room-for-road',
    });
    // Neighbours stand one shared road apart: right beside the ring is fine, on it is not.
    const coop = unwrap(orderStructure(s0, 'chickenCoop', FREE_X, FREE_Y));
    expect(orderStructure(coop, 'chickenCoop', FREE_X + 2, FREE_Y)).toEqual({ ok: false, error: 'tile-busy' });
    expect(unwrap(orderStructure(coop, 'chickenCoop', FREE_X + 3, FREE_Y)).structures).toHaveLength(
      coop.structures.length + 1,
    );
    // The bottom row has no room for the ring below it.
    expect(orderStructure(s0, 'chickenCoop', NEAR_X + 4, 63)).toEqual({ ok: false, error: 'no-room-for-road' });
  });

  it('a building no road reaches stands idle until one does', () => {
    const s = farm();
    const far = run(unwrap(orderStructure(s, 'bunkhouse', FREE_X, FREE_Y)), 600);
    const bunk = far.state.structures.find((x) => x.type === 'bunkhouse' && x.x === FREE_X);
    if (!bunk) throw new Error('no bunkhouse');
    expect(bunk.work).toBeUndefined();
    expect(far.finished).toContainEqual({ type: 'bunkhouse', kind: 'build', cutOff: true });
    expect(hasRoadAccess(far.state.tiles, bunk)).toBe(false);
    expect(bedCount(far.state)).toBe(bedCount(s));
    // A road from the ring's corner down to the house ring links it.
    const link = Array.from({ length: 55 - (FREE_Y + 2) }, (_, i) => tileIndex(FREE_X + 1, FREE_Y + 2 + i));
    const linked = withRoadAt(far.state, link);
    expect(hasRoadAccess(linked.tiles, bunk)).toBe(true);
    expect(bedCount(linked)).toBe(bedCount(s) + BUNKHOUSE_BEDS);
  });

  it('cancelling refunds the queued ring once, also with "cancel everything"', () => {
    const s0 = farm();
    let s = unwrap(orderStructure(s0, 'barn', FREE_X, FREE_Y));
    s = unwrap(orderRoad(s, tileIndex(FREE_X + 8, FREE_Y)));
    const cleared = cancelAllOrders(s);
    expect(cleared.money).toBe(s0.money);
    expect(cleared.tasks).toEqual([]);
  });
});

describe('crew work', () => {
  it('the crew raises the building with its ring and the game reports it', () => {
    const s = unwrap(orderStructure(farm(), 'chickenCoop', NEAR_X, NEAR_Y));
    const { state, finished } = run(s, 400);
    const coop = state.structures.find((x) => x.type === 'chickenCoop');
    expect(coop?.work).toBeUndefined();
    expect(state.tasks).toEqual([]);
    expect(finished).toEqual([{ type: 'chickenCoop', kind: 'build' }]);
    expect(ringCells('chickenCoop', NEAR_X, NEAR_Y, 0).every((c) => state.tiles[tileIndex(c.x, c.y)]?.road)).toBe(true);
    expect(state.workers.every((w) => w.taskId === null)).toBe(true);
  });

  it('keeps the progress on the site when the shift ends', () => {
    const start = setTimeOfDay(unwrap(orderStructure(farm(), 'barn', FREE_X, FREE_Y)), WORK_END_HOUR - 1);
    const evening = run(start, 120).state;
    const done = site(evening).work?.done ?? 0;
    expect(done).toBeGreaterThan(0);
    expect(evening.workers.every((w) => w.taskId === null)).toBe(true);
    // Overnight nothing changes; in the morning the work goes on from where it stopped.
    const night = run(evening, 60).state;
    expect(site(night).work?.done).toBe(done);
    const morning = run(setTimeOfDay(night, 7), 60).state;
    expect(site(morning).work?.done ?? 0).toBeGreaterThan(done);
  });

  it('more builders finish sooner', () => {
    const s = unwrap(orderStructure(farm(), 'barn', FREE_X, FREE_Y));
    const solo = site(run(crewOf(s, 1), 120).state).work?.done ?? 0;
    const crew = site(run(crewOf(s, 3), 120).state).work?.done ?? 0;
    expect(crew).toBeGreaterThan(solo * 2);
  });

  it('the Construction skill makes building faster', () => {
    const base = { name: 'X', age: 30, stars: 2, specialty: null, hourlyWage: 2 } as const;
    const builder = workSpeed({ ...base, skills: ['construction'] }, { kind: 'build', cropId: null });
    const farmer = workSpeed({ ...base, skills: ['farming'] }, { kind: 'build', cropId: null });
    expect(builder).toBeGreaterThan(farmer);
  });

  it('only workers with the build activity take construction tasks', () => {
    const s0 = farm();
    const noBuilders: GameState = {
      ...s0,
      workers: s0.workers.map((w): Worker => ({ ...w, priorities: w.priorities.filter((k) => k !== 'build') })),
    };
    const s = unwrap(orderStructure(noBuilders, 'chickenCoop', FREE_X, FREE_Y));
    expect(unstaffedKinds(s)).toEqual(['build']);
    expect(site(run(s, 60).state).work?.done).toBe(0);
  });
});

describe('demolition', () => {
  it('is queued, done by the crew and refunds part of the cost at the end', () => {
    const built = unwrap(orderStructure(farm(), 'chickenCoop', NEAR_X, NEAR_Y));
    const ready = run(built, 400).state;
    const queued = unwrap(orderDemolish(ready, NEAR));
    expect(site(queued).work).toEqual({ kind: 'demolish', done: 0, total: demolishMinutesFor('chickenCoop') });
    expect(queued.money).toBe(ready.money);
    const { state, finished } = run(queued, 300);
    expect(finished).toEqual([{ type: 'chickenCoop', kind: 'demolish', refund: refundFor('chickenCoop') }]);
    expect(state.structures.some((x) => x.type === 'chickenCoop')).toBe(false);
    expect(state.tiles[NEAR]?.structure).toBeUndefined();
    expect(state.money).toBeGreaterThan(ready.money);
    expect(state.money).toBeLessThanOrEqual(ready.money + refundFor('chickenCoop'));
  });

  it('can be called off, and a demolished bunkhouse stops giving beds right away', () => {
    const s = farm();
    const extra = run(unwrap(orderStructure(s, 'bunkhouse', NEAR_X, NEAR_Y)), 600).state;
    expect(bedCount(extra)).toBe(bedCount(s) + BUNKHOUSE_BEDS);
    const queued = unwrap(demolishClick(extra, NEAR));
    expect(bedCount(queued)).toBe(bedCount(s));
    const called = demolishClick(queued, NEAR);
    expect(called.ok && called.change.kind).toBe('demolish-cancelled');
    expect(bedCount(unwrap(called))).toBe(bedCount(extra));
  });

  it('refuses a bunkhouse whose beds are in use and buildings that cannot be demolished', () => {
    // Staff fills the lodge (6 beds) and a bunkhouse west of it, so the bunkhouse's beds are needed.
    let s = unwrap(placeStructure(farm(), 'bunkhouse', 24, 57));
    while (s.workers.filter((w) => w.kind === 'staff').length < bedCount(s)) s = hireFree(s);
    expect(orderDemolish(s, tileIndex(24, 57))).toEqual({ ok: false, error: 'beds-in-use' });
    expect(orderDemolish(s, tileIndex(30, 56))).toEqual({ ok: false, error: 'not-demolishable' });
  });
});

describe('road work', () => {
  it('the crew opens queued roads', () => {
    const s0 = farm();
    let s = unwrap(orderRoad(s0, FREE));
    s = unwrap(orderRoad(s, tileIndex(29, 44)));
    expect(s.money).toBe(s0.money - 2 * ROAD_COST);
    const done = run(s, ROAD_WORK_MINUTES.build * 3).state;
    expect(done.tiles[FREE]?.road).toBe(true);
    expect(done.tiles[tileIndex(29, 44)]?.road).toBe(true);
    expect(done.tasks).toEqual([]);
  });

  it('clicking a queued road again cancels it with a refund', () => {
    const s0 = farm();
    const s = unwrap(roadClick(s0, FREE));
    const again = roadClick(s, FREE);
    expect(again.ok && again.change).toBe('cancelled');
    expect(unwrap(again).money).toBe(s0.money);
    expect(unwrap(again).tasks).toEqual([]);
  });

  it('removing a road is crew work too', () => {
    const access = tileIndex(32, 60);
    const result = demolishClick(farm(), access);
    expect(result.ok && result.change.kind).toBe('road-removal-queued');
    const done = run(unwrap(result), ROAD_WORK_MINUTES.remove * 6).state;
    expect(done.tiles[access]?.road).toBeUndefined();
    // A road on land for sale (off the farm) stays.
    const s = farm();
    const forSale = { ...s, tiles: withTile(s.tiles, access, { state: 'locked', road: true }) };
    expect(demolishClick(forSale, access)).toEqual({ ok: false, error: 'locked' });
  });
});

describe('whole queue and saves', () => {
  it('"cancel everything" calls off sites and refunds queued roads', () => {
    const s0 = farm();
    let s = unwrap(orderStructure(s0, 'chickenCoop', FREE_X, FREE_Y));
    s = unwrap(orderRoad(s, tileIndex(30, 46)));
    const cleared = cancelAllOrders(s);
    expect(cleared.money).toBe(s0.money);
    expect(cleared.tasks).toEqual([]);
    expect(cleared.structures).toHaveLength(s0.structures.length);
  });

  it('saves and loads a site with its progress and crew tasks', () => {
    const s = run(unwrap(orderStructure(farm(), 'barn', FREE_X, FREE_Y)), 60).state;
    const loaded = deserialize(serialize(s, DEFAULT_SETTINGS));
    expect(loaded?.game.structures).toEqual(s.structures);
    expect(loaded?.game.tasks).toEqual(s.tasks);
  });

  it('requeues the crew of a site that lost its tasks and drops tasks without a site', () => {
    const s = unwrap(orderStructure(farm(), 'chickenCoop', FREE_X, FREE_Y));
    const broken: GameState = {
      ...s,
      tasks: [{ id: 999, kind: 'build', tile: 0, cropId: null, workerId: null, job: { type: 'structure', structureId: 777 } }],
    };
    const repaired = repairSiteTasks(broken);
    expect(repaired.tasks.some((t) => t.id === 999)).toBe(false);
    expect(repaired.tasks).toHaveLength(crewTiles(site(s)).length);
  });

  it('a day of play keeps ids unique', () => {
    let s = unwrap(orderStructure(farm(), 'silo', FREE_X, FREE_Y));
    s = unwrap(orderRoad(s, tileIndex(36, 46)));
    s = run(s, MINUTES_PER_DAY / 4).state;
    const ids = [...s.tasks.map((t) => t.id), ...s.structures.map((x) => x.id), ...s.workers.map((w) => w.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });
});
