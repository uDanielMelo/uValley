import { describe, expect, it } from 'vitest';
import { STARTING_WORKERS, TASK_MINUTES, WORK_END_HOUR } from '../../data/workers';
import { DAY_LENGTH_REAL_MINUTES, GAME_MINUTES_PER_REAL_SECOND, MINUTES_PER_DAY } from '../../data/world';
import { till } from '../actions';
import { tileIndex, tilesInRect } from '../grid';
import { findPath, lineClear } from '../path';
import { DEFAULT_SETTINGS, deserialize, serialize } from '../save';
import { hireTemp } from '../staff';
import { tick } from '../simulation';
import { createInitialState } from '../state';
import type { ActionResult, GameState } from '../types';
import {
  applyArea,
  areaMode,
  clearTasks,
  isWorkTime,
  toggleTask,
  workerActivity,
  type QueueResult,
} from '../workers';

const unwrap = (result: ActionResult | QueueResult): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

const TILE = tileIndex(13, 13);
const OTHER = tileIndex(19, 13);

/** Runs the simulation in small steps, like the render loop does. */
const run = (state: GameState, minutes: number, step = 1): GameState => {
  let s = state;
  for (let t = 0; t < minutes; t += step) s = tick(s, step);
  return s;
};

describe('time', () => {
  it('lasts 25 real minutes per day at 1x', () => {
    expect(DAY_LENGTH_REAL_MINUTES).toBe(25);
    expect(MINUTES_PER_DAY / GAME_MINUTES_PER_REAL_SECOND / 60).toBeCloseTo(25);
  });
});

describe('starting crew', () => {
  it('starts with three staff workers (no family) and an empty queue', () => {
    const s = createInitialState();
    expect(s.workers.map((w) => w.name)).toEqual(STARTING_WORKERS.map((t) => t.name));
    expect(s.workers.every((w) => w.kind === 'staff')).toBe(true);
    expect(new Set(s.workers.map((w) => w.id)).size).toBe(3);
    expect(s.tasks).toEqual([]);
  });
});

describe('task queue', () => {
  it('validates against the queued future, so till then plant can be queued at once', () => {
    const base = createInitialState();
    let s: GameState = { ...base, inventory: { ...base.inventory, seeds: { wheat: 5 } } };
    expect(toggleTask(s, 'seed', TILE, 'wheat')).toEqual({ ok: false, error: 'not-tilled' });
    s = unwrap(toggleTask(s, 'hoe', TILE, 'wheat'));
    s = unwrap(toggleTask(s, 'seed', TILE, 'wheat'));
    expect(s.tasks.map((t) => t.kind)).toEqual(['hoe', 'seed']);

    // Seeds are reserved by queued plantings.
    const seeds = s.inventory.seeds.wheat ?? 0;
    for (let i = 0; i < seeds - 1; i++) {
      const tile = tileIndex(12 + i, 19);
      s = unwrap(toggleTask(unwrap(toggleTask(s, 'hoe', tile, 'wheat')), 'seed', tile, 'wheat'));
    }
    const extra = tileIndex(19, 18);
    s = unwrap(toggleTask(s, 'hoe', extra, 'wheat'));
    expect(toggleTask(s, 'seed', extra, 'wheat')).toEqual({ ok: false, error: 'no-seeds' });
  });

  it('cancels the last task when clicking again with the same tool', () => {
    const s = unwrap(toggleTask(createInitialState(), 'hoe', TILE, 'wheat'));
    const result = toggleTask(s, 'hoe', TILE, 'wheat');
    expect(result.ok && result.change).toBe('cancelled');
    expect(unwrap(result).tasks).toEqual([]);
  });

  it('rejects invalid tiles', () => {
    const s = createInitialState();
    expect(toggleTask(s, 'hoe', tileIndex(0, 0), 'wheat')).toEqual({ ok: false, error: 'locked' });
    expect(toggleTask(s, 'hoe', tileIndex(15, 15), 'wheat')).toEqual({ ok: false, error: 'structure' });
  });
});

