/**
 * Vehicles at the dock. A shipment is saved state with phases: it drives in ('enroute'), parks at a
 * bay and waits for the farm ('waiting'), is loaded by the crew like a construction site
 * ('loading': the goods leave the inventory when the player orders it, and the crew adds work
 * minutes to the shipment, not to themselves) and drives off ('leaving') until it is out of sight.
 * A vehicle never waits past its deadline: if it runs out during loading the crew unloads it again
 * and part of the lot is damaged.
 *
 * For now the only vehicles are customers who drive in on their own (walk-ins): at a few hours of
 * the day one may set off for the farm (deterministic by day), wanting one lot of something the
 * farm knows, and pays on the spot when loaded.
 */
import { DOCK, WALK_IN } from '../data/docks';
import { MAX_TASKS } from '../data/workers';
import { MINUTES_PER_DAY } from '../data/world';
import { animalProduct } from './animals';
import { bayCount, bayPoint, crewTilesOf, dockWorks, docksOf } from './dock';
import { addTo, basePrice, countIn, unitWeight, type Good } from './market';
import { hash01 } from './random';
import { dropTasks } from './tasks';
import {
  fail,
  ok,
  type ActionError,
  type ActionResult,
  type GameState,
  type Shipment,
  type ShipmentLine,
  type ShipmentOutcome,
  type Task,
} from './types';
import { carRoutes, driveMinutes, routeLength, type CarRoutes } from './visitors';

// ---------- lots ----------

export const linesWeight = (lines: readonly ShipmentLine[]): number =>
  lines.reduce((sum, line) => sum + line.quantity * unitWeight(line.good), 0);

export const linesUnits = (lines: readonly ShipmentLine[]): number => lines.reduce((sum, line) => sum + line.quantity, 0);

/** Work minutes (at speed 1) to load a lot. */
export const loadMinutes = (lines: readonly ShipmentLine[]): number =>
  Math.round(DOCK.loadMinutes.base + DOCK.loadMinutes.perKg * linesWeight(lines));

/** The inventory holds every line of the lot. */
export const hasGoods = (state: Pick<GameState, 'inventory'>, lines: readonly ShipmentLine[]): boolean =>
  lines.every((line) => countIn(state.inventory, line.good) >= line.quantity);

/** Units lost from a lot unloaded after its deadline: a share of each line, at least one. */
export const damagedUnits = (quantity: number): number =>
  quantity <= 0 ? 0 : Math.min(quantity, Math.max(1, Math.round(quantity * DOCK.damage)));

// ---------- routes ----------

/** The routes of a vehicle parking at a dock (from the road network as it is now). */
export const shipmentRoutes = (state: Pick<GameState, 'tiles' | 'structures'>, dockId: number): CarRoutes | null => {
  const dock = state.structures.find((s) => s.id === dockId);
  return dock ? carRoutes(state.tiles, bayPoint(dock)) : null;
};

/** Game minutes to drive in to a dock (and the same to drive back out). */
const driveTime = (state: Pick<GameState, 'tiles' | 'structures'>, dockId: number): number => {
  const routes = shipmentRoutes(state, dockId);
  return routes ? driveMinutes(routeLength(routes.arrive)) : 0;
};

// ---------- walk-in customers ----------

export interface WalkInSlot {
  /** Game minute the customer sets off. */
  at: number;
  day: number;
  slot: number;
}

/** Customers who may set off in the interval (from, to], in time order. */
export const walkInsBetween = (from: number, to: number): WalkInSlot[] => {
  const result: WalkInSlot[] = [];
  const first = Math.floor(from / MINUTES_PER_DAY);
  const last = Math.floor(to / MINUTES_PER_DAY);
  for (let day = first; day <= last; day++) {
    WALK_IN.hours.forEach((hour, slot) => {
      if (hash01(day * 7919 + slot * 131 + 11) >= WALK_IN.chance) return;
      const at = day * MINUTES_PER_DAY + hour * 60 + Math.floor(hash01(day * 3571 + slot * 37 + 5) * WALK_IN.jitterMinutes);
      if (at > from && at <= to) result.push({ at, day, slot });
    });
  }
  return result.sort((a, b) => a.at - b.at);
};

