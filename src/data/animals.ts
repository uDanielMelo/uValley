/** Farm animals and their products. All balancing for livestock lives here. */

import type { Stars } from '../game/types';
import { GAME_MINUTES_PER_REAL_SECOND } from './world';

export const ANIMAL_IDS = ['chicken', 'duck', 'pig', 'sheep', 'goat', 'cow', 'ox', 'horse'] as const;
export type AnimalId = (typeof ANIMAL_IDS)[number];

export const ANIMAL_PRODUCT_IDS = ['egg', 'duckEgg', 'truffle', 'wool', 'fineWool', 'goatMilk', 'milk'] as const;
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
  fineWool: { id: 'fineWool', label: 'Lã fina', sellPrice: 340, icon: '🧵' },
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
  /** Room it takes on pasture (a plot of free grass holds PLOT_PASTURE_UNITS). */
  pastureUnits: number;
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
    pastureUnits: 1,
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
    pastureUnits: 1,
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
    pastureUnits: 3,
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
    pastureUnits: 2,
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
    pastureUnits: 2,
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
    pastureUnits: 3,
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
    pastureUnits: 3,
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
    pastureUnits: 3,
    moveSpeed: 0.45,
    icon: '🐎',
  },
};

// ---------- breeds ----------

export const BREED_IDS = [
  'caipira',
  'leghorn',
  'pequim',
  'corredor',
  'piau',
  'duroc',
  'santaInes',
  'merino',
  'moxoto',
  'saanen',
  'gir',
  'holandesa',
  'nelore',
  'guzera',
  'crioulo',
  'mangalarga',
] as const;
export type BreedId = (typeof BREED_IDS)[number];

export interface BreedDef {
  id: BreedId;
  species: AnimalId;
  label: string;
  /** The finer breed of the species (pricier, better). */
  noble: boolean;
  /** Multiplies the species' purchase price. */
  price: number;
  /** Multiplies how fast it produces. */
  production: number;
  /** A different (finer) product than the species' own. */
  product?: AnimalProductId;
  /** Multiplies the draft help (ox and horse). */
  labor: number;
  /** What sets it apart (pt-BR). */
  note: string;
}

const breed = (def: Omit<BreedDef, 'labor'> & { labor?: number }): BreedDef => ({ labor: 1, ...def });

export const BREEDS: Record<BreedId, BreedDef> = {
  caipira: breed({ id: 'caipira', species: 'chicken', label: 'Caipira', noble: false, price: 1, production: 1, note: 'Rústica e econômica.' }),
  leghorn: breed({ id: 'leghorn', species: 'chicken', label: 'Leghorn', noble: true, price: 1.6, production: 1.35, note: 'Põe mais ovos.' }),
  pequim: breed({ id: 'pequim', species: 'duck', label: 'Pequim', noble: false, price: 1, production: 1, note: 'Rústica e econômica.' }),
  corredor: breed({ id: 'corredor', species: 'duck', label: 'Corredor indiano', noble: true, price: 1.5, production: 1.3, note: 'Põe mais ovos.' }),
  piau: breed({ id: 'piau', species: 'pig', label: 'Piau', noble: false, price: 1, production: 1, note: 'Rústico e econômico.' }),
  duroc: breed({ id: 'duroc', species: 'pig', label: 'Duroc', noble: true, price: 1.6, production: 1.3, note: 'Faro melhor: mais trufas.' }),
  santaInes: breed({ id: 'santaInes', species: 'sheep', label: 'Santa Inês', noble: false, price: 1, production: 1, note: 'Rústica e econômica.' }),
  merino: breed({ id: 'merino', species: 'sheep', label: 'Merino', noble: true, price: 1.8, production: 1, product: 'fineWool', note: 'Dá lã fina, mais cara.' }),
  moxoto: breed({ id: 'moxoto', species: 'goat', label: 'Moxotó', noble: false, price: 1, production: 1, note: 'Rústica e econômica.' }),
  saanen: breed({ id: 'saanen', species: 'goat', label: 'Saanen', noble: true, price: 1.6, production: 1.35, note: 'Dá mais leite.' }),
  gir: breed({ id: 'gir', species: 'cow', label: 'Gir', noble: false, price: 1, production: 1, note: 'Rústica e econômica.' }),
  holandesa: breed({ id: 'holandesa', species: 'cow', label: 'Holandesa', noble: true, price: 1.7, production: 1.4, note: 'Dá muito mais leite.' }),
  nelore: breed({ id: 'nelore', species: 'ox', label: 'Nelore', noble: false, price: 1, production: 1, note: 'Rústico e econômico.' }),
  guzera: breed({ id: 'guzera', species: 'ox', label: 'Guzerá', noble: true, price: 1.6, production: 1, labor: 1.4, note: 'Mais força na aração.' }),
  crioulo: breed({ id: 'crioulo', species: 'horse', label: 'Crioulo', noble: false, price: 1, production: 1, note: 'Rústico e econômico.' }),
  mangalarga: breed({ id: 'mangalarga', species: 'horse', label: 'Mangalarga Marchador', noble: true, price: 1.7, production: 1, labor: 1.4, note: 'Marcha mais rápida.' }),
};

