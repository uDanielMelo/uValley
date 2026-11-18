import {
  DEMOLISH_REFUND,
  DEMOLISH_WORK,
  SHELTER_LEVELS,
  STRUCTURES,
  type ShelterLevel,
  type StructureId,
} from '../data/structures';
import { BUNKHOUSE_BEDS } from '../data/workers';
import { GRID_SIZE } from '../data/world';
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

/** Direction a structure's front (+z in its model) faces in tile space, for each quarter turn. */
const FRONT: Record<Rotation, GridPoint> = {
  0: { x: 0, y: 1 },
  1: { x: 1, y: 0 },
  2: { x: 0, y: -1 },
  3: { x: -1, y: 0 },
};

/**
 * A point in front of a structure: `gap` tiles out from the front wall (negative: inside), shifted
 * `across` tiles along the wall.
 */
export const frontPoint = (s: Pick<StructureInstance, 'type' | 'x' | 'y' | 'rotation'>, gap: number, across = 0): GridPoint => {
  const fp = footprintOf(s.type, s.x, s.y, s.rotation);
  const front = FRONT[s.rotation];
  const reach = STRUCTURES[s.type].depth / 2 + gap;
  return {
    x: fp.x + fp.width / 2 + front.x * reach - front.y * across,
    y: fp.y + fp.depth / 2 + front.y * reach + front.x * across,
  };
};

