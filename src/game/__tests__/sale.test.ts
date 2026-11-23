import { describe, expect, it } from 'vitest';
import { DOCK, FREIGHT, FREIGHT_RULES, LISTINGS, OFFERS } from '../../data/docks';
import { VEHICLES } from '../../data/market';
import { MINUTES_PER_DAY } from '../../data/world';
import {
  acceptOffer,
  dailyDemand,
  declineOffer,
  expireOffers,
  generateOffers,
  offerChance,
  postListing,
  referencePrice,
  removeListing,
  repriceListing,
  sendOrder,
} from '../listings';
import { DEFAULT_SETTINGS, deserialize, serialize } from '../save';
import { dismissShipment, freightCost, freightStart, spawnWalkIn, stepShipments } from '../shipments';
import { advanceGame } from '../simulation';
import { createInitialState } from '../state';
import type { ActionResult, GameState, Offer, Order, Shipment } from '../types';
import { clearTasks } from '../workers';

const unwrap = (result: ActionResult): GameState => {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.state;
};

const WHEAT = { kind: 'crop', id: 'wheat' } as const;
const REF = referencePrice(WHEAT);

/** A farm at 9:00 with 40 sacks of wheat. */
const farm = (): GameState => {
  const s = createInitialState();
  return { ...s, gameMinutes: 9 * 60, inventory: { ...s.inventory, produce: { wheat: 40 } } };
};

/** A farm with a wheat listing and an offer on it. */
const withOffer = (quantity = 10, price = REF): { state: GameState; offer: Offer } => {
  const listed = unwrap(postListing(farm(), WHEAT, price, 30));
  const listing = listed.listings[0];
  if (!listing) throw new Error('no listing');
  const offer: Offer = { id: listed.nextId, listingId: listing.id, quantity, price, expiresAt: listed.gameMinutes + 120 };
  return { state: { ...listed, offers: [offer], nextId: listed.nextId + 1 }, offer };
};

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

const sale = (s: GameState): Shipment | undefined => s.shipments.find((x) => x.kind === 'sale');

describe('offers', () => {
  it('get rarer as the price rises and stop at the ceiling', () => {
    expect(offerChance(1)).toBeCloseTo(OFFERS.hourlyChance, 5);
    expect(offerChance(0.5)).toBe(OFFERS.hourlyChance * OFFERS.maxBoost);
    expect(offerChance(1.3)).toBeLessThan(offerChance(1.1));
    expect(offerChance(1.1)).toBeLessThan(offerChance(1));
    expect(offerChance(OFFERS.ceiling)).toBe(0);
    expect(offerChance(3)).toBe(0);
  });

  it('come during the day, deterministically, one open offer per listing, within the day demand', () => {
    const listed = unwrap(postListing({ ...farm(), gameMinutes: 0 }, WHEAT, REF, 500));
    // Night hours: nothing.
    expect(generateOffers(listed, 2)).toBe(listed);
    let s = listed;
    let offered = 0;
    for (let h = OFFERS.hours[0]; h < OFFERS.hours[1]; h++) {
      s = generateOffers(s, h);
      expect(s.offers.length).toBeLessThanOrEqual(1);
      offered += s.offers.reduce((sum, o) => sum + o.quantity, 0);
      s = { ...s, offers: [] };
    }
    expect(offered).toBeGreaterThan(0);
    expect(offered).toBeLessThanOrEqual(dailyDemand(WHEAT, 0));
    // The same hours give the same offers.
    expect(generateOffers(listed, 9)).toEqual(generateOffers(listed, 9));
  });

  it('come more often to a cheap listing than to an expensive one', () => {
    const count = (ratio: number): number => {
      let s = unwrap(postListing({ ...farm(), gameMinutes: 0 }, WHEAT, Math.round(REF * ratio), 500));
      let n = 0;
      for (let h = 0; h < 24 * 30; h++) {
        s = generateOffers(s, h);
        n += s.offers.length;
        s = { ...s, offers: [] };
      }
      return n;
    };
    expect(count(0.8)).toBeGreaterThan(count(1.3));
    expect(count(1.3)).toBeGreaterThan(0);
    expect(count(OFFERS.ceiling)).toBe(0);
  });

  it('expire after a while, and can be turned down', () => {
    const { state, offer } = withOffer();
    expect(expireOffers({ ...state, gameMinutes: offer.expiresAt }).offers).toHaveLength(0);
    expect(unwrap(declineOffer(state, offer.id)).offers).toHaveLength(0);
    expect(declineOffer(state, 999)).toEqual({ ok: false, error: 'no-offer' });
  });
});

