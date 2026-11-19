import { describe, expect, it } from 'vitest';
import { CROPS } from '../../data/crops';
import { MARKET_BONUS, ORDERS, PICKUP_DELAY, VEHICLES } from '../../data/market';
import { CAR } from '../../data/roads';
import { MINUTES_PER_DAY } from '../../data/world';
import {
  cargoWeight,
  deliverCargo,
  loadCargo,
  marketPrice,
  nextPickup,
  pickupsBetween,
  refreshOrders,
  unloadCargo,
  upgradeVehicle,
} from '../market';
import { DEFAULT_SETTINGS, deserialize, serialize } from '../save';
import { advanceGame } from '../simulation';
import { createInitialState } from '../state';
import type { ActionResult, GameState, Order } from '../types';

const unwrap = (result: ActionResult): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

const WHEAT = { kind: 'crop', id: 'wheat' } as const;
const MILK = { kind: 'product', id: 'milk' } as const;

const stocked = (): GameState => {
  const s = createInitialState();
  return { ...s, inventory: { ...s.inventory, produce: { wheat: 40 }, products: { milk: 6 } } };
};

describe('loading the vehicle', () => {
  it('moves goods from the inventory up to the vehicle capacity', () => {
    const s = unwrap(loadCargo(stocked(), WHEAT, 40));
    // The pickup carries 250 kg: 25 sacks of wheat (10 kg each).
    expect(s.cargo.produce.wheat).toBe(25);
    expect(s.inventory.produce.wheat).toBe(15);
    expect(cargoWeight(s.cargo)).toBe(250);
    expect(loadCargo(s, MILK, 1)).toEqual({ ok: false, error: 'vehicle-full' });
    const back = unwrap(unloadCargo(s, WHEAT, 5));
    expect(back.cargo.produce.wheat).toBe(20);
    expect(back.inventory.produce.wheat).toBe(20);
  });

  it('a bigger vehicle carries more', () => {
    const s = unwrap(upgradeVehicle({ ...stocked(), money: 10_000 }));
    expect(s.vehicleLevel).toBe(2);
    expect(s.money).toBe(10_000 - VEHICLES[2].price);
    expect(unwrap(loadCargo(s, WHEAT, 40)).cargo.produce.wheat).toBe(40);
    expect(upgradeVehicle({ ...s, money: 0 })).toEqual({ ok: false, error: 'not-enough-money' });
    expect(upgradeVehicle({ ...s, vehicleLevel: 3, money: 1e6 })).toEqual({ ok: false, error: 'max-level' });
  });
});

describe('pickups', () => {
  it('happen PICKUP_DELAY after each car visit hour', () => {
    const [first = 0] = CAR.visitHours;
    expect(nextPickup(0)).toBe(first * 60 + PICKUP_DELAY);
    expect(nextPickup(23 * 60)).toBe(MINUTES_PER_DAY + first * 60 + PICKUP_DELAY);
    expect(pickupsBetween(0, MINUTES_PER_DAY)).toHaveLength(CAR.visitHours.length);
  });

  it('sell the load at the market price', () => {
    const s = unwrap(loadCargo(stocked(), WHEAT, 10));
    const { state, delivery } = deliverCargo(s);
    expect(delivery?.earned).toBe(10 * marketPrice(WHEAT));
    expect(marketPrice(WHEAT)).toBe(Math.round(CROPS.wheat.sellPrice * MARKET_BONUS));
    expect(state.money).toBe(s.money + 10 * marketPrice(WHEAT));
    expect(state.cargo).toEqual({ produce: {}, products: {} });
    expect(deliverCargo(state).delivery).toBeNull();
  });

  it('fill orders the load covers first (they pay the reward)', () => {
    const order: Order = { id: 900, shop: 'bakery', good: WHEAT, quantity: 8, reward: 500, dueDay: 3 };
    const s = unwrap(loadCargo({ ...stocked(), orders: [order] }, WHEAT, 10));
    const { state, delivery } = deliverCargo(s);
    expect(delivery?.filled.map((o) => o.id)).toEqual([900]);
    expect(delivery?.earned).toBe(500 + 2 * marketPrice(WHEAT));
    expect(state.orders).toHaveLength(0);
  });

  it('a load short of an order sells at the market and the order stays', () => {
    const order: Order = { id: 901, shop: 'bakery', good: WHEAT, quantity: 20, reward: 900, dueDay: 3 };
    const s = unwrap(loadCargo({ ...stocked(), orders: [order] }, WHEAT, 10));
    const { state, delivery } = deliverCargo(s);
    expect(delivery?.filled).toHaveLength(0);
    expect(state.orders).toHaveLength(1);
  });

  it('run in the simulation when the clock passes them', () => {
    const s = unwrap(loadCargo(stocked(), WHEAT, 10));
    const [first = 0] = CAR.visitHours;
    const tick = advanceGame({ ...s, gameMinutes: first * 60 }, PICKUP_DELAY + 1);
    expect(tick.deliveries).toHaveLength(1);
    expect(tick.state.cargo.produce.wheat).toBeUndefined();
  });
});

describe('orders', () => {
  it('appear at midnight (deterministically), at most ORDERS.maxOpen, and expire after their due day', () => {
    let s = createInitialState();
    for (let day = 2; day < 30; day++) s = refreshOrders(s, day);
    expect(s.orders.length).toBeGreaterThan(0);
    expect(s.orders.length).toBeLessThanOrEqual(ORDERS.maxOpen);
    for (const o of s.orders) {
      expect(o.quantity).toBeGreaterThan(0);
      expect(o.reward).toBeGreaterThan(0);
    }
    const again = refreshOrders(createInitialState(), 5);
    expect(refreshOrders(createInitialState(), 5)).toEqual(again);
    const late = refreshOrders(s, 1000);
    expect(late.orders.every((o) => o.dueDay >= 1000)).toBe(true);
  });
});

describe('save', () => {
  it('keeps the vehicle, the load and the orders', () => {
    let s = unwrap(upgradeVehicle({ ...stocked(), money: 10_000 }));
    s = unwrap(loadCargo(s, MILK, 3));
    s = refreshOrders(refreshOrders(s, 2), 3);
    expect(deserialize(serialize(s, DEFAULT_SETTINGS))?.game).toEqual(s);
  });

  it('migrates v12 saves: the starting pickup, nothing loaded, no orders', () => {
    const { vehicleLevel: _v, cargo: _c, orders: _o, ...v12 } = createInitialState();
    const raw = JSON.stringify({ saveVersion: 12, savedAt: 0, game: v12, settings: DEFAULT_SETTINGS });
    const loaded = deserialize(raw)?.game;
    expect(loaded?.vehicleLevel).toBe(1);
    expect(loaded?.cargo).toEqual({ produce: {}, products: {} });
    expect(loaded?.orders).toEqual([]);
  });
});
