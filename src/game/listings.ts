/**
 * Selling by listing. The farm puts goods up for sale at a price per unit; nothing happens right
 * away. Each hour of the day (OFFERS.hours) a listing may get an offer from a town buyer: the
 * cheaper the listing against the town price, the likelier, and from OFFERS.ceiling × that price
 * up, never. Offers fit the town's demand for the good that day (deterministic by day and good)
 * and stay open for a while. Closing an offer (or sending a town order) hires the freight and sets
 * the goods aside (shipments.ts); the buyer pays when the vehicle leaves loaded.
 * Listings reserve nothing: the stock is only checked when an offer is closed.
 */
import { CROP_IDS } from '../data/crops';
import { ANIMAL_PRODUCT_IDS } from '../data/animals';
import { LISTINGS, OFFERS } from '../data/docks';
import { MINUTES_PER_DAY } from '../data/world';
import { basePrice, goodKey, marketPrice, sameGood, unitWeight, type Good } from './market';
import { hash01 } from './random';
import { between, freightCapacity, scheduleSale } from './shipments';
import { fail, ok, type ActionResult, type GameState, type Listing, type Offer } from './types';

const isPositiveInt = (n: number): boolean => Number.isInteger(n) && n > 0;

/** The price listings are compared against: what the town market pays. */
export const referencePrice = (good: Good): number => marketPrice(good);

/**
 * Chance per hour that a listing at `ratio` × the reference price gets an offer: falls with the
 * square of the price over the reference and is zero from the ceiling up.
 */
export const offerChance = (ratio: number): number => {
  if (ratio >= OFFERS.ceiling) return 0;
  const pull = ((OFFERS.ceiling - ratio) / (OFFERS.ceiling - 1)) ** 2;
  return OFFERS.hourlyChance * Math.min(OFFERS.maxBoost, pull);
};

/** A stable number per good, for seeding. */
const goodSeed = (good: Good): number =>
  good.kind === 'crop' ? CROP_IDS.indexOf(good.id) + 1 : 100 + ANIMAL_PRODUCT_IDS.indexOf(good.id);

/** Units of a good the town buys on a day (0-based): cheap goods sell in bigger amounts. */
export const dailyDemand = (good: Good, day: number): number => {
  const cheapness = Math.min(1, 40 / basePrice(good));
  return Math.max(1, Math.round(between(OFFERS.demand, hash01(day * 6151 + goodSeed(good) * 97 + 13)) * (0.5 + cheapness * 0.5)));
};

// ---------- listings ----------

/** Puts goods up for sale. */
export const postListing = (state: GameState, good: Good, price: number, quantity: number): ActionResult => {
  if (!isPositiveInt(price)) return fail('invalid-price');
  if (!isPositiveInt(quantity) || quantity > LISTINGS.maxQuantity) return fail('invalid-quantity');
  if (state.listings.length >= LISTINGS.max) return fail('too-many-listings');
  const listing: Listing = {
    id: state.nextId,
    good,
    price,
    quantity,
    postedAt: state.gameMinutes,
    offered: { day: Math.floor(state.gameMinutes / MINUTES_PER_DAY), units: 0 },
  };
  return ok({ ...state, listings: [...state.listings, listing], nextId: state.nextId + 1 });
};

/** Changes a listing's price (its open offer keeps the price it was made at). */
export const repriceListing = (state: GameState, listingId: number, price: number): ActionResult => {
  if (!isPositiveInt(price)) return fail('invalid-price');
  if (!state.listings.some((l) => l.id === listingId)) return fail('no-listing');
  return ok({ ...state, listings: state.listings.map((l) => (l.id === listingId ? { ...l, price } : l)) });
};

/** Takes a listing down, with its open offers. */
export const removeListing = (state: GameState, listingId: number): ActionResult => {
  if (!state.listings.some((l) => l.id === listingId)) return fail('no-listing');
  return ok({
    ...state,
    listings: state.listings.filter((l) => l.id !== listingId),
    offers: state.offers.filter((o) => o.listingId !== listingId),
  });
};

