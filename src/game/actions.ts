import { CROPS, type CropId } from '../data/crops';
import { FERTILIZER } from '../data/fertilizer';
import { isMature } from './crops';
import { isValidTileIndex, withTile } from './grid';
import { addCount } from './inventory';
import { hash01 } from './random';
import { startOfNextDay } from './time';
import { fail, ok, type ActionResult, type GameState, type Tile, type ToolId } from './types';

type TileCheck = { tile: Tile } | { error: ActionResult };

/** Common checks for tile actions. */
const usableTile = (state: GameState, index: number): TileCheck => {
  const tile = isValidTileIndex(index) ? state.tiles[index] : undefined;
  if (!tile) return { error: fail('out-of-bounds') };
  if (tile.state === 'locked') return { error: fail('locked') };
  if (tile.structure) return { error: fail('structure') };
  if (tile.road) return { error: fail('road') };
  if (tile.fence) return { error: fail('fence') };
  return { tile };
};

/** Hoe: grass → tilled. */
export const till = (state: GameState, index: number): ActionResult => {
  const check = usableTile(state, index);
  if ('error' in check) return check.error;
  if (check.tile.state !== 'grass') return fail('not-grass');
  const tilled: Tile = { ...(check.tile.cover ? { cover: true as const } : {}), state: 'tilled' };
  return ok({ ...state, tiles: withTile(state.tiles, index, tilled) });
};

/** Seed: tilled → planted, consumes one seed. */
export const plant = (state: GameState, index: number, cropId: CropId): ActionResult => {
  const check = usableTile(state, index);
  if ('error' in check) return check.error;
  if (check.tile.state !== 'tilled') return fail('not-tilled');
  if ((state.inventory.seeds[cropId] ?? 0) <= 0) return fail('no-seeds');
  if (CROPS[cropId].kind === 'greenhouse' && !check.tile.cover) return fail('needs-greenhouse');
  return ok({
    ...state,
    tiles: withTile(state.tiles, index, { ...fertilizedOf(check.tile), state: 'planted', crop: { cropId, growthMinutes: 0 } }),
    inventory: { ...state.inventory, seeds: addCount(state.inventory.seeds, cropId, -1) },
  });
};

/** Watering can: planted → watered until the end of the current day. */
export const water = (state: GameState, index: number): ActionResult => {
  const check = usableTile(state, index);
  if ('error' in check) return check.error;
  const { tile } = check;
  if (!tile.crop) return fail('no-crop');
  // Orchard trees are rain-fed and greenhouses water themselves.
  if (CROPS[tile.crop.cropId].kind === 'orchard' || tile.cover) return fail('no-water-needed');
  if (tile.state === 'watered') return fail('already-watered');
  if (isMature(tile.crop)) return fail('already-mature');
  return ok({
    ...state,
    tiles: withTile(state.tiles, index, {
      ...fertilizedOf(tile),
      state: 'watered',
      crop: tile.crop,
      wateredUntil: startOfNextDay(state.gameMinutes),
    }),
  });
};

/** Keeps the soil's flags (fertilized, under a greenhouse) when a tile changes state. */
const fertilizedOf = (tile: Tile): Pick<Tile, 'fertilized' | 'cover'> => ({
  ...(tile.fertilized ? { fertilized: true } : {}),
  ...(tile.cover ? { cover: true } : {}),
});

/**
 * Hand: harvests a mature crop into the inventory; the tile stays tilled and the fertilizer is
 * used up. A fertilized crop may give one extra unit (rolled from the tile and the clock).
 */
export const harvest = (state: GameState, index: number): ActionResult => {
  const check = usableTile(state, index);
  if ('error' in check) return check.error;
  const { crop } = check.tile;
  if (!crop) return fail('no-crop');
  if (!isMature(crop)) return fail('not-mature');
  const extra = check.tile.fertilized && hash01(index * 977 + Math.floor(state.gameMinutes) * 13 + 3) < FERTILIZER.harvestBonus;
  // An orchard tree stays and fruits again after its regrow time.
  const regrow = CROPS[crop.cropId].regrowHours;
  const cover = check.tile.cover ? { cover: true as const } : {};
  const fruiting = Math.max(0, CROPS[crop.cropId].growthHours - (regrow ?? 0)) * 60;
  const after: Tile = regrow
    ? { ...cover, state: 'planted', crop: { cropId: crop.cropId, growthMinutes: fruiting } }
    : { ...cover, state: 'tilled' };
  return ok({
    ...state,
    tiles: withTile(state.tiles, index, after),
    inventory: { ...state.inventory, produce: addCount(state.inventory.produce, crop.cropId, extra ? 2 : 1) },
  });
};

/** Fertilizer: worked soil (tilled, planted or watered, not yet mature) gets fertilized; uses one unit. */
export const fertilize = (state: GameState, index: number): ActionResult => {
  const check = usableTile(state, index);
  if ('error' in check) return check.error;
  const { tile } = check;
  if (tile.state === 'grass') return fail('not-fertilizable');
  if (tile.fertilized) return fail('already-fertilized');
  if (tile.crop && isMature(tile.crop)) return fail('already-mature');
  if (state.inventory.fertilizer < 1) return fail('no-fertilizer');
  return ok({
    ...state,
    tiles: withTile(state.tiles, index, { ...tile, fertilized: true }),
    inventory: { ...state.inventory, fertilizer: state.inventory.fertilizer - 1 },
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
    case 'fertilize':
      return fertilize(state, index);
  }
};
