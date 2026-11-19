/**
 * Selling in town. The player loads goods onto the farm's vehicle (up to its capacity in kg);
 * at the next car visit the load is picked up and paid: open orders that the load covers are
 * filled first (they pay more), the rest sells at the town market. Orders appear at midnight and
 * expire after their due day. Everything is deterministic (hash01 of the day).
 */
import { ANIMAL_PRODUCTS, ANIMAL_PRODUCT_IDS } from '../data/animals';
import { CROPS, CROP_IDS } from '../data/crops';
import {
  CROP_WEIGHT,
  MARKET_BONUS,
  ORDERS,
  PICKUP_DELAY,
  PRODUCT_WEIGHT,
  TOWN_SHOPS,
  TOWN_SHOP_IDS,
  VEHICLES,
  type OrderGood,
  type VehicleLevel,
} from '../data/market';
import { CAR } from '../data/roads';
import { MINUTES_PER_DAY } from '../data/world';
import { addCount } from './inventory';
import { hash01 } from './random';
import { fail, ok, type ActionResult, type Cargo, type GameState, type Inventory, type Order } from './types';

export type Good = OrderGood;

export const ALL_GOODS: readonly Good[] = [
  ...CROP_IDS.map((id): Good => ({ kind: 'crop', id })),
  ...ANIMAL_PRODUCT_IDS.map((id): Good => ({ kind: 'product', id })),
];

export const sameGood = (a: Good, b: Good): boolean => a.kind === b.kind && a.id === b.id;

export const goodKey = (good: Good): string => `${good.kind}:${good.id}`;

export const unitWeight = (good: Good): number => (good.kind === 'crop' ? CROP_WEIGHT[good.id] : PRODUCT_WEIGHT[good.id]);

/** The shipping bin price of one unit. */
export const basePrice = (good: Good): number =>
  good.kind === 'crop' ? CROPS[good.id].sellPrice : ANIMAL_PRODUCTS[good.id].sellPrice;

/** What the town market pays for one unit. */
export const marketPrice = (good: Good): number => Math.round(basePrice(good) * MARKET_BONUS);

export const emptyCargo = (): Cargo => ({ produce: {}, products: {} });

/** Units of a good in the inventory or in a load. */
export const countIn = (holder: Pick<Inventory, 'produce' | 'products'>, good: Good): number =>
  good.kind === 'crop' ? (holder.produce[good.id] ?? 0) : (holder.products[good.id] ?? 0);

const addTo = <T extends Pick<Inventory, 'produce' | 'products'>>(holder: T, good: Good, delta: number): T =>
  good.kind === 'crop'
    ? { ...holder, produce: addCount(holder.produce, good.id, delta) }
    : { ...holder, products: addCount(holder.products, good.id, delta) };

export const cargoUnits = (cargo: Cargo): number =>
  ALL_GOODS.reduce((sum, good) => sum + countIn(cargo, good), 0);

export const cargoWeight = (cargo: Cargo): number =>
  ALL_GOODS.reduce((sum, good) => sum + countIn(cargo, good) * unitWeight(good), 0);

export const vehicleCapacity = (state: Pick<GameState, 'vehicleLevel'>): number => VEHICLES[state.vehicleLevel].capacity;

/** Moves units from the inventory onto the vehicle (as many as fit, up to `quantity`). */
export const loadCargo = (state: GameState, good: Good, quantity: number): ActionResult => {
  if (!Number.isInteger(quantity) || quantity <= 0) return fail('invalid-quantity');
  const owned = countIn(state.inventory, good);
  if (owned <= 0) return fail('no-produce');
  const room = Math.floor((vehicleCapacity(state) - cargoWeight(state.cargo)) / unitWeight(good));
  const amount = Math.min(quantity, owned, room);
  if (amount <= 0) return fail('vehicle-full');
  return ok({ ...state, inventory: addTo(state.inventory, good, -amount), cargo: addTo(state.cargo, good, amount) });
};

/** Moves units back from the vehicle to the inventory. */
export const unloadCargo = (state: GameState, good: Good, quantity: number): ActionResult => {
  const loaded = countIn(state.cargo, good);
  const amount = Math.min(Math.max(0, Math.floor(quantity)), loaded);
  if (amount <= 0) return fail('invalid-quantity');
  return ok({ ...state, inventory: addTo(state.inventory, good, amount), cargo: addTo(state.cargo, good, -amount) });
};

