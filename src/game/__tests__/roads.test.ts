import { describe, expect, it } from 'vitest';
import { ACCESS_ROAD_FARM_Y, ACCESS_ROAD_X, CAR, HIGHWAY, ROAD_COST } from '../../data/roads';
import { DOCK } from '../../data/docks';
import { GRID_SIZE } from '../../data/world';
import { till } from '../actions';
import { isPasture } from '../animals';
import { tileIndex, tileLine, withTile } from '../grid';
import { checkRoadOrder, orderRoad } from '../construction';
import { findPath } from '../path';
import { accessEntryTile, layRoad, removeRoad, roadNetwork } from '../roads';
import { DEFAULT_SETTINGS, deserialize, serialize } from '../save';
import { tick } from '../simulation';
import { createInitialState } from '../state';
import { checkPlacement } from '../structures';
import type { ActionResult, GameState, GridPoint, Tile } from '../types';
import { carRoutes, driveMinutes, roundCorners, routeLength, shipmentCar } from '../visitors';
import { toggleTask } from '../workers';

const unwrap = (result: ActionResult): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

// The access road runs south from the yard's street (row 58) to the map edge, all on the farm.
const LAST_ROW = GRID_SIZE - 1;
const ACCESS_IN_FARM = tileIndex(ACCESS_ROAD_X, ACCESS_ROAD_FARM_Y);
const ACCESS_AT_EDGE = tileIndex(ACCESS_ROAD_X, LAST_ROW);
const FREE = tileIndex(29, 45);
/** Where the car parks: the street right in front of the shipping bin (33, 57). */
const PARKING = { x: 33.5, y: 58.5 };

/** Opens road on tiles at once. */
const withRoads = (tiles: readonly Tile[], indices: readonly number[]): Tile[] =>
  indices.reduce<Tile[]>((acc, i) => withTile(acc, i, { state: 'grass', road: true }), tiles.slice());

const onRoad = (s: GameState, p: GridPoint): boolean => !!s.tiles[tileIndex(Math.floor(p.x), Math.floor(p.y))]?.road;

