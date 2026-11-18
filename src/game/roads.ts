import { ACCESS_ROAD_EDGE, ACCESS_ROAD_FARM_Y, ACCESS_ROAD_X, HIGHWAY, OFFMAP_ROAD_LENGTH, ROAD_COST } from '../data/roads';
import { PROP_SIZES, meters } from '../data/scale';
import { GRID_SIZE } from '../data/world';
import { isValidTileIndex, tileIndex } from './grid';
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

/** Why a road cannot be built on this tile, or null when it can. */
export const checkRoad = (state: GameState, index: number): ActionError | null => {
  const tile = isValidTileIndex(index) ? state.tiles[index] : undefined;
  if (!tile) return 'out-of-bounds';
  if (tile.state === 'locked') return 'locked';
  if (tile.structure) return 'structure';
  if (tile.road) return 'already-road';
  if (tile.state !== 'grass') return 'not-grass';
  if (state.tasks.some((t) => t.tile === index)) return 'tile-busy';
  if (state.money < ROAD_COST) return 'not-enough-money';
  return null;
};

/** Builds one tile of dirt road on free owned grass. */
export const buildRoad = (state: GameState, index: number): ActionResult => {
  const error = checkRoad(state, index);
  if (error) return fail(error);
  const tiles = state.tiles.slice();
  tiles[index] = { state: 'grass', road: true };
  return ok({ ...state, tiles, money: state.money - ROAD_COST });
};

/** Removes a road tile on owned land (the access road outside the farm is fixed). */
export const removeRoad = (state: GameState, index: number): ActionResult => {
  const tile = isValidTileIndex(index) ? state.tiles[index] : undefined;
  if (!tile?.road) return fail('no-road');
  if (tile.state === 'locked') return fail('locked');
  const tiles = state.tiles.slice();
  tiles[index] = { state: tile.state };
  return ok({ ...state, tiles });
};
