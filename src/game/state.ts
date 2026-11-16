import { STARTING_MONEY, STARTING_SEEDS } from '../data/economy';
import { START_STRUCTURES, STRUCTURES } from '../data/structures';
import { START_HOUR, START_PLOTS } from '../data/world';
import { TILE_COUNT, plotIndex, tileIndex, tilesInPlot } from './grid';
import type { GameState, Tile } from './types';
import { createFamily } from './workers';

export const createInitialState = (): GameState => {
  const tiles: Tile[] = Array.from({ length: TILE_COUNT }, () => ({ state: 'locked' }));
  const unlockedPlots = START_PLOTS.map(([px, py]) => plotIndex(px, py));
  for (const plot of unlockedPlots) {
    for (const index of tilesInPlot(plot)) tiles[index] = { state: 'grass' };
  }
  for (const placement of START_STRUCTURES) {
    const def = STRUCTURES[placement.id];
    for (let dy = 0; dy < def.depth; dy++) {
      for (let dx = 0; dx < def.width; dx++) {
        const index = tileIndex(placement.x + dx, placement.y + dy);
        const tile = tiles[index];
        if (tile) tiles[index] = { ...tile, structure: placement.id };
      }
    }
  }
  const family = createFamily(1);
  return {
    gameMinutes: START_HOUR * 60,
    money: STARTING_MONEY,
    tiles,
    unlockedPlots,
    plotsPurchased: 0,
    inventory: { seeds: { ...STARTING_SEEDS }, produce: {}, products: {} },
    workers: family,
    tasks: [],
    animals: [],
    nextId: family.length + 1,
  };
};
