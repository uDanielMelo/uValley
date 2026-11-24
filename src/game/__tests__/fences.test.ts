import { describe, expect, it } from 'vitest';
import { tileCoords, tileIndex, withTile } from '../grid';
import { LEASH_RADIUS } from '../../data/animals';
import { stepAnimals } from '../animals';
import { layFenceLine, setTimeOfDay, spawnAnimals } from '../dev';
import { nearestInArea, pastureArea } from '../fences';
import { shelterDoor } from '../shelters';
import { footprintOf, placeStructure } from '../structures';
import { ringAround } from '../roads';
import { pastureCapacity } from '../shelters';
import { DEFAULT_SETTINGS, deserialize, serialize } from '../save';
import { createInitialState } from '../state';
import type { ActionResult, GameState, GridPoint, Task, TileFence } from '../types';
import { checkRoadOrder } from '../construction';
import { isPasture } from '../shelters';
import { checkPlacement } from '../structures';
import { findPath, isWalkable, segmentClear } from '../path';
import { DEMOLISH_REFUND } from '../../data/structures';
import { till } from '../actions';
import { cancelAllOrders, demolishClick, repairSiteTasks } from '../construction';
import { fenceError, fenceLine, fencePlan, layFence, orderFenceLine, orderGate, pieceCost, toggleGate } from '../fences';
import { taskSpot } from '../workers';
import { applyTask } from '../tasks';

/** Free owned grass, away from the yard. */
const FREE = tileIndex(22, 40);
const FREE2 = tileIndex(23, 40);

const reload = (s: GameState): GameState => {
  const loaded = deserialize(serialize(s, DEFAULT_SETTINGS));
  if (!loaded) throw new Error('save did not load');
  return loaded.game;
};

describe('fence save', () => {
  it('round-trips a fence and a gate through the save', () => {
    const s0 = createInitialState();
    let tiles = withTile(s0.tiles, FREE, { state: 'grass', fence: {} });
    tiles = withTile(tiles, FREE2, { state: 'grass', fence: { gate: true, open: true } });
    const loaded = reload({ ...s0, tiles });
    expect(loaded.tiles[FREE]).toEqual({ state: 'grass', fence: {} });
    expect(loaded.tiles[FREE2]).toEqual({ state: 'grass', fence: { gate: true, open: true } });
  });

  it('round-trips a queued fence task', () => {
    const s0 = createInitialState();
    const task: Task = { id: s0.nextId, kind: 'build', tile: FREE, cropId: null, workerId: null, job: { type: 'fence', remove: false, cost: 6 } };
    const loaded = reload({ ...s0, tasks: [task], nextId: s0.nextId + 1 });
    expect(loaded.tasks.find((t) => t.id === task.id)?.job).toEqual({ type: 'fence', remove: false, cost: 6 });
  });

  it('rejects a fence on a road tile in a save', () => {
    const s0 = createInitialState();
    const tiles = withTile(s0.tiles, FREE, { state: 'grass', road: true, fence: {} });
    expect(deserialize(serialize({ ...s0, tiles }, DEFAULT_SETTINGS))).toBeNull();
  });
});

// ---------- Task 2: ordering fences ----------

const unwrap = (result: ActionResult): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

const fenceTasks = (s: GameState) => s.tasks.filter((t) => t.job?.type === 'fence');

/** Runs every queued task at once, as the crew would. */
const finishAll = (s: GameState): GameState =>
  s.tasks.reduce((acc, t) => {
    const r = applyTask(acc, t);
    return r.ok ? { ...r.state, tasks: r.state.tasks.filter((x) => x.id !== t.id) } : acc;
  }, s);

