import { ANIMAL_PRODUCTS, ANIMAL_PRODUCT_IDS } from '../data/animals';
import { CROPS, CROP_IDS } from '../data/crops';
import { PLOT_BASE_COST, PLOT_COST_MULTIPLIER } from '../data/economy';
import { PLOT_COUNT, neighbourPlots, tilesInPlot } from './grid';
import { fail, ok, type ActionResult, type GameState } from './types';

/** What all crops and animal products in the inventory are worth at the reference price. */
export const produceValue = (state: GameState): number =>
  CROP_IDS.reduce((sum, id) => sum + CROPS[id].sellPrice * (state.inventory.produce[id] ?? 0), 0) +
  ANIMAL_PRODUCT_IDS.reduce(
    (sum, id) => sum + ANIMAL_PRODUCTS[id].sellPrice * (state.inventory.products[id] ?? 0),
    0,
  );

export const plotCost = (plotsPurchased: number): number =>
  Math.round(PLOT_BASE_COST * Math.pow(PLOT_COST_MULTIPLIER, plotsPurchased));

export const nextPlotCost = (state: GameState): number => plotCost(state.plotsPurchased);

export type PlotStatus = 'unlocked' | 'available' | 'not-adjacent';

export const plotStatus = (state: GameState, plot: number): PlotStatus => {
  if (state.unlockedPlots.includes(plot)) return 'unlocked';
  return neighbourPlots(plot).some((n) => state.unlockedPlots.includes(n))
    ? 'available'
    : 'not-adjacent';
};

export const buyPlot = (state: GameState, plot: number): ActionResult => {
  if (!Number.isInteger(plot) || plot < 0 || plot >= PLOT_COUNT) return fail('out-of-bounds');
  const status = plotStatus(state, plot);
  if (status === 'unlocked') return fail('plot-unlocked');
  if (status === 'not-adjacent') return fail('plot-not-adjacent');
  const cost = nextPlotCost(state);
  if (state.money < cost) return fail('not-enough-money');
  const tiles = state.tiles.slice();
  for (const index of tilesInPlot(plot)) {
    const tile = tiles[index];
    if (tile?.state === 'locked') tiles[index] = { ...tile, state: 'grass' };
  }
  return ok({
    ...state,
    money: state.money - cost,
    tiles,
    unlockedPlots: [...state.unlockedPlots, plot],
    plotsPurchased: state.plotsPurchased + 1,
  });
};
