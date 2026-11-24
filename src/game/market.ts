/**
 * Goods, town prices, town orders and the farm's vehicle. Selling itself goes through the dock
 * (listings.ts and shipments.ts). Orders appear at midnight and expire after their due day.
 * Everything is deterministic (hash01 of the day).
 */
import { ANIMAL_PRODUCTS, ANIMAL_PRODUCT_IDS } from '../data/animals';
import { CROPS, CROP_IDS } from '../data/crops';
import {
  CROP_WEIGHT,
  MARKET_BONUS,
  ORDERS,
  PRODUCT_WEIGHT,
  TOWN_SHOPS,
  TOWN_SHOP_IDS,
  VEHICLES,
  type OrderGood,
  type VehicleLevel,
} from '../data/market';
import { addCount } from './inventory';
import { hash01 } from './random';
import { fail, ok, type ActionResult, type GameState, type Inventory } from './types';

export type Good = OrderGood;

export const ALL_GOODS: readonly Good[] = [
  ...CROP_IDS.map((id): Good => ({ kind: 'crop', id })),
  ...ANIMAL_PRODUCT_IDS.map((id): Good => ({ kind: 'product', id })),
];

export const sameGood = (a: Good, b: Good): boolean => a.kind === b.kind && a.id === b.id;

export const goodKey = (good: Good): string => `${good.kind}:${good.id}`;

export const unitWeight = (good: Good): number => (good.kind === 'crop' ? CROP_WEIGHT[good.id] : PRODUCT_WEIGHT[good.id]);

/** The reference price of one unit (what a walk-in customer pays, give or take). */
export const basePrice = (good: Good): number =>
  good.kind === 'crop' ? CROPS[good.id].sellPrice : ANIMAL_PRODUCTS[good.id].sellPrice;

/** What the town market pays for one unit. */
export const marketPrice = (good: Good): number => Math.round(basePrice(good) * MARKET_BONUS);

/** Units of a good in the inventory. */
export const countIn = (holder: Pick<Inventory, 'produce' | 'products'>, good: Good): number =>
  good.kind === 'crop' ? (holder.produce[good.id] ?? 0) : (holder.products[good.id] ?? 0);

export const addTo = <T extends Pick<Inventory, 'produce' | 'products'>>(holder: T, good: Good, delta: number): T =>
  good.kind === 'crop'
    ? { ...holder, produce: addCount(holder.produce, good.id, delta) }
    : { ...holder, products: addCount(holder.products, good.id, delta) };

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

/** Which vehicle the freight comes with: 'auto' (the smallest that fits) or one with a contract. */
export const setFreightVehicle = (state: GameState, choice: 'auto' | VehicleLevel): ActionResult => {
  if (choice !== 'auto' && choice > state.vehicleLevel) return fail('max-level');
  return ok({ ...state, freightVehicle: choice });
};

/** Signs a contract for the next freight vehicle at the dealership. */
export const upgradeVehicle = (state: GameState): ActionResult => {
  const next = nextVehicle(state.vehicleLevel);
  if (!next) return fail('max-level');
  const price = VEHICLES[next].price;
  if (state.money < price) return fail('not-enough-money');
  return ok({ ...state, money: state.money - price, vehicleLevel: next });
};