/** What customers may ask for: crops the farm knows, and the products of the animals it keeps. */
export const knownGoods = (state: Pick<GameState, 'research' | 'animals'>): Good[] => {
  const crops = state.research.unlocked.map((id): Good => ({ kind: 'crop', id }));
  const products = [...new Set(state.animals.map(animalProduct).filter((p) => p !== null))];
  return [...crops, ...products.map((id): Good => ({ kind: 'product', id }))];
};

const pick = <T>(list: readonly T[], roll: number): T | undefined => list[Math.floor(roll * list.length)];

const between = (range: readonly [number, number], roll: number): number => range[0] + (range[1] - range[0]) * roll;

/**
 * What a walk-in customer wants: usually something the farm has in stock (they heard about it),
 * otherwise anything it knows. Cheap goods come in bigger lots, and the lot fits their car.
 */
export const walkInRequest = (
  state: Pick<GameState, 'research' | 'animals' | 'inventory'>,
  seed: number,
): { line: ShipmentLine; payment: number } | null => {
  const known = knownGoods(state);
  const stocked = known.filter((g) => countIn(state.inventory, g) > 0);
  const pool = stocked.length > 0 && hash01(seed * 13 + 1) < 0.7 ? stocked : known;
  const good = pick(pool, hash01(seed * 17 + 3));
  if (!good) return null;
  const cheapness = Math.min(1, 40 / basePrice(good));
  const wanted = Math.round(between(WALK_IN.quantity, hash01(seed * 19 + 5)) * (0.5 + cheapness * 0.5));
  const quantity = Math.max(1, Math.min(wanted, Math.floor(WALK_IN.capacityKg / unitWeight(good))));
  const unit = basePrice(good) * between(WALK_IN.price, hash01(seed * 23 + 7));
  return { line: { good, quantity }, payment: Math.round(unit * quantity) };
};

/** Shipments parked at, or driving to, a dock (each one holds a bay). */
const holdingBay = (state: Pick<GameState, 'shipments'>, dockId: number): number =>
  state.shipments.filter((s) => s.dockId === dockId && s.phase !== 'leaving').length;

/** The first working dock with a free bay. */
const freeDock = (state: GameState): number | null => {
  for (const dock of docksOf(state)) {
    if (dockWorks(state, dock) && holdingBay(state, dock.id) < bayCount(dock)) return dock.id;
  }
  return null;
};

/** A customer sets off at `at` (skipped when no dock is free). */
export const spawnWalkIn = (state: GameState, walkIn: WalkInSlot): GameState => {
  const dockId = freeDock(state);
  if (dockId === null) return state;
  const request = walkInRequest(state, walkIn.day * 101 + walkIn.slot);
  if (!request) return state;
  const arrivesAt = walkIn.at + driveTime(state, dockId);
  const shipment: Shipment = {
    id: state.nextId,
    kind: 'walkin',
    dockId,
    phase: 'enroute',
    setOffAt: walkIn.at,
    arrivesAt,
    deadline: arrivesAt + DOCK.waitMinutes,
    goods: [request.line],
    payment: request.payment,
  };
  return { ...state, shipments: [...state.shipments, shipment], nextId: state.nextId + 1 };
};

// ---------- phases ----------

const isHaulFor = (shipmentId: number) => (t: Task) => t.job?.type === 'shipment' && t.job.shipmentId === shipmentId;

const update = (state: GameState, id: number, change: (s: Shipment) => Shipment): GameState => ({
  ...state,
  shipments: state.shipments.map((s) => (s.id === id ? change(s) : s)),
});

/** Puts goods back into the inventory. */
const restock = (state: GameState, lines: readonly ShipmentLine[]): GameState => ({
  ...state,
  inventory: lines.reduce((inv, line) => addTo(inv, line.good, line.quantity), state.inventory),
});

