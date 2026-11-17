import { describe, expect, it } from 'vitest';
import { STARTING_MONEY } from '../../data/economy';
import { DAILY_WAGE, FAMILY, HIRE_COST, MAX_WORKERS, TASK_MINUTES, WORK_END_HOUR } from '../../data/workers';
import { DAY_LENGTH_REAL_MINUTES, GAME_MINUTES_PER_REAL_SECOND, MINUTES_PER_DAY } from '../../data/world';
import { tileIndex } from '../grid';
import { findPath, lineClear } from '../path';
import { DEFAULT_SETTINGS, deserialize, serialize } from '../save';
import { advanceGame, tick } from '../simulation';
import { createInitialState } from '../state';
import type { ActionResult, GameState } from '../types';
import {
  clearTasks,
  fireWorker,
  hireWorker,
  isWorkTime,
  payWages,
  toggleTask,
  workerActivity,
  type QueueResult,
} from '../workers';

const unwrap = (result: ActionResult | QueueResult): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

const TILE = tileIndex(13, 13);
// Column 18 north of the bin is the access road, so the second tile sits just past it.
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

describe('family', () => {
  it('starts with the three family members at home', () => {
    const s = createInitialState();
    expect(FAMILY).toHaveLength(3);
    expect(s.workers).toHaveLength(3);
    expect(s.workers.every((w) => w.kind === 'family')).toBe(true);
    expect(new Set(s.workers.map((w) => w.id)).size).toBe(3);
    expect(s.tasks).toEqual([]);
  });
});

describe('task queue', () => {
  it('validates against the queued future, so till then plant can be queued at once', () => {
    let s = createInitialState();
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

describe('hiring', () => {
  it('hires, pays wages daily, and loses workers it cannot pay', () => {
    const s = unwrap(hireWorker(createInitialState()));
    expect(s.workers).toHaveLength(4);
    expect(s.money).toBe(STARTING_MONEY - HIRE_COST);
    const hired = s.workers[3];
    expect(hired?.kind).toBe('hired');

    const paid = payWages(s);
    expect(paid.state.money).toBe(s.money - DAILY_WAGE);
    expect(paid.left).toEqual([]);

    const broke = payWages({ ...s, money: DAILY_WAGE - 1 });
    expect(broke.left).toEqual([hired?.name]);
    expect(broke.state.workers).toHaveLength(3);

    const nextDay = advanceGame({ ...s, gameMinutes: MINUTES_PER_DAY - 1 }, 2);
    expect(nextDay.state.money).toBe(s.money - DAILY_WAGE);
  });

  it('cannot fire family or exceed the limit', () => {
    let s: GameState = { ...createInitialState(), money: 1_000_000 };
    expect(fireWorker(s, s.workers[0]?.id ?? -1)).toEqual({ ok: false, error: 'not-hired' });
    while (s.workers.length < MAX_WORKERS) s = unwrap(hireWorker(s));
    expect(hireWorker(s)).toEqual({ ok: false, error: 'max-workers' });
    s = unwrap(fireWorker(s, s.workers.at(-1)?.id ?? -1));
    expect(s.workers).toHaveLength(MAX_WORKERS - 1);
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
    s = unwrap(hireWorker(s));
    s = tick(s, 1);
    expect(deserialize(serialize(s, DEFAULT_SETTINGS))?.game).toEqual(s);
  });

  it('migrates v1 saves by adding the family', () => {
    const { workers: _w, tasks: _t, nextId: _n, ...v1Game } = createInitialState();
    const loaded = deserialize(JSON.stringify({ saveVersion: 1, savedAt: 0, game: v1Game, settings: {} }));
    expect(loaded?.game.workers).toHaveLength(3);
    expect(loaded?.game.tasks).toEqual([]);
    expect(loaded?.settings).toEqual(DEFAULT_SETTINGS);
  });
});