/** The footprint tile at the middle of the front wall (where the door is). */
export const frontTile = (s: Pick<StructureInstance, 'type' | 'x' | 'y' | 'rotation'>): number => {
  const p = frontPoint(s, -0.5, -0.01);
  return tileIndex(Math.floor(p.x), Math.floor(p.y));
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

/**
 * A structure works (beds, a door to rest at, room for animals) unless it is being built or torn
 * down. Shelters keep working while they are upgraded.
 */
export const isOperational = (s: StructureInstance): boolean => s.work === undefined || s.work.kind === 'upgrade';

/** Beds for staff workers: one set per finished bunkhouse (not one being built or torn down). */
export const bedCount = (state: Pick<GameState, 'structures'>): number =>
  state.structures.filter((s) => s.type === 'bunkhouse' && isOperational(s)).length * BUNKHOUSE_BEDS;

export const buildCost = (type: StructureId): number => STRUCTURES[type].cost ?? 0;

/** Work minutes (at speed 1) to raise a structure. */
export const buildMinutesFor = (type: StructureId): number => STRUCTURES[type].buildMinutes ?? 0;

/** Price of upgrading a shelter to a level: a share of its build cost. */
export const upgradeCost = (type: StructureId, toLevel: ShelterLevel): number =>
  Math.round(buildCost(type) * SHELTER_LEVELS[toLevel].upgradeShare);

/** Work minutes (at speed 1) of upgrading a shelter to a level: a share of its build work. */
export const upgradeMinutes = (type: StructureId, toLevel: ShelterLevel): number =>
  Math.round(buildMinutesFor(type) * SHELTER_LEVELS[toLevel].upgradeShare);

/** Everything paid for a structure: building it and every upgrade up to its level. */
export const investedIn = (type: StructureId, level: ShelterLevel = 1): number => {
  let total = buildCost(type);
  for (let l = 2; l <= level; l++) total += upgradeCost(type, l as ShelterLevel);
  return total;
};

/** What a finished demolition gives back: a share of everything invested. */
export const refundFor = (type: StructureId, level: ShelterLevel = 1): number =>
  Math.floor(investedIn(type, level) * DEMOLISH_REFUND);

/** Work minutes (at speed 1) to tear a structure down. */
export const demolishMinutesFor = (type: StructureId): number => Math.round(buildMinutesFor(type) * DEMOLISH_WORK);

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

/**
 * Where a structure fits without cost checks (free owned grass, no road, no queued work), as close
 * as possible to `near`. It prefers spots with a one-tile gap to other structures and roads, so
 * doors and paths stay clear. Used by save migrations and dev tools. Null when it fits nowhere.
 */
export const findFreeSpot = (
  state: Pick<GameState, 'tiles' | 'tasks'>,
  type: StructureId,
  near: GridPoint,
): { x: number; y: number; rotation: Rotation } | null => {
  const busy = new Set(state.tasks.map((t) => t.tile));
  const free = (x: number, y: number): boolean => {
    if (!inBounds(x, y)) return false;
    const index = tileIndex(x, y);
    const tile = state.tiles[index];
    return !!tile && tile.state === 'grass' && !tile.structure && !tile.road && !busy.has(index);
  };
  const clear = (x: number, y: number): boolean => {
    const tile = inBounds(x, y) ? state.tiles[tileIndex(x, y)] : undefined;
    return !tile?.structure && !tile?.road;
  };
  const search = (gap: number) => {
    let best: { x: number; y: number; rotation: Rotation } | null = null;
    let bestDistance = Infinity;
    for (const rotation of [0, 1] as const) {
      const { width, depth } = footprintOf(type, 0, 0, rotation);
      for (let y = 0; y + depth <= GRID_SIZE; y++) {
        for (let x = 0; x + width <= GRID_SIZE; x++) {
          const d = Math.hypot(x + width / 2 - near.x, y + depth / 2 - near.y) + rotation * 0.01;
          if (d >= bestDistance) continue;
          if (!footprintCells({ x, y, width, depth }).every((c) => free(c.x, c.y))) continue;
          const margin = { x: x - gap, y: y - gap, width: width + gap * 2, depth: depth + gap * 2 };
          if (gap > 0 && !footprintCells(margin).every((c) => clear(c.x, c.y))) continue;
          best = { x, y, rotation };
          bestDistance = d;
        }
      }
    }
    return best;
  };
  return search(1) ?? search(0);
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
  return moved.x === a.x && moved.y === a.y ? a : { ...a, x: moved.x, y: moved.y, path: [] };
};

const evictWorker = (w: Worker, fp: Footprint, state: GameState): Worker => {
  const moved = pushOut({ x: w.x, y: w.y }, fp, (x, y) => isWalkable(state.tiles, x, y));
  if (moved.x === w.x && moved.y === w.y) return w;
  const last = w.path[w.path.length - 1];
  return { ...w, x: moved.x, y: moved.y, path: last ? findPath(state.tiles, moved, last) : [] };
};

/**
 * Places a finished structure at once, charging its cost. Whoever stands in the footprint is moved
 * aside. The player's orders go through `orderStructure` (construction.ts), which adds the work.
 */
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

/** Takes a structure off the map: its tiles go back to bare ground (no refund). */
export const removeStructure = (state: GameState, structureId: number): GameState => {
  const found = state.structures.find((s) => s.id === structureId);
  if (!found) return state;
  const tiles = state.tiles.slice();
  for (const c of footprintCells(footprintOf(found.type, found.x, found.y, found.rotation))) {
    if (!inBounds(c.x, c.y)) continue;
    const index = tileIndex(c.x, c.y);
    const current = tiles[index];
    if (current) tiles[index] = { state: current.state };
  }
  return { ...state, tiles, structures: state.structures.filter((s) => s.id !== structureId) };
};

/** Why the structure covering a tile cannot be torn down, or the structure itself. */
export const checkDemolish = (state: GameState, tile: number): StructureInstance | ActionError => {
  const found = structureAt(state, tile);
  if (!found) return 'no-structure';
  if (STRUCTURES[found.type].cost === undefined) return 'not-demolishable';
  if (found.work) return 'under-construction';
  if (state.animals.some((a) => a.shelterId === found.id)) return 'shelter-in-use';
  if (found.type === 'bunkhouse') {
    const staff = state.workers.filter((w) => w.kind === 'staff').length;
    if (bedCount(state) - BUNKHOUSE_BEDS < staff) return 'beds-in-use';
  }
  return found;
};

/** Demolishes the finished structure covering a tile at once and refunds part of its cost. */
export const demolishStructure = (state: GameState, tile: number): ActionResult => {
  const found = checkDemolish(state, tile);
  if (typeof found === 'string') return fail(found);
  const removed = removeStructure(state, found.id);
  return ok({ ...removed, money: removed.money + refundFor(found.type, found.level) });
};
