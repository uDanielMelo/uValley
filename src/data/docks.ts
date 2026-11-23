/** The dock: bays where vehicles park, customers who drive in, loading by the crew. Balancing only. */

import type { VehicleLevel } from './market';

/** Dock levels (reached by upgrades in a later stage): how many vehicles can park at once. */
export type DockLevel = 1;

export interface DockLevelDef {
  label: string;
  /** Car bays (one vehicle each). */
  carBays: number;
}

export const DOCK_LEVELS: Record<DockLevel, DockLevelDef> = {
  1: { label: 'Doca simples', carBays: 1 },
};

export const DOCK = {
  /** Game minutes a vehicle waits at the dock before driving off, loaded or not. */
  waitMinutes: 120,
  /**
   * Share of a lot lost when the deadline runs out during loading: the crew unloads it again and
   * this much is damaged (rounded, at least one unit).
   */
  damage: 0.15,
  /** Most workers loading one vehicle (each takes a spot along the bay). */
  crewMax: 3,
  /** Work minutes (at speed 1) to load a vehicle: a fixed part plus a part per kg. */
  loadMinutes: { base: 15, perKg: 0.25 },
} as const;

/** Customers who drive in on their own to buy one good, paying on the spot (no freight). */
export const WALK_IN = {
  /** Hours of the day when a customer may set off for the farm. */
  hours: [8, 11, 14, 17],
  /** Chance a customer comes at each of those hours (when a bay is free). */
  chance: 0.6,
  /** A customer sets off up to this many minutes after the hour. */
  jitterMinutes: 40,
  /** Units asked, scaled by how cheap the good is (cheap goods in bigger lots). */
  quantity: [3, 10] as const,
  /** Pays the shipping price × this range per unit. */
  price: [0.95, 1.2] as const,
  /** Most kg a customer's car takes. */
  capacityKg: 200,
} as const;

// ---------- selling by listing: offers and hired freight ----------

/** What the hired freight costs per trip: a fixed part plus a part per kg, by the farm's vehicle level. */
export const FREIGHT: Record<VehicleLevel, { base: number; perKg: number }> = {
  // The pickup is almost free, so a small farm can always sell.
  1: { base: 4, perKg: 0.04 },
  2: { base: 12, perKg: 0.03 },
  3: { base: 30, perKg: 0.02 },
};

export const FREIGHT_RULES = {
  /** Freight only drives between these hours (a deal closed at night waits for the morning). */
  hours: [6, 19] as const,
  /** From the first hour the freight can drive, the deal has this long to be loaded. */
  windowMinutes: 300,
  /** It only sets off when this much time is left after arriving (otherwise the deal falls through). */
  minLoadMinutes: 40,
} as const;

/** The farm's listings ("Vender" tab). */
export const LISTINGS = {
  /** Most listings open at once. */
  max: 6,
  /** Most units in one listing. */
  maxQuantity: 500,
} as const;

/**
 * Offers on listings. Each hour of the day a listing may get an offer; the chance falls as its price
 * rises above the reference (the town market price) and is zero from `ceiling` × the reference up.
 * Offers fit the town's demand for that good that day.
 */
export const OFFERS = {
  /** Offers come between these hours. */
  hours: [7, 18] as const,
  /** Chance of an offer in an hour at the reference price. */
  hourlyChance: 0.3,
  /** At this many times the reference nobody buys. */
  ceiling: 1.6,
  /** Cheap listings get at most this many times the chance. */
  maxBoost: 2,
  /** Game minutes an offer stays open. */
  validMinutes: 180,
  /** Units of a good the town buys per day (scaled by how cheap it is, like the orders). */
  demand: [6, 24] as const,
  /** One offer takes this share of the day's demand. */
  share: [0.35, 0.8] as const,
} as const;