describe('fence orders', () => {
  it('fenceLine snaps a drag to 45°', () => {
    const diag = fenceLine(tileIndex(20, 40), tileIndex(25, 44));
    expect(diag.diagonal).toBe(true);
    expect(diag.tiles).toEqual([0, 1, 2, 3, 4, 5].map((k) => tileIndex(20 + k, 40 + k)));
    const straight = fenceLine(tileIndex(20, 40), tileIndex(26, 41));
    expect(straight.diagonal).toBe(false);
    expect(straight.tiles).toEqual([0, 1, 2, 3, 4, 5, 6].map((k) => tileIndex(20 + k, 40)));
  });

  it('orders only the free tiles of a line and charges them', () => {
    const s0 = createInitialState();
    const tilled = unwrap(till({ ...s0, money: 1000 }, tileIndex(22, 40)));
    const s = unwrap(orderFenceLine(tilled, tileIndex(20, 40), tileIndex(25, 40)));
    expect(fenceTasks(s)).toHaveLength(5);
    expect(fenceTasks(s).map((t) => t.tile)).not.toContain(tileIndex(22, 40));
    expect(s.money).toBe(1000 - 5 * pieceCost('straight'));
    expect(fenceTasks(s).every((t) => t.kind === 'build')).toBe(true);
  });

  it('a diagonal line costs the diagonal piece', () => {
    const s0 = { ...createInitialState(), money: 1000 };
    const s = unwrap(orderFenceLine(s0, tileIndex(20, 40), tileIndex(23, 43)));
    expect(fenceTasks(s)).toHaveLength(4);
    expect(s.money).toBe(1000 - 4 * pieceCost('diagonal'));
    expect(pieceCost('diagonal')).toBeGreaterThan(pieceCost('straight'));
  });

  it('fails without money', () => {
    const s0 = { ...createInitialState(), money: 0 };
    const r = orderFenceLine(s0, tileIndex(20, 40), tileIndex(25, 40));
    expect(r).toEqual({ ok: false, error: 'not-enough-money' });
  });

  it('fails when no tile of the line is free', () => {
    const s0 = { ...createInitialState(), money: 1000 };
    const r = orderFenceLine(unwrap(till(s0, FREE)), FREE, FREE);
    expect(r).toEqual({ ok: false, error: 'no-room-for-fence' });
  });

  it('finishing the task lays the fence; projected tasks see it', () => {
    const s0 = { ...createInitialState(), money: 1000 };
    const queued = unwrap(orderFenceLine(s0, FREE, FREE));
    expect(fenceError(queued, FREE, false)).toBe('already-fence');
    const done = finishAll(queued);
    expect(done.tiles[FREE]?.fence).toEqual({});
  });

  it('clicking a queued fence again cancels and refunds', () => {
    const s0 = { ...createInitialState(), money: 1000 };
    const queued = unwrap(orderFenceLine(s0, FREE, FREE));
    const cancelled = unwrap(orderFenceLine(queued, FREE, FREE));
    expect(fenceTasks(cancelled)).toHaveLength(0);
    expect(cancelled.money).toBe(1000);
  });

  it('demolish cancels a queued fence, then queues removal of a built one and refunds DEMOLISH_REFUND', () => {
    const s0 = { ...createInitialState(), money: 1000 };
    const queued = unwrap(orderFenceLine(s0, FREE, FREE));
    const click = demolishClick(queued, FREE);
    if (!click.ok) throw new Error(click.error);
    expect(click.change).toEqual({ kind: 'fence-cancelled', refund: pieceCost('straight') });
    expect(click.state.money).toBe(1000);

    const built = finishAll(unwrap(orderFenceLine(s0, FREE, FREE)));
    const removal = demolishClick(built, FREE);
    if (!removal.ok) throw new Error(removal.error);
    expect(removal.change).toEqual({ kind: 'fence-removal-queued' });
    const gone = finishAll(removal.state);
    expect(gone.tiles[FREE]?.fence).toBeUndefined();
    expect(gone.money).toBe(built.money + DEMOLISH_REFUND * pieceCost('straight'));
  });

  it('cancel all refunds queued fences', () => {
    const s0 = { ...createInitialState(), money: 1000 };
    const queued = unwrap(orderFenceLine(s0, tileIndex(20, 40), tileIndex(23, 43)));
    const cleared = cancelAllOrders(queued);
    expect(fenceTasks(cleared)).toHaveLength(0);
    expect(cleared.money).toBe(1000);
  });

  it('repairSiteTasks keeps queued fence tasks', () => {
    const s0 = { ...createInitialState(), money: 1000 };
    const queued = unwrap(orderFenceLine(s0, tileIndex(20, 40), tileIndex(22, 40)));
    expect(fenceTasks(repairSiteTasks(queued))).toHaveLength(3);
  });

  it('a gate goes on an existing fence tile and toggles open and closed', () => {
    const s0 = { ...createInitialState(), money: 1000 };
    const built = finishAll(unwrap(orderFenceLine(s0, tileIndex(20, 40), tileIndex(22, 40))));
    const mid = tileIndex(21, 40);
    expect(toggleGate(built, mid)).toEqual({ ok: false, error: 'not-gate' });
    const gated = finishAll(unwrap(orderGate(built, mid)));
    expect(gated.money).toBe(built.money - pieceCost('gate'));
    expect(gated.tiles[mid]?.fence).toEqual({ gate: true });
    const opened = unwrap(toggleGate(gated, mid));
    expect(opened.tiles[mid]?.fence).toEqual({ gate: true, open: true });
    expect(unwrap(toggleGate(opened, mid)).tiles[mid]?.fence).toEqual({ gate: true });
    expect(orderGate(gated, mid)).toEqual({ ok: false, error: 'already-fence' });
  });

  it('a gate can also go on free grass', () => {
    const s0 = { ...createInitialState(), money: 1000 };
    const gated = finishAll(unwrap(orderGate(s0, FREE)));
    expect(gated.tiles[FREE]?.fence).toEqual({ gate: true });
  });

  it('materials sum the recipes', () => {
    const s0 = { ...createInitialState(), money: 1000 };
    const plan = fencePlan(s0, tileIndex(20, 40), tileIndex(22, 40));
    expect(plan.materials.map((m) => [m.id, m.amount])).toEqual([
      ['post', 3],
      ['rail', 6],
      ['wire', 12],
    ]);
    expect(plan.cost).toBe(3 * pieceCost('straight'));
    expect(plan.error).toBeNull();
  });
});

