import {
  DEMOLISH_REFUND,
  DEMOLISH_WORK,
  SHED_LEVELS,
  SHELTER_LEVELS,
  STRUCTURES,
  type ShelterLevel,
  type StructureId,
} from '../data/structures';
import { ROAD_COST, ROAD_RING } from '../data/roads';
import { DOCK_LEVELS } from '../data/docks';
import { BUNKHOUSE_BEDS, HOUSE_BEDS } from '../data/workers';
import { GRID_SIZE } from '../data/world';
import { inBounds, tileCoords, tileIndex } from './grid';
import { findPath, isWalkable } from './path';
import { ringAround, roadNetwork, touchesNetwork } from './roads';
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
    if (!tile.structure && !tile.cover) return tile;
    const { structure: _removed, cover: _uncovered, ...rest } = tile;
    return rest;
  });
  // A building or greenhouse never stands on a fence (only a hand-edited save could say so).
  const unfenced = ({ fence: _fence, ...rest }: Tile): Tile => rest;
  for (const s of structures) {
    const cover = STRUCTURES[s.type].cover;
    for (const c of footprintCells(footprintOf(s.type, s.x, s.y, s.rotation))) {
      if (!inBounds(c.x, c.y)) continue;
      const index = tileIndex(c.x, c.y);
      const tile = result[index];
      if (tile) result[index] = cover ? { ...unfenced(tile), cover: true } : { ...unfenced(tile), structure: s.type };
    }
  }
  return result;
};

/**
 * A structure is standing (beds, a door to rest at, room for animals) unless it is being built or
 * torn down. Shelters keep standing while they are upgraded.
 */
export const isOperational = (s: StructureInstance): boolean => s.work === undefined || s.work.kind === 'upgrade';

// ---------- roads around buildings ----------

/** Buildings get a road ring around them; decorations keep the grass. */
export const hasRoadRing = (type: StructureId): boolean => STRUCTURES[type].category !== 'decor';

/**
 * Buildings that stop working without a road to the access road: the dock, the bunkhouse, shelters
 * and storage. The house is fixed, decorations need no road and the greenhouse is only a roof over
 * the field.
 */
export const needsRoadAccess = (type: StructureId): boolean => {
  const def = STRUCTURES[type];
  return def.needsRoad === true || (def.cost !== undefined && def.category !== 'decor' && !def.cover);
};

/** Tiles of a structure's road ring (may leave the map). Empty for decorations. */
export const ringCells = (type: StructureId, x: number, y: number, rotation: Rotation): GridPoint[] =>
  hasRoadRing(type) ? ringAround(footprintOf(type, x, y, rotation), ROAD_RING) : [];

/** True when a road of the network (linked to the access road) runs along the structure. */
export const hasRoadAccess = (
  tiles: readonly Tile[],
  s: Pick<StructureInstance, 'type' | 'x' | 'y' | 'rotation'>,
): boolean => !needsRoadAccess(s.type) || touchesNetwork(tiles, footprintOf(s.type, s.x, s.y, s.rotation));

/** The structure works: it is standing and, when it needs one, has a road to the access road. */
export const isActive = (state: Pick<GameState, 'tiles'>, s: StructureInstance): boolean =>
  isOperational(s) && hasRoadAccess(state.tiles, s);

/** A building past its construction that is cut off from the road network (it stands idle). */
export const isCutOff = (state: Pick<GameState, 'tiles'>, s: StructureInstance): boolean =>
  s.work?.kind !== 'build' && !hasRoadAccess(state.tiles, s);

/** Beds for staff workers: the house's, plus one set per working bunkhouse (finished and reached by road). */
export const bedCount = (state: Pick<GameState, 'structures' | 'tiles'>): number =>
  (state.structures.some((s) => s.type === 'house') ? HOUSE_BEDS : 0) +
  state.structures.filter((s) => s.type === 'bunkhouse' && isActive(state, s)).length * BUNKHOUSE_BEDS;

export const buildCost = (type: StructureId): number => STRUCTURES[type].cost ?? 0;

/** Work minutes (at speed 1) to raise a structure. */
export const buildMinutesFor = (type: StructureId): number => STRUCTURES[type].buildMinutes ?? 0;

