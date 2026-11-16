/** Farm animals and their products. All balancing for livestock lives here. */

export const ANIMAL_IDS = ['chicken', 'duck', 'pig', 'sheep', 'goat', 'cow', 'ox', 'horse'] as const;
export type AnimalId = (typeof ANIMAL_IDS)[number];

export const ANIMAL_PRODUCT_IDS = ['egg', 'duckEgg', 'truffle', 'wool', 'goatMilk', 'milk'] as const;
export type AnimalProductId = (typeof ANIMAL_PRODUCT_IDS)[number];

export interface AnimalProductDef {
  id: AnimalProductId;
  label: string;
  sellPrice: number;
  icon: string;
}

export const ANIMAL_PRODUCTS: Record<AnimalProductId, AnimalProductDef> = {
  egg: { id: 'egg', label: 'Ovo', sellPrice: 18, icon: '🥚' },
  duckEgg: { id: 'duckEgg', label: 'Ovo de pata', sellPrice: 26, icon: '🥚' },
  truffle: { id: 'truffle', label: 'Trufa', sellPrice: 160, icon: '🍄' },
  wool: { id: 'wool', label: 'Lã', sellPrice: 220, icon: '🧶' },
  goatMilk: { id: 'goatMilk', label: 'Leite de cabra', sellPrice: 45, icon: '🍼' },
  milk: { id: 'milk', label: 'Leite', sellPrice: 70, icon: '🥛' },
};

/** Help a draft animal gives the workers. Bonuses from several animals add up to LABOR_BONUS_CAP. */
export interface LaborBonus {
  /** Extra tilling speed (0.4 = 40% faster). */
  hoe?: number;
  /** Extra walking speed. */
  walk?: number;
}

export interface AnimalDef {
  id: AnimalId;
  /** UI label (pt-BR). */
  label: string;
  purchaseCost: number;
  /** Charged at midnight; unfed animals don't produce the next day. */
  feedCostPerDay: number;
  /** What it produces, or null for draft animals. */
  product: AnimalProductId | null;
  /** Fed game hours between products. */
  productionHours: number;
  labor: LaborBonus;
  /** Wandering speed in tiles per game minute. */
  moveSpeed: number;
  icon: string;
}

export const ANIMALS: Record<AnimalId, AnimalDef> = {
  chicken: {
    id: 'chicken',
    label: 'Galinha',
    purchaseCost: 120,
    feedCostPerDay: 2,
    product: 'egg',
    productionHours: 24,
    labor: {},
    moveSpeed: 0.5,
    icon: '🐔',
  },
  duck: {
    id: 'duck',
    label: 'Pata',
    purchaseCost: 150,
    feedCostPerDay: 2,
    product: 'duckEgg',
    productionHours: 24,
    labor: {},
    moveSpeed: 0.4,
    icon: '🦆',
  },
  pig: {
    id: 'pig',
    label: 'Porco',
    purchaseCost: 600,
    feedCostPerDay: 6,
    product: 'truffle',
    productionHours: 48,
    labor: {},
    moveSpeed: 0.3,
    icon: '🐖',
  },
  sheep: {
    id: 'sheep',
    label: 'Ovelha',
    purchaseCost: 700,
    feedCostPerDay: 5,
    product: 'wool',
    productionHours: 72,
    labor: {},
    moveSpeed: 0.28,
    icon: '🐑',
  },
  goat: {
    id: 'goat',
    label: 'Cabra',
    purchaseCost: 450,
    feedCostPerDay: 4,
    product: 'goatMilk',
    productionHours: 24,
    labor: {},
    moveSpeed: 0.4,
    icon: '🐐',
  },
  cow: {
    id: 'cow',
    label: 'Vaca',
    purchaseCost: 800,
    feedCostPerDay: 8,
    product: 'milk',
    productionHours: 24,
    labor: {},
    moveSpeed: 0.25,
    icon: '🐄',
  },
  ox: {
    id: 'ox',
    label: 'Boi',
    purchaseCost: 1000,
    feedCostPerDay: 9,
    product: null,
    productionHours: 0,
    labor: { hoe: 0.4 },
    moveSpeed: 0.22,
    icon: '🐂',
  },
  horse: {
    id: 'horse',
    label: 'Cavalo',
    purchaseCost: 1200,
    feedCostPerDay: 10,
    product: null,
    productionHours: 0,
    labor: { walk: 0.3 },
    moveSpeed: 0.45,
    icon: '🐎',
  },
};

/** Maximum total labor bonus of each kind (1 = twice as fast). */
export const LABOR_BONUS_CAP = 1;
export const MAX_ANIMALS = 40;
/** Fraction of the purchase cost returned when selling an animal. */
export const ANIMAL_RESALE = 0.5;
/** Animals wander between these hours and sleep otherwise. */
export const ANIMAL_WAKE_HOUR = 5;
export const ANIMAL_SLEEP_HOUR = 21;
/** Max tiles an animal walks per wander leg. */
export const WANDER_RADIUS = 4;
/** Rest between wander legs, in game minutes. */
export const WANDER_PAUSE: readonly [number, number] = [10, 70];
