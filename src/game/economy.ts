import { ANIMAL_PRODUCTS, ANIMAL_PRODUCT_IDS, type AnimalProductId } from '../data/animals';
import { CROPS, CROP_IDS, type CropId } from '../data/crops';
import { FERTILIZER } from '../data/fertilizer';
import { PLOT_BASE_COST, PLOT_COST_MULTIPLIER } from '../data/economy';
import { PLOT_COUNT, neighbourPlots, tilesInPlot } from './grid';
import { addCount } from './inventory';
import { fail, ok, type ActionResult, type GameState } from './types';

const isPositiveInt = (n: number): boolean => Number.isInteger(n) && n > 0;

export const buySeeds = (state: GameState, cropId: CropId, quantity: number): ActionResult => {
  if (!isPositiveInt(quantity)) return fail('invalid-quantity');
  const cost = CROPS[cropId].seedCost * quantity;
  if (state.money < cost) return fail('not-enough-money');
  return ok({
    ...state,
    money: state.money - cost,
    inventory: { ...state.inventory, seeds: addCount(state.inventory.seeds, cropId, quantity) },
  });
};

export const buyFertilizer = (state: GameState, quantity: number): ActionResult => {
  if (!isPositiveInt(quantity)) return fail('invalid-quantity');
  const cost = FERTILIZER.price * quantity;
  if (state.money < cost) return fail('not-enough-money');
  return ok({
    ...state,
    money: state.money - cost,
    inventory: { ...state.inventory, fertilizer: state.inventory.fertilizer + quantity },
  });
};

export const sellProduce = (state: GameState, cropId: CropId, quantity: number): ActionResult => {
  if (!isPositiveInt(quantity)) return fail('invalid-quantity');
  if ((state.inventory.produce[cropId] ?? 0) < quantity) return fail('no-produce');
  return ok({
    ...state,
    money: state.money + CROPS[cropId].sellPrice * quantity,
    inventory: {
      ...state.inventory,
      produce: addCount(state.inventory.produce, cropId, -quantity),
    },
  });
};

export const sellAnimalProduct = (state: GameState, productId: AnimalProductId, quantity: number): ActionResult => {
  if (!isPositiveInt(quantity)) return fail('invalid-quantity');
  if ((state.inventory.products[productId] ?? 0) < quantity) return fail('no-produce');
  return ok({
    ...state,
    money: state.money + ANIMAL_PRODUCTS[productId].sellPrice * quantity,
    inventory: {
      ...state.inventory,
      products: addCount(state.inventory.products, productId, -quantity),
    },
  });
};

/** Total sale value of all crops and animal products in the inventory. */
export const produceValue = (state: GameState): number =>
  CROP_IDS.reduce((sum, id) => sum + CROPS[id].sellPrice * (state.inventory.produce[id] ?? 0), 0) +
  ANIMAL_PRODUCT_IDS.reduce(
    (sum, id) => sum + ANIMAL_PRODUCTS[id].sellPrice * (state.inventory.products[id] ?? 0),
    0,
  );

export const sellAllProduce = (state: GameState): ActionResult => {
  const value = produceValue(state);
  if (value <= 0) return fail('no-produce');
  return ok({
    ...state,
    money: state.money + value,
    inventory: { ...state.inventory, produce: {}, products: {} },
  });
};

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
