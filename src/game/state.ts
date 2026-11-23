import { FEED } from '../data/animals';
import { STARTING_MONEY, STARTING_SEEDS } from '../data/economy';
import { STARTING_CROPS } from './research';
import { START_STRUCTURES } from '../data/structures';
import { MINUTES_PER_DAY, START_HOUR, START_PLOTS } from '../data/world';
import { TILE_COUNT, inBounds, plotIndex, tileIndex, tilesInPlot } from './grid';
import { homeSpot } from './home';
import { withAccessRoad } from './roads';
import { createStartingWorkers, rollCandidates } from './staff';
import { ringCells, stampStructures, withRoads } from './structures';
import type { GameState, StructureInstance, Tile } from './types';

/** The starting yard's roads: every starting structure's ring, then the access road down to the map edge. */
const withStartRoads = (tiles: readonly Tile[], structures: readonly StructureInstance[]): Tile[] => {
  const ring = structures
    .flatMap((s) => ringCells(s.type, s.x, s.y, s.rotation))
    .filter((c) => inBounds(c.x, c.y))
    .map((c) => tileIndex(c.x, c.y))
    .filter((i) => tiles[i]?.state === 'grass' && !tiles[i]?.structure);
  return withAccessRoad(withRoads(tiles, ring));
};

export const createInitialState = (): GameState => {
  const ground: Tile[] = Array.from({ length: TILE_COUNT }, () => ({ state: 'locked' }));
  const unlockedPlots = START_PLOTS.map(([px, py]) => plotIndex(px, py));
  for (const plot of unlockedPlots) {
    for (const index of tilesInPlot(plot)) ground[index] = { state: 'grass' };
  }
  const structures: StructureInstance[] = START_STRUCTURES.map((placement, i) => ({
    id: 1 + i,
    type: placement.id,
    x: placement.x,
    y: placement.y,
    rotation: 0,
  }));
  const tiles = withStartRoads(stampStructures(ground, structures), structures);
  let nextId = 1 + structures.length;
  const workers = createStartingWorkers(nextId, (slot) => homeSpot({ structures, tiles }, slot));
  nextId += workers.length;
  const gameMinutes = START_HOUR * 60;
  const candidates = rollCandidates(Math.floor(gameMinutes / MINUTES_PER_DAY), nextId, workers.map((w) => w.name));
  nextId += candidates.length;
  return {
    gameMinutes,
    money: STARTING_MONEY,
    tiles,
    unlockedPlots,
    plotsPurchased: 0,
    inventory: { seeds: { ...STARTING_SEEDS }, produce: {}, products: {}, medicine: {}, fertilizer: 0, feed: 0 },
    workers,
    candidates,
    tasks: [],
    animals: [],
    carcasses: [],
    vehicleLevel: 1,
    orders: [],
    listings: [],
    offers: [],
    research: { unlocked: [...STARTING_CROPS], current: null },
    structures,
    shipments: [],
    held: [],
    feedOrder: { auto: true, days: FEED.autoDays },
    nextId,
  };
};
