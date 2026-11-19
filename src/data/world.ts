/** World layout and time configuration. Pure data, no logic. */

export const GRID_SIZE = 64;
/** Side length (in tiles) of a purchasable land plot. GRID_SIZE must be divisible by it. */
export const PLOT_SIZE = 4;
export const PLOTS_PER_SIDE = GRID_SIZE / PLOT_SIZE;

/** Side (in plots) of the land owned on a new game: 8x8 plots = 32x32 tiles. */
export const START_PLOTS_SIDE = 8;

/**
 * Plots unlocked on a new game, as [plotX, plotY]: a square centered left to right that touches the
 * south edge, the side closest to the highway. The rest of the map is for sale.
 */
export const START_PLOTS: ReadonlyArray<readonly [number, number]> = Array.from(
  { length: START_PLOTS_SIDE * START_PLOTS_SIDE },
  (_, i) =>
    [
      (PLOTS_PER_SIDE - START_PLOTS_SIDE) / 2 + (i % START_PLOTS_SIDE),
      PLOTS_PER_SIDE - START_PLOTS_SIDE + Math.floor(i / START_PLOTS_SIDE),
    ] as const,
);

export const MINUTES_PER_DAY = 24 * 60;
/** Real minutes one game day lasts at speed x1. */
export const DAY_LENGTH_REAL_MINUTES = 25;
/** Game minutes that pass per real second at speed x1 (derived from DAY_LENGTH_REAL_MINUTES). */
export const GAME_MINUTES_PER_REAL_SECOND = MINUTES_PER_DAY / (DAY_LENGTH_REAL_MINUTES * 60);
/** Hour of day when a new game starts. */
export const START_HOUR = 6;
/** Crop growth is processed in steps of this many game minutes. */
export const GROWTH_STEP_MINUTES = 10;

export const SPEED_OPTIONS = [0, 1, 2, 3] as const;
export type GameSpeed = (typeof SPEED_OPTIONS)[number];
