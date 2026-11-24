/**
 * Vehicles at the dock. A shipment is saved state with phases: hired freight first waits for
 * daylight and a free bay ('scheduled'), then every vehicle drives in ('enroute'), parks at a bay
 * and waits for the farm ('waiting'), is loaded by the crew like a construction site ('loading':
 * the crew adds work minutes to the shipment, not to themselves) and drives off ('leaving') until
 * it is out of sight. A vehicle never waits past its deadline: if it runs out during loading the
 * crew unloads it again and part of the lot is damaged.
 *
 * Two kinds of vehicles come:
 * - walk-in customers ('walkin'): at a few hours of the day one may set off for the farm
 *   (deterministic by day), wanting one lot of something the farm knows. The player orders the
 *   loading (the lot leaves the inventory then) and they pay on the spot, without freight.
 * - hired freight ('sale'): the farm closed a deal (an offer on a listing or a town order, see
 *   listings.ts), paid the freight and set the goods aside. The freight comes when it can, is
 *   loaded as soon as it parks and the buyer pays when it leaves loaded. If the deal falls through
 *   the goods come back (minus the damage) and the freight is not refunded.
 * - hired freight bringing a purchase ('purchase', see purchases.ts): paid when ordered and
 *   unloaded by the crew as soon as it parks. If nobody unloads it in time it drives back and the
 *   delivery is held in town until the farm pays a new freight.
 */