/** Game minutes of the day when loads are picked up. */
export const PICKUP_MINUTES: readonly number[] = CAR.visitHours.map((h) => h * 60 + PICKUP_DELAY);

/** The next pickup at or after a game minute. */
export const nextPickup = (gameMinutes: number): number => {
  const day = Math.floor(gameMinutes / MINUTES_PER_DAY);
  for (let d = day; d <= day + 1; d++) {
    for (const m of PICKUP_MINUTES) {
      const at = d * MINUTES_PER_DAY + m;
      if (at >= gameMinutes) return at;
    }
  }
  return (day + 1) * MINUTES_PER_DAY + (PICKUP_MINUTES[0] ?? 0);
};

/** Pickups in the interval (from, to]. */
export const pickupsBetween = (from: number, to: number): number[] => {
  const result: number[] = [];
  let t = nextPickup(from + 1e-6);
  while (t <= to) {
    result.push(t);
    t = nextPickup(t + 1e-6);
  }
  return result;
};

export interface Delivery {
  /** Coins from the market and orders. */
  earned: number;
  units: number;
  /** Orders the load filled. */
  filled: Order[];
}

/** The load is picked up and paid: orders it covers first, the rest at the market. */
export const deliverCargo = (state: GameState): { state: GameState; delivery: Delivery | null } => {
  if (cargoUnits(state.cargo) === 0) return { state, delivery: null };
  let cargo = state.cargo;
  let earned = 0;
  const filled: Order[] = [];
  for (const order of state.orders) {
    if (countIn(cargo, order.good) < order.quantity) continue;
    cargo = addTo(cargo, order.good, -order.quantity);
    earned += order.reward;
    filled.push(order);
  }
  for (const good of ALL_GOODS) earned += countIn(cargo, good) * marketPrice(good);
  const done = new Set(filled.map((o) => o.id));
  return {
    state: {
      ...state,
      money: state.money + earned,
      cargo: emptyCargo(),
      orders: state.orders.filter((o) => !done.has(o.id)),
    },
    delivery: { earned, units: cargoUnits(state.cargo), filled },
  };
};

const pick = <T>(list: readonly T[], roll: number): T | undefined => list[Math.floor(roll * list.length)];

const between = (range: readonly [number, number], roll: number): number => range[0] + (range[1] - range[0]) * roll;

/** At the start of `day`: expired orders go away and a new one may appear. */
export const refreshOrders = (state: GameState, day: number): GameState => {
  let orders = state.orders.filter((o) => o.dueDay >= day);
  let nextId = state.nextId;
  if (orders.length < ORDERS.maxOpen && hash01(day * 4111 + 17) < ORDERS.chance) {
    const shop = pick(TOWN_SHOP_IDS, hash01(day * 3001 + 5)) ?? 'bakery';
    // Only goods the farm can produce (crops it has researched).
    const wants = TOWN_SHOPS[shop].wants.filter((g) => g.kind === 'product' || state.research.unlocked.includes(g.id));
    const good = pick(wants, hash01(day * 6007 + 9));
    if (good) {
      // Cheap goods come in bigger lots.
      const cheapness = Math.min(1, 40 / basePrice(good));
      const quantity = Math.max(2, Math.round(between(ORDERS.quantity, hash01(day * 7013 + 3)) * (0.5 + cheapness * 0.5)));
      const reward = Math.round(quantity * basePrice(good) * between(ORDERS.reward, hash01(day * 8017 + 1)));
      const dueDay = day + Math.round(between(ORDERS.days, hash01(day * 9011 + 7)));
      orders = [...orders, { id: nextId, shop, good, quantity, reward, dueDay }];
      nextId++;
    }
  }
  if (orders.length === state.orders.length && nextId === state.nextId) return state;
  return { ...state, orders, nextId };
};

export const nextVehicle = (level: VehicleLevel): VehicleLevel | null => (level < 3 ? ((level + 1) as VehicleLevel) : null);

/** Trades the vehicle up at the dealership. */
export const upgradeVehicle = (state: GameState): ActionResult => {
  const next = nextVehicle(state.vehicleLevel);
  if (!next) return fail('max-level');
  const price = VEHICLES[next].price;
  if (state.money < price) return fail('not-enough-money');
  return ok({ ...state, money: state.money - price, vehicleLevel: next });
};
