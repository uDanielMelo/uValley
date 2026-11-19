/** Manure and fertilizer. All balancing for animal manure and fertilizing crops lives here. */

import type { AnimalId } from './animals';

/** The fertilizer item: cured manure collected at shelters, also sold at the shop. */
export const FERTILIZER = {
  label: 'Adubo',
  icon: '💩',
  /** Shop price per unit. */
  price: 12,
  /** A fertilized crop grows this much faster while watered. */
  growth: 1.3,
  /** Chance of one extra unit when a fertilized crop is harvested. */
  harvestBonus: 0.35,
} as const;

/** Units of manure each animal leaves at its shelter per game day. */
export const MANURE_PER_DAY: Record<AnimalId, number> = {
  chicken: 0.15,
  duck: 0.15,
  sheep: 0.35,
  goat: 0.35,
  pig: 0.6,
  cow: 0.7,
  ox: 0.7,
  horse: 0.6,
};

/** Babies leave less. */
export const BABY_MANURE = 0.5;
/** Manure a shelter holds per head of capacity; full, it stops piling up (and makes animals sick more often). */
export const SHELTER_MANURE_PER_HEAD = 2;
/** The pigsty's manure pit (level 3) yields this much more manure. */
export const MANURE_PIT_BONUS = 1.5;
/** A shelter full of manure multiplies the sickness risk of its animals. */
export const MANURE_SICKNESS = 1.5;
