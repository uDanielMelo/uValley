import { describe, expect, it } from 'vitest';
import { ACCESS_ROAD_FARM_Y, ACCESS_ROAD_X, CAR, HIGHWAY, ROAD_COST } from '../../data/roads';
import { GRID_SIZE } from '../../data/world';
import { till } from '../actions';
import { isPasture } from '../animals';
import { tileIndex } from '../grid';
import { buildRoad, checkRoad, removeRoad } from '../roads';
import { DEFAULT_SETTINGS, deserialize, serialize } from '../save';
import { tick } from '../simulation';
import { createInitialState } from '../state';
import { checkPlacement } from '../structures';
import type { ActionResult, GameState } from '../types';
import { carRoutes, carState, driveMinutes, routeLength } from '../visitors';
import { toggleTask } from '../workers';

const unwrap = (result: ActionResult): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

// The access road runs south from beside the shipping bin (18, 16) to the map edge (18, 31).
const LAST_ROW = GRID_SIZE - 1;
const ACCESS_IN_FARM = tileIndex(ACCESS_ROAD_X, ACCESS_ROAD_FARM_Y);
const ACCESS_OFF_FARM = tileIndex(ACCESS_ROAD_X, LAST_ROW);
const FREE = tileIndex(13, 13);

describe('roads', () => {
  it('starts with the access road from the farm to the south edge', () => {
    const s = createInitialState();
    for (let y = ACCESS_ROAD_FARM_Y; y <= LAST_ROW; y++) {
      expect(s.tiles[tileIndex(ACCESS_ROAD_X, y)]?.road).toBe(true);
    }
    expect(s.tiles[ACCESS_OFF_FARM]?.state).toBe('locked');
    expect(s.tiles[tileIndex(ACCESS_ROAD_X, ACCESS_ROAD_FARM_Y - 1)]?.road).toBeUndefined();
    expect(s.tiles[tileIndex(ACCESS_ROAD_X - 1, 24)]?.road).toBeUndefined();
  });

  it('builds a road on owned grass for ROAD_COST', () => {
    const s0 = createInitialState();
    const s = unwrap(buildRoad(s0, FREE));
    expect(s.tiles[FREE]).toEqual({ state: 'grass', road: true });
    expect(s.money).toBe(s0.money - ROAD_COST);
  });

  it('rejects locked land, buildings, existing roads, worked soil, queued tiles and lack of money', () => {
    const s = createInitialState();
    expect(checkRoad(s, tileIndex(0, 0))).toBe('locked');
    expect(checkRoad(s, tileIndex(15, 15))).toBe('structure');
    expect(checkRoad(s, ACCESS_IN_FARM)).toBe('already-road');
    expect(checkRoad(unwrap(till(s, FREE)), FREE)).toBe('not-grass');
    expect(checkRoad(unwrap(toggleTask(s, 'hoe', FREE, 'wheat')), FREE)).toBe('tile-busy');
    expect(checkRoad({ ...s, money: 0 }, FREE)).toBe('not-enough-money');
  });

  it('blocks farming, building and grazing on roads', () => {
    const s = unwrap(buildRoad(createInitialState(), FREE));
    expect(till(s, FREE)).toEqual({ ok: false, error: 'road' });
    expect(toggleTask(s, 'hoe', FREE, 'wheat')).toEqual({ ok: false, error: 'road' });
    expect(checkPlacement(s, 'chickenCoop', 12, 13, 0)).toBe('road');
    expect(isPasture(s.tiles, 13, 13)).toBe(false);
  });

  it('removes roads on owned land but keeps the access road off the farm', () => {
    const s = unwrap(buildRoad(createInitialState(), FREE));
    expect(unwrap(removeRoad(s, FREE)).tiles[FREE]).toEqual({ state: 'grass' });
    expect(removeRoad(s, ACCESS_OFF_FARM)).toEqual({ ok: false, error: 'locked' });
    expect(removeRoad(s, tileIndex(12, 12))).toEqual({ ok: false, error: 'no-road' });
  });

  it('keeps roads when the plot is bought', async () => {
    const { buyPlot } = await import('../economy');
    const { plotOfTile } = await import('../grid');
    const s = { ...createInitialState(), money: 100000 };
    const bought = unwrap(buyPlot(s, plotOfTile(tileIndex(ACCESS_ROAD_X, 22))));
    expect(bought.tiles[tileIndex(ACCESS_ROAD_X, 22)]).toEqual({ state: 'grass', road: true });
  });

  it('lets workers walk faster on roads', () => {
    const base = createInitialState();
    const worker = base.workers[0];
    if (!worker) throw new Error('no worker');
    // Same 3-tile walk, once along the access road and once across grass.
    const along = (x: number) => ({
      ...base,
      gameMinutes: 8 * 60,
      workers: [{ ...worker, x: x + 0.5, y: 16.5, path: [{ x: x + 0.5, y: 19.5 }] }],
    });
    const onRoad = tick(along(ACCESS_ROAD_X), 0.5).workers[0];
    const onGrass = tick(along(12), 0.5).workers[0];
    expect((onRoad?.y ?? 0) - 16.5).toBeGreaterThan((onGrass?.y ?? 0) - 16.5);
  });
});

