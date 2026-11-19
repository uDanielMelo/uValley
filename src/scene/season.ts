import { Color, type MeshStandardMaterial } from 'three';
import type { SeasonId } from '../data/climate';
import { PALETTE } from './palette';

/** Tint each season gives the landscape (it multiplies the vertex colors). */
export const SEASON_TINTS: Record<SeasonId, Color> = {
  spring: new Color(PALETTE.seasonSpring),
  summer: new Color(PALETTE.seasonSummer),
  autumn: new Color(PALETTE.seasonAutumn),
  winter: new Color(PALETTE.seasonWinter),
};

/** Landscape materials that follow the season (terrain, grass, trees, the farm ground). */
const seasonal = new Set<MeshStandardMaterial>();

/** Current (eased) season tint, written by DayNightLight every frame. */
export const seasonTint = new Color(1, 1, 1);

export const addSeasonal = (material: MeshStandardMaterial): (() => void) => {
  seasonal.add(material);
  material.color.copy(seasonTint);
  return () => {
    seasonal.delete(material);
  };
};

/** Applies the current tint to every seasonal material. */
export const paintSeasonal = (): void => {
  for (const m of seasonal) m.color.copy(seasonTint);
};


