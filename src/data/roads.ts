/** Roads and the vehicles that drive on them. Balancing and layout only, no logic. */

/** Tile column of the access road. */
export const ACCESS_ROAD_X = 32;
/** Row where the access road starts inside the farm: just below the yard's street (row 58). */
export const ACCESS_ROAD_FARM_Y = 59;
/**
 * Map edge the road leaves through: 'north' (row 0) or 'south' (last row). It runs south, down
 * the screen for the default camera, to the highway that passes below the farm.
 */
export const ACCESS_ROAD_EDGE: 'north' | 'south' = 'south';

/** How far (in tiles) the access road continues beyond the map edge, to the highway's center line. */
export const OFFMAP_ROAD_LENGTH = 4;

/** The paved highway beyond the farm edge, perpendicular to the access road. */
export const HIGHWAY = {
  /** Distance (tiles) the car drives along the highway from where it appears to the junction. */
  reach: 90,
} as const;

/** Price of one tile of dirt road, paid when ordered. Removing a road is free and gives nothing back. */
export const ROAD_COST = 5;
/** Work minutes (at work speed 1) to open one road tile, and to remove one. */
export const ROAD_WORK_MINUTES = { build: 20, remove: 10 } as const;
/** Workers walk this much faster on roads (0.5 = 50%), so their routes prefer roads. */
export const ROAD_WALK_BONUS = 0.5;
/**
 * Width (tiles) of the road ring every building gets around its footprint: the crew opens it with
 * the site, at ROAD_COST per new tile. Neighbours share it, so buildings stand one road apart.
 */
export const ROAD_RING = 1;

export const CAR = {
  /** Cruising speed, in tiles per game minute (≈ 36 km/h on screen at 1×). */
  speed: 4,
  /** Distance (tiles) over which the car brakes before parking and speeds up when leaving. */
  brakeDistance: 4,
  /** Radius (tiles) of the turn between the highway and the access road. */
  junctionRadius: 1.4,
} as const;
