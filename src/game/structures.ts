import { DEMOLISH_REFUND, STRUCTURES, type StructureId } from '../data/structures';
import { BUNKHOUSE_BEDS } from '../data/workers';
import { inBounds, tileIndex } from './grid';
import { findPath, isWalkable } from './path';
import {
  fail,
  ok,
  type Tile,
  type ActionError,
  type ActionResult,
  type Animal,
  type GameState,
  type GridPoint,
  type Rotation,
  type StructureInstance,
  type Worker,
} from './types';

export interface Footprint {
  x: number;
  y: number;
  width: number;
  depth: number;
}

/** Footprint of a structure; odd quarter turns swap width and depth. */
export const footprintOf = (type: StructureId, x: number, y: number, rotation: Rotation): Footprint => {
  const def = STRUCTURES[type];
  const swapped = rotation % 2 === 1;
  return { x, y, width: swapped ? def.depth : def.width, depth: swapped ? def.width : def.depth };
};

/** Top-left tile so that the footprint is centered on the given tile as well as it can be. */
export const anchorFor = (type: StructureId, tileX: number, tileY: number, rotation: Rotation): GridPoint => {
  const { width, depth } = footprintOf(type, 0, 0, rotation);
  return { x: tileX - Math.floor((width - 1) / 2), y: tileY - Math.floor((depth - 1) / 2) };
};

/** Tile coordinates covered by a footprint (may be out of bounds). */
export const footprintCells = (fp: Footprint): GridPoint[] => {
  const cells: GridPoint[] = [];
  for (let dy = 0; dy < fp.depth; dy++) {
    for (let dx = 0; dx < fp.width; dx++) cells.push({ x: fp.x + dx, y: fp.y + dy });
  }
  return cells;
};

/**
 * Rebuilds every tile's `structure` flag from the placed structures (the source of truth),
 * so saves stay consistent even if a footprint size changes between versions.
 */
export const stampStructures = (tiles: readonly Tile[], structures: readonly StructureInstance[]): Tile[] => {
  const result: Tile[] = tiles.map((tile) => {
    if (!tile.structure) return tile;
    const { structure: _removed, ...rest } = tile;
    return rest;
  });
  for (const s of structures) {
    for (const c of footprintCells(footprintOf(s.type, s.x, s.y, s.rotation))) {
      if (!inBounds(c.x, c.y)) continue;
      const index = tileIndex(c.x, c.y);
      const tile = result[index];
      if (tile) result[index] = { ...tile, structure: s.type };
    }
  }
  return result;
};

/** Beds for staff workers: one set per bunkhouse. */
export const bedCount = (state: Pick<GameState, 'structures'>): number =>
  state.structures.filter((s) => s.type === 'bunkhouse').length * BUNKHOUSE_BEDS;

export const buildCost = (type: StructureId): number => STRUCTURES[type].cost ?? 0;

export const refundFor = (type: StructureId): number => Math.floor(buildCost(type) * DEMOLISH_REFUND);

/** Why a structure cannot be placed there, or null when it can. */
export const checkPlacement = (
  state: GameState,
  type: StructureId,
  x: number,
  y: number,
  rotation: Rotation,
): ActionError | null => {
  if (STRUCTURES[type].cost === undefined) return 'not-buildable';
  const cells = footprintCells(footprintOf(type, x, y, rotation));
  if (cells.some((c) => !inBounds(c.x, c.y))) return 'out-of-bounds';
  const tiles = cells.map((c) => ({ index: tileIndex(c.x, c.y), tile: state.tiles[tileIndex(c.x, c.y)] }));
  if (tiles.some((t) => !t.tile || t.tile.state === 'locked')) return 'locked';
  if (tiles.some((t) => t.tile?.structure)) return 'structure';
  if (tiles.some((t) => t.tile?.road)) return 'road';
  if (tiles.some((t) => t.tile?.state !== 'grass')) return 'not-grass';
  if (state.tasks.some((task) => tiles.some((t) => t.index === task.tile))) return 'tile-busy';
  if (state.money < buildCost(type)) return 'not-enough-money';
  return null;
};

type Passable = (x: number, y: number) => boolean;