const dockLevelDef = (level: ShelterLevel) => (level === 2 || level === 3 ? DOCK_LEVELS[level] : null);

const shedLevelDef = (level: ShelterLevel) => (level === 2 ? SHED_LEVELS[2] : null);

/** Price of upgrading to a level: the dock's or the shed's own price, or a share of a shelter's build cost. */
export const upgradeCost = (type: StructureId, toLevel: ShelterLevel): number =>
  type === 'dock'
    ? (dockLevelDef(toLevel)?.cost ?? 0)
    : type === 'machineShed'
      ? (shedLevelDef(toLevel)?.cost ?? 0)
      : Math.round(buildCost(type) * SHELTER_LEVELS[toLevel].upgradeShare);

/** Work minutes (at speed 1) of upgrading to a level: the dock's own, or a share of a shelter's build work. */
export const upgradeMinutes = (type: StructureId, toLevel: ShelterLevel): number =>
  type === 'dock'
    ? (dockLevelDef(toLevel)?.buildMinutes ?? 0)
    : type === 'machineShed'
      ? (shedLevelDef(toLevel)?.buildMinutes ?? 0)
      : Math.round(buildMinutesFor(type) * SHELTER_LEVELS[toLevel].upgradeShare);

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

/** A ring tile can carry the building's road: owned, free and grass (or already a road). */
const ringTileFree = (tiles: readonly Tile[], c: GridPoint): boolean => {
  if (!inBounds(c.x, c.y)) return false;
  const tile = tiles[tileIndex(c.x, c.y)];
  if (!tile || tile.state === 'locked' || tile.structure || tile.cover || tile.fence) return false;
  return tile.road === true || tile.state === 'grass';
};

/** A ring tile: already a road, a new road to open, or in the way (outside the map, not free grass). */
export type RingTileStatus = 'road' | 'new' | 'blocked';

export interface RingPlan {
  /** Every ring tile can carry a road. */
  free: boolean;
  /** Tiles that still need a road (empty when the ring is not free). */
  newRoads: number[];
  /** Each ring tile inside the map and what it would be. */
  cells: Array<{ tile: number; status: RingTileStatus }>;
}

/** The road ring a structure would get there, judged on `future` tiles (the queue applied). */
export const ringPlan = (
  future: readonly Tile[],
  type: StructureId,
  x: number,
  y: number,
  rotation: Rotation,
): RingPlan => {
  const ring = ringCells(type, x, y, rotation);
  const free = ring.every((c) => ringTileFree(future, c));
  const cells = ring
    .filter((c) => inBounds(c.x, c.y))
    .map((c) => {
      const tile = tileIndex(c.x, c.y);
      const status: RingTileStatus = !ringTileFree(future, c) ? 'blocked' : future[tile]?.road ? 'road' : 'new';
      return { tile, status };
    });
  const newRoads = free ? cells.filter((c) => c.status === 'new').map((c) => c.tile) : [];
  return { free, newRoads, cells };
};

/** Price of a structure plus the new road tiles of its ring. */
export const placementCost = (type: StructureId, newRoads: number): number => buildCost(type) + newRoads * ROAD_COST;

/**
 * Why a structure cannot be placed there, or null when it can. The footprint is judged on the
 * tiles now and the road ring on `future` tiles (the queue applied, so queued roads count). The
 * price includes the ring's new road tiles (skipped with `free`).
 */
export const checkPlacement = (
  state: GameState,
  type: StructureId,
  x: number,
  y: number,
  rotation: Rotation,
  future: readonly Tile[] = state.tiles,
  options: { free?: boolean } = {},
): ActionError | null => {
  if (STRUCTURES[type].cost === undefined) return 'not-buildable';
  const cells = footprintCells(footprintOf(type, x, y, rotation));
  if (cells.some((c) => !inBounds(c.x, c.y))) return 'out-of-bounds';
  const tiles = cells.map((c) => ({ index: tileIndex(c.x, c.y), tile: state.tiles[tileIndex(c.x, c.y)] }));
  if (tiles.some((t) => !t.tile || t.tile.state === 'locked')) return 'locked';
  if (tiles.some((t) => t.tile?.structure || t.tile?.cover)) return 'structure';
  if (tiles.some((t) => t.tile?.road)) return 'road';
  if (tiles.some((t) => t.tile?.fence)) return 'fence';
  if (tiles.some((t) => t.tile?.state !== 'grass')) return 'not-grass';
  // Soil surveys never change their tile, so they do not hold it.
  if (state.tasks.some((task) => task.kind !== 'survey' && tiles.some((t) => t.index === task.tile))) return 'tile-busy';
  const ring = ringPlan(future, type, x, y, rotation);
  if (!ring.free) return 'no-room-for-road';
  if (!options.free && state.money < placementCost(type, ring.newRoads.length)) return 'not-enough-money';
  return null;
};

