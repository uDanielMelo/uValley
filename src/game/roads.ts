import { ACCESS_ROAD_EDGE, ACCESS_ROAD_FARM_Y, ACCESS_ROAD_X, HIGHWAY, OFFMAP_ROAD_LENGTH } from '../data/roads';
import { PROP_SIZES, meters } from '../data/scale';
import { GRID_SIZE } from '../data/world';
import { inBounds, isValidTileIndex, tileCoords, tileIndex } from './grid';
import { fail, ok, type ActionError, type ActionResult, type GameState, type GridPoint, type Tile } from './types';

/** Where the access road leaves the map, in tile space. */
export interface RoadExit {
  /** Row of the map-edge road tile. */
  edgeRow: number;
  /** -1 when the road leaves northward (towards -y), +1 southward. */
  outward: -1 | 1;
  /** Point on the map border where the road crosses it. */
  border: GridPoint;
  /** Where the access road meets the highway's center line. */
  junction: GridPoint;
  /** Where the car turns: the junction, in the highway lane nearer the farm. */
  turn: GridPoint;
  /** Highway ends, where cars appear (east) and vanish (west). */
  highwayEast: GridPoint;
  highwayWest: GridPoint;
}

export const accessRoadExit = (): RoadExit => {
  const north = ACCESS_ROAD_EDGE === 'north';
  const x = ACCESS_ROAD_X + 0.5;
  const borderY = north ? 0 : GRID_SIZE;
  const outward = north ? -1 : 1;
  const junctionY = borderY + outward * OFFMAP_ROAD_LENGTH;
  // Traffic keeps right: heading west, that is the lane on the farm's side of the center line.
  const laneY = junctionY - outward * (meters(PROP_SIZES.highwayWidth) / 4);
  return {
    edgeRow: north ? 0 : GRID_SIZE - 1,
    outward,
    border: { x, y: borderY },
    junction: { x, y: junctionY },
    turn: { x, y: laneY },
    highwayEast: { x: x + HIGHWAY.reach, y: laneY },
    highwayWest: { x: x - HIGHWAY.reach, y: laneY },
  };
};

/** Tile indices of the fixed access road, from the farm to the map edge. */
export const accessRoadTiles = (): number[] => {
  const { edgeRow } = accessRoadExit();
  const result: number[] = [];
  const step = edgeRow < ACCESS_ROAD_FARM_Y ? -1 : 1;
  for (let y = ACCESS_ROAD_FARM_Y; y !== edgeRow + step; y += step) result.push(tileIndex(ACCESS_ROAD_X, y));
  return result;
};

/** The access road's tile on the map edge: where the farm's road network meets the outside world. */
export const accessEntryTile = (): number => tileIndex(ACCESS_ROAD_X, accessRoadExit().edgeRow);

const SIDES: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
const CORNERS: ReadonlyArray<readonly [number, number]> = [
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
];

const roadAt = (tiles: readonly Tile[], x: number, y: number): boolean => inBounds(x, y) && !!tiles[tileIndex(x, y)]?.road;

/**
 * True when the road tiles at (x, y) and (x + dx, y + dy), which touch only at a corner, link
 * through it: neither tile beside the corner is road (then the road already turns through it),
 * none holds a building and they are not both fenced (a diagonal fence crosses there).
 */
export const diagonalRoadLink = (tiles: readonly Tile[], x: number, y: number, dx: number, dy: number): boolean => {
  if (!roadAt(tiles, x, y) || !roadAt(tiles, x + dx, y + dy)) return false;
  const a = inBounds(x + dx, y) ? tiles[tileIndex(x + dx, y)] : undefined;
  const b = inBounds(x, y + dy) ? tiles[tileIndex(x, y + dy)] : undefined;
  if (!a || !b || a.road || b.road) return false;
  if (a.structure || b.structure || a.cover || b.cover) return false;
  return !(a.fence && b.fence);
};

/** Offsets of the road tiles a road tile links to: road on each side, and diagonal links through its corners. */
export const roadLinks = (tiles: readonly Tile[], x: number, y: number): Array<readonly [number, number]> => [
  ...SIDES.filter(([dx, dy]) => roadAt(tiles, x + dx, y + dy)),
  ...CORNERS.filter(([dx, dy]) => diagonalRoadLink(tiles, x, y, dx, dy)),
];

