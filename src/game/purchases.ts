/**
 * Buying by freight. Everything physical the farm buys (seeds, fertilizer, medicine, feed and
 * animals) goes into a cart; ordering pays the goods and the freight and hires a trip to the dock
 * (shipments.ts), where the crew unloads it. Animals keep their seats in a shelter from the order
 * on, and come on a hired livestock truck priced per head. A delivery nobody unloads in time is
 * held in town: still the farm's, it needs a new freight (held animals cost a daily fee and may
 * fall sick). Feed can be reordered automatically, so the animals are not left hungry.
 */
import { ANIMALS, FEED } from '../data/animals';
import { CROPS, CROP_IDS, type CropId } from '../data/crops';
import { FREIGHT, FREIGHT_RULES, HELD, LIVESTOCK } from '../data/docks';
import { FERTILIZER } from '../data/fertilizer';
import { MEDICINES, MEDICINE_IDS, type MedicineId } from '../data/health';
import { MINUTES_PER_DAY } from '../data/world';
import { dailyFeedKg, purchasePrice, rollAnimalStars } from './animals';
import { emptyDelivery, pendingFeed, seatAnimals, type AnimalOrder } from './delivery';
import { addCount } from './inventory';
import { isUnlocked } from './research';
import { freightCapacity, scheduleFreight, supplyWeight, workingDock } from './shipments';
import { fail, ok, type ActionError, type ActionResult, type Delivery, type GameState, type HeldPurchase } from './types';
import type { VehicleLevel } from '../data/market';

/** What the player picked in the shop, before ordering (kept by the UI, never saved). */
export interface Cart {
  seeds: Partial<Record<CropId, number>>;
  medicine: Partial<Record<MedicineId, number>>;
  fertilizer: number;
  /** kg */
  feed: number;
  animals: AnimalOrder[];
}

export const emptyCart = (): Cart => ({ seeds: {}, medicine: {}, fertilizer: 0, feed: 0, animals: [] });

const sum = (counts: Partial<Record<string, number>>): number => Object.values(counts).reduce<number>((s, n) => s + (n ?? 0), 0);

export const cartIsEmpty = (cart: Cart): boolean =>
  sum(cart.seeds) + sum(cart.medicine) + cart.fertilizer + cart.feed + cart.animals.length === 0;

/** Adds to (or, with a negative amount, takes from) a count in the cart. */
export const cartAdd = <K extends string>(counts: Partial<Record<K, number>>, id: K, amount: number): Partial<Record<K, number>> =>
  addCount(counts, id, amount);

/** What the goods cost (the freight is apart). */
export const cartGoodsCost = (cart: Cart): number =>
  CROP_IDS.reduce((s, id) => s + CROPS[id].seedCost * (cart.seeds[id] ?? 0), 0) +
  MEDICINE_IDS.reduce((s, id) => s + MEDICINES[id].price * (cart.medicine[id] ?? 0), 0) +
  FERTILIZER.price * cart.fertilizer +
  FEED.pricePerKg * cart.feed +
  cart.animals.reduce((s, a) => s + purchasePrice(a.kind, a.breed, a.age), 0);

/**
 * The freight for a delivery: the supplies with the farm's vehicle (fixed part plus kg), the
 * animals on the livestock truck (fixed part plus each head).
 */
export const purchaseFreight = (level: VehicleLevel, d: Pick<Delivery, 'seeds' | 'medicine' | 'fertilizer' | 'feed'> & { animals: readonly { kind: AnimalOrder['kind'] }[] }): number => {
  const kg = supplyWeight(d);
  const supplies = kg > 0 ? FREIGHT[level].base + FREIGHT[level].perKg * kg : 0;
  const animals = d.animals.length > 0 ? LIVESTOCK.base + d.animals.reduce((s, a) => s + LIVESTOCK.perHead[a.kind], 0) : 0;
  return Math.round(supplies + animals);
};

/** Why the cart cannot be ordered, or null when it can. */
export const checkPurchase = (state: GameState, cart: Cart): ActionError | null => {
  if (cartIsEmpty(cart)) return 'empty-cart';
  if (CROP_IDS.some((id) => (cart.seeds[id] ?? 0) > 0 && !isUnlocked(state, id))) return 'not-researched';
  if (workingDock(state) === null) return 'dock-no-road';
  if (supplyWeight(cart) > freightCapacity(state.vehicleLevel)) return 'vehicle-full';
  if (cart.animals.length > LIVESTOCK.maxHeads) return 'too-many-heads';
  const seated = seatAnimals(state, cart.animals, () => 1, () => 0);
  if (typeof seated === 'string') return seated;
  return state.money < cartGoodsCost(cart) + purchaseFreight(state.vehicleLevel, cart) ? 'not-enough-money' : null;
};

/**
 * Orders the cart: pays the goods and the freight, keeps the animals' seats and hires the trip.
 * The animals' stars are rolled now (from the trip's id).
 */
