import { growthMinutesNeeded } from './crops';
import type { Tile } from './types';

/**
 * Applies growth to every watered tile for the game interval [from, to).
 * A crop only grows while watered; when watering wears off the tile goes back to 'planted'.
 * Returns the same array reference when nothing changed.
 */
export const growTiles = (tiles: Tile[], from: number, to: number): Tile[] => {
  if (to <= from) return tiles;
  let next: Tile[] | null = null;
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    if (!tile || tile.state !== 'watered' || !tile.crop) continue;
    const wateredUntil = tile.wateredUntil ?? from;
    const effective = Math.max(0, Math.min(to, wateredUntil) - from);
    const growthMinutes = Math.min(
      growthMinutesNeeded(tile.crop),
      tile.crop.growthMinutes + effective,
    );
    const dried = to >= wateredUntil;
    if (growthMinutes === tile.crop.growthMinutes && !dried) continue;
    next ??= tiles.slice();
    const crop = { ...tile.crop, growthMinutes };
    next[i] = dried ? { state: 'planted', crop } : { ...tile, crop };
  }
  return next ?? tiles;
};
