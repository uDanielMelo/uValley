import type { AnimalId } from './animals';
import type { CropId } from './crops';

/**
 * Real-world scale. One world unit is one tile, and one tile is TILE_METERS meters.
 * Every visual size below is in meters and converted with `meters()`; models are either
 * authored in meters (scaled by 1 / TILE_METERS) or fitted to these sizes at render time.
 *
 * 3.5 m matches the farmhouse (2×2 tiles = 7×7 m, door ≈ 2.1 m) and the trees (6–15 m).
 */
export const TILE_METERS = 3.5;

/** Converts meters to world units (tiles). */
export const meters = (m: number): number => m / TILE_METERS;

/** Scale for a model authored in meters. */
export const METER_SCALE = 1 / TILE_METERS;

/** Standing height of people, top of the head (hat not included). */
export const PERSON_HEIGHT = {
  /** Default adult; hired workers vary around it. */
  adult: 1.72,
  /** ± range for hired workers. */
  variation: 0.12,
} as const;

export interface BodySize {
  /** Top of the head when standing, in meters. */
  height: number;
  /** Nose to tail, in meters. */
  length: number;
}

/** Adult animal sizes. */
export const ANIMAL_SIZES: Record<AnimalId, BodySize> = {
  chicken: { height: 0.45, length: 0.45 },
  duck: { height: 0.45, length: 0.5 },
  pig: { height: 0.95, length: 1.5 },
  sheep: { height: 1.1, length: 1.3 },
  goat: { height: 1.1, length: 1.3 },
  cow: { height: 1.7, length: 2.4 },
  ox: { height: 1.8, length: 2.6 },
  horse: { height: 2.2, length: 2.4 },
};

/** Smallest clickable box around an animal, in meters (keeps chickens easy to click). */
export const ANIMAL_MIN_HITBOX = 1.2;

/** Height of a mature crop, in meters. Earlier stages keep their proportion to it. */
export const CROP_HEIGHTS: Record<CropId, number> = {
  wheat: 1.0,
  corn: 2.4,
  tomato: 1.3,
};

export const PROP_SIZES = {
  /** Farm fence around the owned land. */
  fenceHeight: 1.2,
  fenceRails: [0.45, 0.95],
  fencePost: 0.14,
  fenceRail: 0.1,
  /** Grass blades (before the per-tuft random scale). */
  grassMin: 0.15,
  grassMax: 0.35,
  /** Wooden shipping bin. */
  shippingBinHeight: 0.9,
  /** Single-lane dirt road (the rest of the tile is a grass verge). */
  roadWidth: 3.0,
  /** Two-lane paved highway beyond the farm: lanes, edge lines and the dashed center line. */
  highwayWidth: 7.2,
  highwayLine: 0.15,
  highwayDash: 3,
  highwayDashGap: 5,
} as const;
