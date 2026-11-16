import type { CropId } from '../data/crops';
import { isMature } from './crops';
import { isValidTileIndex, withTile } from './grid';
import { addCount } from './inventory';
import { startOfNextDay } from './time';
import { fail, ok, type ActionResult, type GameState, type Tile, type ToolId } from './types';

type TileCheck = { tile: Tile } | { error: ActionResult };

/** Common checks for tile actions. */
const usableTile = (state: GameState, index: number): TileCheck => {
  const tile = isValidTileIndex(index) ? state.tiles[index] : undefined;
  if (!tile) return { error: fail('out-of-bounds') };
  if (tile.state === 'locked') return { error: fail('locked') };
  if (tile.structure) return { error: fail('structure') };
  return { tile };
};

/** Hoe: grass → tilled. */
export const till = (state: GameState, index: number): ActionResult => {
  const check = usableTile(state, index);
  if ('error' in check) return check.error;
  if (check.tile.state !== 'grass') return fail('not-grass');
  return ok({ ...state, tiles: withTile(state.tiles, index, { state: 'tilled' }) });
};

/** Seed: tilled → planted, consumes one seed. */
export const plant = (state: GameState, index: number, cropId: CropId): ActionResult => {
  const check = usableTile(state, index);
  if ('error' in check) return check.error;
  if (check.tile.state !== 'tilled') return fail('not-tilled');
  if ((state.inventory.seeds[cropId] ?? 0) <= 0) return fail('no-seeds');
  return ok({
    ...state,
    tiles: withTile(state.tiles, index, { state: 'planted', crop: { cropId, growthMinutes: 0 } }),
    inventory: { ...state.inventory, seeds: addCount(state.inventory.seeds, cropId, -1) },
  });
};

/** Watering can: planted → watered until the end of the current day. */
export const water = (state: GameState, index: number): ActionResult => {
  const check = usableTile(state, index);
  if ('error' in check) return check.error;
  const { tile } = check;
  if (!tile.crop) return fail('no-crop');
  if (tile.state === 'watered') return fail('already-watered');
  if (isMature(tile.crop)) return fail('already-mature');
  return ok({
    ...state,
    tiles: withTile(state.tiles, index, {
      state: 'watered',
      crop: tile.crop,
      wateredUntil: startOfNextDay(state.gameMinutes),
    }),
  });
};

/** Hand: harvests a mature crop into the inventory; the tile stays tilled. */
export const harvest = (state: GameState, index: number): ActionResult => {
  const check = usableTile(state, index);
  if ('error' in check) return check.error;
  const { crop } = check.tile;
  if (!crop) return fail('no-crop');
  if (!isMature(crop)) return fail('not-mature');
  return ok({
    ...state,
    tiles: withTile(state.tiles, index, { state: 'tilled' }),
    inventory: { ...state.inventory, produce: addCount(state.inventory.produce, crop.cropId, 1) },
  });
};

/** Dispatches the active tool to the matching action. */
export const applyTool = (
  state: GameState,
  tool: ToolId,
  index: number,
  selectedCrop: CropId,
): ActionResult => {
  switch (tool) {
    case 'hoe':
      return till(state, index);
    case 'seed':
      return plant(state, index, selectedCrop);
    case 'water':
      return water(state, index);
    case 'hand':
      return harvest(state, index);
  }
};