/** Breeds of each species, the common one first. */
export const SPECIES_BREEDS: Record<AnimalId, readonly BreedId[]> = {
  chicken: ['caipira', 'leghorn'],
  duck: ['pequim', 'corredor'],
  pig: ['piau', 'duroc'],
  sheep: ['santaInes', 'merino'],
  goat: ['moxoto', 'saanen'],
  cow: ['gir', 'holandesa'],
  ox: ['nelore', 'guzera'],
  horse: ['crioulo', 'mangalarga'],
};

// ---------- stars ----------

export interface AnimalStarLevel {
  /** Multiplies production (and draft help). */
  production: number;
  /** Multiplies the resale price. */
  resale: number;
  /** Chance a bought animal has this level. */
  chance: number;
}

export const ANIMAL_STARS: Record<Stars, AnimalStarLevel> = {
  1: { production: 0.85, resale: 0.8, chance: 0.5 },
  2: { production: 1, resale: 1, chance: 0.35 },
  3: { production: 1.15, resale: 1.25, chance: 0.15 },
};

// ---------- life cycle ----------

export const LIFE_STAGE_IDS = ['baby', 'young', 'adult', 'old'] as const;
export type LifeStage = (typeof LIFE_STAGE_IDS)[number];

export interface LifeStageDef {
  label: string;
  /** Age (real hours at speed 1×) when the stage starts. */
  startsAtRealHours: number;
  /** Multiplies production. */
  production: number;
  /** Multiplies the draft help. */
  labor: number;
  /** Multiplies the resale price. */
  resale: number;
  /** Multiplies the walking speed. */
  moveSpeed: number;
}

/** Same cycle for every species: baby 12 h, young 12 h, adult 48 h, old 24 h of real time at 1×. */
export const LIFE_STAGES: Record<LifeStage, LifeStageDef> = {
  baby: { label: 'Filhote', startsAtRealHours: 0, production: 0, labor: 0, resale: 0.5, moveSpeed: 1.1 },
  young: { label: 'Jovem', startsAtRealHours: 12, production: 0.5, labor: 0.5, resale: 0.75, moveSpeed: 1.1 },
  adult: { label: 'Adulto', startsAtRealHours: 24, production: 1, labor: 1, resale: 1, moveSpeed: 1 },
  old: { label: 'Idoso', startsAtRealHours: 72, production: 0.5, labor: 0.6, resale: 0.25, moveSpeed: 0.7 },
};
/** Age (real hours at 1×) when an animal dies of old age. */
export const LIFESPAN_REAL_HOURS = 96;
/** Game minutes in one real hour at speed 1×. */
export const GAME_MINUTES_PER_REAL_HOUR = 3600 * GAME_MINUTES_PER_REAL_SECOND;
/** A baby costs this share of the adult price. */
export const BABY_PRICE = 0.5;

/**
 * Pasture: each 4×4 plot of free grass holds this many units (e.g. 4 cows or 12 chickens).
 * Plots with crops, roads or buildings hold proportionally less.
 */
export const PLOT_PASTURE_UNITS = 12;
/** A shelter keeps up to this many products per head of capacity until the crew collects them. */
export const SHELTER_STOCK_PER_HEAD = 3;
/** Animals graze within this many tiles of their shelter's door. */
export const LEASH_RADIUS = 5;
/** Work minutes (at speed 1) to collect a shelter's products. */
export const COLLECT_MINUTES = 10;

/** Maximum total labor bonus of each kind (1 = twice as fast). */
export const LABOR_BONUS_CAP = 1;
export const MAX_ANIMALS = 40;
/** Fraction of the purchase price returned when selling an adult animal (stage and stars adjust it). */
export const ANIMAL_RESALE = 0.5;
/** Animals wander between these hours and sleep otherwise. */
export const ANIMAL_WAKE_HOUR = 5;
export const ANIMAL_SLEEP_HOUR = 21;
/** Max tiles an animal walks per wander leg. */
export const WANDER_RADIUS = 4;
/** Rest between wander legs, in game minutes. */
export const WANDER_PAUSE: readonly [number, number] = [10, 70];
