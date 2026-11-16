/** Crop definitions. All balancing for crops lives here. */

export const CROP_IDS = ['wheat', 'corn', 'tomato'] as const;
export type CropId = (typeof CROP_IDS)[number];

export interface CropDef {
  id: CropId;
  /** UI label (pt-BR). */
  label: string;
  seedCost: number;
  /** Watered game hours needed to reach maturity. */
  growthHours: number;
  sellPrice: number;
  /** Fraction of growth at which each visual stage starts. Last stage = mature. */
  stageThresholds: readonly [number, number, number];
  /** Emoji used in the HUD. */
  icon: string;
}

export const CROPS: Record<CropId, CropDef> = {
  wheat: {
    id: 'wheat',
    label: 'Trigo',
    seedCost: 10,
    growthHours: 20,
    sellPrice: 28,
    stageThresholds: [0, 0.5, 1],
    icon: '🌾',
  },
  corn: {
    id: 'corn',
    label: 'Milho',
    seedCost: 20,
    growthHours: 40,
    sellPrice: 60,
    stageThresholds: [0, 0.5, 1],
    icon: '🌽',
  },
  tomato: {
    id: 'tomato',
    label: 'Tomate',
    seedCost: 35,
    growthHours: 60,
    sellPrice: 105,
    stageThresholds: [0, 0.5, 1],
    icon: '🍅',
  },
};

export const CROP_STAGE_COUNT = 3;
