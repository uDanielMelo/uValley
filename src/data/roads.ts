/** Roads and the visiting car. Balancing and layout only, no logic. */

/** Tile column of the access road. */
export const ACCESS_ROAD_X = 18;
/** Row where the access road ends inside the farm: right beside the shipping bin (17, 16). */
export const ACCESS_ROAD_FARM_Y = 16;
/**
 * Map edge the road leaves through: 'north' (row 0) or 'south' (last row). It runs south, down
 * the screen for the default camera, to the highway that passes below the farm.
 */
export const ACCESS_ROAD_EDGE: 'north' | 'south' = 'south';

/** How far (in tiles) the access road continues beyond the map edge, to the highway's center line. */
export const OFFMAP_ROAD_LENGTH = 7;

/** The paved highway beyond the farm edge, perpendicular to the access road. */
export const HIGHWAY = {
  /** Distance (tiles) the car drives along the highway from where it appears to the junction. */
  reach: 90,
} as const;

/** Price of one tile of dirt road. Removing a road is free and gives nothing back. */
export const ROAD_COST = 5;
/** Workers walk this much faster on roads (0.5 = 50%). */
export const ROAD_WALK_BONUS = 0.5;

export const CAR = {
  /** Cruising speed, in tiles per game minute (≈ 36 km/h on screen at 1×). */
  speed: 4,
  /** Distance (tiles) over which the car brakes before parking and speeds up when leaving. */
  brakeDistance: 4,
  /** Game minutes the car stays parked at the farm. */
  waitMinutes: 40,
  /** Hours of the day when a car comes to the farm. */
  visitHours: [7, 12, 18],
} as const;
