/** Economy balancing values. */

/** Money on a new game. Tune freely: nothing else depends on this exact value. */
export const STARTING_MONEY = 800;

/** Starting seed inventory for a new game. */
export const STARTING_SEEDS = { wheat: 12 } as const;

export const PLOT_BASE_COST = 200;
/** Each purchased plot multiplies the price of the next one by this factor. */
export const PLOT_COST_MULTIPLIER = 1.4;