export const orderPurchase = (state: GameState, cart: Cart): ActionResult => {
  const error = checkPurchase(state, cart);
  if (error) return fail(error);
  const tripId = state.nextId;
  const animals = seatAnimals(
    state,
    cart.animals,
    (i) => rollAnimalStars(tripId * 16 + i),
    (a) => purchasePrice(a.kind, a.breed, a.age),
  );
  if (typeof animals === 'string') return fail(animals);
  const delivery: Delivery = { ...emptyDelivery(), seeds: { ...cart.seeds }, medicine: { ...cart.medicine }, fertilizer: cart.fertilizer, feed: cart.feed, animals };
  const goodsCost = cartGoodsCost(cart);
  const freight = purchaseFreight(state.vehicleLevel, cart);
  const paid = { ...state, money: state.money - goodsCost - freight };
  return ok(
    scheduleFreight(paid, {
      kind: 'purchase',
      goods: [],
      payment: 0,
      freight,
      // Animals come on the livestock truck.
      vehicle: animals.length > 0 ? 3 : state.vehicleLevel,
      delivery,
      goodsCost,
    }),
  );
};

// ---------- held in town ----------

/** Pays a new freight to bring a held delivery. */
export const reorderHeld = (state: GameState, heldId: number): ActionResult => {
  const held = state.held.find((h) => h.id === heldId);
  if (!held) return fail('no-held');
  if (workingDock(state) === null) return fail('dock-no-road');
  const freight = purchaseFreight(state.vehicleLevel, held.delivery);
  if (state.money < freight) return fail('not-enough-money');
  const paid: GameState = { ...state, money: state.money - freight, held: state.held.filter((h) => h.id !== heldId) };
  return ok(
    scheduleFreight(paid, {
      kind: 'purchase',
      goods: [],
      payment: 0,
      freight,
      vehicle: held.delivery.animals.length > 0 ? 3 : state.vehicleLevel,
      delivery: held.delivery,
      goodsCost: held.cost,
    }),
  );
};

/** What giving up a held delivery gives back. */
export const giveUpRefund = (held: Pick<HeldPurchase, 'cost'>): number => Math.floor(held.cost * HELD.giveUpRefund);

/** Gives up a held delivery: part of what it cost comes back and its seats are freed. */
export const giveUpHeld = (state: GameState, heldId: number): ActionResult => {
  const held = state.held.find((h) => h.id === heldId);
  if (!held) return fail('no-held');
  return ok({ ...state, money: state.money + giveUpRefund(held), held: state.held.filter((h) => h.id !== heldId) });
};

/** What keeping the held animals in town costs a day. */
export const heldFee = (state: Pick<GameState, 'held'>): number =>
  state.held.reduce(
    (s, h) => s + h.delivery.animals.reduce((t, a) => t + ANIMALS[a.kind].feedKgPerDay * FEED.pricePerKg * HELD.feeMultiplier, 0),
    0,
  );

/** At midnight the held animals' keep is charged (as far as the money goes). */
export const chargeHeld = (state: GameState): GameState => {
  const fee = heldFee(state);
  return fee > 0 ? { ...state, money: Math.max(0, state.money - fee) } : state;
};

// ---------- automatic feed ----------

/** Feed the farm has and has on its way, in days of what its animals eat. */
export const feedDays = (state: GameState): number => {
  const daily = dailyFeedKg(state);
  return daily > 0 ? (state.inventory.feed + pendingFeed(state)) / daily : Infinity;
};

export const setFeedOrder = (state: GameState, auto: boolean, days: number): ActionResult => {
  if (!Number.isInteger(days) || days < 1 || days > 14) return fail('invalid-quantity');
  return ok({ ...state, feedOrder: { auto, days } });
};

/**
 * During freight hours, when the feed (counting what is coming) runs below
 * FEED.reorderBelowDays, orders enough for `feedOrder.days` (one trip at most, if there is money).
 * Returns the kg ordered (0 when nothing was).
 */
export const autoOrderFeed = (state: GameState): { state: GameState; ordered: number } => {
  const none = { state, ordered: 0 };
  if (!state.feedOrder.auto || state.animals.length === 0) return none;
  const hour = ((state.gameMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY / 60;
  if (hour < FREIGHT_RULES.hours[0] || hour >= FREIGHT_RULES.hours[1]) return none;
  const daily = dailyFeedKg(state);
  const have = state.inventory.feed + pendingFeed(state);
  if (have >= daily * FEED.reorderBelowDays) return none;
  const wanted = Math.ceil((daily * state.feedOrder.days - have) / FEED.orderStep) * FEED.orderStep;
  const feed = Math.min(wanted, Math.floor(freightCapacity(state.vehicleLevel) / FEED.orderStep) * FEED.orderStep);
  if (feed <= 0) return none;
  const ordered = orderPurchase(state, { ...emptyCart(), feed });
  return ordered.ok ? { state: ordered.state, ordered: feed } : none;
};