const networks = new WeakMap<readonly Tile[], ReadonlySet<number>>();

/**
 * Road tiles linked (by sides, or diagonally through a corner) to the access road: the network
 * people and the vehicle use to reach the buildings. Cached per tile array, which only changes on
 * game events.
 */
export const roadNetwork = (tiles: readonly Tile[]): ReadonlySet<number> => {
  const cached = networks.get(tiles);
  if (cached) return cached;
  const result = new Set<number>();
  const entry = accessEntryTile();
  if (tiles[entry]?.road) {
    result.add(entry);
    const queue = [entry];
    for (let head = 0; head < queue.length; head++) {
      const current = queue[head];
      if (current === undefined) break;
      const { x, y } = tileCoords(current);
      for (const [dx, dy] of roadLinks(tiles, x, y)) {
        const next = tileIndex(x + dx, y + dy);
        if (result.has(next)) continue;
        result.add(next);
        queue.push(next);
      }
    }
  }
  networks.set(tiles, result);
  return result;
};

/** A rectangle of tiles (a structure's footprint). */
export interface TileRect {
  x: number;
  y: number;
  width: number;
  depth: number;
}

/** The ring of tiles around a rectangle (corners included), clockwise from the top-left; may leave the map. */
export const ringAround = (r: TileRect, width = 1): GridPoint[] => {
  const cells: GridPoint[] = [];
  for (let y = r.y - width; y < r.y + r.depth + width; y++) {
    for (let x = r.x - width; x < r.x + r.width + width; x++) {
      const inside = x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.depth;
      if (!inside) cells.push({ x, y });
    }
  }
  return cells;
};

/** Tiles touching a rectangle's sides (no corners): where a road gives access to it. */
export const sidesOf = (r: TileRect): GridPoint[] => {
  const cells: GridPoint[] = [];
  for (let x = r.x; x < r.x + r.width; x++) cells.push({ x, y: r.y - 1 }, { x, y: r.y + r.depth });
  for (let y = r.y; y < r.y + r.depth; y++) cells.push({ x: r.x - 1, y }, { x: r.x + r.width, y });
  return cells;
};

/** True when a road of the network runs along one of the rectangle's sides. */
export const touchesNetwork = (tiles: readonly Tile[], r: TileRect): boolean => {
  const network = roadNetwork(tiles);
  return sidesOf(r).some((c) => inBounds(c.x, c.y) && network.has(tileIndex(c.x, c.y)));
};

/** Marks the access road on a fresh tile array (only on free grass or land for sale). */
export const withAccessRoad = (tiles: readonly Tile[]): Tile[] => {
  const result = tiles.slice();
  for (const index of accessRoadTiles()) {
    const tile = result[index];
    if (tile && !tile.structure && (tile.state === 'grass' || tile.state === 'locked')) {
      result[index] = { ...tile, road: true };
    }
  }
  return result;
};

/** Why this tile cannot get a road (ignoring money and the queue), or null when it can. */
export const roadError = (state: GameState, index: number): ActionError | null => {
  const tile = isValidTileIndex(index) ? state.tiles[index] : undefined;
  if (!tile) return 'out-of-bounds';
  if (tile.state === 'locked') return 'locked';
  if (tile.structure || tile.cover) return 'structure';
  if (tile.road) return 'already-road';
  if (tile.fence) return 'fence';
  if (tile.state !== 'grass') return 'not-grass';
  return null;
};

/** Opens one tile of dirt road on free owned grass (what a finished road task does; already paid for). */
export const layRoad = (state: GameState, index: number): ActionResult => {
  const error = roadError(state, index);
  if (error) return fail(error);
  const tiles = state.tiles.slice();
  tiles[index] = { state: 'grass', road: true };
  return ok({ ...state, tiles });
};

/** Removes a road tile on owned land (what a finished removal task does; the access road outside the farm is fixed). */
export const removeRoad = (state: GameState, index: number): ActionResult => {
  const tile = isValidTileIndex(index) ? state.tiles[index] : undefined;
  if (!tile?.road) return fail('no-road');
  if (tile.state === 'locked') return fail('locked');
  const tiles = state.tiles.slice();
  tiles[index] = { state: tile.state };
  return ok({ ...state, tiles });
};
