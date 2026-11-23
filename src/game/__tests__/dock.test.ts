import { describe, expect, it } from 'vitest';
import { DOCK, WALK_IN } from '../../data/docks';
import { DEFAULT_PRIORITIES } from '../../data/workers';
import { MINUTES_PER_DAY } from '../../data/world';
import { bayPoint, crewTilesOf, docksOf, loaderSpot } from '../dock';
import { DEFAULT_SETTINGS, deserialize, serialize } from '../save';
import {
  cancelLoading,
  damagedUnits,
  dismissShipment,
  knownGoods,
  loadMinutes,
  spawnWalkIn,
  startLoading,
  stepShipments,
  walkInRequest,
  walkInsBetween,
} from '../shipments';
import { advanceGame } from '../simulation';
import { createInitialState } from '../state';
import type { ActionResult, GameState, Shipment } from '../types';
import { clearTasks } from '../workers';

const unwrap = (result: ActionResult): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

/** Runs the game in small steps (like the real loop), collecting the dock events. */
const run = (state: GameState, minutes: number, step = 1) => {
  let s = state;
  const events: string[] = [];
  for (let t = 0; t < minutes; t += step) {
    const tick = advanceGame(s, step);
    s = tick.state;
    events.push(...tick.dockEvents.map((e) => e.kind));
  }
  return { state: s, events };
};

/** A new farm at 8:00 with no customers on their way yet. */
const farm = (): GameState => ({ ...createInitialState(), gameMinutes: 8 * 60 });

/** A farm with a customer who just set off for the dock. */
const withCustomer = (base: GameState = farm()): { state: GameState; shipment: Shipment } => {
  const state = spawnWalkIn(base, { at: base.gameMinutes, day: 3, slot: 1 });
  const shipment = state.shipments[state.shipments.length - 1];
  if (!shipment) throw new Error('no customer');
  return { state, shipment };
};

/** Fast-forwards to the moment the customer is parked. */
const parked = (base?: GameState) => {
  const { state, shipment } = withCustomer(base);
  const at = { ...state, gameMinutes: shipment.arrivesAt };
  return { state: stepShipments(at, shipment.arrivesAt - 1), shipment };
};

/** Stocks exactly what the shipment asks for. */
const stockFor = (state: GameState, shipment: Shipment, extra = 0): GameState => {
  const produce = { ...state.inventory.produce };
  const products = { ...state.inventory.products };
  for (const { good, quantity } of shipment.goods) {
    if (good.kind === 'crop') produce[good.id] = quantity + extra;
    else products[good.id] = quantity + extra;
  }
  return { ...state, inventory: { ...state.inventory, produce, products } };
};

const owned = (state: GameState, shipment: Shipment): number =>
  shipment.goods.reduce(
    (sum, { good }) => sum + (good.kind === 'crop' ? (state.inventory.produce[good.id] ?? 0) : (state.inventory.products[good.id] ?? 0)),
    0,
  );

describe('the dock', () => {
  it('stands where the shipping bin was, with a bay on the street and loader spots beside it', () => {
    const s = createInitialState();
    const [dock] = docksOf(s);
    expect(dock).toMatchObject({ type: 'dock', x: 33, y: 57 });
    if (!dock) return;
    expect(bayPoint(dock)).toEqual({ x: 33.5, y: 58.5 });
    const tiles = crewTilesOf(dock);
    expect(tiles).toHaveLength(DOCK.crewMax);
    expect(new Set(tiles).size).toBe(tiles.length);
    for (const tile of tiles) {
      expect(s.tiles[tile]?.road).toBe(true);
      const spot = loaderSpot(dock, tile);
      // Between the platform (rows ≤ 57) and the vehicle parked mid-row 58.
      expect(spot.y).toBeGreaterThan(58);
      expect(spot.y).toBeLessThan(58.3);
    }
  });
});