describe('listings', () => {
  it('check price, quantity and how many are open, and can be repriced or taken down with their offers', () => {
    const s = farm();
    expect(postListing(s, WHEAT, 0, 5)).toEqual({ ok: false, error: 'invalid-price' });
    expect(postListing(s, WHEAT, 10, 0)).toEqual({ ok: false, error: 'invalid-quantity' });
    expect(postListing(s, WHEAT, 10, LISTINGS.maxQuantity + 1)).toEqual({ ok: false, error: 'invalid-quantity' });
    let full = s;
    for (let i = 0; i < LISTINGS.max; i++) full = unwrap(postListing(full, WHEAT, 10, 5));
    expect(postListing(full, WHEAT, 10, 5)).toEqual({ ok: false, error: 'too-many-listings' });
    // Listing reserves nothing.
    expect(full.inventory.produce.wheat).toBe(40);

    const { state, offer } = withOffer();
    expect(unwrap(repriceListing(state, offer.listingId, 99)).listings[0]?.price).toBe(99);
    const removed = unwrap(removeListing(state, offer.listingId));
    expect(removed.listings).toHaveLength(0);
    expect(removed.offers).toHaveLength(0);
  });
});

describe('closing a deal', () => {
  it('pays the freight, sets the goods aside and shrinks the listing', () => {
    const { state, offer } = withOffer(10);
    const s = unwrap(acceptOffer(state, offer.id));
    const freight = freightCost(1, [{ good: WHEAT, quantity: 10 }]);
    expect(freight).toBe(Math.round(FREIGHT[1].base + FREIGHT[1].perKg * 100));
    expect(s.money).toBe(state.money - freight);
    expect(s.inventory.produce.wheat).toBe(30);
    expect(s.listings[0]?.quantity).toBe(20);
    expect(s.offers).toHaveLength(0);
    expect(sale(s)).toMatchObject({ kind: 'sale', phase: 'scheduled', staged: true, freight, payment: offer.price * 10 });
  });

  it('needs the stock, money for the freight and room on the vehicle', () => {
    const { state, offer } = withOffer(10);
    expect(acceptOffer({ ...state, inventory: { ...state.inventory, produce: { wheat: 5 } } }, offer.id)).toEqual({
      ok: false,
      error: 'not-enough-goods',
    });
    expect(acceptOffer({ ...state, money: 0 }, offer.id)).toEqual({ ok: false, error: 'not-enough-money' });
    const big = withOffer(VEHICLES[1].capacity / 10 + 1);
    const stocked = { ...big.state, inventory: { ...big.state.inventory, produce: { wheat: 100 } } };
    expect(acceptOffer(stocked, big.offer.id)).toEqual({ ok: false, error: 'vehicle-full' });
  });

  it('the freight comes, the crew loads it right away and the buyer pays when it leaves', () => {
    const { state, offer } = withOffer(10);
    const s = unwrap(acceptOffer(state, offer.id));
    const money = s.money;
    const { state: done, events } = run(s, 120);
    expect(events).toContain('arrived:sale');
    expect(events).toContain('sold:sale');
    expect(done.money).toBeGreaterThan(money + offer.price * 10 - 40); // minus a little in wages
    expect(done.inventory.produce.wheat).toBe(30);
  });

  it('closed at night waits for the morning', () => {
    const { state, offer } = withOffer(10);
    const night = unwrap(acceptOffer({ ...state, gameMinutes: 22 * 60 }, offer.id));
    const morning = MINUTES_PER_DAY + FREIGHT_RULES.hours[0] * 60;
    expect(freightStart(22 * 60)).toBe(morning);
    expect(freightStart(3 * 60)).toBe(FREIGHT_RULES.hours[0] * 60);
    expect(sale(night)).toMatchObject({ setOffAt: morning, deadline: morning + FREIGHT_RULES.windowMinutes });
    const still = stepShipments({ ...night, gameMinutes: morning - 1 }, 22 * 60);
    expect(sale(still)?.phase).toBe('scheduled');
    const off = stepShipments({ ...night, gameMinutes: morning + 1 }, morning);
    expect(sale(off)?.phase).toBe('enroute');
  });

  it('falls through when the freight cannot reach the dock in time: the goods come back, the freight does not', () => {
    const { state, offer } = withOffer(10);
    const s = unwrap(acceptOffer(state, offer.id));
    // No roads to the dock (and no crew, so no wages muddle the money).
    const cut = { ...s, workers: [], tiles: s.tiles.map(({ road: _road, ...t }) => t) };
    const deadline = sale(cut)?.deadline ?? 0;
    const late = advanceGame({ ...cut, gameMinutes: deadline - 1 }, 2);
    expect(late.dockEvents.map((e) => e.kind)).toEqual(['expired']);
    expect(late.state.inventory.produce.wheat).toBe(40);
    expect(late.state.money).toBe(s.money);
  });

  it('walk-in customers wait while freight is waiting for the bay', () => {
    const { state, offer } = withOffer(10);
    const s = unwrap(acceptOffer({ ...state, gameMinutes: 22 * 60 }, offer.id));
    expect(spawnWalkIn(s, { at: s.gameMinutes, day: 3, slot: 1 }).shipments).toHaveLength(1);
  });

  it('can be called off: the goods come back, the freight does not', () => {
    const { state, offer } = withOffer(10);
    const s = unwrap(acceptOffer(state, offer.id));
    const id = sale(s)?.id ?? -1;
    const off = unwrap(dismissShipment(s, id));
    expect(off.inventory.produce.wheat).toBe(40);
    expect(off.money).toBe(s.money);
  });

  it('keeps its loaders when the queue is emptied', () => {
    const { state, offer } = withOffer(10);
    const s = unwrap(acceptOffer(state, offer.id));
    const { state: loading } = run(s, 40);
    expect(sale(loading)?.phase).toBe('loading');
    expect(clearTasks(loading).tasks.filter((t) => t.kind === 'haul')).toHaveLength(DOCK.crewMax);
  });
});

