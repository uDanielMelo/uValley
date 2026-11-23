import { describe, expect, it } from 'vitest';
import { CROPS } from '../../data/crops';
import { MARKET_BONUS, ORDERS, VEHICLES } from '../../data/market';
import { marketPrice, refreshOrders, upgradeVehicle } from '../market';
import { DEFAULT_SETTINGS, deserialize, serialize } from '../save';
import { createInitialState } from '../state';
import type { ActionResult, GameState } from '../types';

const unwrap = (result: ActionResult): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

const WHEAT = { kind: 'crop', id: 'wheat' } as const;

describe('town prices', () => {
  it('pay the reference price plus the market bonus', () => {
    expect(marketPrice(WHEAT)).toBe(Math.round(CROPS.wheat.sellPrice * MARKET_BONUS));
  });
});

describe('the vehicle', () => {
  it('is traded up at the dealership', () => {
    const s = unwrap(upgradeVehicle({ ...createInitialState(), money: 10_000 }));
    expect(s.vehicleLevel).toBe(2);
    expect(s.money).toBe(10_000 - VEHICLES[2].price);
    expect(upgradeVehicle({ ...s, money: 0 })).toEqual({ ok: false, error: 'not-enough-money' });
    expect(upgradeVehicle({ ...s, vehicleLevel: 3, money: 1e6 })).toEqual({ ok: false, error: 'max-level' });
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
  it('keeps the vehicle and the orders', () => {
    let s = unwrap(upgradeVehicle({ ...createInitialState(), money: 10_000 }));
    s = refreshOrders(refreshOrders(s, 2), 3);
    expect(deserialize(serialize(s, DEFAULT_SETTINGS))?.game).toEqual(s);
  });
});