// ---------- Task 3: fences block things ----------

/** Lays finished fence (or gate) tiles at once. */
const withFences = (s: GameState, cells: ReadonlyArray<readonly [number, number]>, fence: TileFence = {}): GameState => ({
  ...s,
  tiles: cells.reduce((acc, [x, y]) => withTile(acc, tileIndex(x, y), { state: 'grass', fence }), s.tiles),
});

describe('fences block', () => {
  it('tools, roads and buildings refuse a fence tile', () => {
    const s = withFences({ ...createInitialState(), money: 5000 }, [[22, 40]]);
    expect(till(s, FREE)).toEqual({ ok: false, error: 'fence' });
    expect(checkRoadOrder(s, FREE)).toBe('fence');
    expect(checkPlacement(s, 'silo', 22, 40, 0)).toBe('fence');
  });

  it('a fence tile is not pasture', () => {
    const s = withFences(createInitialState(), [[22, 40]]);
    expect(isPasture(s.tiles, 22, 40)).toBe(false);
  });

  it('people walk around a fence and through a gate', () => {
    const wall = Array.from({ length: 21 }, (_, k) => [30, 30 + k] as const);
    const s = withFences(createInitialState(), wall);
    const crosses = (path: GridPoint[], from: GridPoint) =>
      [from, ...path].some((p, i, all) => {
        const next = all[i + 1];
        return !!next && Math.floor(p.x) < 30 !== Math.floor(next.x) < 30 && Math.min(p.y, next.y) >= 30 && Math.max(p.y, next.y) < 51;
      });
    const from = { x: 28.5, y: 40.5 };
    const to = { x: 32.5, y: 40.5 };
    const around = findPath(s.tiles, from, to);
    expect(around.every((p) => !(Math.floor(p.x) === 30 && p.y >= 30 && p.y < 51))).toBe(true);
    expect(crosses(around, from)).toBe(false);
    const gated = withFences(s, [[30, 40]], { gate: true });
    const through = findPath(gated.tiles, from, to);
    expect(through).toEqual([to]);
  });

  it('no corner cutting across a diagonal fence', () => {
    const s = withFences(createInitialState(), [
      [30, 40],
      [31, 41],
    ]);
    expect(segmentClear({ x: 30.6, y: 41.4 }, { x: 31.4, y: 40.6 }, (x, y) => isWalkable(s.tiles, x, y))).toBe(false);
  });
});

// ---------- Task 4: animals kept in by fences ----------

const RECT = { x0: 25, y0: 41, x1: 33, y1: 48 };

/** Fence cells on the border of RECT, skipping roads and buildings (a road leaves through the wall). */
const rectWall = (s: GameState): Array<readonly [number, number]> => {
  const cells: Array<readonly [number, number]> = [];
  for (let x = RECT.x0; x <= RECT.x1; x++) {
    for (let y = RECT.y0; y <= RECT.y1; y++) {
      const border = x === RECT.x0 || x === RECT.x1 || y === RECT.y0 || y === RECT.y1;
      const tile = s.tiles[tileIndex(x, y)];
      if (border && tile?.state === 'grass' && !tile.road && !tile.structure) cells.push([x, y]);
    }
  }
  return cells;
};

const insideRect = (p: GridPoint) => p.x >= RECT.x0 && p.x < RECT.x1 + 1 && p.y >= RECT.y0 && p.y < RECT.y1 + 1;