/**
 * Where a structure fits without cost checks (free owned grass, no road, no queued work, room for
 * its road ring), as close as possible to `near`. Used by save repairs and dev tools. Null when it
 * fits nowhere.
 */
export const findFreeSpot = (
  state: Pick<GameState, 'tiles' | 'tasks'>,
  type: StructureId,
  near: GridPoint,
): { x: number; y: number; rotation: Rotation } | null => {
  const busy = new Set(state.tasks.filter((t) => t.kind !== 'survey').map((t) => t.tile));
  const free = (x: number, y: number): boolean => {
    if (!inBounds(x, y)) return false;
    const index = tileIndex(x, y);
    const tile = state.tiles[index];
    return !!tile && tile.state === 'grass' && !tile.structure && !tile.cover && !tile.road && !tile.fence && !busy.has(index);
  };
  const ringFree = (x: number, y: number, rotation: Rotation): boolean =>
    ringCells(type, x, y, rotation).every((c) => {
      if (!ringTileFree(state.tiles, c)) return false;
      const index = tileIndex(c.x, c.y);
      return state.tiles[index]?.road === true || !busy.has(index);
    });
  let best: { x: number; y: number; rotation: Rotation } | null = null;
  let bestDistance = Infinity;
  for (const rotation of [0, 1] as const) {
    const { width, depth } = footprintOf(type, 0, 0, rotation);
    for (let y = 0; y + depth <= GRID_SIZE; y++) {
      for (let x = 0; x + width <= GRID_SIZE; x++) {
        const d = Math.hypot(x + width / 2 - near.x, y + depth / 2 - near.y) + rotation * 0.01;
        if (d >= bestDistance) continue;
        if (!footprintCells({ x, y, width, depth }).every((c) => free(c.x, c.y))) continue;
        if (!ringFree(x, y, rotation)) continue;
        best = { x, y, rotation };
        bestDistance = d;
      }
    }
  }
  return best;
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
 * Takes a structure's footprint: stamps its tiles, charges `cost` and adds the instance (id
 * `nextId`). Whoever stands in the footprint is moved aside. No checks (see checkPlacement).
 */
export const occupyFootprint = (
  state: GameState,
  type: StructureId,
  x: number,
  y: number,
  rotation: Rotation,
  cost: number,
): GameState => {
  const fp = footprintOf(type, x, y, rotation);
  const tiles = state.tiles.slice();
  const cover = STRUCTURES[type].cover;
  for (const c of footprintCells(fp)) {
    const index = tileIndex(c.x, c.y);
    const tile = tiles[index];
    if (tile) tiles[index] = cover ? { ...tile, cover: true } : { ...tile, structure: type };
  }
  const built: StructureInstance = { id: state.nextId, type, x, y, rotation };
  const next: GameState = {
    ...state,
    tiles,
    money: state.money - cost,
    structures: [...state.structures, built],
    nextId: state.nextId + 1,
  };
  return { ...evictAnimals(next, fp), workers: next.workers.map((w) => evictWorker(w, fp, next)) };
};

/** Moves every animal standing inside the footprint just outside it. */
export const evictAnimals = (state: GameState, fp: Footprint): GameState => ({
  ...state,
  animals: state.animals.map((a) => evictAnimal(a, fp, state)),
});

/** Opens road on tiles at once (free grass or roads already). */
export const withRoads = (tiles: readonly Tile[], indices: readonly number[]): Tile[] => {
  const result = tiles.slice();
  for (const i of indices) result[i] = { state: 'grass', road: true };
  return result;
};

