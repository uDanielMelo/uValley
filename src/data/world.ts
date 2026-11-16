/** World layout and time configuration. Pure data, no logic. */

export const GRID_SIZE = 32;
/** Side length (in tiles) of a purchasable land plot. GRID_SIZE must be divisible by it. */
export const PLOT_SIZE = 4;
export const PLOTS_PER_SIDE = GRID_SIZE / PLOT_SIZE;

/** Plots unlocked on a new game, as [plotX, plotY]. Central 2x2 plots = 8x8 tiles. */
export const START_PLOTS: ReadonlyArray<readonly [number, number]> = [
  [3, 3],
  [4, 3],
  [3, 4],
  [4, 4],
];

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
