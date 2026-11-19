/** Crop definitions. All balancing for crops lives here. */

import type { SeasonId } from './climate';

export const CROP_IDS = ['wheat', 'corn', 'tomato', 'carrot', 'potato', 'pumpkin', 'strawberry', 'orange', 'apple'] as const;
export type CropId = (typeof CROP_IDS)[number];

/** Where a crop grows: open field, only under a greenhouse, or as an orchard tree. */
export type CropKind = 'field' | 'greenhouse' | 'orchard';

export interface CropDef {
  id: CropId;
  /** UI label (pt-BR). */
  label: string;
  kind: CropKind;
  seedCost: number;
  /** Watered game hours needed to reach maturity (orchard trees: to the first harvest). */
  growthHours: number;
  sellPrice: number;
  /** Fraction of growth at which each visual stage starts. Last stage = mature. */
  stageThresholds: readonly [number, number, number];
  /** Emoji used in the HUD. */
  icon: string;
  /** Grows faster in this season (CROP_SEASON_BONUS). */
  season?: SeasonId;
  /** Has to be researched before its seeds are sold (absent: known from the start). */
  research?: { cost: number; hours: number };
  /** Orchard trees: after a harvest the tree stays and fruits again after these hours. */
  regrowHours?: number;
}

export const CROPS: Record<CropId, CropDef> = {
  wheat: {
    id: 'wheat',
    label: 'Trigo',
    kind: 'field',
    seedCost: 10,
    growthHours: 20,
    sellPrice: 28,
    stageThresholds: [0, 0.5, 1],
    icon: '🌾',
    season: 'summer',
  },
  corn: {
    id: 'corn',
    label: 'Milho',
    kind: 'field',
    seedCost: 20,
    growthHours: 40,
    sellPrice: 60,
    stageThresholds: [0, 0.5, 1],
    icon: '🌽',
    season: 'summer',
  },
  tomato: {
    id: 'tomato',
    label: 'Tomate',
    kind: 'field',
    seedCost: 35,
    growthHours: 60,
    sellPrice: 105,
    stageThresholds: [0, 0.5, 1],
    icon: '🍅',
    season: 'spring',
  },
  carrot: {
    id: 'carrot',
    label: 'Cenoura',
    kind: 'field',
    seedCost: 15,
    growthHours: 28,
    sellPrice: 45,
    stageThresholds: [0, 0.5, 1],
    icon: '🥕',
    season: 'autumn',
    research: { cost: 300, hours: 12 },
  },
  potato: {
    id: 'potato',
    label: 'Batata',
    kind: 'field',
    seedCost: 18,
    growthHours: 36,
    sellPrice: 55,
    stageThresholds: [0, 0.5, 1],
    icon: '🥔',
    season: 'winter',
    research: { cost: 450, hours: 18 },
  },
  pumpkin: {
    id: 'pumpkin',
    label: 'Abóbora',
    kind: 'field',
    seedCost: 40,
    growthHours: 72,
    sellPrice: 150,
    stageThresholds: [0, 0.5, 1],
    icon: '🎃',
    season: 'autumn',
    research: { cost: 800, hours: 24 },
  },
  strawberry: {
    id: 'strawberry',
    label: 'Morango',
    kind: 'greenhouse',
    seedCost: 50,
    growthHours: 48,
    sellPrice: 170,
    stageThresholds: [0, 0.5, 1],
    icon: '🍓',
    research: { cost: 1200, hours: 30 },
  },
  orange: {
    id: 'orange',
    label: 'Laranjeira',
    kind: 'orchard',
    seedCost: 150,
    growthHours: 120,
    sellPrice: 70,
    stageThresholds: [0, 0.45, 1],
    icon: '🍊',
    research: { cost: 1500, hours: 36 },
    regrowHours: 30,
  },
  apple: {
    id: 'apple',
    label: 'Macieira',
    kind: 'orchard',
    seedCost: 180,
    growthHours: 140,
    sellPrice: 80,
    stageThresholds: [0, 0.45, 1],
    icon: '🍎',
    season: 'autumn',
    research: { cost: 1800, hours: 42 },
    regrowHours: 36,
  },
};

export const CROP_STAGE_COUNT = 3;

/** A crop grows this much faster in its own season. */
export const CROP_SEASON_BONUS = 1.25;
/** Under a greenhouse crops always grow at this rate (no season), are watered and safe from storms. */
export const GREENHOUSE_GROWTH = 1.15;

/** Crop mastery: completed tasks on a crop needed for each level, and what each level adds. */
export const MASTERY_LEVELS: readonly { tasks: number; speed: number; effectiveness: number; label: string }[] = [
  { tasks: 15, speed: 1.1, effectiveness: 1.05, label: 'Aprendiz' },
  { tasks: 50, speed: 1.2, effectiveness: 1.1, label: 'Experiente' },
  { tasks: 120, speed: 1.3, effectiveness: 1.15, label: 'Mestre' },
];