describe('roads', () => {
  it('starts with the access road from the yard to the south edge, all on the farm', () => {
    const s = createInitialState();
    for (let y = ACCESS_ROAD_FARM_Y; y <= LAST_ROW; y++) {
      expect(s.tiles[tileIndex(ACCESS_ROAD_X, y)]?.road).toBe(true);
    }
    expect(s.tiles[ACCESS_AT_EDGE]?.state).toBe('grass');
    expect(accessEntryTile()).toBe(ACCESS_AT_EDGE);
    // It meets the yard's street, which runs in front of the lodge and the dock.
    for (let x = 27; x <= 34; x++) expect(s.tiles[tileIndex(x, ACCESS_ROAD_FARM_Y - 1)]?.road).toBe(true);
    expect(s.tiles[tileIndex(ACCESS_ROAD_X - 1, 60)]?.road).toBeUndefined();
  });

  it('knows which roads link to the access road', () => {
    const s = createInitialState();
    const network = roadNetwork(s.tiles);
    expect(network.has(ACCESS_AT_EDGE)).toBe(true);
    expect(network.has(tileIndex(27, 58))).toBe(true);
    // A loose road far away is not part of it until a road joins them.
    const loose = unwrap(layRoad(s, FREE));
    expect(roadNetwork(loose.tiles).has(FREE)).toBe(false);
    const joined = withRoads(loose.tiles, tileLine(tileIndex(29, 46), tileIndex(29, 54)));
    expect(roadNetwork(joined).has(FREE)).toBe(true);
  });

  it('charges ROAD_COST when the road is ordered; the crew opens it later', () => {
    const s0 = createInitialState();
    const s = unwrap(orderRoad(s0, FREE));
    expect(s.money).toBe(s0.money - ROAD_COST);
    expect(s.tiles[FREE]).toEqual({ state: 'grass' });
    expect(s.tasks).toHaveLength(1);
    expect(unwrap(layRoad(s, FREE)).tiles[FREE]).toEqual({ state: 'grass', road: true });
  });

  it('rejects locked land, buildings, existing roads, worked soil, soil queued to be tilled and lack of money', () => {
    const s = createInitialState();
    expect(checkRoadOrder(s, tileIndex(0, 0))).toBe('locked');
    expect(checkRoadOrder(s, tileIndex(30, 56))).toBe('structure');
    expect(checkRoadOrder(s, ACCESS_IN_FARM)).toBe('already-road');
    expect(checkRoadOrder(unwrap(till(s, FREE)), FREE)).toBe('not-grass');
    expect(checkRoadOrder(unwrap(toggleTask(s, 'hoe', FREE, 'wheat')), FREE)).toBe('not-grass');
    expect(checkRoadOrder(unwrap(orderRoad(s, FREE)), FREE)).toBe('already-road');
    expect(checkRoadOrder({ ...s, money: 0 }, FREE)).toBe('not-enough-money');
  });

  it('blocks farming, building and grazing on roads', () => {
    const s = unwrap(layRoad(createInitialState(), FREE));
    expect(till(s, FREE)).toEqual({ ok: false, error: 'road' });
    expect(toggleTask(s, 'hoe', FREE, 'wheat')).toEqual({ ok: false, error: 'road' });
    expect(checkPlacement(s, 'chickenCoop', 28, 45, 0)).toBe('road');
    expect(isPasture(s.tiles, 29, 45)).toBe(false);
  });

  it('removes roads on owned land but keeps roads on land for sale', () => {
    const s = unwrap(layRoad(createInitialState(), FREE));
    expect(unwrap(removeRoad(s, FREE)).tiles[FREE]).toEqual({ state: 'grass' });
    expect(removeRoad(s, tileIndex(28, 44))).toEqual({ ok: false, error: 'no-road' });
    const forSale = { ...s, tiles: withTile(s.tiles, ACCESS_AT_EDGE, { state: 'locked', road: true }) };
    expect(removeRoad(forSale, ACCESS_AT_EDGE)).toEqual({ ok: false, error: 'locked' });
  });

  it('keeps roads when the plot is bought', async () => {
    const { buyPlot } = await import('../economy');
    const { plotOfTile } = await import('../grid');
    // A road on the land for sale just east of the farm.
    const tile = tileIndex(48, 40);
    const s0 = { ...createInitialState(), money: 100000 };
    const s = { ...s0, tiles: withTile(s0.tiles, tile, { state: 'locked', road: true }) };
    const bought = unwrap(buyPlot(s, plotOfTile(tile)));
    expect(bought.tiles[tile]).toEqual({ state: 'grass', road: true });
  });

  it('draws a dragged road as side-by-side tiles, with no gaps', () => {
    const line = tileLine(tileIndex(10, 10), tileIndex(13, 12));
    expect(line).toHaveLength(6);
    expect(line[0]).toBe(tileIndex(10, 10));
    expect(line[line.length - 1]).toBe(tileIndex(13, 12));
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1] ?? 0;
      const b = line[i] ?? 0;
      const step = Math.abs((a % GRID_SIZE) - (b % GRID_SIZE)) + Math.abs(Math.floor(a / GRID_SIZE) - Math.floor(b / GRID_SIZE));
      expect(step).toBe(1);
    }
    expect(tileLine(tileIndex(5, 5), tileIndex(5, 5))).toEqual([tileIndex(5, 5)]);
  });
});

