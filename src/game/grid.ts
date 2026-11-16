import { GRID_SIZE, PLOT_SIZE, PLOTS_PER_SIDE } from '../data/world';
import type { Tile } from './types';

export const TILE_COUNT = GRID_SIZE * GRID_SIZE;
export const PLOT_COUNT = PLOTS_PER_SIDE * PLOTS_PER_SIDE;

export const tileIndex = (x: number, y: number): number => y * GRID_SIZE + x;

export const tileCoords = (index: number): { x: number; y: number } => ({
  x: index % GRID_SIZE,
  y: Math.floor(index / GRID_SIZE),
});

export const inBounds = (x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < GRID_SIZE && y < GRID_SIZE;

export const isValidTileIndex = (index: number): boolean =>
  Number.isInteger(index) && index >= 0 && index < TILE_COUNT;

export const plotIndex = (plotX: number, plotY: number): number => plotY * PLOTS_PER_SIDE + plotX;

export const plotCoords = (index: number): { plotX: number; plotY: number } => ({
  plotX: index % PLOTS_PER_SIDE,
  plotY: Math.floor(index / PLOTS_PER_SIDE),
});

export const plotOfTile = (tile: number): number => {
  const { x, y } = tileCoords(tile);
  return plotIndex(Math.floor(x / PLOT_SIZE), Math.floor(y / PLOT_SIZE));
};

/** All tile indices inside a plot. */
export const tilesInPlot = (plot: number): number[] => {
  const { plotX, plotY } = plotCoords(plot);
  const result: number[] = [];
  for (let dy = 0; dy < PLOT_SIZE; dy++) {
    for (let dx = 0; dx < PLOT_SIZE; dx++) {
      result.push(tileIndex(plotX * PLOT_SIZE + dx, plotY * PLOT_SIZE + dy));
    }
  }
  return result;
};

/** 4-neighbour plot indices that exist on the map. */
export const neighbourPlots = (plot: number): number[] => {
  const { plotX, plotY } = plotCoords(plot);
  const candidates: Array<[number, number]> = [
    [plotX + 1, plotY],
    [plotX - 1, plotY],
    [plotX, plotY + 1],
    [plotX, plotY - 1],
  ];
  return candidates
    .filter(([px, py]) => px >= 0 && py >= 0 && px < PLOTS_PER_SIDE && py < PLOTS_PER_SIDE)
    .map(([px, py]) => plotIndex(px, py));
};

/** Returns a copy of the tiles array with one tile replaced. */
export const withTile = (tiles: readonly Tile[], index: number, tile: Tile): Tile[] => {
  const next = tiles.slice();
  next[index] = tile;
  return next;
};
