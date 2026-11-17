import { describe, expect, it } from 'vitest';
import { ACCESS_ROAD_FARM_Y, ACCESS_ROAD_X, CAR, OFFMAP_ROAD_LENGTH, ROAD_COST } from '../../data/roads';
import { till } from '../actions';
import { isPasture } from '../animals';
import { tileIndex } from '../grid';
import { buildRoad, checkRoad, removeRoad } from '../roads';
import { DEFAULT_SETTINGS, deserialize, serialize } from '../save';
import { tick } from '../simulation';
import { createInitialState } from '../state';
import { checkPlacement } from '../structures';
import type { ActionResult, GameState } from '../types';
import { carRoute, carState, driveMinutes, routeLength } from '../visitors';
import { toggleTask } from '../workers';

const unwrap = (result: ActionResult): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

// The access road runs north from beside the shipping bin (18, 16) to the map edge (18, 0).
const ACCESS_IN_FARM = tileIndex(ACCESS_ROAD_X, ACCESS_ROAD_FARM_Y);
const ACCESS_OFF_FARM = tileIndex(ACCESS_ROAD_X, 0);
const FREE = tileIndex(13, 13);

describe('roads', () => {
  it('starts with the access road from the farm to the north edge', () => {
    const s = createInitialState();
    for (let y = 0; y <= ACCESS_ROAD_FARM_Y; y++) {
      expect(s.tiles[tileIndex(ACCESS_ROAD_X, y)]?.road).toBe(true);
    }
    expect(s.tiles[ACCESS_OFF_FARM]?.state).toBe('locked');
    expect(s.tiles[tileIndex(ACCESS_ROAD_X, ACCESS_ROAD_FARM_Y + 1)]?.road).toBeUndefined();
    expect(s.tiles[tileIndex(ACCESS_ROAD_X - 1, 8)]?.road).toBeUndefined();
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
    const bought = unwrap(buyPlot(s, plotOfTile(tileIndex(ACCESS_ROAD_X, 9))));
    expect(bought.tiles[tileIndex(ACCESS_ROAD_X, 9)]).toEqual({ state: 'grass', road: true });
  });

  it('lets workers walk faster on roads', () => {
    const base = createInitialState();
    const worker = base.workers[0];
    if (!worker) throw new Error('no worker');
    // Same 3-tile walk, once along the access road and once across grass.
    const along = (x: number) => ({
      ...base,
      gameMinutes: 8 * 60,
      workers: [{ ...worker, x: x + 0.5, y: 12.5, path: [{ x: x + 0.5, y: 15.5 }] }],
    });
    const onRoad = tick(along(ACCESS_ROAD_X), 0.5).workers[0];
    const onGrass = tick(along(13), 0.5).workers[0];
    expect((onRoad?.y ?? 0) - 12.5).toBeGreaterThan((onGrass?.y ?? 0) - 12.5);
  });
});

describe('visiting car', () => {
  it('drives from beyond the map along the access road to the spot next to the shipping bin', () => {
    const route = carRoute(createInitialState().tiles);
    expect(route[0]).toEqual({ x: ACCESS_ROAD_X + 0.5, y: -OFFMAP_ROAD_LENGTH });
    expect(route[route.length - 1]).toEqual({ x: ACCESS_ROAD_X + 0.5, y: ACCESS_ROAD_FARM_Y + 0.5 });
    // Straight road: the intermediate tile centers are simplified away.
    expect(route).toHaveLength(2);
  });

  it('follows player-built roads and parks at the reachable tile closest to the bin', () => {
    // Cutting the access road inside the farm makes the car stop at the last reachable tile.
    const cut = unwrap(removeRoad(createInitialState(), tileIndex(ACCESS_ROAD_X, 14)));
    const short = carRoute(cut.tiles);
    expect(short[short.length - 1]).toEqual({ x: ACCESS_ROAD_X + 0.5, y: 13.5 });
    // A detour west of the cut reaches the spot right above the bin (17, 16).
    let s = cut;
    for (const y of [13, 14, 15]) s = unwrap(buildRoad(s, tileIndex(17, y)));
    const detour = carRoute(s.tiles);
    expect(detour[detour.length - 1]).toEqual({ x: 17.5, y: 15.5 });
    expect(detour).toContainEqual({ x: 17.5, y: 13.5 });
  });

  it('arrives, parks, leaves and is away between visits', () => {
    const route = carRoute(createInitialState().tiles);
    const length = routeLength(route);
    const drive = driveMinutes(length);
    const hour = (CAR.visitHours[0] ?? 0) * 60;
    expect(carState(hour - 1, route).phase).toBe('away');

    const early = carState(hour + 1, route);
    expect(early.phase).toBe('arriving');
    expect(early.y).toBeCloseTo(-OFFMAP_ROAD_LENGTH + CAR.speed, 5);
    expect(early.heading).toBeCloseTo(0, 5); // driving south (towards +y), into the farm

    const parked = carState(hour + drive + 1, route);
    expect(parked.phase).toBe('parked');
    expect(parked.y).toBeCloseTo(ACCESS_ROAD_FARM_Y + 0.5, 5);

    const leaving = carState(hour + drive + CAR.waitMinutes + drive / 2, route);
    expect(leaving.phase).toBe('leaving');
    expect(Math.cos(leaving.heading)).toBeCloseTo(-1, 5); // facing north, away from the farm

    expect(carState(hour + drive * 2 + CAR.waitMinutes + 1, route).phase).toBe('away');
  });

  it('slows down smoothly before parking', () => {
    const route = carRoute(createInitialState().tiles);
    const drive = driveMinutes(routeLength(route));
    const hour = (CAR.visitHours[0] ?? 0) * 60;
    const at = (t: number) => carState(hour + t, route).y;
    const cruise = at(2) - at(1);
    const braking = at(drive - 0.1) - at(drive - 0.2);
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
    expect(loaded?.game.tiles[tileIndex(ACCESS_ROAD_X, 15)]?.road).toBe(true);
    expect(loaded?.game.tiles[ACCESS_OFF_FARM]?.road).toBe(true);
  });
});
