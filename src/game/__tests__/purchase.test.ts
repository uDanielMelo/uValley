import { describe, expect, it } from 'vitest';
import { ANIMALS, FEED, MAX_ANIMALS } from '../../data/animals';
import { CROPS } from '../../data/crops';
import { FREIGHT, HELD, LIVESTOCK, SUPPLY_WEIGHT } from '../../data/docks';
import { MEDICINES } from '../../data/health';
import { VEHICLES } from '../../data/market';
import { MINUTES_PER_DAY } from '../../data/world';
import { purchasePrice } from '../animals';
import { keptSeats, receiveDelivery } from '../delivery';
import { setTimeOfDay, spawnAnimals } from '../dev';
import { tileIndex } from '../grid';
import {
  autoOrderFeed,
  cartGoodsCost,
  chargeHeld,
  checkPurchase,
  emptyCart,
  giveUpHeld,
  heldFee,
  orderPurchase,
  purchaseFreight,
  reorderHeld,
  type Cart,
} from '../purchases';
import { DEFAULT_SETTINGS, deserialize, serialize } from '../save';
import { shelterCapacity } from '../shelters';
import { dismissShipment } from '../shipments';
import { advanceGame } from '../simulation';
import { createInitialState } from '../state';
import { checkDemolish, placeStructure } from '../structures';
import type { ActionResult, Delivery, GameState, Shipment } from '../types';

const unwrap = (result: ActionResult): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

/** A rich farm at 9:00 with a chicken coop. */
const farm = (): GameState =>
  setTimeOfDay(unwrap(placeStructure({ ...createInitialState(), money: 10_000 }, 'chickenCoop', 28, 44)), 9);

const coopOf = (s: GameState) => {
  const coop = s.structures.find((x) => x.type === 'chickenCoop');
  if (!coop) throw new Error('no coop');
  return coop;
};

const supplies: Cart = { ...emptyCart(), seeds: { wheat: 10 }, medicine: { antibiotic: 2 }, fertilizer: 3, feed: 20 };
const chickens = (n: number): Cart => ({
  ...emptyCart(),
  animals: Array.from({ length: n }, () => ({ kind: 'chicken' as const, breed: 'caipira' as const, age: 'adult' as const })),
});

const purchase = (s: GameState): Shipment | undefined => s.shipments.find((x) => x.kind === 'purchase');

const run = (state: GameState, minutes: number) => {
  let s = state;
  const events: string[] = [];
  for (let t = 0; t < minutes; t++) {
    const tick = advanceGame(s, 1);
    s = tick.state;
    events.push(...tick.dockEvents.map((e) => `${e.kind}:${e.shipment.kind}`));
  }
  return { state: s, events };
};

describe('the cart', () => {
  it('costs the goods plus the freight: supplies by kg with the farm vehicle, animals per head', () => {
    expect(cartGoodsCost(supplies)).toBe(
      CROPS.wheat.seedCost * 10 + MEDICINES.antibiotic.price * 2 + 3 * 12 + FEED.pricePerKg * 20,
    );
    const kg = 10 * SUPPLY_WEIGHT.seed + 2 * SUPPLY_WEIGHT.medicine + 3 * SUPPLY_WEIGHT.fertilizer + 20 * SUPPLY_WEIGHT.feedKg;
    expect(purchaseFreight(1, supplies)).toBe(Math.round(FREIGHT[1].base + FREIGHT[1].perKg * kg));
    expect(purchaseFreight(1, chickens(2))).toBe(LIVESTOCK.base + 2 * LIVESTOCK.perHead.chicken);
    expect(cartGoodsCost(chickens(2))).toBe(2 * purchasePrice('chicken', 'caipira', 'adult'));
  });

  it('is checked before ordering', () => {
    const s = farm();
    expect(checkPurchase(s, emptyCart())).toBe('empty-cart');
    expect(checkPurchase(s, { ...emptyCart(), seeds: { carrot: 1 } })).toBe('not-researched');
    expect(checkPurchase(s, { ...emptyCart(), feed: VEHICLES[1].capacity + 1 })).toBe('vehicle-full');
    expect(checkPurchase(s, chickens(LIVESTOCK.maxHeads + 1))).toBe('too-many-heads');
    expect(checkPurchase(createInitialState(), chickens(1))).toBe('no-shelter');
    expect(checkPurchase({ ...s, money: 0 }, supplies)).toBe('not-enough-money');
    const noRoads = { ...s, tiles: s.tiles.map(({ road: _road, ...t }) => t) };
    expect(checkPurchase(noRoads, supplies)).toBe('dock-no-road');
    expect(checkPurchase(s, supplies)).toBeNull();
  });
});

