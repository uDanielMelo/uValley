/** The dock: bays where vehicles park, customers who drive in, loading by the crew. Balancing only. */

import type { AnimalId } from './animals';
import type { VehicleLevel } from './market';

/** Dock levels, reached by upgrades the crew builds: more bays, then a truck bay. */
export type DockLevel = 1 | 2 | 3;
export const DOCK_LEVEL_IDS: readonly DockLevel[] = [1, 2, 3];

/** A truck needs a truck bay; pickups and SUVs park at car bays. */
export type BaySize = 'car' | 'truck';

/**
 * A bay on the street in front of the dock. `along` is how far (tiles) its middle is from the
 * middle of the dock's front, to the dock's right (east when it faces south); `roads` are the
 * offsets along the street (whole tiles from the dock's own tile) that must be road for it to work.
 */
export interface BayDef {
  size: BaySize;
  along: number;
  roads: readonly number[];
}

export interface DockLevelDef {
  label: string;
  bays: readonly BayDef[];
  /** Price and work minutes (at speed 1) of the upgrade to this level (level 1: none). */
  cost: number;
  buildMinutes: number;
  /** What the level adds (pt-BR), for the card. */
  perk: string;
}

const CAR_BAY: BayDef = { size: 'car', along: 0, roads: [0] };
// Bays are two tiles apart: a pickup is 5.2 m long, a tile 3.5 m.
const SECOND_CAR_BAY: BayDef = { size: 'car', along: 2, roads: [1, 2] };
const TRUCK_BAY: BayDef = { size: 'truck', along: 4, roads: [3, 4, 5] };

export const DOCK_LEVELS: Record<DockLevel, DockLevelDef> = {
  1: { label: 'Doca simples', bays: [CAR_BAY], cost: 0, buildMinutes: 0, perk: 'Uma vaga de carro' },
  2: { label: 'Doca dupla', bays: [CAR_BAY, SECOND_CAR_BAY], cost: 600, buildMinutes: 300, perk: 'Segunda vaga de carro' },
  3: {
    label: 'Doca com caminhão',
    bays: [CAR_BAY, SECOND_CAR_BAY, TRUCK_BAY],
    cost: 1600,
    buildMinutes: 540,
    perk: 'Vaga de caminhão: o frete pode vir de caminhão (1.500 kg, frete por kg mais barato)',
  },
};

/** The bay each freight vehicle needs. */
export const VEHICLE_BAY: Record<VehicleLevel, BaySize> = { 1: 'car', 2: 'car', 3: 'truck' };

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
  /** How far apart (tiles) the loaders stand along a car and along a truck. */
  crewSpread: { car: 0.32, truck: 0.6 },
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

// ---------- buying by freight ----------

/** Weight (kg) of what the farm buys, for the freight: per seed packet, dose, fertilizer unit and kg of feed. */
export const SUPPLY_WEIGHT = { seed: 1, medicine: 0.5, fertilizer: 10, feedKg: 1 } as const;

/** Animals come on a hired livestock truck: a fixed part plus a price per head, up to `maxHeads` a trip. */
export const LIVESTOCK = {
  base: 15,
  perHead: {
    chicken: 2,
    duck: 2,
    pig: 8,
    sheep: 6,
    goat: 6,
    cow: 20,
    ox: 20,
    horse: 20,
  } satisfies Record<AnimalId, number>,
  maxHeads: 8,
  /** Work minutes (at speed 1) to unload each head. */
  unloadMinutesPerHead: 6,
} as const;

/**
 * A delivery nobody unloaded in time goes back to town and is held there: it is still the farm's,
 * and a new freight brings it. Animals held cost a daily fee and fall sick if they wait too long.
 */
export const HELD = {
  /** Held animals cost this many times their daily feed, every midnight. */
  feeMultiplier: 2,
  /** Animals held at least this many days arrive with a chance of being sick (worms). */
  sickAfterDays: 2,
  sickChance: 0.5,
  /** Giving up a held delivery gives this share of what it cost back. */
  giveUpRefund: 0.5,
} as const;