describe('workers', () => {
  it('walk to the tile, work, and apply the task', () => {
    let s = unwrap(toggleTask(createInitialState(), 'hoe', TILE, 'wheat'));
    s = tick(s, 0.5);
    const worker = s.workers.find((w) => w.taskId !== null);
    expect(worker).toBeDefined();
    expect(worker && workerActivity(s, worker)).toBe('walking');
    s = run(s, 30);
    expect(s.tiles[TILE]?.state).toBe('tilled');
    expect(s.tasks).toEqual([]);
  });

  it('run tasks on one tile in order and share the queue', () => {
    let s = createInitialState();
    for (const tile of [TILE, OTHER]) {
      s = unwrap(toggleTask(unwrap(toggleTask(s, 'hoe', tile, 'wheat')), 'seed', tile, 'wheat'));
    }
    s = tick(s, 0.5);
    // One worker per tile: each planting waits for the tilling on its tile.
    expect(s.workers.filter((w) => w.taskId !== null)).toHaveLength(2);
    s = run(s, 60);
    expect(s.tiles[TILE]?.state).toBe('planted');
    expect(s.tiles[OTHER]?.state).toBe('planted');
    expect(s.tasks).toEqual([]);
  });

  it('finish a batch sooner when there are more of them', () => {
    const tiles = [12, 13, 14, 16, 17, 19].map((x) => tileIndex(x, 12));
    const queue = (base: GameState) => tiles.reduce((s, t) => unwrap(toggleTask(s, 'hoe', t, 'wheat')), base);
    const minutesToFinish = (start: GameState): number => {
      let s = start;
      for (let m = 1; m <= 600; m++) {
        s = tick(s, 1);
        if (s.tasks.length === 0) return m;
      }
      return Infinity;
    };
    const family = createInitialState();
    const solo: GameState = { ...family, workers: family.workers.slice(0, 1) };
    const familyTime = minutesToFinish(queue(family));
    expect(familyTime).toBeLessThan(minutesToFinish(queue(solo)));
    expect(familyTime).toBeGreaterThanOrEqual(TASK_MINUTES.hoe);
  });

  it('stop working at night and go home', () => {
    let s: GameState = { ...createInitialState(), gameMinutes: WORK_END_HOUR * 60 - 2 };
    s = unwrap(toggleTask(s, 'hoe', TILE, 'wheat'));
    s = run(s, 60);
    expect(isWorkTime(s.gameMinutes)).toBe(false);
    expect(s.tiles[TILE]?.state).toBe('grass');
    expect(s.tasks).toHaveLength(1);
    expect(s.tasks[0]?.workerId).toBeNull();
    expect(s.workers.every((w) => workerActivity(s, w) === 'resting')).toBe(true);
  });

  it('are all freed when the queue is cleared', () => {
    let s = tick(unwrap(toggleTask(createInitialState(), 'hoe', TILE, 'wheat')), 0.5);
    s = clearTasks(s);
    expect(s.tasks).toEqual([]);
    expect(s.workers.every((w) => w.taskId === null)).toBe(true);
  });
});

describe('paths', () => {
  it('go around the house instead of through it', () => {
    const s = createInitialState();
    const from = { x: 15.5, y: 17.5 };
    const to = { x: 16.5, y: 13.5 };
    expect(lineClear(s.tiles, from, to)).toBe(false);
    const path = findPath(s.tiles, from, to);
    expect(path.at(-1)).toEqual(to);
    let prev = from;
    for (const p of path) {
      expect(lineClear(s.tiles, prev, p)).toBe(true);
      prev = p;
    }
  });
});