describe('ordering', () => {
  it('pays goods and freight and hires the trip; the crew unloads it into the stock', () => {
    const s = farm();
    const ordered = unwrap(orderPurchase(s, supplies));
    const cost = cartGoodsCost(supplies) + purchaseFreight(1, supplies);
    expect(ordered.money).toBe(s.money - cost);
    expect(purchase(ordered)).toMatchObject({ phase: 'scheduled', goodsCost: cartGoodsCost(supplies) });
    const { state: done, events } = run(ordered, 150);
    expect(events).toContain('arrived:purchase');
    expect(events).toContain('delivered:purchase');
    expect(done.inventory.seeds.wheat).toBe((s.inventory.seeds.wheat ?? 0) + 10);
    expect(done.inventory.medicine.antibiotic).toBe(2);
    expect(done.inventory.fertilizer).toBe(s.inventory.fertilizer + 3);
    expect(done.inventory.feed).toBeGreaterThanOrEqual(20);
  });

  it('keeps the animals seats from the order on, and they move in when unloaded', () => {
    // A coop with three seats left.
    const s = spawnAnimals(farm(), 'chicken', shelterCapacity(coopOf(farm())) - 3);
    const living = s.animals.length;
    const ordered = unwrap(orderPurchase(s, chickens(2)));
    const coop = coopOf(ordered);
    expect(keptSeats(ordered, coop.id)).toBe(2);
    // The kept seats count: one seat is all that is left.
    expect(checkPurchase(ordered, chickens(2))).toBe('shelter-full');
    expect(checkPurchase(ordered, chickens(1))).toBeNull();
    // An empty shelter with seats kept cannot be torn down either.
    const empty = unwrap(orderPurchase(farm(), chickens(1)));
    expect(checkDemolish(empty, tileIndex(coop.x, coop.y))).toBe('reserved');
    const stars = purchase(ordered)?.delivery?.animals.map((a) => a.stars);
    const { state: done } = run({ ...ordered, inventory: { ...ordered.inventory, feed: 100 } }, 150);
    const arrived = done.animals.slice(living);
    expect(arrived).toHaveLength(2);
    expect(arrived.every((a) => a.shelterId === coop.id)).toBe(true);
    expect(arrived.map((a) => a.stars)).toEqual(stars);
    expect(keptSeats(done, coop.id)).toBe(0);
  });

  it('stops at the farm animal limit, counting the animals on their way', () => {
    const s = { ...farm(), animals: spawnAnimals(farm(), 'chicken', MAX_ANIMALS).animals };
    expect(checkPurchase(s, chickens(1))).toBe('max-animals');
  });

  it('can be called off before the freight sets off: the goods are paid back, the freight is not', () => {
    const s = setTimeOfDay(farm(), 22);
    const ordered = unwrap(orderPurchase(s, supplies));
    const off = unwrap(dismissShipment(ordered, purchase(ordered)?.id ?? -1));
    expect(off.money).toBe(s.money - purchaseFreight(1, supplies));
  });
});