describe('walking on roads', () => {
  it('is faster', () => {
    const base = createInitialState();
    const worker = base.workers[0];
    if (!worker) throw new Error('no worker');
    // Same 3-tile walk, once along the access road and once across grass.
    const along = (x: number) => ({
      ...base,
      gameMinutes: 8 * 60,
      workers: [{ ...worker, x: x + 0.5, y: 59.5, path: [{ x: x + 0.5, y: 62.5 }] }],
    });
    const onRoadWorker = tick(along(ACCESS_ROAD_X), 0.5).workers[0];
    const onGrass = tick(along(36), 0.5).workers[0];
    expect((onRoadWorker?.y ?? 0) - 59.5).toBeGreaterThan((onGrass?.y ?? 0) - 59.5);
  });

  it('people take a road when it is quicker, and keep to its bends', () => {
    const s0 = createInitialState();
    // An L-shaped road: east along row 40, then south along column 40.
    const road = [...tileLine(tileIndex(20, 40), tileIndex(40, 40)), ...tileLine(tileIndex(40, 41), tileIndex(40, 50))];
    const s = { ...s0, tiles: withRoads(s0.tiles, road) };
    const from = { x: 20.5, y: 40.5 };
    const path = findPath(s.tiles, from, { x: 40.5, y: 50.5 });
    expect(path.length).toBeGreaterThan(1);
    // Every leg stays on the road (it may cut the bend's inner corner, never the field).
    [from, ...path].forEach((a, i, all) => {
      const b = all[i + 1];
      if (!b) return;
      for (let t = 0; t <= 1; t += 0.05) expect(onRoad(s, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })).toBe(true);
    });
    // Without the road the walk cuts straight across.
    expect(findPath(s0.tiles, { x: 20.5, y: 40.5 }, { x: 40.5, y: 50.5 })).toEqual([{ x: 40.5, y: 50.5 }]);
  });

  it('a long walk beside a road steps onto it', () => {
    const s0 = createInitialState();
    const s = { ...s0, tiles: withRoads(s0.tiles, tileLine(tileIndex(18, 40), tileIndex(46, 40))) };
    const path = findPath(s.tiles, { x: 18.5, y: 41.5 }, { x: 46.5, y: 41.5 });
    expect(path.some((p) => onRoad(s, p))).toBe(true);
    // Short hops go straight.
    expect(findPath(s.tiles, { x: 18.5, y: 41.5 }, { x: 20.5, y: 41.5 })).toEqual([{ x: 20.5, y: 41.5 }]);
  });
});