describe('save v2', () => {
  it('round-trips workers and tasks', () => {
    let s = unwrap(toggleTask(createInitialState(), 'hoe', TILE, 'wheat'));
    s = unwrap(hireTemp(s));
    s = tick(s, 1);
    expect(deserialize(serialize(s, DEFAULT_SETTINGS))?.game).toEqual(s);
  });

  it('migrates v1 saves by adding the family, who become the starting crew in v6', () => {
    const { workers: _w, tasks: _t, nextId: _n, candidates: _c, structures: _s, ...v1Game } = createInitialState();
    const loaded = deserialize(JSON.stringify({ saveVersion: 1, savedAt: 0, game: v1Game, settings: {} }));
    expect(loaded?.game.workers.map((w) => [w.name, w.kind])).toEqual(STARTING_WORKERS.map((t) => [t.name, 'staff']));
    expect(loaded?.game.tasks).toEqual([]);
    expect(loaded?.settings).toEqual(DEFAULT_SETTINGS);
  });
});

describe('area orders', () => {
  it('lists the tiles of a rectangle whatever corner the drag starts from', () => {
    expect(tilesInRect(tileIndex(13, 13), tileIndex(12, 12))).toEqual([
      tileIndex(12, 12),
      tileIndex(13, 12),
      tileIndex(12, 13),
      tileIndex(13, 13),
    ]);
  });

  it('queues the order on every valid tile and skips the rest', () => {
    const s = createInitialState();
    // 12..15 × 12..13 is free grass; row 15 crosses the house (15–16, 15).
    const field = applyArea(s, 'hoe', tilesInRect(tileIndex(12, 12), tileIndex(15, 13)), 'wheat', 'queue');
    expect(field.changed).toHaveLength(8);
    expect(field.state.tasks).toHaveLength(8);
    expect(field.error).toBeNull();

    const row = applyArea(s, 'hoe', tilesInRect(tileIndex(14, 15), tileIndex(19, 15)), 'wheat', 'queue');
    expect(row.changed).toEqual([tileIndex(14, 15), tileIndex(17, 15), tileIndex(18, 15), tileIndex(19, 15)]);
    expect(row.error).toBe('structure');
  });

  it('reserves seeds across the area and stops planting when they run out', () => {
    let s = createInitialState();
    s = { ...s, inventory: { ...s.inventory, seeds: { wheat: 3 } } };
    const tiles = tilesInRect(tileIndex(12, 12), tileIndex(16, 12));
    s = applyArea(s, 'hoe', tiles, 'wheat', 'queue').state;
    const planted = applyArea(s, 'seed', tiles, 'wheat', 'queue');
    expect(planted.changed).toEqual(tiles.slice(0, 3));
    expect(planted.error).toBe('no-seeds');
  });

  it('does not queue twice, and cancels when the drag starts on the same order', () => {
    const tiles = tilesInRect(tileIndex(12, 12), tileIndex(14, 12));
    let s = applyArea(createInitialState(), 'hoe', tiles.slice(0, 2), 'wheat', 'queue').state;
    const again = applyArea(s, 'hoe', tiles, 'wheat', 'queue');
    expect(again.changed).toEqual([tiles[2]]);
    s = again.state;

    expect(areaMode(s, 'hoe', tileIndex(12, 12), 'wheat')).toBe('cancel');
    expect(areaMode(s, 'water', tileIndex(12, 12), 'wheat')).toBe('queue');
    const cancelled = applyArea(s, 'hoe', tiles.slice(1), 'wheat', 'cancel');
    expect(cancelled.changed).toEqual(tiles.slice(1));
    expect(cancelled.state.tasks.map((t) => t.tile)).toEqual([tiles[0]]);
  });

  it('only waters tiles that will have a crop', () => {
    let s = unwrap(till(createInitialState(), TILE));
    s = { ...s, tiles: s.tiles.map((t, i) => (i === TILE ? { state: 'planted', crop: { cropId: 'wheat', growthMinutes: 0 } } : t)) };
    const result = applyArea(s, 'water', tilesInRect(TILE, TILE + 1), 'wheat', 'queue');
    expect(result.changed).toEqual([TILE]);
    expect(result.error).toBe('no-crop');
  });
});