/** A coop at (28, 44) with one hen, fenced in by RECT, at 7:00. */
const fencedCoop = (): GameState => {
  const s = spawnAnimals(setTimeOfDay(unwrap(placeStructure({ ...createInitialState(), money: 100_000 }, 'chickenCoop', 28, 44)), 7), 'chicken', 1);
  return withFences(s, rectWall(s));
};

const shelterOf = (s: GameState, type: string) => {
  const found = s.structures.find((x) => x.type === type);
  if (!found) throw new Error(`no ${type}`);
  return found;
};

describe('animals and fences', () => {
  it('with no fences the area is the connected grass and wandering stays near the door', () => {
    let s = spawnAnimals(setTimeOfDay(unwrap(placeStructure({ ...createInitialState(), money: 100_000 }, 'chickenCoop', 28, 44)), 7), 'chicken', 1);
    const coop = shelterOf(s, 'chickenCoop');
    expect(pastureArea(s.tiles, coop).size).toBeGreaterThan(100);
    const door = shelterDoor(coop);
    for (let i = 0; i < 60; i++) {
      s = stepAnimals(s, 10);
      s = { ...s, gameMinutes: s.gameMinutes + 10 };
      for (const a of s.animals) expect(Math.hypot(a.x - door.x, a.y - door.y)).toBeLessThanOrEqual(LEASH_RADIUS + 1);
    }
  });

  it('a closed fence keeps a hen inside', () => {
    let s = fencedCoop();
    for (let i = 0; i < 300; i++) {
      s = stepAnimals(s, 10);
      s = { ...s, gameMinutes: s.gameMinutes + 10 };
      for (const a of s.animals) expect(insideRect(a)).toBe(true);
    }
  });

  it('an open gate lets it out', () => {
    const s = fencedCoop();
    const coop = shelterOf(s, 'chickenCoop');
    const closed = pastureArea(s.tiles, coop);
    const gate = withFences(s, [[RECT.x0, 45]], { gate: true, open: true });
    const open = pastureArea(gate.tiles, coop);
    expect([...closed].some((t) => !insideRect(tileCoords(t)))).toBe(false);
    expect([...open].some((t) => !insideRect(tileCoords(t)))).toBe(true);
  });

  it('closing the gate sends a hen outside back to the door', () => {
    const s = fencedCoop();
    const coop = shelterOf(s, 'chickenCoop');
    const door = shelterDoor(coop);
    const outside = { x: RECT.x0 - 1.5, y: 45.5 };
    const placed = { ...s, animals: s.animals.map((a) => ({ ...a, ...outside, path: [], waitMinutes: 0 })) };
    const stepped = stepAnimals(placed, 1);
    const hen = stepped.animals[0];
    expect(hen?.path.at(-1)).toEqual(door);
    // Once home it wanders inside again, without being sent back.
    const home = { ...s, animals: s.animals.map((a) => ({ ...a, ...door, path: [], waitMinutes: 0 })) };
    const next = stepAnimals(home, 1).animals[0];
    const target = next?.path.at(-1);
    if (target) expect(pastureArea(s.tiles, coop).has(tileIndex(Math.floor(target.x), Math.floor(target.y)))).toBe(true);
  });

  it('closing the gate brings a cow back inside the fence, not to the shelter', () => {
    const base = spawnAnimals(setTimeOfDay(unwrap(placeStructure({ ...createInitialState(), money: 100_000 }, 'corral', 28, 44)), 7), 'cow', 1);
    const s = withFences(base, rectWall(base));
    const corral = shelterOf(s, 'corral');
    const outside = { x: RECT.x0 - 1.5, y: 45.5 };
    const placed = { ...s, animals: s.animals.map((a) => ({ ...a, ...outside, path: [], waitMinutes: 0 })) };
    const cow = stepAnimals(placed, 1).animals[0];
    const end = cow?.path.at(-1);
    expect(end).toEqual(nearestInArea(pastureArea(s.tiles, corral), outside));
    expect(end).not.toEqual(shelterDoor(corral));
  });
});

// ---------- Task 5: dev ----------

describe('dev fence', () => {
  it('lays a finished line for free', () => {
    const s0 = createInitialState();
    const s = layFenceLine(s0, 20, 40, 23, 43);
    expect([0, 1, 2, 3].every((k) => s.tiles[tileIndex(20 + k, 40 + k)]?.fence)).toBe(true);
    expect(s.money).toBe(s0.money);
    expect(s.tasks).toEqual(s0.tasks);
  });
});

// ---------- Final review fixes ----------

