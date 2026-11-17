import { STARTING_MONEY, STARTING_SEEDS } from '../data/economy';
import { START_STRUCTURES } from '../data/structures';
import { START_HOUR, START_PLOTS } from '../data/world';
import { TILE_COUNT, plotIndex, tilesInPlot } from './grid';
import { withAccessRoad } from './roads';
import { stampStructures } from './structures';
import type { GameState, StructureInstance, Tile } from './types';
import { createFamily } from './workers';

export const createInitialState = (): GameState => {
  const tiles: Tile[] = Array.from({ length: TILE_COUNT }, () => ({ state: 'locked' }));
  const unlockedPlots = START_PLOTS.map(([px, py]) => plotIndex(px, py));
  for (const plot of unlockedPlots) {
    for (const index of tilesInPlot(plot)) tiles[index] = { state: 'grass' };
  }
  const family = createFamily(1);
  const structures: StructureInstance[] = [];
  for (const placement of START_STRUCTURES) {
    structures.push({
      id: family.length + 1 + structures.length,
      type: placement.id,
      x: placement.x,
      y: placement.y,
      rotation: 0,
    });
  }
  return {
    gameMinutes: START_HOUR * 60,
    money: STARTING_MONEY,
    tiles: withAccessRoad(stampStructures(tiles, structures)),
    unlockedPlots,
    plotsPurchased: 0,
    inventory: { seeds: { ...STARTING_SEEDS }, produce: {}, products: {} },
    workers: family,
    tasks: [],
    animals: [],
    structures,
    nextId: family.length + 1 + structures.length,
  };
};