/** The vehicle drives off at `at` (its loaders stop). */
const depart = (state: GameState, shipment: Shipment, outcome: ShipmentOutcome, at: number, lost?: number): GameState => {
  const dropped = dropTasks(state, isHaulFor(shipment.id));
  const { work: _work, ...rest } = shipment;
  const leaving: Shipment = {
    ...rest,
    phase: 'leaving',
    leftAt: at,
    goneAt: at + driveTime(state, shipment.dockId),
    outcome,
    ...(lost ? { lost } : {}),
  };
  return update(dropped, shipment.id, () => leaving);
};

/**
 * The deadline ran out: a vehicle still waiting just leaves; one being loaded is unloaded again,
 * losing part of the lot when the crew had already started.
 */
const expire = (state: GameState, shipment: Shipment): GameState => {
  if (!shipment.work) return depart(state, shipment, 'expired', shipment.deadline);
  const started = shipment.work.done > 0;
  const back = shipment.goods.map((line) => ({
    good: line.good,
    quantity: line.quantity - (started ? damagedUnits(line.quantity) : 0),
  }));
  const lost = linesUnits(shipment.goods) - linesUnits(back);
  return depart(restock(state, back), shipment, 'expired', shipment.deadline, lost);
};

/** Moves every shipment along the clock: new customers set off, vehicles park, time out and drive away. */
export const stepShipments = (state: GameState, from: number): GameState => {
  const now = state.gameMinutes;
  let next = state;
  for (const walkIn of walkInsBetween(from, now)) next = spawnWalkIn(next, walkIn);
  for (const shipment of next.shipments) {
    let s = next.shipments.find((x) => x.id === shipment.id);
    if (s?.phase === 'enroute' && now >= s.arrivesAt) {
      next = update(next, s.id, (x) => ({ ...x, phase: 'waiting' }));
      s = next.shipments.find((x) => x.id === shipment.id);
    }
    if ((s?.phase === 'waiting' || s?.phase === 'loading') && now >= s.deadline) {
      next = expire(next, s);
    }
  }
  const gone = next.shipments.filter((s) => s.phase === 'leaving' && now >= (s.goneAt ?? 0));
  if (gone.length === 0) return next;
  const ids = new Set(gone.map((s) => s.id));
  return { ...next, shipments: next.shipments.filter((s) => !ids.has(s.id)) };
};

// ---------- loading ----------

/** Queues the loaders of a shipment (one per crew tile not already queued). */
const addHaulTasks = (state: GameState, shipment: Shipment): GameState => {
  const dock = state.structures.find((s) => s.id === shipment.dockId);
  if (!dock) return state;
  const queued = new Set(state.tasks.filter(isHaulFor(shipment.id)).map((t) => t.tile));
  let nextId = state.nextId;
  const added: Task[] = [];
  for (const tile of crewTilesOf(dock)) {
    if (queued.has(tile)) continue;
    added.push({ id: nextId++, kind: 'haul', tile, cropId: null, workerId: null, job: { type: 'shipment', shipmentId: shipment.id } });
  }
  return added.length === 0 ? state : { ...state, tasks: [...state.tasks, ...added], nextId };
};

/** Why a parked vehicle cannot be loaded now, or null when it can. */
export const checkLoading = (state: GameState, shipmentId: number): ActionError | null => {
  const shipment = state.shipments.find((s) => s.id === shipmentId);
  if (!shipment || shipment.phase !== 'waiting') return 'no-shipment';
  if (!hasGoods(state, shipment.goods)) return 'not-enough-goods';
  return state.tasks.length + DOCK.crewMax > MAX_TASKS ? 'queue-full' : null;
};

/**
 * Orders the crew to load a parked vehicle: the lot leaves the inventory now and the loaders are
 * queued ('haul', the Carga activity).
 */
export const startLoading = (state: GameState, shipmentId: number): ActionResult => {
  const error = checkLoading(state, shipmentId);
  if (error) return fail(error);
  const shipment = state.shipments.find((s) => s.id === shipmentId);
  if (!shipment) return fail('no-shipment');
  const loading: Shipment = { ...shipment, phase: 'loading', work: { done: 0, total: loadMinutes(shipment.goods) } };
  const taken: GameState = {
    ...state,
    inventory: shipment.goods.reduce((inv, line) => addTo(inv, line.good, -line.quantity), state.inventory),
  };
  return ok(addHaulTasks(update(taken, shipmentId, () => loading), loading));
};