describe('visiting car', () => {
  const step = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(b.x - a.x, b.y - a.y);

  it('comes along the highway, turns into the access road and parks at the dock bay', () => {
    const s = createInitialState();
    const { arrive, leave } = carRoutes(s.tiles, PARKING);
    const start = arrive[0];
    expect(start?.x).toBe(ACCESS_ROAD_X + 0.5 + HIGHWAY.reach);
    expect(start?.y).toBeGreaterThan(GRID_SIZE);
    expect(arrive[arrive.length - 1]).toEqual(PARKING);
    // On the farm it only drives on road tiles, bends included.
    for (const p of arrive.filter((q) => q.y < GRID_SIZE)) expect(onRoad(s, p)).toBe(true);
    // It leaves the other way along the highway, over a drive of the same length.
    expect(leave[0]).toEqual(arrive[arrive.length - 1]);
    expect(leave[leave.length - 1]?.x).toBe(ACCESS_ROAD_X + 0.5 - HIGHWAY.reach);
    expect(routeLength(leave)).toBeCloseTo(routeLength(arrive), 5);
  });

  it('takes corners in arcs', () => {
    const corner = roundCorners(
      [
        { x: 0, y: 10 },
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      () => 2,
    );
    // The arc starts and ends 2 tiles from the corner, and every point on it is 2 from its center.
    expect(corner[1]?.x).toBeCloseTo(0, 5);
    expect(corner[1]?.y).toBeCloseTo(2, 5);
    expect(corner[corner.length - 2]?.x).toBeCloseTo(2, 5);
    expect(corner[corner.length - 2]?.y).toBeCloseTo(0, 5);
    for (const p of corner.slice(1, -1)) expect(Math.hypot(p.x - 2, p.y - 2)).toBeCloseTo(2, 5);
    // Short legs shrink the arc so it never takes more than half of one.
    const tight = roundCorners(
      [
        { x: 0, y: 1 },
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      () => 2,
    );
    expect(tight[1]?.y).toBeCloseTo(0.5, 5);
  });

  it('follows player-built roads and parks at the reachable tile closest to the bay', () => {
    // Cutting the access road makes the car stop at the last reachable tile.
    const cut = unwrap(removeRoad(createInitialState(), tileIndex(ACCESS_ROAD_X, 60)));
    const short = carRoutes(cut.tiles, PARKING).arrive;
    expect(short[short.length - 1]).toEqual({ x: ACCESS_ROAD_X + 0.5, y: 61.5 });
    // A detour east of the cut reaches the street in front of the dock.
    const s = { ...cut, tiles: withRoads(cut.tiles, [61, 60, 59].map((y) => tileIndex(33, y))) };
    const detour = carRoutes(s.tiles, PARKING).arrive;
    expect(detour[detour.length - 1]).toEqual(PARKING);
    for (const p of detour.filter((q) => q.y < GRID_SIZE)) expect(onRoad(s, p)).toBe(true);
  });

  /** A visit setting off at `hour`, parked for DOCK.waitMinutes, then leaving (as game/shipments saves it). */
  const visit = (hour: number, drive: number) => {
    const setOffAt = hour;
    const arrivesAt = hour + drive;
    const leftAt = arrivesAt + DOCK.waitMinutes;
    return {
      coming: { phase: 'enroute' as const, setOffAt, arrivesAt },
      parked: { phase: 'waiting' as const, setOffAt, arrivesAt },
      leaving: { phase: 'leaving' as const, setOffAt, arrivesAt, leftAt, goneAt: leftAt + drive },
    };
  };

  it('arrives, parks, leaves and disappears, following its saved visit', () => {
    const routes = carRoutes(createInitialState().tiles, PARKING);
    const drive = driveMinutes(routeLength(routes.arrive));
    const hour = 8 * 60;
    const v = visit(hour, drive);
    expect(shipmentCar(v.coming, hour - 1, routes)).toBeNull();

    const early = shipmentCar(v.coming, hour + 1, routes);
    expect(early?.phase).toBe('arriving');
    expect(early?.x).toBeCloseTo(ACCESS_ROAD_X + 0.5 + HIGHWAY.reach - CAR.speed, 5);
    expect(Math.sin(early?.heading ?? 0)).toBeCloseTo(-1, 5); // driving west along the highway

    const parked = shipmentCar(v.parked, hour + drive + 1, routes);
    expect(parked?.phase).toBe('parked');
    expect(parked?.x).toBeCloseTo(PARKING.x, 5);
    expect(parked?.y).toBeCloseTo(PARKING.y, 5);

    const leaving = shipmentCar(v.leaving, hour + drive + DOCK.waitMinutes + drive / 2, routes);
    expect(leaving?.phase).toBe('leaving');
    expect(leaving?.x).toBeLessThan(ACCESS_ROAD_X);
    expect(Math.sin(leaving?.heading ?? 0)).toBeCloseTo(-1, 5); // still westward, away from the farm

    expect(shipmentCar(v.leaving, hour + drive * 2 + DOCK.waitMinutes + 1, routes)).toBeNull();
  });

  it('slows down smoothly before parking', () => {
    const routes = carRoutes(createInitialState().tiles, PARKING);
    const drive = driveMinutes(routeLength(routes.arrive));
    const hour = 8 * 60;
    const v = visit(hour, drive);
    const at = (t: number) => shipmentCar(v.coming, hour + t, routes) ?? { x: NaN, y: NaN };
    const cruise = step(at(1), at(2));
    const braking = step(at(drive - 0.2), at(drive - 0.1));
    expect(cruise).toBeCloseTo(CAR.speed, 5);
    expect(braking).toBeGreaterThan(0);
    expect(braking).toBeLessThan(cruise / 5);
  });
});

describe('road saves', () => {
  it('round-trips roads', () => {
    const s = unwrap(layRoad(createInitialState(), FREE));
    const loaded = deserialize(serialize(s, DEFAULT_SETTINGS));
    expect(loaded?.game.tiles[FREE]).toEqual({ state: 'grass', road: true });
    expect(loaded?.game.tiles[ACCESS_AT_EDGE]?.road).toBe(true);
  });
});