/**
 * Moves a point out of a footprint through the nearest side that lands on passable ground
 * (any side if none does). Points outside are unchanged.
 */
const pushOut = (p: GridPoint, fp: Footprint, passable: Passable): GridPoint => {
  const inside = p.x >= fp.x && p.x < fp.x + fp.width && p.y >= fp.y && p.y < fp.y + fp.depth;
  if (!inside) return p;
  const margin = 0.5;
  const options: GridPoint[] = [
    { x: fp.x - margin, y: p.y },
    { x: fp.x + fp.width + margin, y: p.y },
    { x: p.x, y: fp.y - margin },
    { x: p.x, y: fp.y + fp.depth + margin },
  ];
  const blocked = (o: GridPoint) => (passable(Math.floor(o.x), Math.floor(o.y)) ? 0 : 1000);
  const cost = (o: GridPoint) => Math.abs(o.x - p.x) + Math.abs(o.y - p.y) + blocked(o);
  let best = options[0] ?? p;
  for (const o of options) if (cost(o) < cost(best)) best = o;
  return best;
};

const evictAnimal = (a: Animal, fp: Footprint, state: GameState): Animal => {
  const moved = pushOut({ x: a.x, y: a.y }, fp, (x, y) => isWalkable(state.tiles, x, y));
  return moved.x === a.x && moved.y === a.y ? a : { ...a, x: moved.x, y: moved.y, target: null };
};

const evictWorker = (w: Worker, fp: Footprint, state: GameState): Worker => {
  const moved = pushOut({ x: w.x, y: w.y }, fp, (x, y) => isWalkable(state.tiles, x, y));
  if (moved.x === w.x && moved.y === w.y) return w;
  const last = w.path[w.path.length - 1];
  return { ...w, x: moved.x, y: moved.y, path: last ? findPath(state.tiles, moved, last) : [] };
};

/** Builds a structure, charging its cost. Whoever stands in the footprint is moved aside. */
export const placeStructure = (
  state: GameState,
  type: StructureId,
  x: number,
  y: number,
  rotation: Rotation = 0,
): ActionResult => {
  const error = checkPlacement(state, type, x, y, rotation);
  if (error) return fail(error);
  const fp = footprintOf(type, x, y, rotation);
  const tiles = state.tiles.slice();
  for (const c of footprintCells(fp)) {
    const index = tileIndex(c.x, c.y);
    const tile = tiles[index];
    if (tile) tiles[index] = { ...tile, structure: type };
  }
  const built: StructureInstance = { id: state.nextId, type, x, y, rotation };
  const next: GameState = {
    ...state,
    tiles,
    money: state.money - buildCost(type),
    structures: [...state.structures, built],
    nextId: state.nextId + 1,
  };
  return ok({
    ...next,
    animals: next.animals.map((a) => evictAnimal(a, fp, next)),
    workers: next.workers.map((w) => evictWorker(w, fp, next)),
  });
};

/** The structure covering a tile, if any. */
export const structureAt = (state: GameState, tile: number): StructureInstance | undefined =>
  state.structures.find((s) =>
    footprintCells(footprintOf(s.type, s.x, s.y, s.rotation)).some((c) => tileIndex(c.x, c.y) === tile),
  );

/** Demolishes the buildable structure covering a tile and refunds part of its cost. */
export const demolishStructure = (state: GameState, tile: number): ActionResult => {
  const found = structureAt(state, tile);
  if (!found) return fail('no-structure');
  if (STRUCTURES[found.type].cost === undefined) return fail('not-demolishable');
  if (found.type === 'bunkhouse') {
    const staff = state.workers.filter((w) => w.kind === 'staff').length;
    if (bedCount(state) - BUNKHOUSE_BEDS < staff) return fail('beds-in-use');
  }
  const tiles = state.tiles.slice();
  for (const c of footprintCells(footprintOf(found.type, found.x, found.y, found.rotation))) {
    const index = tileIndex(c.x, c.y);
    const current = tiles[index];
    if (current) tiles[index] = { state: current.state };
  }
  return ok({
    ...state,
    tiles,
    money: state.money + refundFor(found.type),
    structures: state.structures.filter((s) => s.id !== found.id),
  });
};