/** Calls the loading off: the lot goes back to the inventory whole and the vehicle keeps waiting. */
export const cancelLoading = (state: GameState, shipmentId: number): ActionResult => {
  const shipment = state.shipments.find((s) => s.id === shipmentId);
  if (!shipment || shipment.phase !== 'loading') return fail('no-shipment');
  const { work: _work, ...rest } = shipment;
  const back = restock(dropTasks(state, isHaulFor(shipmentId)), shipment.goods);
  return ok(update(back, shipmentId, () => ({ ...rest, phase: 'waiting' })));
};

/** Sends a vehicle away without its load (whatever was staged for it goes back to the inventory). */
export const dismissShipment = (state: GameState, shipmentId: number): ActionResult => {
  const shipment = state.shipments.find((s) => s.id === shipmentId);
  if (!shipment || (shipment.phase !== 'waiting' && shipment.phase !== 'loading')) return fail('no-shipment');
  const back = shipment.work ? restock(state, shipment.goods) : state;
  return ok(depart(back, shipment, 'dismissed', state.gameMinutes));
};

/** Calls off every loading under way (the "cancel everything" button empties the queue). */
export const cancelAllLoading = (state: GameState): GameState =>
  state.shipments.reduce((s, x) => {
    if (x.phase !== 'loading') return s;
    const result = cancelLoading(s, x.id);
    return result.ok ? result.state : s;
  }, state);

/** Adds loading work to a shipment; when it is loaded the customer pays and drives off. */
export const addShipmentWork = (state: GameState, shipmentId: number, minutes: number): GameState => {
  const shipment = state.shipments.find((s) => s.id === shipmentId);
  if (!shipment?.work || minutes <= 0) return state;
  const done = shipment.work.done + minutes;
  if (done < shipment.work.total) return update(state, shipmentId, (s) => ({ ...s, work: { done, total: shipment.work?.total ?? done } }));
  return depart({ ...state, money: state.money + shipment.payment }, shipment, 'sold', state.gameMinutes);
};

/** Share of the loading done (0–1), or null when nothing is being loaded. */
export const loadingProgress = (shipment: Pick<Shipment, 'work'>): number | null =>
  shipment.work ? (shipment.work.total > 0 ? Math.min(1, shipment.work.done / shipment.work.total) : 1) : null;

/**
 * Keeps loaders and shipments consistent (after loading a save): drops loaders without a vehicle
 * being loaded and requeues the loaders of vehicles that lost theirs.
 */
export const repairHaulTasks = (state: GameState): GameState => {
  const loading = new Set(state.shipments.filter((s) => s.phase === 'loading').map((s) => s.id));
  let next = dropTasks(state, (t) => t.kind === 'haul' && (t.job?.type !== 'shipment' || !loading.has(t.job.shipmentId)));
  for (const s of next.shipments) if (s.phase === 'loading') next = addHaulTasks(next, s);
  return next;
};

// ---------- what happened, for the messages ----------

export type DockEvent =
  | { kind: 'arrived'; shipment: Shipment }
  | { kind: 'sold'; shipment: Shipment }
  | { kind: 'expired'; shipment: Shipment };

/** Vehicles that parked, were loaded and paid, or left without their load since `before`. */
export const dockEvents = (before: readonly Shipment[], after: readonly Shipment[]): DockEvent[] => {
  if (before === after) return [];
  const events: DockEvent[] = [];
  for (const s of after) {
    const prev = before.find((x) => x.id === s.id);
    if (s.phase === 'waiting' && (!prev || prev.phase === 'enroute')) events.push({ kind: 'arrived', shipment: s });
    if (s.phase === 'leaving' && prev?.phase !== 'leaving') {
      if (s.outcome === 'sold') events.push({ kind: 'sold', shipment: s });
      else if (s.outcome === 'expired') events.push({ kind: 'expired', shipment: s });
    }
  }
  return events;
};