describe('walk-in customers', () => {
  it('may set off at the customer hours, the same way every time', () => {
    const week = walkInsBetween(0, 7 * MINUTES_PER_DAY);
    expect(week).toEqual(walkInsBetween(0, 7 * MINUTES_PER_DAY));
    expect(week.length).toBeGreaterThan(0);
    expect(week.length).toBeLessThanOrEqual(7 * WALK_IN.hours.length);
    for (const w of week) {
      const minute = w.at % MINUTES_PER_DAY;
      const hour = WALK_IN.hours[w.slot] ?? -1;
      expect(minute).toBeGreaterThanOrEqual(hour * 60);
      expect(minute).toBeLessThan(hour * 60 + WALK_IN.jitterMinutes);
    }
    // Sorted, and an interval only holds the ones inside it.
    expect(week.map((w) => w.at)).toEqual([...week.map((w) => w.at)].sort((a, b) => a - b));
    const first = week[0];
    if (first) expect(walkInsBetween(first.at - 1, first.at)).toEqual([first]);
  });

  it('ask for something the farm knows, in a lot that fits their car', () => {
    const s = farm();
    const known = knownGoods(s).map((g) => `${g.kind}:${g.id}`);
    for (let seed = 0; seed < 50; seed++) {
      const request = walkInRequest(s, seed);
      expect(request).not.toBeNull();
      if (!request) continue;
      expect(known).toContain(`${request.line.good.kind}:${request.line.good.id}`);
      expect(request.line.quantity).toBeGreaterThanOrEqual(1);
      expect(request.payment).toBeGreaterThan(0);
    }
    // No animals: no animal products are asked for.
    expect(known.every((k) => k.startsWith('crop:'))).toBe(true);
  });

  it('drive in, park at the bay and wait until their deadline', () => {
    const { state, shipment } = withCustomer();
    expect(shipment.phase).toBe('enroute');
    expect(shipment.arrivesAt).toBeGreaterThan(shipment.setOffAt);
    expect(shipment.deadline).toBe(shipment.arrivesAt + DOCK.waitMinutes);
    const drive = shipment.arrivesAt - state.gameMinutes;
    const arrived = run(state, drive + 1);
    expect(arrived.events).toContain('arrived');
    expect(arrived.state.shipments.find((s) => s.id === shipment.id)?.phase).toBe('waiting');
  });

  it('leave without paying when nobody loads them, and are gone after the drive back', () => {
    const { state, shipment } = parked();
    const money = state.money;
    const late = stepShipments({ ...state, gameMinutes: shipment.deadline }, shipment.deadline - 1);
    const leaving = late.shipments.find((s) => s.id === shipment.id);
    expect(leaving).toMatchObject({ phase: 'leaving', outcome: 'expired' });
    expect(late.money).toBe(money);
    const gone = stepShipments({ ...late, gameMinutes: leaving?.goneAt ?? 0 }, (leaving?.goneAt ?? 0) - 1);
    expect(gone.shipments.find((s) => s.id === shipment.id)).toBeUndefined();
  });

  it('do not come when the dock has no road to the access road', () => {
    const base = farm();
    const noRoads = { ...base, tiles: base.tiles.map(({ road: _road, ...t }) => t) };
    expect(spawnWalkIn(noRoads, { at: noRoads.gameMinutes, day: 3, slot: 1 }).shipments).toHaveLength(0);
  });

  it('do not come while the only bay is taken', () => {
    const { state } = withCustomer();
    expect(spawnWalkIn(state, { at: state.gameMinutes, day: 4, slot: 2 }).shipments).toHaveLength(1);
  });
});