describe('held in town', () => {
  /** A purchase that could not reach the dock, now held in town. */
  const held = (cart: Cart): GameState => {
    const ordered = unwrap(orderPurchase(farm(), cart));
    const noRoads = { ...ordered, workers: [], tiles: ordered.tiles.map(({ road: _road, ...t }) => t) };
    const deadline = purchase(noRoads)?.deadline ?? 0;
    const late = advanceGame({ ...noRoads, gameMinutes: deadline - 1 }, 2);
    expect(late.dockEvents.map((e) => e.kind)).toEqual(['expired']);
    return { ...late.state, tiles: ordered.tiles };
  };

  it('a delivery nobody unloads in time is held, still the farm\'s, keeping its seats', () => {
    const s = held(chickens(2));
    expect(s.held).toHaveLength(1);
    expect(s.held[0]?.delivery.animals).toHaveLength(2);
    expect(keptSeats(s, coopOf(s).id)).toBe(2);
  });

  it('comes with a new freight, or is given up for part of its cost', () => {
    const s = held(supplies);
    const id = s.held[0]?.id ?? -1;
    const again = unwrap(reorderHeld(s, id));
    expect(again.held).toHaveLength(0);
    expect(again.money).toBe(s.money - purchaseFreight(1, supplies));
    expect(again.shipments.some((x) => x.kind === 'purchase' && x.phase === 'scheduled')).toBe(true);
    const gone = unwrap(giveUpHeld(s, id));
    expect(gone.money).toBe(s.money + Math.floor(cartGoodsCost(supplies) * HELD.giveUpRefund));
    expect(reorderHeld(gone, id)).toEqual({ ok: false, error: 'no-held' });
  });

  it('held animals cost a fee every midnight', () => {
    const s = held(chickens(2));
    const fee = 2 * ANIMALS.chicken.feedKgPerDay * FEED.pricePerKg * HELD.feeMultiplier;
    expect(heldFee(s)).toBe(fee);
    expect(chargeHeld(s).money).toBe(s.money - fee);
  });

  it('animals that waited too long may arrive sick', () => {
    const s = farm();
    const animals = Array.from({ length: 8 }, () => ({
      kind: 'chicken' as const,
      breed: 'caipira' as const,
      age: 'adult' as const,
      stars: 1 as const,
      shelterId: coopOf(s).id,
      price: 100,
    }));
    const delivery: Delivery = { seeds: {}, medicine: {}, fertilizer: 0, feed: 0, animals };
    const fresh = receiveDelivery(s, delivery, 7);
    expect(fresh.sick).toBe(0);
    const old = receiveDelivery(s, { ...delivery, heldSince: s.gameMinutes - HELD.sickAfterDays * MINUTES_PER_DAY }, 7);
    expect(old.sick).toBeGreaterThan(0);
    expect(old.state.animals.filter((a) => a.health?.noticed)).toHaveLength(old.sick);
  });
});

describe('automatic feed', () => {
  const hungryFarm = (): GameState => ({ ...spawnAnimals(farm(), 'chicken', 4), inventory: { ...farm().inventory, feed: 0 } });

  it('orders feed for the chosen days when the stock runs low, once', () => {
    const s = hungryFarm();
    const daily = 4 * ANIMALS.chicken.feedKgPerDay;
    const first = autoOrderFeed(s);
    expect(first.ordered).toBe(Math.ceil((daily * s.feedOrder.days) / FEED.orderStep) * FEED.orderStep);
    expect(purchase(first.state)?.delivery?.feed).toBe(first.ordered);
    // What is on its way counts: no second order.
    expect(autoOrderFeed(first.state).ordered).toBe(0);
    // Off, or at night: nothing.
    expect(autoOrderFeed({ ...s, feedOrder: { auto: false, days: 3 } }).ordered).toBe(0);
    expect(autoOrderFeed(setTimeOfDay(s, 23)).ordered).toBe(0);
  });

  it('runs in the simulation and the feed arrives before midnight', () => {
    const { state } = run(hungryFarm(), 180);
    expect(state.inventory.feed).toBeGreaterThan(0);
  });
});

describe('purchase saves', () => {
  it('round-trip purchases on their way, held deliveries and the feed order', () => {
    const ordered = unwrap(orderPurchase(farm(), { ...supplies, ...chickens(1), seeds: supplies.seeds }));
    const s = {
      ...ordered,
      held: [{ id: 999, delivery: { ...supplies, animals: [], heldSince: 5 }, since: 5, cost: 40 }],
      feedOrder: { auto: false, days: 5 },
    };
    const loaded = deserialize(serialize(s, DEFAULT_SETTINGS))?.game;
    expect(loaded?.shipments).toEqual(s.shipments);
    expect(loaded?.held).toEqual(s.held);
    expect(loaded?.feedOrder).toEqual(s.feedOrder);
  });

  it('migrate v18: the animals get a few days of feed and automatic orders', () => {
    const s = spawnAnimals(farm(), 'chicken', 3);
    const v18 = JSON.parse(serialize(s, DEFAULT_SETTINGS)) as { saveVersion: number; game: Record<string, unknown> };
    v18.saveVersion = 18;
    delete v18.game.held;
    delete v18.game.feedOrder;
    const inventory = v18.game.inventory as Record<string, unknown>;
    delete inventory.feed;
    const loaded = deserialize(JSON.stringify(v18))?.game;
    expect(loaded?.inventory.feed).toBe(3 * ANIMALS.chicken.feedKgPerDay * FEED.autoDays);
    expect(loaded?.feedOrder).toEqual({ auto: true, days: FEED.autoDays });
    expect(loaded?.held).toEqual([]);
  });
});