// ---------- offers ----------

/**
 * The offers buyers make in the hour starting at absolute hour `hour`: at most one open offer per
 * listing, for part of the day's demand left (and what one freight trip takes).
 */
export const generateOffers = (state: GameState, hour: number): GameState => {
  const hourOfDay = ((hour % 24) + 24) % 24;
  if (hourOfDay < OFFERS.hours[0] || hourOfDay >= OFFERS.hours[1]) return state;
  const day = Math.floor(hour / 24);
  let nextId = state.nextId;
  const offers: Offer[] = [];
  /** Units offered in this very hour, by good. */
  const fresh = new Map<string, number>();
  const listings = state.listings.map((listing) => {
    if (state.offers.some((o) => o.listingId === listing.id)) return listing;
    const ratio = listing.price / referencePrice(listing.good);
    if (hash01(hour * 977 + listing.id * 131 + 3) >= offerChance(ratio)) return listing;
    // Other listings of the same good share the day's demand.
    const offeredToday = state.listings
      .filter((l) => sameGood(l.good, listing.good) && l.offered.day === day)
      .reduce((sum, l) => sum + l.offered.units, fresh.get(goodKey(listing.good)) ?? 0);
    const left = dailyDemand(listing.good, day) - offeredToday;
    const wanted = Math.max(1, Math.round(dailyDemand(listing.good, day) * between(OFFERS.share, hash01(hour * 389 + listing.id * 71 + 5))));
    const fits = Math.floor(freightCapacity(state.vehicleLevel) / unitWeight(listing.good));
    const quantity = Math.min(wanted, left, listing.quantity, fits);
    if (quantity <= 0) return listing;
    fresh.set(goodKey(listing.good), (fresh.get(goodKey(listing.good)) ?? 0) + quantity);
    offers.push({ id: nextId++, listingId: listing.id, quantity, price: listing.price, expiresAt: hour * 60 + OFFERS.validMinutes });
    const units = (listing.offered.day === day ? listing.offered.units : 0) + quantity;
    return { ...listing, offered: { day, units } };
  });
  if (offers.length === 0) return state;
  return { ...state, listings, offers: [...state.offers, ...offers], nextId };
};

/** Offers past their time are gone. */
export const expireOffers = (state: GameState): GameState => {
  const offers = state.offers.filter((o) => o.expiresAt > state.gameMinutes);
  return offers.length === state.offers.length ? state : { ...state, offers };
};

/** Closes an offer: the freight is hired and paid, the goods set aside, the listing shrinks. */
export const acceptOffer = (state: GameState, offerId: number): ActionResult => {
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer) return fail('no-offer');
  const listing = state.listings.find((l) => l.id === offer.listingId);
  if (!listing) return fail('no-listing');
  const sold = scheduleSale(state, [{ good: listing.good, quantity: offer.quantity }], offer.price * offer.quantity);
  if (!sold.ok) return sold;
  const left = listing.quantity - offer.quantity;
  return ok({
    ...sold.state,
    offers: sold.state.offers.filter((o) => o.id !== offerId),
    listings:
      left > 0
        ? sold.state.listings.map((l) => (l.id === listing.id ? { ...l, quantity: left } : l))
        : sold.state.listings.filter((l) => l.id !== listing.id),
  });
};

/** Turns an offer down. */
export const declineOffer = (state: GameState, offerId: number): ActionResult => {
  if (!state.offers.some((o) => o.id === offerId)) return fail('no-offer');
  return ok({ ...state, offers: state.offers.filter((o) => o.id !== offerId) });
};

// ---------- town orders ----------

/** Sends a town order from the dock: the freight takes the whole lot and the shop pays the reward. */
export const sendOrder = (state: GameState, orderId: number): ActionResult => {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return fail('no-order');
  const sold = scheduleSale(state, [{ good: order.good, quantity: order.quantity }], order.reward, order);
  if (!sold.ok) return sold;
  return ok({ ...sold.state, orders: sold.state.orders.filter((o) => o.id !== orderId) });
};
