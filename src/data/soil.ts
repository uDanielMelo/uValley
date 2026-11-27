/** Soil: the soil types of the farm, how each crop does on each of them and the soil survey. */

import type { CropId } from './crops';

export const SOIL_IDS = ['terraRoxa', 'clay', 'sandy', 'floodplain', 'stony'] as const;
export type SoilId = (typeof SOIL_IDS)[number];

export interface SoilDef {
  id: SoilId;
  /** UI label (pt-BR). */
  label: string;
  /** Multiplies the time it takes to plow a tile. */
  plowFactor: number;
  /** Multiplies the pasture a tile of grass gives. */
  pastureFactor: number;
  /** Target share of the map. The shares add up to 1. */
  share: number;
}

export const SOILS: Record<SoilId, SoilDef> = {
  terraRoxa: { id: 'terraRoxa', label: 'Terra roxa', plowFactor: 1, pastureFactor: 1.2, share: 0.2 },
  clay: { id: 'clay', label: 'Argiloso', plowFactor: 1.4, pastureFactor: 1, share: 0.25 },
  sandy: { id: 'sandy', label: 'Arenoso', plowFactor: 0.7, pastureFactor: 0.6, share: 0.25 },
  floodplain: { id: 'floodplain', label: 'Várzea', plowFactor: 1.2, pastureFactor: 1.5, share: 0.15 },
  stony: { id: 'stony', label: 'Pedregoso', plowFactor: 2, pastureFactor: 0.5, share: 0.15 },
};

export const SOIL_RATING_IDS = ['great', 'good', 'neutral', 'poor', 'bad'] as const;
export type SoilRating = (typeof SOIL_RATING_IDS)[number];

/** What each rating does to a harvest (bad: the crop withers before it is ready). */
export const SOIL_RATINGS: Record<SoilRating, { label: string; yield: number }> = {
  great: { label: 'Ótimo', yield: 2 },
  good: { label: 'Bom', yield: 1.5 },
  neutral: { label: 'Neutro', yield: 1 },
  poor: { label: 'Fraco', yield: 0.5 },
  bad: { label: 'Péssimo', yield: 0 },
};

/**
 * How each crop does on each soil. Strawberries grow only under a greenhouse, which ignores the soil.
 * Tuned so that planting blind averages about 1× over the map (test: between 0.85 and 1.1); against the
 * table in the design, wheat and orange on clay, tomato on clay, pumpkin on sandy and stony and orange on
 * stony were moved one step to hit that.
 */
export const CROP_SOIL: Record<Exclude<CropId, 'strawberry'>, Record<SoilId, SoilRating>> = {
  wheat: { terraRoxa: 'great', clay: 'neutral', sandy: 'neutral', floodplain: 'bad', stony: 'poor' },
  corn: { terraRoxa: 'great', clay: 'good', sandy: 'poor', floodplain: 'bad', stony: 'poor' },
  tomato: { terraRoxa: 'good', clay: 'poor', sandy: 'great', floodplain: 'poor', stony: 'bad' },
  carrot: { terraRoxa: 'neutral', clay: 'poor', sandy: 'great', floodplain: 'poor', stony: 'bad' },
  potato: { terraRoxa: 'neutral', clay: 'poor', sandy: 'great', floodplain: 'bad', stony: 'poor' },
  pumpkin: { terraRoxa: 'good', clay: 'great', sandy: 'poor', floodplain: 'neutral', stony: 'bad' },
  orange: { terraRoxa: 'great', clay: 'neutral', sandy: 'neutral', floodplain: 'bad', stony: 'neutral' },
  apple: { terraRoxa: 'good', clay: 'great', sandy: 'poor', floodplain: 'bad', stony: 'neutral' },
};

/** A crop on bad soil withers when it reaches this share of its growth. */
export const WITHER_AT = 0.5;

/** Soil survey of one plot by an agronomist: the sample kit's price and the work minutes (at speed 1). */
export const SOIL_SURVEY = { cost: 40, minutes: 120 } as const;
