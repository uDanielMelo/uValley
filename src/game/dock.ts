/**
 * The dock's geometry: the bays on the street in front of it, where vehicles park (more with each
 * level, then a truck bay), and the spots beside each vehicle where the crew loads it.
 */
import { DOCK, DOCK_LEVELS, type BayDef, type BaySize, type DockLevel } from '../data/docks';
import { inBounds, tileIndex } from './grid';
import { frontPoint, isActive } from './structures';
import type { GameState, GridPoint, StructureInstance, Tile } from './types';

type Placed = Pick<StructureInstance, 'type' | 'x' | 'y' | 'rotation'>;

export const isDock = (s: Pick<StructureInstance, 'type'>): boolean => s.type === 'dock';

export const docksOf = (state: Pick<GameState, 'structures'>): StructureInstance[] => state.structures.filter(isDock);

export const dockLevel = (s: Pick<StructureInstance, 'level'>): DockLevel => (s.level === 2 || s.level === 3 ? s.level : 1);

/** The level an upgrade would reach, or null at the top. */
export const nextDockLevel = (s: Pick<StructureInstance, 'level'>): DockLevel | null => {
  const level = dockLevel(s);
  return level < 3 ? ((level + 1) as DockLevel) : null;
};

/** The bays a dock has at its level. */
export const dockBays = (s: Pick<StructureInstance, 'level'>): readonly BayDef[] => DOCK_LEVELS[dockLevel(s)].bays;

/** Where a vehicle parks at a bay: on the street in front of the dock, `along` tiles to its right. */
export const bayPoint = (dock: Placed & Pick<StructureInstance, 'level'>, bay = 0): GridPoint =>
  frontPoint(dock, 0.5, -(dockBays(dock)[bay]?.along ?? 0));

/** The street tile `offset` tiles to the dock's right, in front of it (may leave the map). */
const streetTile = (dock: Placed, offset: number): GridPoint => {
  const p = frontPoint(dock, 0.5, -offset);
  return { x: Math.floor(p.x), y: Math.floor(p.y) };
};

/** Tiles a bay needs as road (outside the map: -1). */
export const bayRoadTiles = (dock: Placed, bay: BayDef): number[] =>
  bay.roads.map((offset) => {
    const c = streetTile(dock, offset);
    return inBounds(c.x, c.y) ? tileIndex(c.x, c.y) : -1;
  });

/** The tile a bay's loading tasks sit on (the street tile under the middle of the vehicle). */
export const bayTile = (dock: Placed & Pick<StructureInstance, 'level'>, bay: number): number => {
  const p = bayPoint(dock, bay);
  return inBounds(Math.floor(p.x), Math.floor(p.y)) ? tileIndex(Math.floor(p.x), Math.floor(p.y)) : -1;
};

/** A bay works when every tile it needs is road. */
export const bayUsable = (tiles: readonly Tile[], dock: Placed, bay: BayDef): boolean =>
  bayRoadTiles(dock, bay).every((t) => t >= 0 && !!tiles[t]?.road);

/** Bays of a size a dock has, and how many of them work. */
export const bayTotals = (
  tiles: readonly Tile[],
  dock: Placed & Pick<StructureInstance, 'level'>,
  size: BaySize,
): { total: number; usable: number } => {
  const bays = dockBays(dock).filter((b) => b.size === size);
  return { total: bays.length, usable: bays.filter((b) => bayUsable(tiles, dock, b)).length };
};

/** How far out from the platform's edge the loaders stand (tiles). */
const CREW_GAP = 0.12;

/** Offset along the vehicle of each loader slot: the middle first, then each side. */
const slotOffset = (size: BaySize, slot: number): number => {
  const side = Math.ceil(slot / 2) * (slot % 2 === 1 ? -1 : 1);
  return side * DOCK.crewSpread[size];
};

/** Where loader `slot` stands at a bay: between the dock's row and the vehicle, along it. */
export const loaderSpot = (dock: Placed & Pick<StructureInstance, 'level'>, bay: number, slot: number): GridPoint => {
  const def = dockBays(dock)[bay];
  const size = def?.size ?? 'car';
  return frontPoint(dock, CREW_GAP, -((def?.along ?? 0) + slotOffset(size, slot)));
};

/** A dock receives vehicles: it is standing and reached by a road from the access road. */
export const dockWorks = (state: Pick<GameState, 'tiles'>, dock: StructureInstance): boolean => isActive(state, dock);

/** Street tiles the bays of a level need that are not road yet (-1: outside the map). */
export const upgradeRoads = (tiles: readonly Tile[], dock: Placed, toLevel: DockLevel): number[] => {
  const needed = DOCK_LEVELS[toLevel].bays.flatMap((b) => bayRoadTiles(dock, b));
  return [...new Set(needed)].filter((t) => t < 0 || !tiles[t]?.road);
};
