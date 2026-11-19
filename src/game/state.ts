import { STARTING_MONEY, STARTING_SEEDS } from '../data/economy';
import { STARTING_CROPS } from './research';
import { START_STRUCTURES } from '../data/structures';
import { MINUTES_PER_DAY, START_HOUR, START_PLOTS } from '../data/world';
import { TILE_COUNT, plotIndex, tilesInPlot } from './grid';
import { homeSpot } from './home';
import { withAccessRoad } from './roads';
import { createStartingWorkers, rollCandidates } from './staff';
import { stampStructures } from './structures';
import type { GameState, StructureInstance, Tile } from './types';

export const createInitialState = (): GameState => {
  const tiles: Tile[] = Array.from({ length: TILE_COUNT }, () => ({ state: 'locked' }));
  const unlockedPlots = START_PLOTS.map(([px, py]) => plotIndex(px, py));
  for (const plot of unlockedPlots) {
    for (const index of tilesInPlot(plot)) tiles[index] = { state: 'grass' };
  }
  const structures: StructureInstance[] = START_STRUCTURES.map((placement, i) => ({
    id: 1 + i,
    type: placement.id,
    x: placement.x,
    y: placement.y,
    rotation: 0,
  }));
  let nextId = 1 + structures.length;
  const workers = createStartingWorkers(nextId, (slot) => homeSpot({ structures }, slot));
  nextId += workers.length;
  const gameMinutes = START_HOUR * 60;
  const candidates = rollCandidates(Math.floor(gameMinutes / MINUTES_PER_DAY), nextId, workers.map((w) => w.name));
  nextId += candidates.length;
  return {
    gameMinutes,
    money: STARTING_MONEY,
    tiles: withAccessRoad(stampStructures(tiles, structures)),
    unlockedPlots,
    plotsPurchased: 0,
    inventory: { seeds: { ...STARTING_SEEDS }, produce: {}, products: {}, medicine: {}, fertilizer: 0 },
    workers,
    candidates,
    tasks: [],
    animals: [],
    carcasses: [],
    vehicleLevel: 1,
    cargo: { produce: {}, products: {} },
    orders: [],
    research: { unlocked: [...STARTING_CROPS], current: null },
    github: null,
    structures,
    nextId,
  };
};