describe('loading at the dock', () => {
  it('needs the goods in stock', () => {
    const { state, shipment } = parked();
    expect(startLoading(state, shipment.id)).toEqual({ ok: false, error: 'not-enough-goods' });
    expect(startLoading(stockFor(state, shipment), 999)).toEqual({ ok: false, error: 'no-shipment' });
  });

  it('takes the lot from the stock, queues the loaders and is paid when the crew is done', () => {
    const { state: at, shipment } = parked();
    const state = stockFor(at, shipment, 2);
    const loading = unwrap(startLoading(state, shipment.id));
    expect(owned(loading, shipment)).toBe(2 * shipment.goods.length);
    expect(loading.tasks.filter((t) => t.kind === 'haul')).toHaveLength(DOCK.crewMax);
    const s = loading.shipments.find((x) => x.id === shipment.id);
    expect(s).toMatchObject({ phase: 'loading', work: { done: 0, total: loadMinutes(shipment.goods) } });
    // Loading again is not possible.
    expect(startLoading(loading, shipment.id)).toEqual({ ok: false, error: 'no-shipment' });

    const done = run(loading, DOCK.waitMinutes - 1);
    expect(done.events).toContain('sold');
    expect(done.state.money).toBeGreaterThanOrEqual(state.money + shipment.payment - 50); // minus a little in wages
    expect(done.state.tasks.filter((t) => t.kind === 'haul')).toHaveLength(0);
    expect(done.state.workers.every((w) => w.taskId === null || done.state.tasks.some((t) => t.id === w.taskId))).toBe(true);
  });

  it('can be called off: the lot comes back whole and the customer keeps waiting', () => {
    const { state: at, shipment } = parked();
    const state = stockFor(at, shipment);
    const loading = unwrap(startLoading(state, shipment.id));
    const back = unwrap(cancelLoading(loading, shipment.id));
    expect(owned(back, shipment)).toBe(owned(state, shipment));
    expect(back.tasks.filter((t) => t.kind === 'haul')).toHaveLength(0);
    expect(back.shipments.find((x) => x.id === shipment.id)?.phase).toBe('waiting');
    // "Cancel everything" also calls it off.
    const cleared = clearTasks(loading);
    expect(owned(cleared, shipment)).toBe(owned(state, shipment));
  });

  it('is unloaded with some damage when the deadline runs out halfway', () => {
    const { state: at, shipment } = parked();
    const loading = unwrap(startLoading(stockFor(at, shipment), shipment.id));
    const started: GameState = {
      ...loading,
      workers: [],
      shipments: loading.shipments.map((x) => (x.id === shipment.id && x.work ? { ...x, work: { ...x.work, done: 1 } } : x)),
    };
    const late = advanceGame({ ...started, gameMinutes: shipment.deadline - 0.5 }, 1);
    expect(late.dockEvents.map((e) => e.kind)).toEqual(['expired']);
    const left = late.state.shipments.find((x) => x.id === shipment.id);
    const lost = shipment.goods.reduce((sum, line) => sum + damagedUnits(line.quantity), 0);
    expect(left?.lost).toBe(lost);
    expect(owned(late.state, shipment)).toBe(owned(stockFor(at, shipment), shipment) - lost);
    expect(late.state.tasks.filter((t) => t.kind === 'haul')).toHaveLength(0);
  });

  it('comes back whole when the deadline runs out before anyone started', () => {
    const { state: at, shipment } = parked();
    const loading = unwrap(startLoading(stockFor(at, shipment), shipment.id));
    const late = advanceGame({ ...loading, workers: [], gameMinutes: shipment.deadline - 0.5 }, 1);
    expect(owned(late.state, shipment)).toBe(owned(stockFor(at, shipment), shipment));
    expect(late.state.shipments.find((x) => x.id === shipment.id)?.lost).toBeUndefined();
  });

  it('damage is a share of the lot, at least one unit', () => {
    expect(damagedUnits(1)).toBe(1);
    expect(damagedUnits(4)).toBe(1);
    expect(damagedUnits(20)).toBe(3);
    expect(damagedUnits(0)).toBe(0);
  });

  it('a customer can be sent away (whatever was staged goes back)', () => {
    const { state: at, shipment } = parked();
    const loading = unwrap(startLoading(stockFor(at, shipment), shipment.id));
    const sent = unwrap(dismissShipment(loading, shipment.id));
    expect(sent.shipments.find((x) => x.id === shipment.id)).toMatchObject({ phase: 'leaving', outcome: 'dismissed' });
    expect(owned(sent, shipment)).toBe(owned(stockFor(at, shipment), shipment));
    expect(dismissShipment(sent, shipment.id)).toEqual({ ok: false, error: 'no-shipment' });
  });
});

describe('dock saves', () => {
  it('round-trip a vehicle being loaded, with its loaders', () => {
    const { state: at, shipment } = parked();
    const loading = unwrap(startLoading(stockFor(at, shipment), shipment.id));
    const loaded = deserialize(serialize(loading, DEFAULT_SETTINGS));
    expect(loaded?.game.shipments).toEqual(loading.shipments);
    expect(loaded?.game.tasks.filter((t) => t.kind === 'haul')).toHaveLength(DOCK.crewMax);
    // Loaders lost on the way are queued again.
    const noTasks = { ...loading, tasks: loading.tasks.filter((t) => t.kind !== 'haul') };
    const repaired = deserialize(serialize(noTasks, DEFAULT_SETTINGS));
    expect(repaired?.game.tasks.filter((t) => t.kind === 'haul')).toHaveLength(DOCK.crewMax);
  });

  it('migrate v16: the shipping bin becomes the dock and everyone loads first', () => {
    const s = createInitialState();
    const v16 = JSON.parse(serialize(s, DEFAULT_SETTINGS)) as { saveVersion: number; game: Record<string, unknown> };
    v16.saveVersion = 16;
    const game = v16.game as {
      structures: Array<{ type: string }>;
      tiles: Array<{ structure?: string }>;
      workers: Array<{ priorities: string[] }>;
      shipments?: unknown;
    };
    for (const x of game.structures) if (x.type === 'dock') x.type = 'shippingBin';
    for (const t of game.tiles) if (t.structure === 'dock') t.structure = 'shippingBin';
    for (const w of game.workers) w.priorities = w.priorities.filter((p) => p !== 'haul');
    delete game.shipments;
    const loaded = deserialize(JSON.stringify(v16));
    expect(loaded).not.toBeNull();
    expect(loaded?.game.structures.map((x) => x.type)).toEqual(['house', 'dock', 'bunkhouse']);
    expect(loaded?.game.tiles.filter((t) => t.structure === 'dock')).toHaveLength(1);
    expect(loaded?.game.shipments).toEqual([]);
    for (const w of loaded?.game.workers ?? []) expect(w.priorities).toEqual(DEFAULT_PRIORITIES);
  });
});