const SIDE_STEPS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/**
 * Lays the shortest road over free owned grass from a structure's ring to the road network, at no
 * cost (dev tools and save repairs, so the structures they add work). Unchanged when the structure
 * is already reached by road or no way exists.
 */
export const linkToNetwork = (state: GameState, s: StructureInstance): GameState => {
  if (!needsRoadAccess(s.type) || hasRoadAccess(state.tiles, s)) return state;
  const network = roadNetwork(state.tiles);
  if (network.size === 0) return state;
  const busy = new Set(state.tasks.filter((t) => t.kind !== 'survey').map((t) => t.tile));
  const crossable = (index: number): boolean => {
    const tile = state.tiles[index];
    return !!tile && tile.state === 'grass' && !tile.structure && !tile.cover && !tile.fence && !busy.has(index);
  };
  const starts = ringCells(s.type, s.x, s.y, s.rotation)
    .filter((c) => inBounds(c.x, c.y))
    .map((c) => tileIndex(c.x, c.y))
    .filter((i) => state.tiles[i]?.road);
  const parent = new Map<number, number>(starts.map((i) => [i, -1]));
  const queue = starts.slice();
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    if (current === undefined) break;
    const { x, y } = tileCoords(current);
    for (const [dx, dy] of SIDE_STEPS) {
      if (!inBounds(x + dx, y + dy)) continue;
      const next = tileIndex(x + dx, y + dy);
      if (parent.has(next)) continue;
      if (network.has(next)) {
        const path: number[] = [];
        for (let node = current; node !== -1; node = parent.get(node) ?? -1) path.push(node);
        return { ...state, tiles: withRoads(state.tiles, path.filter((i) => !state.tiles[i]?.road)) };
      }
      if (!crossable(next)) continue;
      parent.set(next, current);
      queue.push(next);
    }
  }
  return state;
};

/**
 * Places a finished structure at once with its road ring, linked to the road network, charging
 * its price (nothing with `free`). Dev tools, save repairs and tests use it; the player's orders go
 * through `orderStructure` (construction.ts), where the crew does the work.
 */
export const placeStructure = (
  state: GameState,
  type: StructureId,
  x: number,
  y: number,
  rotation: Rotation = 0,
  options: { free?: boolean } = {},
): ActionResult => {
  const error = checkPlacement(state, type, x, y, rotation, state.tiles, options);
  if (error) return fail(error);
  const { newRoads } = ringPlan(state.tiles, type, x, y, rotation);
  const cost = options.free ? 0 : placementCost(type, newRoads.length);
  const placed = occupyFootprint(state, type, x, y, rotation, cost);
  const ringed: GameState = { ...placed, tiles: withRoads(placed.tiles, newRoads) };
  const built = ringed.structures[ringed.structures.length - 1];
  return ok(built ? linkToNetwork(ringed, built) : ringed);
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
    if (!current) continue;
    if (STRUCTURES[found.type].cover) {
      // A greenhouse comes off: whatever grows underneath stays.
      const { cover: _uncovered, ...rest } = current;
      tiles[index] = rest;
    } else {
      tiles[index] = { state: current.state };
    }
  }
  return { ...state, tiles, structures: state.structures.filter((s) => s.id !== structureId) };
};

/** Why the structure covering a tile cannot be torn down, or the structure itself. */
export const checkDemolish = (state: GameState, tile: number): StructureInstance | ActionError => {
  const found = structureAt(state, tile);
  if (!found) return 'no-structure';
  if (STRUCTURES[found.type].cost === undefined) return 'not-demolishable';
  if (found.work) return 'under-construction';
  if (state.animals.some((a) => a.shelterId === found.id || a.penned?.penId === found.id)) return 'shelter-in-use';
  if (state.shipments.some((s) => s.dockId === found.id && s.phase !== 'leaving')) return 'reserved';
  if (state.machines.some((m) => m.parkId === found.id)) return 'reserved';
  // Animals on their way (or held in town) keep a seat here.
  const kept = [...state.shipments.map((s) => s.delivery), ...state.held.map((h) => h.delivery)];
  if (kept.some((d) => d?.animals.some((a) => a.shelterId === found.id))) return 'reserved';
  if (found.type === 'bunkhouse' && isActive(state, found)) {
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
