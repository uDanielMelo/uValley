import { CROPS, CROP_SEASON_BONUS, GREENHOUSE_GROWTH } from '../data/crops';
import { FERTILIZER } from '../data/fertilizer';
import { dayOf, seasonGrowth, seasonOf } from './climate';
import { growthMinutesNeeded } from './crops';
import type { Tile } from './types';

/**
 * Applies growth to every watered tile for the game interval [from, to).
 * A field crop only grows while watered; orchard trees (rain-fed) and crops under a greenhouse
 * (self-watering) always grow. Fertilized soil, the season (and the crop's own season) speed it up;
 * under a greenhouse the season does not matter. When watering wears off the tile goes back to
 * 'planted'. * Returns the same array reference when nothing changed.
 */
export const growTiles = (tiles: Tile[], from: number, to: number): Tile[] => {
  if (to <= from) return tiles;
  let next: Tile[] | null = null;
  const season = seasonGrowth(from);
  const seasonId = seasonOf(dayOf(from));
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    if (!tile || !tile.crop) continue;
    const def = CROPS[tile.crop.cropId];
    const always = tile.cover || def.kind === 'orchard';
    if (tile.state !== 'watered' && !always) continue;
    const wateredUntil = tile.state === 'watered' ? (tile.wateredUntil ?? from) : to;
    const climate = tile.cover ? GREENHOUSE_GROWTH : season * (def.season === seasonId ? CROP_SEASON_BONUS : 1);
    const grownFor = Math.max(0, Math.min(to, always ? to : wateredUntil) - from);
    const effective = grownFor * (tile.fertilized ? FERTILIZER.growth : 1) * climate;
    const growthMinutes = Math.min(
      growthMinutesNeeded(tile.crop),
      tile.crop.growthMinutes + effective,
    );
    const dried = tile.state === 'watered' && to >= wateredUntil;
    if (growthMinutes === tile.crop.growthMinutes && !dried) continue;
    next ??= tiles.slice();
    const crop = { ...tile.crop, growthMinutes };
    if (dried) {
      const { wateredUntil: _dry, ...rest } = tile;
      next[i] = { ...rest, state: 'planted', crop };
    } else {
      next[i] = { ...tile, crop };
    }
  }
  return next ?? tiles;
};