describe('fence review fixes', () => {
  it('a tight pen right outside the ring road keeps the hens in', () => {
    let s = spawnAnimals(setTimeOfDay(unwrap(placeStructure({ ...createInitialState(), money: 100_000 }, 'chickenCoop', 28, 44)), 7), 'chicken', 3);
    const coop = shelterOf(s, 'chickenCoop');
    const fp = footprintOf(coop.type, coop.x, coop.y, coop.rotation);
    const inner = new Set(ringAround(fp, 1).map((c) => `${c.x},${c.y}`));
    const pen = ringAround(fp, 2)
      .filter((c) => !inner.has(`${c.x},${c.y}`))
      .filter((c) => {
        const t = s.tiles[tileIndex(c.x, c.y)];
        return t?.state === 'grass' && !t.road && !t.structure;
      })
      .map((c) => [c.x, c.y] as const);
    s = withFences(s, pen);
    const inPen = (p: GridPoint) => p.x >= fp.x - 2 && p.x < fp.x + fp.width + 2 && p.y >= fp.y - 2 && p.y < fp.y + fp.depth + 2;
    for (let i = 0; i < 80; i++) {
      s = stepAnimals(s, 10);
      s = { ...s, gameMinutes: s.gameMinutes + 10 };
      for (const a of s.animals) expect(inPen(a)).toBe(true);
    }
  });

  it('linking a structure to the road network never paves over a fence', () => {
    const fenced = withFences(createInitialState(), Array.from({ length: 30 }, (_, k) => [17 + k, 50] as const));
    const placed = unwrap(placeStructure(fenced, 'chickenCoop', 28, 40));
    for (let k = 0; k < 30; k++) expect(placed.tiles[tileIndex(17 + k, 50)]?.fence).toBeDefined();
  });

  it('fencing the pasture does not shrink its capacity', () => {
    const s0 = createInitialState();
    const before = pastureCapacity(s0);
    const fenced = withFences(s0, Array.from({ length: 10 }, (_, k) => [20 + k, 36] as const));
    expect(pastureCapacity(fenced)).toBe(before);
  });
});

// ---------- Deferred minors ----------

describe('fence polish', () => {
  it('clicking a queued fence removal in fence mode cancels it instead of buying a new fence', () => {
    const s0 = { ...createInitialState(), money: 1000 };
    const built = finishAll(unwrap(orderFenceLine(s0, FREE, FREE)));
    const removal = demolishClick(built, FREE);
    if (!removal.ok) throw new Error(removal.error);
    const clicked = unwrap(orderFenceLine(removal.state, FREE, FREE));
    expect(fenceTasks(clicked)).toHaveLength(0);
    expect(clicked.money).toBe(built.money);
  });

  it('an animal standing where a fence is laid is moved off the tile', () => {
    const s0 = spawnAnimals(setTimeOfDay(unwrap(placeStructure({ ...createInitialState(), money: 100_000 }, 'chickenCoop', 28, 44)), 7), 'chicken', 1);
    const placed = { ...s0, animals: s0.animals.map((a) => ({ ...a, x: 22.5, y: 40.5, path: [] })) };
    const laid = unwrap(layFence(placed, FREE, false));
    const hen = laid.animals[0];
    expect(hen && tileIndex(Math.floor(hen.x), Math.floor(hen.y))).not.toBe(FREE);
  });

  it('the crew builds a fence from beside the tile, not on it', () => {
    const s0 = { ...createInitialState(), money: 1000 };
    const queued = unwrap(orderFenceLine(s0, FREE, FREE));
    const task = fenceTasks(queued)[0];
    if (!task) throw new Error('no task');
    const spot = taskSpot(queued, task, { x: 20.5, y: 40.5 });
    expect(tileIndex(Math.floor(spot.x), Math.floor(spot.y))).not.toBe(FREE);
    expect(Math.hypot(spot.x - 22.5, spot.y - 40.5)).toBeLessThanOrEqual(1);
  });

  it('a save with a fence under a building loads without that fence', () => {
    const s0 = unwrap(placeStructure({ ...createInitialState(), money: 100_000 }, 'chickenCoop', 28, 44));
    const under = tileIndex(28, 44);
    const raw = JSON.parse(serialize(s0, DEFAULT_SETTINGS)) as { game: { tiles: Record<string, unknown>[] } };
    raw.game.tiles[under] = { state: 'grass', fence: {} };
    const loaded = deserialize(JSON.stringify(raw));
    expect(loaded?.game.tiles[under]?.fence).toBeUndefined();
    expect(loaded?.game.tiles[under]?.structure).toBe('chickenCoop');
  });
});
