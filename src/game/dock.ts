/**
 * The dock's geometry: the bay on the road in front of it, where a vehicle parks, and the spots
 * between the platform and the vehicle where the crew loads it.
 */
import { DOCK, DOCK_LEVELS } from '../data/docks';
import { inBounds, tileIndex } from './grid';
import { frontPoint, isActive } from './structures';
import type { GameState, GridPoint, StructureInstance } from './types';

export const isDock = (s: Pick<StructureInstance, 'type'>): boolean => s.type === 'dock';

export const docksOf = (state: Pick<GameState, 'structures'>): StructureInstance[] => state.structures.filter(isDock);

/** Vehicles that fit at a dock at once. */
export const bayCount = (_dock: StructureInstance): number => DOCK_LEVELS[1].carBays;

/** Where a vehicle parks: the middle of the road tile in front of the platform. */
export const bayPoint = (dock: Pick<StructureInstance, 'type' | 'x' | 'y' | 'rotation'>): GridPoint => frontPoint(dock, 0.5);

/** How far the loaders stand along the platform's edge from its middle (tiles). */
const CREW_SPREAD = 0.32;
/** How far out from the platform's edge the loaders stand (tiles). */
const CREW_GAP = 0.12;

/** Offsets along the platform's edge of each loader spot: the middle first, then each side. */
const crewOffsets = (): number[] => {
  const result: number[] = [];
  for (let i = 0; i < DOCK.crewMax; i++) {
    const side = Math.ceil(i / 2) * (i % 2 === 1 ? -1 : 1);
    result.push(side * CREW_SPREAD);
  }
  return result;
};

/**
 * Tiles the loading tasks sit on (one per loader, so each loader takes a different one): the bay
 * tile, then the tiles beside it along the street.
 */
export const crewTilesOf = (dock: Pick<StructureInstance, 'type' | 'x' | 'y' | 'rotation'>): number[] => {
  const result: number[] = [];
  for (const offset of crewOffsets()) {
    const p = frontPoint(dock, 0.5, Math.sign(offset));
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    if (inBounds(x, y)) result.push(tileIndex(x, y));
  }
  return result;
};

/** Where the loader with a given crew tile stands: between the platform and the vehicle. */
export const loaderSpot = (dock: Pick<StructureInstance, 'type' | 'x' | 'y' | 'rotation'>, tile: number): GridPoint => {
  const tiles = crewTilesOf(dock);
  const offsets = crewOffsets();
  const offset = offsets[Math.max(0, tiles.indexOf(tile))] ?? 0;
  return frontPoint(dock, CREW_GAP, offset);
};

/** A dock receives vehicles: it is standing and reached by a road from the access road. */
export const dockWorks = (state: Pick<GameState, 'tiles'>, dock: StructureInstance): boolean => isActive(state, dock);