describe('visiting car', () => {
  const step = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(b.x - a.x, b.y - a.y);

  it('comes along the highway, turns into the access road and parks next to the shipping bin', () => {
    const { arrive, leave } = carRoutes(createInitialState().tiles);
    const start = arrive[0];
    expect(start?.x).toBe(ACCESS_ROAD_X + 0.5 + HIGHWAY.reach);
    expect(start?.y).toBeGreaterThan(GRID_SIZE);
    expect(arrive[arrive.length - 1]).toEqual({ x: ACCESS_ROAD_X + 0.5, y: ACCESS_ROAD_FARM_Y + 0.5 });
    // Highway, then the straight access road: the tile centers in between are simplified away.
    expect(arrive).toHaveLength(3);
    // It leaves the other way along the highway, over a drive of the same length.
    expect(leave[0]).toEqual(arrive[arrive.length - 1]);
    expect(leave[leave.length - 1]?.x).toBe(ACCESS_ROAD_X + 0.5 - HIGHWAY.reach);
    expect(routeLength(leave)).toBeCloseTo(routeLength(arrive), 5);
  });

  it('follows player-built roads and parks at the reachable tile closest to the bin', () => {
    // Cutting the access road inside the farm makes the car stop at the last reachable tile.
    const cut = unwrap(removeRoad(createInitialState(), tileIndex(ACCESS_ROAD_X, 18)));
    const short = carRoutes(cut.tiles).arrive;
    expect(short[short.length - 1]).toEqual({ x: ACCESS_ROAD_X + 0.5, y: 19.5 });
    // A detour west of the cut reaches the spot right below the bin (17, 16).
    let s = cut;
    for (const y of [19, 18, 17]) s = unwrap(buildRoad(s, tileIndex(17, y)));
    const detour = carRoutes(s.tiles).arrive;
    expect(detour[detour.length - 1]).toEqual({ x: 17.5, y: 17.5 });
    expect(detour).toContainEqual({ x: 17.5, y: 19.5 });
  });

  it('arrives, parks, leaves and is away between visits', () => {
    const routes = carRoutes(createInitialState().tiles);
    const drive = driveMinutes(routeLength(routes.arrive));
    const hour = (CAR.visitHours[0] ?? 0) * 60;
    expect(carState(hour - 1, routes).phase).toBe('away');

    const early = carState(hour + 1, routes);
    expect(early.phase).toBe('arriving');
    expect(early.x).toBeCloseTo(ACCESS_ROAD_X + 0.5 + HIGHWAY.reach - CAR.speed, 5);
    expect(Math.sin(early.heading)).toBeCloseTo(-1, 5); // driving west along the highway

    const parked = carState(hour + drive + 1, routes);
    expect(parked.phase).toBe('parked');
    expect(parked.y).toBeCloseTo(ACCESS_ROAD_FARM_Y + 0.5, 5);

    const leaving = carState(hour + drive + CAR.waitMinutes + drive / 2, routes);
    expect(leaving.phase).toBe('leaving');
    expect(leaving.x).toBeLessThan(ACCESS_ROAD_X);
    expect(Math.sin(leaving.heading)).toBeCloseTo(-1, 5); // still westward, away from the farm

    expect(carState(hour + drive * 2 + CAR.waitMinutes + 1, routes).phase).toBe('away');
  });

  it('slows down smoothly before parking', () => {
    const routes = carRoutes(createInitialState().tiles);
    const drive = driveMinutes(routeLength(routes.arrive));
    const hour = (CAR.visitHours[0] ?? 0) * 60;
    const at = (t: number) => carState(hour + t, routes);
    const cruise = step(at(1), at(2));
    const braking = step(at(drive - 0.2), at(drive - 0.1));
    expect(cruise).toBeCloseTo(CAR.speed, 5);
    expect(braking).toBeGreaterThan(0);
    expect(braking).toBeLessThan(cruise / 5);
  });
});

describe('road saves', () => {
  it('round-trips roads', () => {
    const s = unwrap(buildRoad(createInitialState(), FREE));
    const loaded = deserialize(serialize(s, DEFAULT_SETTINGS));
    expect(loaded?.game.tiles[FREE]).toEqual({ state: 'grass', road: true });
    expect(loaded?.game.tiles[ACCESS_OFF_FARM]?.road).toBe(true);
  });

  it('migrates a v4 save by adding the access road on free land only', () => {
    const s = createInitialState();
    const tiles = s.tiles.map(({ road: _road, ...rest }) => rest);
    // The player had tilled one tile of what is now the access road.
    tiles[ACCESS_IN_FARM] = { state: 'tilled' };
    const raw = JSON.stringify({ saveVersion: 4, savedAt: 0, game: { ...s, tiles }, settings: DEFAULT_SETTINGS });
    const loaded = deserialize(raw);
    expect(loaded?.game.tiles[ACCESS_IN_FARM]).toEqual({ state: 'tilled' });
    expect(loaded?.game.tiles[tileIndex(ACCESS_ROAD_X, 17)]?.road).toBe(true);
    expect(loaded?.game.tiles[ACCESS_OFF_FARM]?.road).toBe(true);
  });
});