import { DOCK, FREIGHT, FREIGHT_RULES, LIVESTOCK, SUPPLY_WEIGHT, VEHICLE_BAY, WALK_IN, type BaySize } from '../data/docks';
import { VEHICLES, VEHICLE_LEVELS, type VehicleLevel } from '../data/market';
import { MAX_TASKS } from '../data/workers';
import { MINUTES_PER_DAY } from '../data/world';
import { animalProduct } from './animals';
import { receiveDelivery } from './delivery';
import { bayPoint, bayTile, bayUsable, dockBays, dockWorks, docksOf } from './dock';
import { addTo, basePrice, countIn, unitWeight, type Good } from './market';
import { hash01 } from './random';
import { dropTasks } from './tasks';
import {
  fail,
  ok,
  type ActionError,
  type ActionResult,
  type Delivery,
  type GameState,
  type Order,
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

/** Weight (kg) of a delivery's supplies (the animals come on their own truck). */
export const supplyWeight = (d: Pick<Delivery, 'seeds' | 'medicine' | 'fertilizer' | 'feed'>): number => {
  const count = (counts: Partial<Record<string, number>>): number => Object.values(counts).reduce<number>((sum, n) => sum + (n ?? 0), 0);
  return (
    count(d.seeds) * SUPPLY_WEIGHT.seed +
    count(d.medicine) * SUPPLY_WEIGHT.medicine +
    d.fertilizer * SUPPLY_WEIGHT.fertilizer +
    d.feed * SUPPLY_WEIGHT.feedKg
  );
};

/** Work minutes (at speed 1) to unload a delivery: its supplies like a lot, plus each head. */
export const unloadMinutes = (d: Delivery): number =>
  Math.round(DOCK.loadMinutes.base + DOCK.loadMinutes.perKg * supplyWeight(d) + LIVESTOCK.unloadMinutesPerHead * d.animals.length);

/** Work minutes for a shipment: loading its lot, or unloading its delivery. */
const workMinutes = (s: Shipment): number => (s.delivery ? unloadMinutes(s.delivery) : loadMinutes(s.goods));

/** The inventory holds every line of the lot. */
export const hasGoods = (state: Pick<GameState, 'inventory'>, lines: readonly ShipmentLine[]): boolean =>
  lines.every((line) => countIn(state.inventory, line.good) >= line.quantity);

/** Units lost from a lot unloaded after its deadline: a share of each line, at least one. */
export const damagedUnits = (quantity: number): number =>
  quantity <= 0 ? 0 : Math.min(quantity, Math.max(1, Math.round(quantity * DOCK.damage)));

const takeGoods = (state: GameState, lines: readonly ShipmentLine[]): GameState => ({
  ...state,
  inventory: lines.reduce((inv, line) => addTo(inv, line.good, -line.quantity), state.inventory),
});

/** Puts goods back into the inventory. */
const restock = (state: GameState, lines: readonly ShipmentLine[]): GameState => ({
  ...state,
  inventory: lines.reduce((inv, line) => addTo(inv, line.good, line.quantity), state.inventory),
});

// ---------- routes ----------

/** The routes of a vehicle parking at a bay of a dock (from the road network as it is now). */
export const shipmentRoutes = (state: Pick<GameState, 'tiles' | 'structures'>, dockId: number, bay = 0): CarRoutes | null => {
  const dock = state.structures.find((s) => s.id === dockId);
  return dock ? carRoutes(state.tiles, bayPoint(dock, bay)) : null;
};

/** Game minutes to drive in to a bay (and the same to drive back out). */
const driveTime = (state: Pick<GameState, 'tiles' | 'structures'>, dockId: number, bay = 0): number => {
  const routes = shipmentRoutes(state, dockId, bay);
  return routes ? driveMinutes(routeLength(routes.arrive)) : 0;
};

// ---------- bays ----------

/** Bays taken: by vehicles on their way, parked or being loaded. */
const takenBays = (state: Pick<GameState, 'shipments'>, dockId: number): Set<number> =>
  new Set(
    state.shipments.flatMap((s) =>
      s.dockId === dockId && s.phase !== 'leaving' && s.phase !== 'scheduled' && s.bay !== undefined ? [s.bay] : [],
    ),
  );

/** The first free, working bay of a size at a dock, or null. */
export const freeBay = (state: GameState, dockId: number, size: BaySize): number | null => {
  const dock = state.structures.find((s) => s.id === dockId);
  if (!dock || !dockWorks(state, dock)) return null;
  const taken = takenBays(state, dockId);
  const bays = dockBays(dock);
  for (let i = 0; i < bays.length; i++) {
    const bay = bays[i];
    if (bay && bay.size === size && !taken.has(i) && bayUsable(state.tiles, dock, bay)) return i;
  }
  return null;
};

/** A working dock has a working bay of this size (taken or not). */
export const hasBay = (state: GameState, size: BaySize): boolean =>
  docksOf(state).some((d) => dockWorks(state, d) && dockBays(d).some((b) => b.size === size && bayUsable(state.tiles, d, b)));

/** The bay a shipment's vehicle needs: hired trucks a truck bay, everything else a car bay. */
const baySizeOf = (s: Pick<Shipment, 'vehicle'>): BaySize => (s.vehicle ? VEHICLE_BAY[s.vehicle] : 'car');

/** The first working dock with a free car bay, and the bay. */
const freeCarBay = (state: GameState): { dockId: number; bay: number } | null => {
  for (const dock of docksOf(state)) {
    const bay = freeBay(state, dock.id, 'car');
    if (bay !== null) return { dockId: dock.id, bay };
  }
  return null;
};

/** The dock the farm's freight goes to: the first one reached by road. */
export const workingDock = (state: GameState): number | null => docksOf(state).find((d) => dockWorks(state, d))?.id ?? null;

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

export const between = (range: readonly [number, number], roll: number): number => range[0] + (range[1] - range[0]) * roll;

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

/** A customer sets off at `at` (skipped when no car bay is free, or freight is waiting for one). */
export const spawnWalkIn = (state: GameState, walkIn: WalkInSlot): GameState => {
  if (state.shipments.some((s) => s.phase === 'scheduled' && baySizeOf(s) === 'car')) return state;
  const free = freeCarBay(state);
  if (!free) return state;
  const request = walkInRequest(state, walkIn.day * 101 + walkIn.slot);
  if (!request) return state;
  const arrivesAt = walkIn.at + driveTime(state, free.dockId, free.bay);
  const shipment: Shipment = {
    id: state.nextId,
    kind: 'walkin',
    dockId: free.dockId,
    bay: free.bay,
    phase: 'enroute',
    setOffAt: walkIn.at,
    arrivesAt,
    deadline: arrivesAt + DOCK.waitMinutes,
    goods: [request.line],
    payment: request.payment,
  };
  return { ...state, shipments: [...state.shipments, shipment], nextId: state.nextId + 1 };
};

// ---------- hired freight ----------

/** What the freight costs to take a lot, with the farm's vehicle. */
export const freightCost = (level: VehicleLevel, lines: readonly ShipmentLine[]): number =>
  Math.round(FREIGHT[level].base + FREIGHT[level].perKg * linesWeight(lines));

/** Most kg one freight trip takes with a vehicle. */
export const freightCapacity = (level: VehicleLevel): number => VEHICLES[level].capacity;

/**
 * The freight vehicles that may come: the one the farm chose, or (automatic) every one it has a
 * contract for, smallest first. A truck only comes to a dock with a truck bay.
 */
const freightChoices = (state: GameState): VehicleLevel[] => {
  const contracted = VEHICLE_LEVELS.filter((l) => l <= state.vehicleLevel);
  const choice = state.freightVehicle;
  return choice !== 'auto' && contracted.includes(choice) ? [choice] : contracted;
};

/** The vehicle a load of `kg` comes with: the first choice that fits it and has its bay, or why none. */
export const pickVehicle = (state: GameState, kg: number): VehicleLevel | ActionError => {
  let error: ActionError = 'vehicle-full';
  for (const level of freightChoices(state)) {
    if (kg > freightCapacity(level)) continue;
    if (VEHICLE_BAY[level] === 'truck' && !hasBay(state, 'truck')) {
      error = 'no-truck-bay';
      continue;
    }
    return level;
  }
  return error;
};

/** Most kg one trip can take now (the biggest vehicle that may come). */
export const maxFreightKg = (state: GameState): number =>
  Math.max(
    0,
    ...freightChoices(state)
      .filter((l) => VEHICLE_BAY[l] === 'car' || hasBay(state, 'truck'))
      .map(freightCapacity),
  );

const inFreightHours = (gameMinutes: number): boolean => {
  const hour = (((gameMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY) / 60;
  return hour >= FREIGHT_RULES.hours[0] && hour < FREIGHT_RULES.hours[1];
};

/** The first minute, from `at` on, when freight drives (now in the daytime, else the next morning). */
export const freightStart = (at: number): number => {
  if (inFreightHours(at)) return at;
  const day = Math.floor(at / MINUTES_PER_DAY);
  const morning = day * MINUTES_PER_DAY + FREIGHT_RULES.hours[0] * 60;
  return at < morning ? morning : morning + MINUTES_PER_DAY;
};

/** Why a deal cannot be closed and sent now, or null when it can. */
export const checkSale = (state: GameState, lines: readonly ShipmentLine[]): ActionError | null => {
  if (workingDock(state) === null) return 'dock-no-road';
  if (!hasGoods(state, lines)) return 'not-enough-goods';
  const vehicle = pickVehicle(state, linesWeight(lines));
  if (typeof vehicle === 'string') return vehicle;
  return state.money < freightCost(vehicle, lines) ? 'not-enough-money' : null;
};

/** What every hired freight trip shares; the rest is filled in by `scheduleFreight`. */
type FreightTrip = Pick<Shipment, 'kind' | 'goods' | 'payment' | 'freight' | 'vehicle'> &
  Partial<Pick<Shipment, 'order' | 'delivery' | 'goodsCost' | 'staged'>>;

/**
 * Hires a freight trip to the first working dock: it sets off from the first hour freight drives
 * and must be done within FREIGHT_RULES.windowMinutes of it (or by `due`).
 */
export const scheduleFreight = (state: GameState, trip: FreightTrip, due = Infinity): GameState => {
  const dockId = workingDock(state) ?? docksOf(state)[0]?.id ?? -1;
  const start = freightStart(state.gameMinutes);
  const shipment: Shipment = {
    id: state.nextId,
    dockId,
    phase: 'scheduled',
    setOffAt: start,
    arrivesAt: start,
    deadline: Math.min(start + FREIGHT_RULES.windowMinutes, due),
    ...trip,
  };
  return { ...state, shipments: [...state.shipments, shipment], nextId: state.nextId + 1 };
};

/**
 * Closes a deal: pays the freight, sets the lot aside and schedules the vehicle. It must be loaded
 * within FREIGHT_RULES.windowMinutes of the first hour it can drive (a town order: also before its
 * due day ends).
 */
export const scheduleSale = (state: GameState, lines: ShipmentLine[], payment: number, order?: Order): ActionResult => {
  const error = checkSale(state, lines);
  if (error) return fail(error);
  const vehicle = pickVehicle(state, linesWeight(lines));
  if (typeof vehicle === 'string') return fail(vehicle);
  const freight = freightCost(vehicle, lines);
  const paid = takeGoods({ ...state, money: state.money - freight }, lines);
  const trip: FreightTrip = { kind: 'sale', goods: lines, payment, staged: true, freight, vehicle, ...(order ? { order } : {}) };
  return ok(scheduleFreight(paid, trip, order ? order.dueDay * MINUTES_PER_DAY : Infinity));
};

// ---------- phases ----------

const isHaulFor = (shipmentId: number) => (t: Task) => t.job?.type === 'shipment' && t.job.shipmentId === shipmentId;

const update = (state: GameState, id: number, change: (s: Shipment) => Shipment): GameState => ({
  ...state,
  shipments: state.shipments.map((s) => (s.id === id ? change(s) : s)),
});

/** A town order whose delivery fell through goes back on the board while it is still due. */
const giveOrderBack = (state: GameState, shipment: Shipment): GameState => {
  const order = shipment.order;
  if (!order || order.dueDay * MINUTES_PER_DAY <= state.gameMinutes) return state;
  if (state.orders.some((o) => o.id === order.id)) return state;
  return { ...state, orders: [...state.orders, order] };
};

/**
 * The vehicle drives off at `at` (its loaders stop); one that never came just goes away. Whatever
 * was set aside for it goes back to the inventory (`back`, minus the damage) unless it was sold.
 */
const depart = (
  state: GameState,
  shipment: Shipment,
  outcome: ShipmentOutcome,
  at: number,
  back: readonly ShipmentLine[] = shipment.staged ? shipment.goods : [],
): GameState => {
  const restocked = outcome === 'sold' ? state : giveOrderBack(restock(state, back), shipment);
  const dropped = dropTasks(restocked, isHaulFor(shipment.id));
  const { work: _work, staged: _staged, ...rest } = shipment;
  const lost = outcome === 'sold' || !shipment.staged ? 0 : linesUnits(shipment.goods) - linesUnits(back);
  const drive = shipment.phase === 'scheduled' ? 0 : driveTime(state, shipment.dockId, shipment.bay);
  const leaving: Shipment = {
    ...rest,
    phase: 'leaving',
    leftAt: at,
    goneAt: at + drive,
    outcome,
    ...(lost > 0 ? { lost } : {}),
  };
  return update(dropped, shipment.id, () => leaving);
};

/** A delivery nobody unloaded goes back to town and is held there (still the farm's). */
const hold = (state: GameState, shipment: Shipment, at: number): GameState => {
  const delivery = shipment.delivery;
  if (!delivery) return depart(state, shipment, 'expired', at, []);
  const held = { id: shipment.id, delivery: { ...delivery, heldSince: delivery.heldSince ?? at }, since: at, cost: shipment.goodsCost ?? 0 };
  return depart({ ...state, held: [...state.held, held] }, shipment, 'expired', at, []);
};

/**
 * The deadline ran out (or the freight can no longer make it): the vehicle leaves without its load.
 * A lot the crew had started loading is unloaded again, losing part of it; a purchase is held in town.
 */
const expire = (state: GameState, shipment: Shipment, at: number): GameState => {
  if (shipment.kind === 'purchase') return hold(state, shipment, at);
  if (!shipment.staged) return depart(state, shipment, 'expired', at);
  const started = (shipment.work?.done ?? 0) > 0;
  const back = shipment.goods.map((line) => ({
    good: line.good,
    quantity: line.quantity - (started ? damagedUnits(line.quantity) : 0),
  }));
  return depart(state, shipment, 'expired', at, back);
};

/** Queues the loaders of a shipment (one per loader slot not already queued), on its bay's tile. */
const addHaulTasks = (state: GameState, shipment: Shipment): GameState => {
  const dock = state.structures.find((s) => s.id === shipment.dockId);
  const tile = dock ? bayTile(dock, shipment.bay ?? 0) : -1;
  if (!dock || tile < 0) return state;
  const queued = new Set(state.tasks.flatMap((t) => (t.job?.type === 'shipment' && t.job.shipmentId === shipment.id ? [t.job.slot] : [])));
  let nextId = state.nextId;
  const added: Task[] = [];
  for (let slot = 0; slot < DOCK.crewMax; slot++) {
    if (queued.has(slot)) continue;
    added.push({ id: nextId++, kind: 'haul', tile, cropId: null, workerId: null, job: { type: 'shipment', shipmentId: shipment.id, slot } });
  }
  return added.length === 0 ? state : { ...state, tasks: [...state.tasks, ...added], nextId };
};

/** Starts loading a parked vehicle whose lot is already set aside (or unloading a delivery). */
const beginLoading = (state: GameState, shipment: Shipment): GameState => {
  const loading: Shipment = { ...shipment, phase: 'loading', staged: true, work: { done: 0, total: workMinutes(shipment) } };
  return addHaulTasks(update(state, shipment.id, () => loading), loading);
};

/** Scheduled freight sets off when it may drive and a bay is free, or the deal falls through. */
const dispatch = (state: GameState, shipment: Shipment, now: number): GameState => {
  if (now < shipment.setOffAt || !inFreightHours(now)) return state;
  const drive = driveTime(state, shipment.dockId);
  if (now + drive + FREIGHT_RULES.minLoadMinutes > shipment.deadline) return expire(state, shipment, now);
  const bay = freeBay(state, shipment.dockId, baySizeOf(shipment));
  if (bay === null) return state;
  const arrivesAt = now + driveTime(state, shipment.dockId, bay);
  return update(state, shipment.id, (s) => ({ ...s, phase: 'enroute', bay, setOffAt: now, arrivesAt }));
};

/** A vehicle parks: a customer waits for the player, hired freight is (un)loaded right away. */
const park = (state: GameState, shipment: Shipment): GameState => {
  const parked = update(state, shipment.id, (s) => ({ ...s, phase: 'waiting' }));
  if (shipment.kind === 'walkin' || state.tasks.length + DOCK.crewMax > MAX_TASKS) return parked;
  const s = parked.shipments.find((x) => x.id === shipment.id);
  return s ? beginLoading(parked, s) : parked;
};

/**
 * Moves every shipment along the clock: vehicles that drove out of sight are dropped, new
 * customers set off, freight sets off, vehicles park, time out and drive away.
 */
export const stepShipments = (state: GameState, from: number): GameState => {
  const now = state.gameMinutes;
  let next: GameState = state;
  // Dropped one step after leaving, so the step it leaves in still reports it.
  const gone = next.shipments.filter((s) => s.phase === 'leaving' && (s.goneAt ?? 0) < from);
  if (gone.length > 0) {
    const ids = new Set(gone.map((s) => s.id));
    next = { ...next, shipments: next.shipments.filter((s) => !ids.has(s.id)) };
  }
  for (const shipment of next.shipments) {
    const s = next.shipments.find((x) => x.id === shipment.id);
    if (s?.phase === 'scheduled') next = dispatch(next, s, now);
  }
  for (const walkIn of walkInsBetween(from, now)) next = spawnWalkIn(next, walkIn);
  for (const shipment of next.shipments) {
    let s = next.shipments.find((x) => x.id === shipment.id);
    if (s?.phase === 'enroute' && now >= s.arrivesAt) {
      next = park(next, s);
      s = next.shipments.find((x) => x.id === shipment.id);
    }
    if ((s?.phase === 'waiting' || s?.phase === 'loading') && now >= s.deadline) next = expire(next, s, s.deadline);
  }
  return next;
};

// ---------- loading ----------

/** Why a parked vehicle cannot be loaded now, or null when it can. */
export const checkLoading = (state: GameState, shipmentId: number): ActionError | null => {
  const shipment = state.shipments.find((s) => s.id === shipmentId);
  if (!shipment || shipment.phase !== 'waiting') return 'no-shipment';
  if (shipment.kind === 'walkin' && !hasGoods(state, shipment.goods)) return 'not-enough-goods';
  return state.tasks.length + DOCK.crewMax > MAX_TASKS ? 'queue-full' : null;
};

/**
 * Orders the crew to load a parked vehicle: a customer's lot leaves the inventory now (freight's
 * was set aside already) and the loaders are queued ('haul', the Carga activity).
 */
export const startLoading = (state: GameState, shipmentId: number): ActionResult => {
  const error = checkLoading(state, shipmentId);
  if (error) return fail(error);
  const shipment = state.shipments.find((s) => s.id === shipmentId);
  if (!shipment) return fail('no-shipment');
  return ok(beginLoading(shipment.kind === 'walkin' ? takeGoods(state, shipment.goods) : state, shipment));
};

/** Calls a customer's loading off: the lot goes back to the inventory whole and they keep waiting. */
export const cancelLoading = (state: GameState, shipmentId: number): ActionResult => {
  const shipment = state.shipments.find((s) => s.id === shipmentId);
  if (!shipment || shipment.phase !== 'loading' || shipment.kind !== 'walkin') return fail('no-shipment');
  const { work: _work, staged: _staged, ...rest } = shipment;
  const back = restock(dropTasks(state, isHaulFor(shipmentId)), shipment.goods);
  return ok(update(back, shipmentId, () => ({ ...rest, phase: 'waiting' })));
};

/**
 * Sends a vehicle away without its load, or calls off a sale: whatever was set aside goes back to
 * the inventory (a town order back on the board); freight already paid is not refunded. A purchase
 * can only be called off before its freight sets off (the goods are paid back, the freight is not).
 */
export const dismissShipment = (state: GameState, shipmentId: number): ActionResult => {
  const shipment = state.shipments.find((s) => s.id === shipmentId);
  if (!shipment || shipment.phase === 'leaving' || shipment.phase === 'enroute') return fail('no-shipment');
  if (shipment.kind === 'purchase') {
    if (shipment.phase !== 'scheduled') return fail('no-shipment');
    return ok(depart({ ...state, money: state.money + (shipment.goodsCost ?? 0) }, shipment, 'dismissed', state.gameMinutes, []));
  }
  return ok(depart(state, shipment, 'dismissed', state.gameMinutes));
};

/** Calls off every customer's loading under way (the "cancel everything" button empties the queue). */
export const cancelAllLoading = (state: GameState): GameState =>
  state.shipments.reduce((s, x) => {
    if (x.phase !== 'loading' || x.kind !== 'walkin') return s;
    const result = cancelLoading(s, x.id);
    return result.ok ? result.state : s;
  }, state);

/**
 * Adds (un)loading work to a shipment; when it is done the buyer pays and drives off, or the
 * delivery goes into the stock and the shelters.
 */
export const addShipmentWork = (state: GameState, shipmentId: number, minutes: number): GameState => {
  const shipment = state.shipments.find((s) => s.id === shipmentId);
  const work = shipment?.work;
  if (!shipment || !work || minutes <= 0) return state;
  const done = work.done + minutes;
  if (done < work.total) return update(state, shipmentId, (s) => ({ ...s, work: { done, total: work.total } }));
  if (shipment.delivery) {
    const received = receiveDelivery(state, shipment.delivery, shipment.id);
    return depart(received.state, shipment, 'delivered', state.gameMinutes, []);
  }
  return depart({ ...state, money: state.money + shipment.payment }, shipment, 'sold', state.gameMinutes);
};

/** Share of the loading done (0–1), or null when nothing is being loaded. */
export const loadingProgress = (shipment: Pick<Shipment, 'work'>): number | null =>
  shipment.work ? (shipment.work.total > 0 ? Math.min(1, shipment.work.done / shipment.work.total) : 1) : null;

/**
 * Keeps loaders and shipments consistent (after loading a save, or emptying the queue): drops
 * loaders without a vehicle being loaded and requeues the loaders of vehicles that lost theirs.
 */
export const repairHaulTasks = (state: GameState): GameState => {
  const loading = new Set(state.shipments.filter((s) => s.phase === 'loading').map((s) => s.id));
  let next = dropTasks(
    state,
    (t) => t.kind === 'haul' && (t.job?.type !== 'shipment' || t.job.slot < 0 || !loading.has(t.job.shipmentId)),
  );
  for (const s of next.shipments) if (s.phase === 'loading') next = addHaulTasks(next, s);
  return next;
};

// ---------- what happened, for the messages ----------

export type DockEvent =
  | { kind: 'arrived'; shipment: Shipment }
  | { kind: 'sold'; shipment: Shipment }
  | { kind: 'delivered'; shipment: Shipment }
  | { kind: 'expired'; shipment: Shipment };

/** Vehicles that parked, were loaded and paid, or left without their load since `before`. */
export const dockEvents = (before: readonly Shipment[], after: readonly Shipment[]): DockEvent[] => {
  if (before === after) return [];
  const events: DockEvent[] = [];
  for (const s of after) {
    const prev = before.find((x) => x.id === s.id);
    const parked = s.phase === 'waiting' || s.phase === 'loading';
    if (parked && (!prev || prev.phase === 'enroute' || prev.phase === 'scheduled')) events.push({ kind: 'arrived', shipment: s });
    if (s.phase === 'leaving' && prev?.phase !== 'leaving') {
      if (s.outcome === 'sold') events.push({ kind: 'sold', shipment: s });
      else if (s.outcome === 'delivered') events.push({ kind: 'delivered', shipment: s });
      else if (s.outcome === 'expired') events.push({ kind: 'expired', shipment: s });
    }
  }
  return events;
};