describe('town orders', () => {
  const order: Order = { id: 900, shop: 'bakery', good: WHEAT, quantity: 8, reward: 500, dueDay: 3 };

  it('are sent by freight and pay the reward', () => {
    const s = unwrap(sendOrder({ ...farm(), orders: [order] }, 900));
    expect(s.orders).toHaveLength(0);
    expect(sale(s)).toMatchObject({ payment: 500, order });
    expect(s.inventory.produce.wheat).toBe(32);
    expect(sendOrder(s, 900)).toEqual({ ok: false, error: 'no-order' });
    const { events, state: done } = run(s, 120);
    expect(events).toContain('sold:sale');
    expect(done.orders).toHaveLength(0);
  });

  it('go back on the board when the delivery falls through in time', () => {
    const s = unwrap(sendOrder({ ...farm(), orders: [order] }, 900));
    const off = unwrap(dismissShipment(s, sale(s)?.id ?? -1));
    expect(off.orders).toEqual([order]);
    expect(off.inventory.produce.wheat).toBe(40);
  });
});

describe('sale saves', () => {
  it('round-trip listings, offers and freight on its way', () => {
    const { state, offer } = withOffer(10);
    const s = unwrap(acceptOffer({ ...state, offers: [...state.offers] }, offer.id));
    const withMore = { ...s, offers: [{ ...offer, id: s.nextId, quantity: 3 }], nextId: s.nextId + 1 };
    const loaded = deserialize(serialize(withMore, DEFAULT_SETTINGS))?.game;
    expect(loaded?.listings).toEqual(withMore.listings);
    expect(loaded?.offers).toEqual(withMore.offers);
    expect(loaded?.shipments).toEqual(withMore.shipments);
  });

  it('migrate v17: the town load goes back to the inventory', () => {
    const s = farm();
    const v17 = JSON.parse(serialize(s, DEFAULT_SETTINGS)) as { saveVersion: number; game: Record<string, unknown> };
    v17.saveVersion = 17;
    delete v17.game.listings;
    delete v17.game.offers;
    v17.game.cargo = { produce: { wheat: 5, corn: 2 }, products: { egg: 3 } };
    const loaded = deserialize(JSON.stringify(v17))?.game;
    expect(loaded?.inventory.produce).toEqual({ wheat: 45, corn: 2 });
    expect(loaded?.inventory.products).toEqual({ egg: 3 });
    expect(loaded?.listings).toEqual([]);
    expect(loaded && 'cargo' in loaded).toBe(false);
  });
});
